import os
import pyodbc

SQL_SERVER   = os.getenv("SQL_SERVER", r"A00145469\MSSQLSERVER2025")
SQL_DATABASE = os.getenv("SQL_DATABASE", "Water_Management")

USE_WINDOWS_AUTH_ENV = os.getenv("USE_WINDOWS_AUTH", "False")
USE_WINDOWS_AUTH = USE_WINDOWS_AUTH_ENV.lower() in ("true", "1", "yes")

SQL_USERNAME = os.getenv("SQL_USERNAME", "sa")
SQL_PASSWORD = os.getenv("SQL_PASSWORD", "12345678")
SQL_DRIVER   = os.getenv("SQL_DRIVER", "ODBC Driver 17 for SQL Server")
SQL_ENCRYPT = os.getenv("SQL_ENCRYPT", "no")
SQL_TRUST_SERVER_CERTIFICATE = os.getenv("SQL_TRUST_SERVER_CERTIFICATE", "yes")
SQL_TIMEOUT = int(os.getenv("SQL_TIMEOUT", "5"))

def _auth_part() -> str:
    if USE_WINDOWS_AUTH:
        return "Trusted_Connection=yes;"
    return (
        f"UID={SQL_USERNAME};"
        f"PWD={SQL_PASSWORD};"
    )


def _connection_string(*, include_encryption: bool = True) -> str:
    base = (
        f"DRIVER={{{SQL_DRIVER}}};"
        f"SERVER={SQL_SERVER};"
        f"DATABASE={SQL_DATABASE};"
        f"Connection Timeout={SQL_TIMEOUT};"
    )
    if include_encryption:
        base += (
            f"Encrypt={SQL_ENCRYPT};"
            f"TrustServerCertificate={SQL_TRUST_SERVER_CERTIFICATE};"
        )
    return base + _auth_part()


def get_db_connection():
    attempts = [_connection_string(include_encryption=True)]

    # Some local SQL Server / ODBC combinations reject encryption keywords even
    # when Encrypt=no is configured. Retrying without those flags keeps local
    # development working while preserving explicit environment configuration.
    if SQL_ENCRYPT.strip().lower() in ("no", "false", "0", "optional"):
        attempts.append(_connection_string(include_encryption=False))

    last_error = None
    for conn_str in attempts:
        try:
            return pyodbc.connect(conn_str, timeout=SQL_TIMEOUT)
        except pyodbc.Error as exc:
            last_error = exc

    raise last_error
