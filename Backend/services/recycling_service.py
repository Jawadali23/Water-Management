import calendar
from datetime import date

import pandas as pd
from fastapi import APIRouter, HTTPException

from services.calculation_service import (
    WITHDRAWAL_SOURCE_KEYS,
    calculate_recycling_percent,
    sheet_difference_totals,
)
from services.sql_service import load_sql_data
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
    df: pd.DataFrame,
    year: int | None,
    *,
    min_year: int = 2019,
) -> int:
    latest = pd.Timestamp(df["DATE"].max()).normalize()
    y = int(year) if year is not None else int(latest.year)
    if y < min_year:
        raise HTTPException(status_code=400, detail=f"year must be >= {min_year}")
    return y


def _resolve_selected_month_year(
    df: pd.DataFrame,
    year: int | None,
    month: int | None,
    *,
    min_year: int = 2019,
) -> tuple[int, int]:
    latest = pd.Timestamp(df["DATE"].max()).normalize()
    y = int(year) if year is not None else int(latest.year)
    m = int(month) if month is not None else int(latest.month)
    if y < min_year:
        raise HTTPException(status_code=400, detail=f"year must be >= {min_year}")
    if not 1 <= m <= 12:
        raise HTTPException(status_code=400, detail="month must be between 1 and 12")
    return y, m


def _resolve_selected_week_window(
    df: pd.DataFrame,
    *,
    year: int | None,
    month: int | None,
    week: int | None,
    min_year: int = 2019,
) -> tuple[pd.Timestamp, pd.Timestamp]:
    latest = pd.Timestamp(df["DATE"].max()).normalize()
    y, m = _resolve_selected_month_year(df, year=year, month=month, min_year=min_year)
    _, last_day = calendar.monthrange(y, m)

    if week is None:
        if y == int(latest.year) and m == int(latest.month):
            w = ((int(latest.day) - 1) // 7) + 1
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
        df = load_sql_data()
        current_df = get_filtered_dataframe(
            df, range, year=year, date_from=date_from, date_to=date_to
        )
        current = calculate_recycling_percent(current_df)

        meters = sheet_difference_totals(current_df, *WITHDRAWAL_SOURCE_KEYS)
        meters.update(
            sheet_difference_totals(current_df, "wwtp_ro_in", "wwtp_ro_rejection")
        )

        return {
            "status": "success",
            "card": "Recycling Percent",
            **get_range_date_bounds(
                df, range, year=year, date_from=date_from, date_to=date_to
            ),
            "value": current,
            "unit": "%",
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
    """Time series for recycling % (same buckets as ``/api/dashboard``).

    ``chart_range``: ``daily`` | ``hourly`` | ``weekly`` | ``monthly`` | ``yearly``.

    ``daily`` and ``monthly`` both return one point per calendar day for the
    selected ``year`` / ``month`` (28-31 points depending on the month).

    ``hourly`` uses ``[10:30, next day 10:30)`` on the selected calendar ``day``
    (optional ``year`` / ``month``): 24 buckets by hour offset from 10:30, with
    labels ``10:30`` ... ``09:30``; recycling % is from cumulative meter totals in that window.
    """
    try:
        df = load_sql_data()
        if df.empty:
            return {
                "status": "success",
                "chart_range": chart_range,
                "date_from": None,
                "date_to": None,
                "labels": [],
                "datasets": {"recycling_percent": []},
            }

        filtered = df
        labels: list[str] = []
        series: list[float] = []

        if chart_range == "weekly":
            start_ts, end_ts = _resolve_selected_week_window(
                df, year=year, month=month, week=week
            )
            for ts in pd.date_range(start=start_ts, end=end_ts, freq="D"):
                day_ts = pd.Timestamp(ts).normalize()
                day_data = filtered[filtered["DATE"].dt.normalize() == day_ts]
                labels.append(_label_d_mmm_yy(day_ts))
                series.append(calculate_recycling_percent(day_data))
            date_from = start_ts.date().isoformat()
            date_to = end_ts.date().isoformat()

        elif chart_range == "monthly":
            y, m = _resolve_selected_month_year(df, year=year, month=month)
            _, last_d = calendar.monthrange(y, m)
            for d in pd.date_range(
                start=date(y, m, 1), end=date(y, m, last_d), freq="D"
            ):
                ts = pd.Timestamp(d).normalize()
                day_data = filtered[filtered["DATE"].dt.normalize() == ts]
                labels.append(_label_d_mmm_yy(ts))
                series.append(calculate_recycling_percent(day_data))
            date_from = date(y, m, 1).isoformat()
            date_to = date(y, m, last_d).isoformat()

        elif chart_range == "yearly":
            y = _resolve_selected_year(df, year=year)
            for m in range(1, 13):
                month_data = filtered[
                    (filtered["DATE"].dt.year == y) & (filtered["DATE"].dt.month == m)
                ]
                labels.append(_label_mmm_yy(pd.Timestamp(date(y, m, 1))))
                series.append(calculate_recycling_percent(month_data))
            date_from = date(y, 1, 1).isoformat()
            date_to = date(y, 12, 31).isoformat()

        elif chart_range == "daily":
            y, m = _resolve_selected_month_year(df, year=year, month=month)
            _, last_d = calendar.monthrange(y, m)
            for d in pd.date_range(
                start=date(y, m, 1), end=date(y, m, last_d), freq="D"
            ):
                ts = pd.Timestamp(d).normalize()
                day_data = filtered[filtered["DATE"].dt.normalize() == ts]
                labels.append(_label_d_mmm_yy(ts))
                series.append(calculate_recycling_percent(day_data))
            date_from = date(y, m, 1).isoformat()
            date_to = date(y, m, last_d).isoformat()

        else:
            raise HTTPException(status_code=400, detail="Invalid chart range")

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
