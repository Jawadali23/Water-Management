import socket
import struct
import time
import datetime
import csv
import logging
import pyodbc
from dataclasses import dataclass
from typing import List

# ==========================================================
# LOGGING
# ==========================================================
logging.basicConfig(
    filename="flowmeter.log",
    level=logging.INFO,
    format="%(asctime)s | %(levelname)s | %(message)s"
)

# ==========================================================
# SQL SERVER CONFIG  ← Update these values or override with environment variables
# ==========================================================
SQL_SERVER   = r"A00145469\MSSQLSERVER2025"   # e.g. "localhost", r"MACHINE\SQLEXPRESS", or "192.168.1.10"
SQL_DATABASE = "Water_Management"             # your database name

# AUTH MODE:
# True  -> Windows Authentication (same as "Windows Authentication" in SSMS)
# False -> SQL Server Authentication (username/password)
USE_WINDOWS_AUTH = False

SQL_USERNAME = "sa"         # used only when USE_WINDOWS_AUTH = False
SQL_PASSWORD = "12345678"   # used only when USE_WINDOWS_AUTH = False


def build_connection_string() -> str:
    base = (
        f"DRIVER={{ODBC Driver 17 for SQL Server}};"
        f"SERVER={SQL_SERVER};"
        f"DATABASE={SQL_DATABASE};"
    )

    if USE_WINDOWS_AUTH:
        return base + "Trusted_Connection=yes;"

    return base + f"UID={SQL_USERNAME};PWD={SQL_PASSWORD};"


CONNECTION_STRING = build_connection_string()


# ==========================================================
# CONFIG
# ==========================================================
@dataclass
class FlowMeterConfig:
    unique_id: int
    name: str
    ip: str
    modbus_port: int
    slave_id: int
    device: str


# ==========================================================
# FLOW METER DRIVER
# ==========================================================
class StableFlowMeter:

    def __init__(self, config: FlowMeterConfig):
        self.config = config
        self.transaction_id = 0
        self.previous_forward_total = None

    def connect(self):
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.settimeout(3)
        sock.connect((self.config.ip, self.config.modbus_port))
        return sock

    def read_registers(self, sock, start, count):
        self.transaction_id = (self.transaction_id + 1) % 65535

        mbap = struct.pack(">HHHB", self.transaction_id, 0, 6, self.config.slave_id)
        pdu  = struct.pack(">BHH", 3, start, count)

        sock.sendall(mbap + pdu)

        header = sock.recv(7)
        if len(header) < 7:
            return None

        _, _, length = struct.unpack(">HHH", header[:6])
        body = sock.recv(length)

        response = header + body

        if response[6] != self.config.slave_id:
            return None

        byte_count = response[8]
        return response[9:9 + byte_count]

    def read(self):
        result = {
            "timestamp":    datetime.datetime.now(),
            "meter":        self.config.name,
            "slave_id":     self.config.slave_id,
            "status":       "OFFLINE",
            "flow":         0,
            "forward_total": 0,
            "error":        None
        }

        try:
            sock = self.connect()
            raw  = self.read_registers(sock, 100, 15)
            sock.close()

            if not raw:
                raise Exception("No response")

            regs = struct.unpack(">" + "H" * (len(raw) // 2), raw)

            forward_int   = regs[7]
            forward_dec   = regs[9]
            forward_total = forward_int + (forward_dec / 1000)

            result["forward_total"] = round(forward_total, 3)
            
            # Calculate flow rate: (current forward total - previous forward total)
            if self.previous_forward_total is not None:
                result["flow"] = round(result["forward_total"] - self.previous_forward_total, 3)
            else:
                result["flow"] = 0.0
                
            # Update previous total for the next reading
            self.previous_forward_total = result["forward_total"]
            
            result["status"]        = "ONLINE"

            logging.info(f"{self.config.name} | Forward={result['forward_total']} | Flow={result['flow']}")

        except Exception as e:
            result["error"] = str(e)
            logging.error(f"{self.config.name} | {str(e)}")

        return result


def _metric_column(name: str, metric: str) -> str:
    return f"[{name}_{metric}]"


# ==========================================================
# SQL SERVER HELPER
# ==========================================================
def insert_to_sql(conn, row: dict):
    """Insert a single meter reading into flow_logs table."""
    sql = """
        INSERT INTO flow_logs (timestamp, meter, slave_id, status, flow, forward_total, error)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    """
    values = (
        row["timestamp"],
        row["meter"],
        row["slave_id"],
        row["status"],
        row["flow"],
        row["forward_total"],
        row["error"]
    )
    cursor = conn.cursor()
    cursor.execute(sql, values)
    conn.commit()



# ==========================================================
# MONITOR SYSTEM
# ==========================================================
class FlowMonitor:

    def __init__(self, config_file):
        self.meters: List[StableFlowMeter] = []

        with open(config_file) as f:
            reader = csv.DictReader(f)
            for row in reader:
                cfg = FlowMeterConfig(
                    unique_id=int(row["Unique_ID"]),
                    name=row["Name"],
                    ip=row["IP"],
                    modbus_port=int(row["ModBusPort"]),
                    slave_id=int(row["Slave_ID"]),
                    device=row["Device"]
                )
                self.meters.append(StableFlowMeter(cfg))

    def display(self, results: list):
        print("\n" + "=" * 100)
        print(f"FLOW METER SYSTEM  —  {datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
        print("=" * 100)
        header = f"{'Meter':<25} {'Slave':>6} {'Status':>8} {'Flow':>8} {'Total':>10} {'Error'}"
        print(header)
        print("-" * 100)
        for r in results:
            error_str = r["error"] if r["error"] else ""
            print(
                f"{r['meter']:<25} {r['slave_id']:>6} {r['status']:>8} "
                f"{r['flow']:>8} {r['forward_total']:>10.3f} {error_str}"
            )

    def run(self):
        print("Connecting to SQL Server...")

        try:
            conn = pyodbc.connect(CONNECTION_STRING)
            # Connected to SQL Server (minute-summary table usage removed)
            print("✅ Connected to SQL Server successfully!\n")
        except Exception as e:
            print(f"❌ Failed to connect to SQL Server: {e}")
            logging.error(f"DB Connection failed: {e}")
            return

        print("Monitoring started...\n")

        while True:
            results = []
            cycle_start = datetime.datetime.now()

            for meter in self.meters:
                row = meter.read()
                results.append(row)

                # Insert directly into SQL Server
                try:
                    insert_to_sql(conn, row)
                    logging.info(f"Inserted to DB: {row['meter']}")
                except Exception as e:
                    logging.error(f"DB insert failed for {row['meter']}: {e}")
                    print(f"⚠️  DB insert failed for {row['meter']}: {e}")

                time.sleep(0.3)

            # Minute-summary upsert skipped (table removed); only raw `flow_logs` are kept.

            # Display in terminal
            self.display(results)

            time.sleep(60)


# ==========================================================
# ENTRY POINT
# ==========================================================
if __name__ == "__main__":
    monitor = FlowMonitor("Moxa-Devices.csv")
    monitor.run()

    
