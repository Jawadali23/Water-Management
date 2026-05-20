import pandas as pd
from fastapi import APIRouter, HTTPException
from database.connection import get_db_connection

router = APIRouter(prefix="/api")


@router.get("/meter/{meter_name}")
def get_meter(meter_name: str):
    """
    Get latest meter data for a specific meter.
    Example: /api/meter/FRESH%20WATER%20TANK
    """
    try:
        conn = get_db_connection()
        query = "SELECT * FROM vw_combined_meters"
        import warnings
        with warnings.catch_warnings():
            warnings.simplefilter("ignore")
            df = pd.read_sql(query, conn)
        conn.close()

        # Clean meter name for searching
        meter_name_clean = meter_name.strip().upper()

        # Find columns related to this meter and keep the shared DATE column.
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

        # Extract data for this meter
        meter_df = df[meter_cols].dropna(how="all")

        # Find the DATE column for this meter
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

        # Convert date column
        meter_df[date_col] = pd.to_datetime(meter_df[date_col], errors="coerce")

        # Remove rows with invalid dates
        meter_df = meter_df.dropna(subset=[date_col])

        if meter_df.empty:
            raise HTTPException(
                status_code=404,
                detail=f"No data found for meter '{meter_name}'"
            )
            
        # Filter out rows where both current and difference are NaN
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

        # Get latest row
        latest_row = meter_df.sort_values(by=date_col, ascending=False).iloc[0]

        # Extract values
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