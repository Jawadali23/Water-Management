import time
import threading
from datetime import date, datetime, time as dt_time, timedelta

import pandas as pd

from database.connection import get_db_connection
from utils.filters import get_range_date_bounds

PACKING_VIEW = "vw_packingcount"
PRODUCTION_CUTOFF = dt_time(10, 30)

_CACHE: dict = {}
_CACHE_LOCK = threading.Lock()
CACHE_TTL = 60


def clear_cache() -> None:
    with _CACHE_LOCK:
        _CACHE.clear()


def compute_production_date(updated_date: datetime | pd.Timestamp) -> date:
    """Shift packing timestamps before 10:30 to the previous calendar day."""
    ts = pd.Timestamp(updated_date)
    if ts.time() < PRODUCTION_CUTOFF:
        return (ts.date() - timedelta(days=1))
    return ts.date()


def _production_date_sql_expr() -> str:
    return """
        CASE
            WHEN CAST([UPDATED_DATE] AS TIME) < '10:30:00'
            THEN DATEADD(DAY, -1, CAST([UPDATED_DATE] AS DATE))
            ELSE CAST([UPDATED_DATE] AS DATE)
        END
    """


def load_packing_data(
    start_date: datetime | date | str | None = None,
    end_date: datetime | date | str | None = None,
    *,
    bypass_cache: bool = False,
) -> pd.DataFrame:
    """Load packing rows with a derived ProductionDate column."""

    def to_str(value) -> str | None:
        if value is None:
            return None
        if isinstance(value, (datetime, date)):
            return value.strftime("%Y-%m-%d")
        text = str(value).strip()
        return text[:10] if text else None

    start_str = to_str(start_date)
    end_str = to_str(end_date)
    cache_key = ("packing", start_str, end_str)

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

    if start_str and end_str:
        query += f" WHERE {prod_expr} BETWEEN ? AND ?"
        params = [start_str, end_str]
    elif start_str:
        query += f" WHERE {prod_expr} >= ?"
        params = [start_str]
    elif end_str:
        query += f" WHERE {prod_expr} <= ?"
        params = [end_str]

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


def get_production_total(
    *,
    range_type: str = "td",
    year: int | None = None,
    date_from: str | None = None,
    date_to: str | None = None,
) -> tuple[int, dict]:
    """Return production units for TD / MTD / YTD / custom bounds."""
    df_full = load_packing_data()
    bounds = get_range_date_bounds(
        _packing_bounds_dataframe(df_full),
        range_type,
        year=year,
        date_from=date_from,
        date_to=date_to,
    )

    date_from_iso = bounds.get("date_from")
    date_to_iso = bounds.get("date_to")
    if not date_from_iso or not date_to_iso:
        return 0, bounds

    start = pd.Timestamp(date_from_iso).date()
    end = pd.Timestamp(date_to_iso).date()
    scoped = df_full[
        (df_full["ProductionDate"] >= start) & (df_full["ProductionDate"] <= end)
    ]
    return sum_production_units(scoped), bounds


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
