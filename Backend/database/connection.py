import os
import pyodbc

SQL_SERVER   = os.getenv("SQL_SERVER", r"HPLAPTOP15DW\SQLEXPRESS01")
SQL_DATABASE = os.getenv("SQL_DATABASE", "Water_Management")

USE_WINDOWS_AUTH_ENV = os.getenv("USE_WINDOWS_AUTH", "False")
USE_WINDOWS_AUTH = USE_WINDOWS_AUTH_ENV.lower() in ("true", "1", "yes")

SQL_USERNAME = os.getenv("SQL_USERNAME", "jawad")
SQL_PASSWORD = os.getenv("SQL_PASSWORD", "123456")
SQL_DRIVER   = os.getenv("SQL_DRIVER", "ODBC Driver 17 for SQL Server")

def get_db_connection():

    base = (
        f"DRIVER={{{SQL_DRIVER}}};"
        f"SERVER={SQL_SERVER};"
        f"DATABASE={SQL_DATABASE};"
    )

    if USE_WINDOWS_AUTH:
        conn_str = base + "Trusted_Connection=yes;"
    else:
        conn_str = base + (
            f"UID={SQL_USERNAME};"
            f"PWD={SQL_PASSWORD};"
        )

    return pyodbc.connect(conn_str)