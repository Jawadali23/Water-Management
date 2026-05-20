METERS = {
    "fresh_water_tank": "Fresh Water Tank",
    "overhead_admin_tank": "Overhead Admin Tank",
    "well_water": "Well Water",
    "domestic_fresh_water": "Domestic Fresh Water",
    "drinking_water_ro_plant": "Drinking Water RO plant",
    "wwtp_in": "WWTP IN (Digital)",
    "wwtp_ro_in": "WWTP RO PLANT IN",
    "wwtp_ro_rejection": "WWTP RO PLANT REJECTION",
}

# Meters whose DIFFERENCE (m³) columns feed water withdrawal totals
WITHDRAWAL_SOURCE_KEYS = (
    "well_water",
    "overhead_admin_tank",
    "domestic_fresh_water",
    "drinking_water_ro_plant",
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
        + fetch_meter_total(df, METERS["overhead_admin_tank"])
        + fetch_meter_total(df, METERS["domestic_fresh_water"])
        + fetch_meter_total(df, METERS["drinking_water_ro_plant"]),
        2,
    )



def calculate_discharge(df):
    return round(
        fetch_meter_total(df, METERS["wwtp_in"])
        - fetch_meter_total(df, METERS["wwtp_ro_in"]),
        2,
    )



def calculate_recycle_volume(df):
    return round(fetch_meter_total(df, METERS["wwtp_ro_in"]), 2)



def calculate_recycling_percent(df):
    wastewater_in = fetch_meter_total(df, METERS["wwtp_in"])
    recovered = calculate_recycle_volume(df)

    if wastewater_in <= 0:
        return 0

    return round((recovered / wastewater_in) * 100, 2)


