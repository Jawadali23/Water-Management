import calendar
from datetime import date, timedelta

import pandas as pd
from fastapi import APIRouter, HTTPException

from database.connection import get_db_connection
from services.calculation_service import (
    METERS,
    calculate_discharge,
    calculate_recycle_volume,
    calculate_recycling_percent,
    calculate_withdrawal,
    fetch_meter_total,
)
from services.production_service import get_production_between, get_production_map, get_production_series, per_unit
from services.sql_service import get_latest_date, get_meter_status_snapshot, load_sql_data

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


def _resolve_selected_day_window(
    latest_ts: pd.Timestamp,
    *,
    year: int | None,
    month: int | None,
    day: int | None,
    min_year: int = 2019,
) -> tuple[pd.Timestamp, pd.Timestamp]:
    y, m = _resolve_selected_month_year(latest_ts, year=year, month=month, min_year=min_year)
    _, last_day = calendar.monthrange(y, m)
    d = int(day) if day is not None else int(latest_ts.day)
    if d < 1 or d > last_day:
        raise HTTPException(status_code=400, detail=f"day must be between 1 and {last_day}")
    selected_day = date(y, m, d)
    start_ts = pd.Timestamp(selected_day - timedelta(days=1)) + pd.Timedelta(hours=22, minutes=30)
    end_ts = pd.Timestamp(selected_day) + pd.Timedelta(hours=22, minutes=30)
    return start_ts, end_ts


@router.get("/dashboard")
def dashboard(
    chart_range: str = "weekly",
    metric: str = "all",
    year: int | None = None,
    month: int | None = None,
    week: int | None = None,
    day: int | None = None,
):
    try:
        latest_ts = get_latest_date()
        
        # 1. Resolve exact date boundaries beforehand to filter in SQL (Requirement 3 & 5)
        if chart_range == "hourly":
            start_ts, end_ts = _resolve_selected_day_window(
                latest_ts, year=year, month=month, day=day
            )
        elif chart_range == "weekly":
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

        # 2. Query scoped SQL data directly instead of full view (Requirement 3 & 5)
        df = load_sql_data(start_ts.date(), end_ts.date())
        if df.empty:
            return {
                "status": "success",
                "date_from": start_ts.date().isoformat(),
                "date_to": end_ts.date().isoformat(),
                "labels": [],
                "datasets": {},
            }

        # 3. Pre-normalize date column for optimized loop comparisons (Requirement 6)
        df["DATE_NORM"] = df["DATE"].dt.normalize()

        labels: list[str] = []
        bucket_dates: list[date] = []
        wd_abs_series: list[float] = []
        dc_abs_series: list[float] = []
        wd_unit_series: list[float] = []
        dc_unit_series: list[float] = []

        production_map = get_production_map(start_ts.date(), end_ts.date())

        if chart_range == "hourly":
            df = df[(df["DATE"] >= start_ts) & (df["DATE"] < end_ts)]
            df["HOUR_SLOT"] = ((df["DATE"] - start_ts).dt.total_seconds() // 3600).astype(int)
            day_production = production_map.get(end_ts.date(), 0)
            for slot in range(24):
                hour_ts = start_ts + pd.Timedelta(hours=slot)
                hour_data = df[df["HOUR_SLOT"] <= slot]
                labels.append(hour_ts.strftime("%I:%M %p").lstrip("0"))
                bucket_dates.append(end_ts.date())
                withdrawal = calculate_withdrawal(hour_data)
                discharge = calculate_discharge(hour_data)
                wd_abs_series.append(withdrawal)
                dc_abs_series.append(discharge)
                wd_unit_series.append(per_unit(withdrawal, day_production))
                dc_unit_series.append(per_unit(discharge, day_production))

        elif chart_range == "weekly":
            for ts in pd.date_range(start=start_ts, end=end_ts, freq="D"):
                day_ts = pd.Timestamp(ts).normalize()
                day_data = df[df["DATE_NORM"] == day_ts]
                labels.append(_label_d_mmm_yy(day_ts))
                bucket_dates.append(day_ts.date())
                withdrawal = calculate_withdrawal(day_data)
                discharge = calculate_discharge(day_data)
                production = production_map.get(day_ts.date(), 0)
                wd_abs_series.append(withdrawal)
                dc_abs_series.append(discharge)
                wd_unit_series.append(per_unit(withdrawal, production))
                dc_unit_series.append(per_unit(discharge, production))

        elif chart_range == "monthly" or chart_range == "daily":
            for d in pd.date_range(start=start_ts, end=end_ts, freq="D"):
                day_ts = pd.Timestamp(d).normalize()
                day_data = df[df["DATE_NORM"] == day_ts]
                labels.append(_label_d_mmm_yy(day_ts))
                bucket_dates.append(day_ts.date())
                withdrawal = calculate_withdrawal(day_data)
                discharge = calculate_discharge(day_data)
                production = production_map.get(day_ts.date(), 0)
                wd_abs_series.append(withdrawal)
                dc_abs_series.append(discharge)
                wd_unit_series.append(per_unit(withdrawal, production))
                dc_unit_series.append(per_unit(discharge, production))

        elif chart_range == "yearly":
            y = start_ts.year
            df["YEAR"] = df["DATE"].dt.year
            df["MONTH"] = df["DATE"].dt.month
            month_dates = [date(y, m, 1) for m in range(1, 13)]
            month_production = get_production_series(
                month_dates, granularity="monthly"
            )
            for m in range(1, 13):
                month_data = df[(df["YEAR"] == y) & (df["MONTH"] == m)]
                labels.append(_label_mmm_yy(pd.Timestamp(date(y, m, 1))))
                bucket_dates.append(date(y, m, 1))
                withdrawal = calculate_withdrawal(month_data)
                discharge = calculate_discharge(month_data)
                production = month_production[m - 1]
                wd_abs_series.append(withdrawal)
                dc_abs_series.append(discharge)
                wd_unit_series.append(per_unit(withdrawal, production))
                dc_unit_series.append(per_unit(discharge, production))

        if metric == "all":
            datasets = {
                "withdrawal_per_unit": wd_unit_series,
                "discharge_per_unit": dc_unit_series,
                "water_withdrawal": wd_abs_series,
                "factory_discharge": dc_abs_series,
            }
        elif metric in ("withdrawal_per_unit", "withdraw", "water_withdrawal"):
            datasets = {
                "withdrawal_per_unit": wd_unit_series,
                "water_withdrawal": wd_abs_series,
            }
        elif metric in ("discharge_per_unit", "discharge", "factory_discharge"):
            datasets = {
                "discharge_per_unit": dc_unit_series,
                "factory_discharge": dc_abs_series,
            }
        elif metric == "fresh_water_tank":
            datasets = {
                "fresh_water_tank": [
                    fetch_meter_total(
                        df[df["DATE_NORM"] == pd.Timestamp(bucket).normalize()],
                        METERS["fresh_water_tank"],
                    )
                    for bucket in bucket_dates
                ]
            }
        else:
            raise HTTPException(status_code=400, detail="Invalid metric")

        return {
            "status": "success",
            "date_from": start_ts.isoformat() if chart_range == "hourly" else start_ts.date().isoformat(),
            "date_to": end_ts.isoformat() if chart_range == "hourly" else end_ts.date().isoformat(),
            "labels": labels,
            "datasets": datasets,
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/date-options")
def date_options(year: int | None = None, month: int | None = None):
    """Frontend helper: return available dates/months/years from the Excel."""
    try:
        df = load_sql_data()
        if df.empty:
            out: dict[str, object] = {
                "status": "success",
                "date_min": None,
                "date_max": None,
                "years": [],
                "months": [],
            }
            if year is not None and month is not None:
                out["days"] = []
                out["days_in_month"] = None
            return out

        dmin = pd.Timestamp(df["DATE"].min()).normalize()
        dmax = pd.Timestamp(df["DATE"].max()).normalize()

        years = sorted(df["DATE"].dt.year.dropna().astype(int).unique().tolist())
        if years:
            start_year = 2019
            end_year = max(years[-1], start_year)
            years = list(range(start_year, end_year + 1))
        month_periods = (
            df["DATE"].dt.to_period("M").dropna().astype(str).unique().tolist()
        )
        months = sorted(month_periods)  # "YYYY-MM"

        result: dict[str, object] = {
            "status": "success",
            "date_min": dmin.date().isoformat(),
            "date_max": dmax.date().isoformat(),
            "years": years,
            "months": months,
        }

        if year is not None and month is not None:
            if not 1 <= int(month) <= 12:
                raise HTTPException(status_code=400, detail="month must be between 1 and 12")
            _, last_d = calendar.monthrange(int(year), int(month))
            result["days_in_month"] = last_d
            result["days"] = list(range(1, last_d + 1))

        return result
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/meter-status")
def get_meter_status():
    try:
        results = get_meter_status_snapshot()
        return {"status": "success", "count": len(results), "data": results}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch meter status: {str(e)}")

@router.get("/review")
def review_page(year: int | None = None):
    try:
        latest_ts = get_latest_date()
        y = _resolve_selected_year(latest_ts, year=year)
        
        # Filter in SQL for only this year (Requirement 3)
        start_date = date(y, 1, 1)
        end_date = date(y, 12, 31)
        df = load_sql_data(start_date, end_date)
        
        if df.empty:
            return {"status": "success", "year": y, "data": {}}

        # Pre-extract month and year for fast pandas filtering (Requirement 6)
        df["YEAR"] = df["DATE"].dt.year
        df["MONTH"] = df["DATE"].dt.month
        year_data = df[df["YEAR"] == y]

        if year_data.empty:
            return {"status": "success", "year": y, "data": {}}

        # ── Monthly breakdown ─────────────────────────────────────────────────
        months_data = []
        for m in range(1, 13):
            month_data = year_data[year_data["MONTH"] == m]
            if month_data.empty:
                continue

            month_name         = pd.Timestamp(date(y, m, 1)).strftime("%B")
            withdrawal         = calculate_withdrawal(month_data)
            discharge          = calculate_discharge(month_data)
            fresh_water        = fetch_meter_total(month_data, METERS["fresh_water_tank"])
            recycle_volume     = calculate_recycle_volume(month_data)
            recycle_efficiency = calculate_recycling_percent(month_data)

            months_data.append({
                "month":                m,
                "month_name":           month_name,
                "water_withdrawal":     withdrawal,
                "fresh_water_tank":     fresh_water,
                "discharge":            discharge,
                "recycle_volume":       recycle_volume,
                "recycle_efficiency":   recycle_efficiency,
            })

        # ── Year summary ──────────────────────────────────────────────────────
        total_withdrawal     = calculate_withdrawal(year_data)
        total_discharge      = calculate_discharge(year_data)
        total_recycle_volume = calculate_recycle_volume(year_data)
        total_fresh_water    = fetch_meter_total(year_data, METERS["fresh_water_tank"])
        overall_efficiency   = calculate_recycling_percent(year_data)

        # ── Monthly metrics for insights ──────────────────────────────────────
        monthly_metrics = []
        for m in range(1, 13):
            month_data = year_data[year_data["MONTH"] == m]
            if month_data.empty:
                continue

            month_name         = pd.Timestamp(date(y, m, 1)).strftime("%B")
            withdrawal         = calculate_withdrawal(month_data)
            discharge          = calculate_discharge(month_data)
            fresh_water        = fetch_meter_total(month_data, METERS["fresh_water_tank"])
            recycle_efficiency = calculate_recycling_percent(month_data)

            monthly_metrics.append({
                "month":             m,
                "month_name":        month_name,
                "withdrawal":        withdrawal,
                "discharge":         discharge,
                "fresh_water_tank":  fresh_water,
                "recycle_efficiency": recycle_efficiency,
            })

        # ── Key insights ──────────────────────────────────────────────────────
        def safe_max(key):
            valid = [m for m in monthly_metrics if (m.get(key) or 0) > 0]
            return max(valid, key=lambda x: x[key]) if valid else None

        def safe_min(key):
            valid = [m for m in monthly_metrics if (m.get(key) or 0) > 0]
            return min(valid, key=lambda x: x[key]) if valid else None

        highest_fwt       = safe_max("fresh_water_tank")
        lowest_fwt        = safe_min("fresh_water_tank")
        highest_withdraw  = safe_max("withdrawal")
        lowest_withdraw   = safe_min("withdrawal")
        best_recycle      = safe_max("recycle_efficiency")
        highest_discharge = safe_max("discharge")

        has_withdrawal  = highest_withdraw is not None
        has_recycle     = best_recycle     is not None
        has_discharge   = highest_discharge is not None

        highest_intake = highest_withdraw if has_withdrawal else highest_fwt
        lowest_intake  = lowest_withdraw  if has_withdrawal else lowest_fwt
        intake_label   = "withdrawal"     if has_withdrawal else "fresh water tank"
        intake_key     = "withdrawal"     if has_withdrawal else "fresh_water_tank"

        insights = {
            "highest_intake_month": {
                "month":      highest_intake["month"]       if highest_intake else None,
                "month_name": highest_intake["month_name"]  if highest_intake else None,
                "value":      highest_intake[intake_key]    if highest_intake else 0,
                "label":      intake_label,
            },
            "lowest_intake_month": {
                "month":      lowest_intake["month"]        if lowest_intake else None,
                "month_name": lowest_intake["month_name"]   if lowest_intake else None,
                "value":      lowest_intake[intake_key]     if lowest_intake else 0,
                "label":      intake_label,
            },
            "best_recycle_month": {
                "month":      best_recycle["month"]              if has_recycle else None,
                "month_name": best_recycle["month_name"]         if has_recycle else None,
                "value":      best_recycle["recycle_efficiency"] if has_recycle else 0,
                "available":  has_recycle,
            },
            "highest_discharge_month": {
                "month":      highest_discharge["month"]      if has_discharge else None,
                "month_name": highest_discharge["month_name"] if has_discharge else None,
                "value":      highest_discharge["discharge"]  if has_discharge else 0,
                "available":  has_discharge,
            },
            "highest_fresh_water_tank_month": {
                "month":      highest_fwt["month"]            if highest_fwt else None,
                "month_name": highest_fwt["month_name"]       if highest_fwt else None,
                "value":      highest_fwt["fresh_water_tank"] if highest_fwt else 0,
                "available":  highest_fwt is not None,
            },
            "lowest_fresh_water_tank_month": {
                "month":      lowest_fwt["month"]            if lowest_fwt else None,
                "month_name": lowest_fwt["month_name"]       if lowest_fwt else None,
                "value":      lowest_fwt["fresh_water_tank"] if lowest_fwt else 0,
                "available":  lowest_fwt is not None,
            },
            "has_withdrawal_data": has_withdrawal,
            "has_recycle_data":    has_recycle,
            "has_discharge_data":  has_discharge,
            "year":                y,
        }

        return {
            "status": "success",
            "year": y,
            "data": {
                "summary": {
                    "total_withdrawal":          total_withdrawal,
                    "total_fresh_water_tank":    total_fresh_water,
                    "total_discharge":           total_discharge,
                    "total_recycle_volume":      total_recycle_volume,
                    "total_recycling_volume":    total_recycle_volume,
                    "total_recyling_volume":     total_recycle_volume,
                    "overall_recycle_efficiency":    overall_efficiency,
                    "overall_recycling_efficiency":  overall_efficiency,
                    "overall_recycling_efficency":   overall_efficiency,
                },
                "monthly_breakdown": months_data,
                "key_insights":      insights,
            },
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
