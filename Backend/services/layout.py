import pandas as pd
from fastapi import APIRouter, HTTPException
from database.connection import get_db_connection

router = APIRouter(prefix="/api")

# Mapping of sanitized input meter name to flow_logs.meter
LIVE_METER_MAP = {
    "FRESH WATER TANK": "Fresh Water Tank",
    "OVERHEAD ADMIN TANK": "Over Head Tank",
    "WELL WATER": "Well Water",
    "DOMESTIC FRESH WATER": "Domestic Fresh",
    "DRINKING WATER RO PLANT": "Drinking Water RO Plant",
    "WWTP IN": "WWTP IN",
    "WWTP RO PLANT IN": "WWTP RO IN",
    "WWTP RO PLANT REJECTION": "WWTP RO Rejection",
}

# Mapping of sanitized input meter name to All_meters columns
HISTORICAL_COLUMNS_MAP = {
    "FRESH WATER TANK": ("FRESH WATER TANK_CURRENT", "FRESH WATER TANK_DIFFERENCE (m3)"),
    "OVERHEAD ADMIN TANK": ("OVERHEAD ADMIN TANK_CURRENT", "OVERHEAD ADMIN TANK_DIFFERENCE (m3)"),
    "WELL WATER": ("WELL WATER_CURRENT", "WELL WATER_DIFFERENCE (m3)"),
    "DOMESTIC FRESH WATER": ("DOMESTIC FRESH WATER_CURRENT", "DOMESTIC FRESH WATER_DIFFERENCE (m3)"),
    "DRINKING WATER RO PLANT": ("Drinking Water RO plant_CURRENT", "Drinking Water RO plant_DIFFERENCE (m3)"),
    "WWTP IN": ("WWTP IN_CURRENT", "WWTP IN_DIFFERENCE (m3)"),
    "WWTP RO PLANT IN": ("WWTP RO PLANT IN _CURRENT", "WWTP RO PLANT IN_DIFFERENCE (m3)"),
    "WWTP RO PLANT REJECTION": ("WWTP RO PLANT REJECTION_CURRENT", "WWTP RO PLANT REJECTION_DIFFERENCE (m3)"),
}

@router.get("/meter/{meter_name}")
def get_meter(meter_name: str):
    """
    Get latest meter data for a specific meter.
    - Uses flow_logs directly for ultra-fast, dynamic live metrics.
    - Falls back to All_meters for historical entries if not found in live logs.
    - Cascades to the full union view only as an absolute fallback for backward compatibility.
    """
    try:
        meter_name_clean = meter_name.strip().upper()
        
        # 1. Check live flow_logs first (Requirement 5)
        live_meter = LIVE_METER_MAP.get(meter_name_clean)
        if live_meter:
            conn = get_db_connection()
            cursor = conn.cursor()
            cursor.execute("""
                SELECT TOP 1 timestamp, forward_total, flow
                FROM flow_logs
                WHERE meter = ?
                ORDER BY timestamp DESC
            """, live_meter)
            row = cursor.fetchone()
            conn.close()
            
            if row:
                timestamp, forward_total, flow = row
                return {
                    "meter_name": meter_name.upper(),
                    "current": round(float(forward_total or 0), 2),
                    "flow_rate": round(float(flow or 0), 2),
                    "last_update": timestamp.strftime("%Y-%m-%d %H:%M:%S")
                }

        # 2. Check historical All_meters as fallback (Requirement 5)
        hist_cols = HISTORICAL_COLUMNS_MAP.get(meter_name_clean)
        if hist_cols:
            col_curr, col_diff = hist_cols
            conn = get_db_connection()
            cursor = conn.cursor()
            query = f"""
                SELECT TOP 1 [DATE], [{col_curr}], [{col_diff}]
                FROM All_meters
                WHERE [{col_curr}] IS NOT NULL OR [{col_diff}] IS NOT NULL
                ORDER BY TRY_CONVERT(DATETIME, [DATE], 6) DESC
            """
            cursor.execute(query)
            row = cursor.fetchone()
            conn.close()
            
            if row:
                date_val, current_val, diff_val = row
                try:
                    parsed_date = pd.to_datetime(date_val)
                    last_update = parsed_date.strftime("%Y-%m-%d %H:%M:%S")
                except Exception:
                    last_update = str(date_val)
                    
                # Safe conversions to float
                def to_f(v):
                    try:
                        return round(float(v), 2) if v is not None else 0.0
                    except Exception:
                        return 0.0

                return {
                    "meter_name": meter_name.upper(),
                    "current": to_f(current_val),
                    "flow_rate": to_f(diff_val),
                    "last_update": last_update
                }

        # 3. Ultimate view-based fallback for unrecognized/custom meter names
        conn = get_db_connection()
        query = "SELECT * FROM vw_combined_meters"
        import warnings
        with warnings.catch_warnings():
            warnings.simplefilter("ignore")
            df = pd.read_sql(query, conn)
        conn.close()

        meter_cols = [
            col
            for col in df.columns
            if meter_name_clean in col or col.strip().upper().startswith("DATE")
        ]

        if not meter_cols:
            raise HTTPException(
                status_code=404,
                detail=f"Meter '{meter_name}' not found"
            )

        meter_df = df[meter_cols].dropna(how="all")

        date_col = None
        current_col = None
        difference_col = None

        for col in meter_cols:
            col_upper = col.upper()
            if "DATE" in col_upper:
                date_col = col
            elif "CURRENT" in col_upper:
                current_col = col
            elif (
                "DIFFERENCE" in col_upper
                and "M3" in col_upper
                and not col_upper.endswith(".1")
            ):
                difference_col = col

        if not date_col:
            raise HTTPException(
                status_code=500,
                detail="DATE column not found for this meter"
            )

        meter_df[date_col] = pd.to_datetime(meter_df[date_col], errors="coerce")
        meter_df = meter_df.dropna(subset=[date_col])

        if meter_df.empty:
            raise HTTPException(
                status_code=404,
                detail=f"No data found for meter '{meter_name}'"
            )
            
        subset_cols = []
        if current_col: subset_cols.append(current_col)
        if difference_col: subset_cols.append(difference_col)
        
        if subset_cols:
            meter_df = meter_df.dropna(subset=subset_cols, how="all")
            
        if meter_df.empty:
            raise HTTPException(
                status_code=404,
                detail=f"No valid readings found for meter '{meter_name}'"
            )

        latest_row = meter_df.sort_values(by=date_col, ascending=False).iloc[0]

        current_value = 0
        if current_col and not pd.isna(latest_row[current_col]):
            current_value = round(float(latest_row[current_col]), 2)

        difference_value = 0
        if difference_col and not pd.isna(latest_row[difference_col]):
            difference_value = round(float(latest_row[difference_col]), 2)

        last_update = latest_row[date_col].strftime("%Y-%m-%d %H:%M:%S")

        return {
            "meter_name": meter_name.upper(),
            "current": current_value,
            "flow_rate": difference_value,
            "last_update": last_update
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=str(e)
        )