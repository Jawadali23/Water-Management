METERS = {
    "fresh_water_tank": "Fresh Water Tank",
    "overhead_admin_tank": "Over Head Tank",
    "well_water": "Well Water",
    "domestic_fresh_water": "Domestic Fresh",
    "drinking_water_ro_plant": "Drinking Water RO Plant",
    "wwtp_in": "WWTP IN",
    "wwtp_ro_in": "WWTP RO IN",
    "wwtp_ro_rejection": "WWTP RO Rejection",
}

# Meters whose summed FLOW_RATE values feed water withdrawal totals
WITHDRAWAL_SOURCE_KEYS = (
    "well_water",
    "fresh_water_tank"
)


def sheet_difference_totals(df, *meter_keys: str) -> dict[str, float]:
    """Sum of workbook DIFFERENCE (m³) per meter for the given date filter."""
    return {METERS[k]: fetch_meter_total(df, METERS[k]) for k in meter_keys}


def fetch_meter_total(df, meter_name: str):
    filtered = df[df["METER"] == meter_name]
    return float(round(filtered["DIFFERENCE"].sum(), 2))



def calculate_withdrawal(df):
    return round(
        fetch_meter_total(df, METERS["well_water"])
        + fetch_meter_total(df, METERS["fresh_water_tank"])
        ,2,
    )



def calculate_discharge(df):
    return round(
        fetch_meter_total(df, METERS["wwtp_in"])
        + fetch_meter_total(df, METERS["well_water"])
        - fetch_meter_total(df, METERS["wwtp_ro_in"]),
        2,
    )



def calculate_recycle_volume(df):
    
    recycled_volume = fetch_meter_total(df, METERS["overhead_admin_tank"])

    return round(recycled_volume , 2)


def calculate_recycling_percent(df):
    wastewater_in = calculate_withdrawal(df)
    ro_produced = calculate_recycle_volume(df)

    if wastewater_in <= 0:
        return 0
    

    return round(ro_produced / wastewater_in * 100, 2)

