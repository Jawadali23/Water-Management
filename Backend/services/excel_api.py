from pathlib import Path
from datetime import date, datetime, time as time_type
import os
import shutil

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse
from openpyxl import Workbook
from pydantic import BaseModel, Field

from database.connection import get_db_connection

router = APIRouter(prefix="/api")

BASE_DIR = Path(__file__).resolve().parent.parent
MANUAL_DATA_DIR = BASE_DIR / "manual_data"
WORKBOOK_PATH = MANUAL_DATA_DIR / "manual_meter_readings.xlsx"
LEGACY_WORKBOOK_PATH = BASE_DIR / "manual_meter_readings.xlsx"
SHEET_NAME = "Manual Readings"
HEADERS = ["Date", "Time", "Meter Name", "Reading", "Unit", "User", "Remarks"]
MANUAL_READING_SCHEMA = os.getenv("MANUAL_READING_SCHEMA", "dbo")
MANUAL_READING_TABLE = os.getenv("MANUAL_READING_TABLE", "Manual_reading")


def _quote_identifier(name: str) -> str:
    return f"[{name.replace(']', ']]')}]"


def _table_ref(schema_name: str, table_name: str) -> str:
    return f"{_quote_identifier(schema_name)}.{_quote_identifier(table_name)}"


def _serialize_value(value):
    if isinstance(value, datetime):
        return value.isoformat(sep=" ")
    if isinstance(value, date):
        return value.isoformat()
    if isinstance(value, time_type):
        return value.strftime("%H:%M:%S")
    return value


class ManualReading(BaseModel):
    date: str = Field(..., description="Reading date")
    time: str = Field(..., description="Reading time")
    meter_name: str = Field(..., description="Meter name")
    reading: float = Field(..., description="Meter reading")
    unit: str = Field(..., description="Reading unit")
    user: str = Field(default="", description="User who entered the reading")
    remarks: str = Field(default="", description="Optional remarks")


def _ensure_workbook(path: Path) -> None:
    MANUAL_DATA_DIR.mkdir(parents=True, exist_ok=True)

    if path.exists():
        if path.is_dir():
            raise HTTPException(
                status_code=500,
                detail=f"Workbook path is a directory: {path}",
            )
        return

    workbook = Workbook()
    worksheet = workbook.active
    worksheet.title = SHEET_NAME
    worksheet.append(HEADERS)
    workbook.save(path)


def _sync_legacy_copy(source: Path) -> None:
    try:
        if LEGACY_WORKBOOK_PATH.exists() and LEGACY_WORKBOOK_PATH.is_dir():
            return
        shutil.copy2(source, LEGACY_WORKBOOK_PATH)
    except Exception:
        # The canonical workbook lives in manual_data; the root copy is only for
        # backward compatibility with older scripts and tests.
        pass


def _get_manual_readings_from_sql() -> list[dict]:
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        schema_name, table_name = MANUAL_READING_SCHEMA, MANUAL_READING_TABLE
        table_ref = _table_ref(schema_name, table_name)
        cursor.execute(
            f"""
            SELECT *
            FROM {table_ref}
            ORDER BY [TIMESTAMP] DESC
            """
        )
        rows = cursor.fetchall()
        columns = [column[0] for column in cursor.description]
        return [
            {key: _serialize_value(value) for key, value in zip(columns, row)}
            for row in rows
        ]
    finally:
        conn.close()


@router.post("/save-manual-reading")
def save_manual_reading(reading: ManualReading):
    raise HTTPException(
        status_code=400,
        detail="The current SSMS table is read-only from this UI. Use the SQL-backed manual readings view instead of save-manual-reading.",
    )


@router.get("/manual-readings")
def get_manual_readings():
    try:
        return {
            "status": "success",
            "data": _get_manual_readings_from_sql(),
        }
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@router.get("/download-excel")
def download_excel():
    try:
        _write_sql_export_to_workbook()
        return FileResponse(
            WORKBOOK_PATH,
            filename=WORKBOOK_PATH.name,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        )
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@router.get("/open-excel")
def open_excel():
    try:
        _write_sql_export_to_workbook()
        if hasattr(os, "startfile"):
            os.startfile(WORKBOOK_PATH)
            return {"message": "Excel opened successfully"}
        else:
            raise HTTPException(
                status_code=400,
                detail="Opening Excel file directly on the host is not supported in this environment. Please download it instead."
            )
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


def _write_sql_export_to_workbook() -> Path:
    rows = _get_manual_readings_from_sql()
    MANUAL_DATA_DIR.mkdir(parents=True, exist_ok=True)

    workbook = Workbook()
    worksheet = workbook.active
    worksheet.title = SHEET_NAME
    if rows:
        headers = list(rows[0].keys())
    else:
        headers = HEADERS
    worksheet.append(headers)
    for row in rows:
        worksheet.append([row.get(header) for header in headers])

    workbook.save(WORKBOOK_PATH)
    _sync_legacy_copy(WORKBOOK_PATH)
    return WORKBOOK_PATH