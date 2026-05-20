import pandas as pd
from database.connection import get_db_connection
from services.calculation_service import METERS

def load_sql_data() -> pd.DataFrame:
    conn = get_db_connection()

    # COMBINED HISTORICAL + LIVE DATA
    query = "SELECT * FROM vw_combined_meters"

    import warnings
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        raw = pd.read_sql(query, conn)

    conn.close()

    _EXCEL_HEADER_TO_METER = {
        "FRESH WATER TANK": METERS["fresh_water_tank"],
        "OVERHEAD ADMIN TANK": METERS["overhead_admin_tank"],
        "WELL WATER": METERS["well_water"],
        "DOMESTIC FRESH WATER": METERS["domestic_fresh_water"],
        "Drinking Water RO plant": METERS["drinking_water_ro_plant"],
        "WWTP IN": METERS["wwtp_in"],
        "WWTP RO PLANT IN": METERS["wwtp_ro_in"],
        "WWTP RO PLANT REJECTION": METERS["wwtp_ro_rejection"],
    }

    # DATE COLUMN
    date_col = next(
        (c for c in raw.columns if "DATE" in str(c).upper()),
        None
    )

    if not date_col:
        return pd.DataFrame()

    # DIFFERENCE COLUMNS
    diff_cols = {}

    for key, meter in _EXCEL_HEADER_TO_METER.items():

        for c in raw.columns:

            c_upper = str(c).upper()

            if (
                key.upper() in c_upper
                and "DIFFERENCE" in c_upper
                and not c_upper.endswith(".1")
            ):

                diff_cols[c] = meter
                break

    if not diff_cols:
        return pd.DataFrame()

    # SUBSET
    df_subset = raw[[date_col] + list(diff_cols.keys())].copy()

    # DATE PARSING
    df_subset[date_col] = pd.to_datetime(
        df_subset[date_col],
        errors="coerce"
    )

    df_subset = df_subset.dropna(subset=[date_col])

    # MELT
    df_long = df_subset.melt(
        id_vars=[date_col],
        value_vars=list(diff_cols.keys()),
        var_name="RAW_METER",
        value_name="DIFFERENCE"
    )

    # MAP METER NAMES
    df_long["METER"] = df_long["RAW_METER"].map(diff_cols)

    # NUMERIC CONVERSION
    df_long["DIFFERENCE"] = pd.to_numeric(
        df_long["DIFFERENCE"],
        errors="coerce"
    )

    df_long = df_long.dropna(subset=["DIFFERENCE"])

    # FINAL FORMAT
    df_long = df_long.rename(columns={date_col: "DATE"})

    df_long = df_long[
        ["DATE", "METER", "DIFFERENCE"]
    ]

    # REMOVE DUPLICATES
    df_long = (
        df_long
        .sort_values("DATE")
        .drop_duplicates(
            subset=["DATE", "METER"],
            keep="last"
        )
    )

    return df_long