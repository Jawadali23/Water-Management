import time
import threading
from datetime import datetime, date
import pandas as pd
from database.connection import get_db_connection
from services.calculation_service import METERS

# Simple dictionary-based TTL cache
_CACHE = {}
_CACHE_LOCK = threading.Lock()
CACHE_TTL = 60  # seconds

# Cache for the latest database date to speed up date boundary computations
_LATEST_DATE_CACHE = (None, 0)

def clear_cache():
    """Clear all caches."""
    with _CACHE_LOCK:
        _CACHE.clear()
    global _LATEST_DATE_CACHE
    _LATEST_DATE_CACHE = (None, 0)

def get_latest_date(bypass_cache: bool = False) -> pd.Timestamp:
    """Fetch the latest date from the database. Uses caching."""
    global _LATEST_DATE_CACHE
    if not bypass_cache:
        cached_val, expiry = _LATEST_DATE_CACHE
        if cached_val is not None and time.time() < expiry:
            return cached_val
            
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT MAX([DATE]) FROM vw_combined_meters")
    row = cursor.fetchone()
    conn.close()
    
    latest = pd.Timestamp(row[0]) if row and row[0] else pd.Timestamp.now()
    _LATEST_DATE_CACHE = (latest, time.time() + CACHE_TTL)
    return latest

def load_sql_data(
    start_date: datetime | date | str | None = None,
    end_date: datetime | date | str | None = None,
    bypass_cache: bool = False
) -> pd.DataFrame:
    """
    Optimized database data loader.
    - Only queries necessary columns (avoids SELECT *).
    - Moves date filtering from pandas to SQL Server.
    - Caches results for 60 seconds (thread-safe).
    - Uses highly optimized pandas mapping and melting operations.
    """
    # Convert inputs to ISO date string format (YYYY-MM-DD) for standard cache key
    def to_str(d):
        if d is None:
            return None
        if isinstance(d, (datetime, date)):
            return d.strftime("%Y-%m-%d")
        d_str = str(d).strip()
        if not d_str:
            return None
        return d_str[:10]

    s_str = to_str(start_date)
    e_str = to_str(end_date)
    cache_key = (s_str, e_str)

    if not bypass_cache:
        with _CACHE_LOCK:
            cached_val, expiry = _CACHE.get(cache_key, (None, 0))
            if cached_val is not None and time.time() < expiry:
                return cached_val.copy()

    # Hardcoded mapping of columns to METERS values
    _COLUMN_TO_METER = {
        "FRESH WATER TANK_DIFFERENCE (m3)": METERS["fresh_water_tank"],
        "OVERHEAD ADMIN TANK_DIFFERENCE (m3)": METERS["overhead_admin_tank"],
        "WELL WATER_DIFFERENCE (m3)": METERS["well_water"],
        "DOMESTIC FRESH WATER_DIFFERENCE (m3)": METERS["domestic_fresh_water"],
        "Drinking Water RO plant_DIFFERENCE (m3)": METERS["drinking_water_ro_plant"],
        "WWTP IN_DIFFERENCE (m3)": METERS["wwtp_in"],
        "WWTP RO PLANT IN_DIFFERENCE (m3)": METERS["wwtp_ro_in"],
        "WWTP RO PLANT REJECTION_DIFFERENCE (m3)": METERS["wwtp_ro_rejection"],
    }

    cols = ["[DATE]"] + [f"[{col}]" for col in _COLUMN_TO_METER.keys()]
    query = f"SELECT {', '.join(cols)} FROM vw_combined_meters"
    params = []

    # Move filtering into SQL
    if s_str and e_str:
        query += " WHERE [DATE] BETWEEN ? AND ?"
        params = [s_str + " 00:00:00", e_str + " 23:59:59.999"]
    elif s_str:
        query += " WHERE [DATE] >= ?"
        params = [s_str + " 00:00:00"]
    elif e_str:
        query += " WHERE [DATE] <= ?"
        params = [e_str + " 23:59:59.999"]

    conn = get_db_connection()
    import warnings
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        if params:
            raw = pd.read_sql(query, conn, params=params)
        else:
            raw = pd.read_sql(query, conn)
    conn.close()

    if raw.empty:
        df_long = pd.DataFrame(columns=["DATE", "METER", "DIFFERENCE"])
    else:
        # Convert DATE column
        raw["DATE"] = pd.to_datetime(raw["DATE"], errors="coerce")
        raw = raw.dropna(subset=["DATE"])

        # Melt raw to long format
        df_long = raw.melt(
            id_vars=["DATE"],
            value_vars=list(_COLUMN_TO_METER.keys()),
            var_name="RAW_METER",
            value_name="DIFFERENCE"
        )

        # Map meter names
        df_long["METER"] = df_long["RAW_METER"].map(_COLUMN_TO_METER)

        # Convert DIFFERENCE to numeric and drop NaNs
        df_long["DIFFERENCE"] = pd.to_numeric(df_long["DIFFERENCE"], errors="coerce")
        df_long = df_long.dropna(subset=["DIFFERENCE"])

        # Keep only DATE, METER, DIFFERENCE
        df_long = df_long[["DATE", "METER", "DIFFERENCE"]]

        # Sort and drop duplicates efficiently
        df_long = (
            df_long
            .sort_values("DATE")
            .drop_duplicates(subset=["DATE", "METER"], keep="last")
        )

    if not bypass_cache:
        with _CACHE_LOCK:
            _CACHE[cache_key] = (df_long, time.time() + CACHE_TTL)

    return df_long.copy()