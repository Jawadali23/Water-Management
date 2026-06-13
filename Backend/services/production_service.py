import time
import threading
from datetime import date, datetime, time as dt_time, timedelta

import pandas as pd

from database.connection import get_db_connection
from utils.filters import get_range_date_bounds

PACKING_VIEW = "vw_PACKINGCOUNT"
PRODUCTION_CUTOFF = dt_time(22, 30)

_CACHE: dict = {}
_CACHE_LOCK = threading.Lock()
CACHE_TTL = 60


def clear_cache() -> None:
    with _CACHE_LOCK:
        _CACHE.clear()


def compute_production_date(updated_date: datetime | pd.Timestamp) -> date:
    """Map UPDATED_DATE into the 22:30-to-22:30 production business date."""
    ts = pd.Timestamp(updated_date)
    if ts.time() >= PRODUCTION_CUTOFF:
        return ts.date() + timedelta(days=1)
    return ts.date()


def _production_date_sql_expr() -> str:
    return """
        CASE
            WHEN CAST([UPDATED_DATE] AS TIME) >= '22:30:00'
            THEN DATEADD(DAY, 1, CAST([UPDATED_DATE] AS DATE))
            ELSE CAST([UPDATED_DATE] AS DATE)
        END
    """


def _business_window_for_dates(
    start_date: datetime | date | str | None,
    end_date: datetime | date | str | None,
) -> tuple[datetime | None, datetime | None]:
    def to_date(value) -> date | None:
        if value is None:
            return None
        if isinstance(value, datetime):
            return value.date()
        if isinstance(value, date):
            return value
        text = str(value).strip()
        return datetime.fromisoformat(text[:10]).date() if text else None

    start_d = to_date(start_date)
    end_d = to_date(end_date)
    start_ts = (
        datetime.combine(start_d - timedelta(days=1), PRODUCTION_CUTOFF)
        if start_d
        else None
    )
    end_ts = datetime.combine(end_d, PRODUCTION_CUTOFF) if end_d else None
    return start_ts, end_ts


def load_packing_data(
    start_date: datetime | date | str | None = None,
    end_date: datetime | date | str | None = None,
    *,
    bypass_cache: bool = False,
) -> pd.DataFrame:
    """Load packing rows using 22:30-to-22:30 production business days."""

    start_ts, end_ts = _business_window_for_dates(start_date, end_date)
    cache_key = ("packing", start_ts.isoformat() if start_ts else None, end_ts.isoformat() if end_ts else None)

    if not bypass_cache:
        with _CACHE_LOCK:
            cached_val, expiry = _CACHE.get(cache_key, (None, 0))
            if cached_val is not None and time.time() < expiry:
                return cached_val.copy()

    prod_expr = _production_date_sql_expr()
    query = f"""
        SELECT [InventoryID], [PRODUCT], [UPDATED_DATE], {prod_expr} AS [ProductionDate]
        FROM {PACKING_VIEW}
    """
    params: list[str] = []

    if start_ts and end_ts:
        query += " WHERE [UPDATED_DATE] >= ? AND [UPDATED_DATE] < ?"
        params = [start_ts, end_ts]
    elif start_ts:
        query += " WHERE [UPDATED_DATE] >= ?"
        params = [start_ts]
    elif end_ts:
        query += " WHERE [UPDATED_DATE] < ?"
        params = [end_ts]

    conn = get_db_connection()
    import warnings

    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        if params:
            df = pd.read_sql(query, conn, params=params)
        else:
            df = pd.read_sql(query, conn)
    conn.close()

    if not df.empty:
        df["UPDATED_DATE"] = pd.to_datetime(df["UPDATED_DATE"], errors="coerce")
        df["ProductionDate"] = pd.to_datetime(df["ProductionDate"], errors="coerce").dt.date

    if not bypass_cache:
        with _CACHE_LOCK:
            _CACHE[cache_key] = (df, time.time() + CACHE_TTL)

    return df.copy()


def sum_production_units(df: pd.DataFrame) -> int:
    """Each packing row is one unit; COUNT(InventoryID) matches SUM(1) per row."""
    if df.empty:
        return 0
    return int(df["InventoryID"].count())


def _production_dates_from_bounds(bounds: dict) -> tuple[date, date] | None:
    date_from = bounds.get("date_from")
    date_to = bounds.get("date_to")
    if not date_from or not date_to:
        return None

    start_ts = datetime.fromisoformat(str(date_from))
    end_ts = datetime.fromisoformat(str(date_to))
    start_date = start_ts.date() + timedelta(days=1)
    end_date = end_ts.date()
    if start_date > end_date:
        return None
    return start_date, end_date


def get_production_total(
    *,
    range_type: str = "td",
    year: int | None = None,
    date_from: str | None = None,
    date_to: str | None = None,
) -> tuple[int, dict]:
    df_full = load_packing_data()
    bounds = get_range_date_bounds(
        _packing_bounds_dataframe(df_full),
        range_type,
        year=year,
        date_from=date_from,
        date_to=date_to,
    )
    production_dates = _production_dates_from_bounds(bounds)
    if production_dates is None:
        return 0, bounds
    start, end = production_dates
    return get_production_between(start, end), bounds


def get_production_between(start: date, end: date) -> int:
    return sum(get_production_map(start, end).values())


def get_production_map(start: date, end: date) -> dict[date, int]:
    df = load_packing_data(start, end)
    if df.empty:
        return {}
    scoped = df[(df["ProductionDate"] >= start) & (df["ProductionDate"] <= end)]
    if scoped.empty:
        return {}
    grouped = scoped.groupby("ProductionDate")["InventoryID"].count()
    return {key: int(value) for key, value in grouped.items()}


def get_production_series(
    labels: list[date],
    *,
    granularity: str,
) -> list[int]:
    """Align production counts with chart buckets (daily / monthly / yearly)."""
    if not labels:
        return []

    min_label = min(labels)
    max_label = max(labels)
    df = load_packing_data(min_label, max_label)
    if df.empty:
        return [0] * len(labels)

    if granularity == "monthly":
        grouped = (
            df.assign(
                bucket=pd.to_datetime(df["ProductionDate"]).dt.to_period("M").astype(str)
            )
            .groupby("bucket")["InventoryID"]
            .count()
        )
        return [
            int(grouped.get(pd.Timestamp(label).strftime("%Y-%m"), 0))
            for label in labels
        ]

    grouped = df.groupby("ProductionDate")["InventoryID"].count()
    return [int(grouped.get(label, 0)) for label in labels]


def per_unit(volume: float, production_units: int) -> float:
    if production_units <= 0:
        return 0.0
    return round(float(volume) / production_units, 4)


def _packing_bounds_dataframe(df: pd.DataFrame) -> pd.DataFrame:
    """Adapter so date-bound helpers can reuse packing ProductionDate values."""
    if df.empty:
        return pd.DataFrame(columns=["DATE"])
    out = df.copy()
    out["DATE"] = pd.to_datetime(out["ProductionDate"])
    return out
