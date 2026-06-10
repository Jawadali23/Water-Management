import time
import threading
from datetime import datetime, date

import pandas as pd

from database.connection import get_db_connection
from services.calculation_service import METERS

COMBINED_METERS_VIEW = "vw_combined_meters"
LIVE_METERS_VIEW = "vw_live_meters"
METER_STATUS_VIEW = "vw_meter_status_pivot"

FLOW_RATE_COLUMNS = {
    "Fresh Water Tank_FLOW_RATE": METERS["fresh_water_tank"],
    "Over Head Tank_FLOW_RATE": METERS["overhead_admin_tank"],
    "Well Water_FLOW_RATE": METERS["well_water"],
    "Domestic Fresh_FLOW_RATE": METERS["domestic_fresh_water"],
    "Drinking Water RO Plant_FLOW_RATE": METERS["drinking_water_ro_plant"],
    "WWTP IN_FLOW_RATE": METERS["wwtp_in"],
    "WWTP RO IN_FLOW_RATE": METERS["wwtp_ro_in"],
    "WWTP RO Rejection_FLOW_RATE": METERS["wwtp_ro_rejection"],
}

FORWARD_TOTAL_COLUMNS = {
    "Fresh Water Tank_FORWARD_TOTAL": METERS["fresh_water_tank"],
    "Over Head Tank_FORWARD_TOTAL": METERS["overhead_admin_tank"],
    "Well Water_FORWARD_TOTAL": METERS["well_water"],
    "Domestic Fresh_FORWARD_TOTAL": METERS["domestic_fresh_water"],
    "Drinking Water RO Plant_FORWARD_TOTAL": METERS["drinking_water_ro_plant"],
    "WWTP IN_FORWARD_TOTAL": METERS["wwtp_in"],
    "WWTP RO IN_FORWARD_TOTAL": METERS["wwtp_ro_in"],
    "WWTP RO Rejection_FORWARD_TOTAL": METERS["wwtp_ro_rejection"],
}

_METER_LIVE_COLUMNS = {
    "FRESH WATER TANK": ("Fresh Water Tank_FORWARD_TOTAL", "Fresh Water Tank_FLOW_RATE"),
    "OVER HEAD TANK": ("Over Head Tank_FORWARD_TOTAL", "Over Head Tank_FLOW_RATE"),
    "OVERHEAD TANK": ("Over Head Tank_FORWARD_TOTAL", "Over Head Tank_FLOW_RATE"),
    "OVERHEAD ADMIN TANK": ("Over Head Tank_FORWARD_TOTAL", "Over Head Tank_FLOW_RATE"),
    "WELL WATER": ("Well Water_FORWARD_TOTAL", "Well Water_FLOW_RATE"),
    "DOMESTIC FRESH": ("Domestic Fresh_FORWARD_TOTAL", "Domestic Fresh_FLOW_RATE"),
    "DOMESTIC FRESH WATER": ("Domestic Fresh_FORWARD_TOTAL", "Domestic Fresh_FLOW_RATE"),
    "DRINKING WATER RO PLANT": ("Drinking Water RO Plant_FORWARD_TOTAL", "Drinking Water RO Plant_FLOW_RATE"),
    "DRINKING WATER & RO PLANT": ("Drinking Water RO Plant_FORWARD_TOTAL", "Drinking Water RO Plant_FLOW_RATE"),
    "WWTP IN": ("WWTP IN_FORWARD_TOTAL", "WWTP IN_FLOW_RATE"),
    "WWTP RO IN": ("WWTP RO IN_FORWARD_TOTAL", "WWTP RO IN_FLOW_RATE"),
    "WWTP RO REJECTION": ("WWTP RO Rejection_FORWARD_TOTAL", "WWTP RO Rejection_FLOW_RATE"),
}

_STATUS_COLUMN_ALIASES = {
    "FRESH WATER TANK": "Fresh Water Tank_(sl:21)",
    "OVER HEAD TANK": "Over Head Tank_(sl:5)",
    "OVERHEAD TANK": "Over Head Tank_(sl:5)",
    "OVERHEAD ADMIN TANK": "Over Head Tank_(sl:5)",
    "WELL WATER": "Well Water_(sl:8)",
    "DOMESTIC FRESH": "Domestic Fresh_(sl:6)",
    "DOMESTIC FRESH WATER": "Domestic Fresh_(sl:6)",
    "DRINKING WATER RO PLANT": "Drinking Water RO Plant_(sl:7)",
    "DRINKING WATER & RO PLANT": "Drinking Water RO Plant_(sl:7)",
    "WWTP IN": "WWTP IN_(sl:2)",
    "WWTP RO IN": "WWTP RO IN_(sl:3)",
    "WWTP RO REJECTION": "WWTP RO Rejection_(sl:4)",
}

_CACHE = {}
_CACHE_LOCK = threading.Lock()
CACHE_TTL = 60

_LATEST_DATE_CACHE = (None, 0)


def clear_cache() -> None:
    with _CACHE_LOCK:
        _CACHE.clear()
    global _LATEST_DATE_CACHE
    _LATEST_DATE_CACHE = (None, 0)


def _timestamp_sql_expr(column: str = "[TIMESTAMP]") -> str:
    return (
        f"COALESCE(TRY_CONVERT(DATETIME, {column}), TRY_CONVERT(DATETIME, {column}, 6))"
    )


def get_latest_date(bypass_cache: bool = False) -> pd.Timestamp:
    global _LATEST_DATE_CACHE
    if not bypass_cache:
        cached_val, expiry = _LATEST_DATE_CACHE
        if cached_val is not None and time.time() < expiry:
            return cached_val

    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute(
        f"SELECT MAX({_timestamp_sql_expr()}) FROM {COMBINED_METERS_VIEW}"
    )
    row = cursor.fetchone()
    conn.close()
    latest = pd.Timestamp(row[0]) if row and row[0] else pd.Timestamp.now()
    _LATEST_DATE_CACHE = (latest, time.time() + CACHE_TTL)
    return latest


def _to_float(value) -> float:
    try:
        return round(float(value), 2) if value is not None and str(value).strip() != "" else 0.0
    except (TypeError, ValueError):
        return 0.0


def _resolve_meter_key(meter_name: str) -> str | None:
    meter_key = meter_name.strip().upper()
    if meter_key in _METER_LIVE_COLUMNS:
        return meter_key
    for key in _METER_LIVE_COLUMNS:
        if key in meter_key or meter_key in key:
            return key
    return None


def get_latest_meter_reading(meter_name: str) -> dict | None:
    """Return the latest live reading for a meter from vw_live_meters."""
    meter_key = _resolve_meter_key(meter_name)
    if not meter_key:
        return None

    col_total, col_flow = _METER_LIVE_COLUMNS[meter_key]
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute(
            f"""
            SELECT TOP 1 [TIMESTAMP], [{col_total}], [{col_flow}]
            FROM {LIVE_METERS_VIEW}
            ORDER BY {_timestamp_sql_expr()} DESC
            """
        )
        row = cursor.fetchone()
        if not row:
            return None

        timestamp_val, total_val, flow_val = row
        parsed_ts = pd.to_datetime(timestamp_val, errors="coerce")
        if pd.isna(parsed_ts):
            return None

        status = get_meter_online_status(meter_name, conn=conn)
        return {
            "current": _to_float(total_val),
            "flow_rate": _to_float(flow_val),
            "last_update": parsed_ts.to_pydatetime(),
            "status": status,
        }
    finally:
        conn.close()


def get_meter_online_status(meter_name: str, *, conn=None) -> str:
    meter_key = _resolve_meter_key(meter_name)
    status_col = _STATUS_COLUMN_ALIASES.get(meter_key or "")
    if not status_col:
        return "UNKNOWN"

    close_conn = False
    if conn is None:
        conn = get_db_connection()
        close_conn = True

    cursor = conn.cursor()
    try:
        cursor.execute(
            f"""
            SELECT TOP 1 [{status_col}]
            FROM {METER_STATUS_VIEW}
            ORDER BY {_timestamp_sql_expr()} DESC
            """
        )
        row = cursor.fetchone()
        if not row or row[0] is None:
            return "UNKNOWN"
        return str(row[0]).strip().upper()
    finally:
        if close_conn:
            conn.close()


def get_meter_status_snapshot() -> list[dict]:
    """Latest online/offline, flow, forward total, and timestamp for all meters."""
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute(
            f"""
            SELECT TOP 1 *
            FROM {LIVE_METERS_VIEW}
            ORDER BY {_timestamp_sql_expr()} DESC
            """
        )
        live_row = cursor.fetchone()
        live_cols = [col[0] for col in cursor.description] if cursor.description else []
        live_data = dict(zip(live_cols, live_row)) if live_row else {}

        cursor.execute(
            f"""
            SELECT TOP 1 *
            FROM {METER_STATUS_VIEW}
            ORDER BY {_timestamp_sql_expr()} DESC
            """
        )
        status_row = cursor.fetchone()
        status_cols = [col[0] for col in cursor.description] if cursor.description else []
        status_data = dict(zip(status_cols, status_row)) if status_row else {}
    finally:
        conn.close()

    timestamp = live_data.get("TIMESTAMP") or status_data.get("TIMESTAMP")
    parsed_ts = pd.to_datetime(timestamp, errors="coerce")
    last_update = (
        parsed_ts.strftime("%Y-%m-%d %H:%M:%S") if not pd.isna(parsed_ts) else None
    )

    status_by_meter = {
        METERS["fresh_water_tank"]: status_data.get("Fresh Water Tank_(sl:21)"),
        METERS["overhead_admin_tank"]: status_data.get("Over Head Tank_(sl:5)"),
        METERS["well_water"]: status_data.get("Well Water_(sl:8)"),
        METERS["domestic_fresh_water"]: status_data.get("Domestic Fresh_(sl:6)"),
        METERS["drinking_water_ro_plant"]: status_data.get("Drinking Water RO Plant_(sl:7)"),
        METERS["wwtp_in"]: status_data.get("WWTP IN_(sl:2)"),
        METERS["wwtp_ro_in"]: status_data.get("WWTP RO IN_(sl:3)"),
        METERS["wwtp_ro_rejection"]: status_data.get("WWTP RO Rejection_(sl:4)"),
    }

    meters: list[dict] = []
    for meter_label in METERS.values():
        flow_col = next(
            (col for col, name in FLOW_RATE_COLUMNS.items() if name == meter_label),
            None,
        )
        total_col = next(
            (col for col, name in FORWARD_TOTAL_COLUMNS.items() if name == meter_label),
            None,
        )
        meters.append(
            {
                "meter_name": meter_label,
                "status": str(status_by_meter.get(meter_label, "UNKNOWN")).upper(),
                "flow_rate": _to_float(live_data.get(flow_col)) if flow_col else 0.0,
                "forward_total": _to_float(live_data.get(total_col)) if total_col else 0.0,
                "last_update": last_update,
            }
        )
    return meters


def load_sql_data(
    start_date: datetime | date | str | None = None,
    end_date: datetime | date | str | None = None,
    bypass_cache: bool = False,
) -> pd.DataFrame:
    """Load long-format water consumption rows from vw_combined_meters."""

    def to_str(value):
        if value is None:
            return None
        if isinstance(value, (datetime, date)):
            return value.strftime("%Y-%m-%d")
        text = str(value).strip()
        return text[:10] if text else None

    start_str = to_str(start_date)
    end_str = to_str(end_date)
    cache_key = (start_str, end_str)

    if not bypass_cache:
        with _CACHE_LOCK:
            cached_val, expiry = _CACHE.get(cache_key, (None, 0))
            if cached_val is not None and time.time() < expiry:
                return cached_val.copy()

    value_columns = list(FLOW_RATE_COLUMNS.keys())
    cols = ["[TIMESTAMP]"] + [f"[{column}]" for column in value_columns]
    query = f"SELECT {', '.join(cols)} FROM {COMBINED_METERS_VIEW}"
    params: list[str] = []

    ts_expr = _timestamp_sql_expr()
    if start_str and end_str:
        query += f" WHERE {ts_expr} BETWEEN ? AND ?"
        params = [start_str + " 00:00:00", end_str + " 23:59:59.999"]
    elif start_str:
        query += f" WHERE {ts_expr} >= ?"
        params = [start_str + " 00:00:00"]
    elif end_str:
        query += f" WHERE {ts_expr} <= ?"
        params = [end_str + " 23:59:59.999"]

    conn = get_db_connection()
    import warnings

    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        if params:
            raw = pd.read_sql(query, conn, params=params)
        else:
            raw = pd.read_sql(query, conn)
    conn.close()

    if raw.empty:
        df_long = pd.DataFrame(columns=["DATE", "METER", "DIFFERENCE"])
    else:
        raw["TIMESTAMP"] = pd.to_datetime(raw["TIMESTAMP"], errors="coerce")
        raw = raw.dropna(subset=["TIMESTAMP"]).rename(columns={"TIMESTAMP": "DATE"})

        df_long = raw.melt(
            id_vars=["DATE"],
            value_vars=value_columns,
            var_name="RAW_METER",
            value_name="DIFFERENCE",
        )
        df_long["METER"] = df_long["RAW_METER"].map(FLOW_RATE_COLUMNS)
        df_long["DIFFERENCE"] = pd.to_numeric(df_long["DIFFERENCE"], errors="coerce")
        df_long = df_long.dropna(subset=["DIFFERENCE"])
        df_long = df_long[["DATE", "METER", "DIFFERENCE"]]
        df_long = (
            df_long.sort_values("DATE")
            .drop_duplicates(subset=["DATE", "METER"], keep="last")
        )

    if not bypass_cache:
        with _CACHE_LOCK:
            _CACHE[cache_key] = (df_long, time.time() + CACHE_TTL)

    return df_long.copy()
