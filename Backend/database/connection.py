import pyodbc

SQL_SERVER   = r"HPLAPTOP15DW\SQLEXPRESS01"
SQL_DATABASE = "Water_Management"
USE_WINDOWS_AUTH = False
SQL_USERNAME = "jawad"
SQL_PASSWORD = "123456"

def get_db_connection():

    base = (
        f"DRIVER={{ODBC Driver 17 for SQL Server}};"
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