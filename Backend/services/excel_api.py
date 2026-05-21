from pathlib import Path
import os
import shutil

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse
from openpyxl import Workbook, load_workbook
from pydantic import BaseModel, Field

router = APIRouter(prefix="/api")

BASE_DIR = Path(__file__).resolve().parent.parent
MANUAL_DATA_DIR = BASE_DIR / "manual_data"
WORKBOOK_PATH = MANUAL_DATA_DIR / "manual_meter_readings.xlsx"
LEGACY_WORKBOOK_PATH = BASE_DIR / "manual_meter_readings.xlsx"
SHEET_NAME = "Manual Readings"
HEADERS = ["Date", "Time", "Meter Name", "Reading", "Unit", "User", "Remarks"]


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


def _append_reading(reading: ManualReading) -> Path:
    _ensure_workbook(WORKBOOK_PATH)

    workbook = load_workbook(WORKBOOK_PATH)
    worksheet = workbook[SHEET_NAME] if SHEET_NAME in workbook.sheetnames else workbook.active
    if worksheet.max_row == 0:
        worksheet.append(HEADERS)

    worksheet.append(
        [
            reading.date,
            reading.time,
            reading.meter_name,
            reading.reading,
            reading.unit,
            reading.user,
            reading.remarks,
        ]
    )
    workbook.save(WORKBOOK_PATH)
    _sync_legacy_copy(WORKBOOK_PATH)
    return WORKBOOK_PATH


@router.post("/save-manual-reading")
def save_manual_reading(reading: ManualReading):
    try:
        workbook_path = _append_reading(reading)
        return {
            "status": "success",
            "message": "Manual reading saved successfully",
            "file_path": str(workbook_path),
        }
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@router.get("/download-excel")
def download_excel():
    try:
        _ensure_workbook(WORKBOOK_PATH)
        _sync_legacy_copy(WORKBOOK_PATH)
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
        _ensure_workbook(WORKBOOK_PATH)
        _sync_legacy_copy(WORKBOOK_PATH)
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