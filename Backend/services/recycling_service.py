import calendar
from datetime import date

import pandas as pd
from fastapi import APIRouter, HTTPException

from services.calculation_service import (
    WITHDRAWAL_SOURCE_KEYS,
    calculate_recycle_volume,
    calculate_recycling_percent,
    sheet_difference_totals,
)
from services.sql_service import load_sql_data, get_latest_date
from utils.filters import get_filtered_dataframe, get_range_date_bounds

router = APIRouter(prefix="/api")


def _label_d_mmm_yy(ts: pd.Timestamp) -> str:
    """e.g. 1-Apr-26 (no leading zero on day; Windows-safe)."""
    t = pd.Timestamp(ts).normalize()
    return f"{int(t.day)}-{t.strftime('%b-%y')}"


def _label_mmm_yy(ts: pd.Timestamp) -> str:
    """e.g. Apr-26."""
    t = pd.Timestamp(ts).normalize()
    return t.strftime("%b-%y")


def _resolve_selected_year(
    latest_ts: pd.Timestamp,
    year: int | None,
    *,
    min_year: int = 2019,
) -> int:
    y = int(year) if year is not None else int(latest_ts.year)
    if y < min_year:
        raise HTTPException(status_code=400, detail=f"year must be >= {min_year}")
    return y


def _resolve_selected_month_year(
    latest_ts: pd.Timestamp,
    year: int | None,
    month: int | None,
    *,
    min_year: int = 2019,
) -> tuple[int, int]:
    y = int(year) if year is not None else int(latest_ts.year)
    m = int(month) if month is not None else int(latest_ts.month)
    if y < min_year:
        raise HTTPException(status_code=400, detail=f"year must be >= {min_year}")
    if not 1 <= m <= 12:
        raise HTTPException(status_code=400, detail="month must be between 1 and 12")
    return y, m


def _resolve_selected_week_window(
    latest_ts: pd.Timestamp,
    *,
    year: int | None,
    month: int | None,
    week: int | None,
    min_year: int = 2019,
) -> tuple[pd.Timestamp, pd.Timestamp]:
    y, m = _resolve_selected_month_year(latest_ts, year=year, month=month, min_year=min_year)
    _, last_day = calendar.monthrange(y, m)

    if week is None:
        if y == int(latest_ts.year) and m == int(latest_ts.month):
            w = ((int(latest_ts.day) - 1) // 7) + 1
        else:
            w = 1
    else:
        w = int(week)

    max_week = ((last_day - 1) // 7) + 1
    if w < 1 or w > max_week:
        raise HTTPException(
            status_code=400,
            detail=f"week must be between 1 and {max_week} for {y}-{m:02d}",
        )

    start_day = 1 + (w - 1) * 7
    end_day = min(start_day + 6, last_day)
    start_ts = pd.Timestamp(date(y, m, start_day)).normalize()
    end_ts = pd.Timestamp(date(y, m, end_day)).normalize()
    return start_ts, end_ts


@router.get("/recycling-percent")
def recycling_percent(
    range: str = "td",
    year: int | None = None,
    date_from: str | None = None,
    date_to: str | None = None,
):
    try:
        # 1. Resolve date bounds first using the cached full df (which is instant due to caching)
        df_full = load_sql_data()
        bounds = get_range_date_bounds(
            df_full, range, year=year, date_from=date_from, date_to=date_to
        )
        
        # 2. Extract bounds
        start_date = bounds.get("date_from")
        end_date = bounds.get("date_to")
        
        # 3. Load only the scoped data from SQL (Requirement 3)
        current_df = load_sql_data(start_date, end_date)
        
        current = calculate_recycling_percent(current_df)

        meters = sheet_difference_totals(current_df, *WITHDRAWAL_SOURCE_KEYS)
        meters.update(
            sheet_difference_totals(current_df, "wwtp_ro_in", "wwtp_ro_rejection")
        )

        return {
            "status": "success",
            "card": "Recycling Percent",
            **bounds,
            "value": current,
            "unit": "%",
            "absolute_value": calculate_recycle_volume(current_df),
            "absolute_unit": "m³",
            "meters": meters,
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/recycling-percent/chart")
def recycling_percent_chart(
    chart_range: str = "weekly",
    year: int | None = None,
    month: int | None = None,
    week: int | None = None,
    day: int | None = None,
):
    try:
        latest_ts = get_latest_date()
        
        # 1. Resolve date boundaries (Requirement 3)
        if chart_range == "weekly":
            start_ts, end_ts = _resolve_selected_week_window(
                latest_ts, year=year, month=month, week=week
            )
        elif chart_range == "monthly" or chart_range == "daily":
            y, m = _resolve_selected_month_year(latest_ts, year=year, month=month)
            _, last_d = calendar.monthrange(y, m)
            start_ts = pd.Timestamp(date(y, m, 1)).normalize()
            end_ts = pd.Timestamp(date(y, m, last_d)).normalize()
        elif chart_range == "yearly":
            y = _resolve_selected_year(latest_ts, year=year)
            start_ts = pd.Timestamp(date(y, 1, 1)).normalize()
            end_ts = pd.Timestamp(date(y, 12, 31)).normalize()
        else:
            raise HTTPException(status_code=400, detail="Invalid chart range")

        # 2. Scoped database loading (Requirement 3)
        df = load_sql_data(start_ts, end_ts)
        if df.empty:
            return {
                "status": "success",
                "chart_range": chart_range,
                "date_from": start_ts.date().isoformat() if 'start_ts' in locals() else None,
                "date_to": end_ts.date().isoformat() if 'end_ts' in locals() else None,
                "labels": [],
                "datasets": {"recycling_percent": []},
            }

        # 3. Pre-normalize date column for optimized loop comparisons (Requirement 6)
        df["DATE_NORM"] = df["DATE"].dt.normalize()

        labels: list[str] = []
        series: list[float] = []

        if chart_range == "weekly":
            for ts in pd.date_range(start=start_ts, end=end_ts, freq="D"):
                day_ts = pd.Timestamp(ts).normalize()
                day_data = df[df["DATE_NORM"] == day_ts]
                labels.append(_label_d_mmm_yy(day_ts))
                series.append(calculate_recycling_percent(day_data))
            date_from = start_ts.date().isoformat()
            date_to = end_ts.date().isoformat()

        elif chart_range == "monthly" or chart_range == "daily":
            for d in pd.date_range(start=start_ts, end=end_ts, freq="D"):
                day_ts = pd.Timestamp(d).normalize()
                day_data = df[df["DATE_NORM"] == day_ts]
                labels.append(_label_d_mmm_yy(day_ts))
                series.append(calculate_recycling_percent(day_data))
            date_from = start_ts.date().isoformat()
            date_to = end_ts.date().isoformat()

        elif chart_range == "yearly":
            y = start_ts.year
            df["YEAR"] = df["DATE"].dt.year
            df["MONTH"] = df["DATE"].dt.month
            for m in range(1, 13):
                month_data = df[(df["YEAR"] == y) & (df["MONTH"] == m)]
                labels.append(_label_mmm_yy(pd.Timestamp(date(y, m, 1))))
                series.append(calculate_recycling_percent(month_data))
            date_from = date(y, 1, 1).isoformat()
            date_to = date(y, 12, 31).isoformat()

        return {
            "status": "success",
            "chart_range": chart_range,
            "date_from": date_from,
            "date_to": date_to,
            "labels": labels,
            "datasets": {"recycling_percent": series},
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
