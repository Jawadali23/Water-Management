from fastapi import APIRouter, HTTPException

from services.calculation_service import (
    METERS,
    WITHDRAWAL_SOURCE_KEYS,
    calculate_discharge,
    calculate_recycle_volume,
    calculate_recycling_percent,
    calculate_withdrawal,
    fetch_meter_total,
    sheet_difference_totals,
)
from datetime import date as dt_date

from services.production_service import get_production_between, per_unit
from services.sql_service import load_sql_data
from utils.filters import get_filtered_dataframe, get_range_date_bounds

router = APIRouter(prefix="/api")


def _load_scoped_cards_dataframe(
    *,
    range: str,
    year: int | None,
    date_from: str | None,
    date_to: str | None,
):
    """
    Resolve date bounds first via the cached database dataframe,
    then load only the precisely filtered records from SQL.
    (Requirement 3 & 4)
    """
    df_full = load_sql_data()
    bounds = get_range_date_bounds(
        df_full,
        range,
        year=year,
        date_from=date_from,
        date_to=date_to,
    )
    current_df = get_filtered_dataframe(
        df_full,
        range,
        year=year,
        date_from=date_from,
        date_to=date_to,
    )
    return current_df, bounds


def get_production_unit_for_bounds(bounds: dict) -> int | None:
    date_from = bounds.get("date_from")
    date_to = bounds.get("date_to")
    if not date_from or not date_to:
        return None
    production = get_production_between(
        dt_date.fromisoformat(str(date_from)),
        dt_date.fromisoformat(str(date_to)),
    )
    return production or None


# @router.get("/fresh-water-tank")
# def fresh_water_tank(
#     range: str = "td",
#     year: int | None = None,
#     date_from: str | None = None,
#     date_to: str | None = None,
# ):
#     try:
#         current_df, bounds = _load_scoped_cards_dataframe(
#             range=range, year=year, date_from=date_from, date_to=date_to
#         )
#         current = fetch_meter_total(current_df, METERS["fresh_water_tank"])

#         return {
#             "status": "success",
#             "card": "Fresh Water Tank",
#             **bounds,
#             "value": current,
#             "unit": "m³",
#             "meters": sheet_difference_totals(current_df, "fresh_water_tank"),
#         }

#     except Exception as e:
#         raise HTTPException(status_code=500, detail=str(e))


@router.get("/water-withdrawal")
def water_withdrawal(
    range: str = "td",
    year: int | None = None,
    date_from: str | None = None,
    date_to: str | None = None,
):
    try:
        current_df, bounds = _load_scoped_cards_dataframe(
            range=range, year=year, date_from=date_from, date_to=date_to
        )
        current = calculate_withdrawal(current_df)
        pu = get_production_unit_for_bounds(bounds)
        intensity = per_unit(current, pu) if pu else None

        return {
            "status": "success",
            "card": "Water Withdrawal",
            **bounds,
            "value": current,
            "unit": "m³",
            "intensity": intensity,
            "intensity_unit": "m³/Unit",
            "production_unit": pu,
            "meters": sheet_difference_totals(current_df, *WITHDRAWAL_SOURCE_KEYS),
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# @router.get("/recycle-volume")
# def recycle_volume(
#     range: str = "td",
#     year: int | None = None,
#     date_from: str | None = None,
#     date_to: str | None = None,
# ):
#     try:
#         current_df, bounds = _load_scoped_cards_dataframe(
#             range=range, year=year, date_from=date_from, date_to=date_to
#         )
#         current = calculate_recycle_volume(current_df)

#         return {
#             "status": "success",
#             "card": "Recycle Volume",
#             **bounds,
#             "value": current,
#             "unit": "m³",
#             "meters": sheet_difference_totals(
#                 current_df, "wwtp_ro_in", "wwtp_ro_rejection"
#             ),
#         }

#     except Exception as e:
#         raise HTTPException(status_code=500, detail=str(e))


@router.get("/factory-discharge")
def factory_discharge(
    range: str = "td",
    year: int | None = None,
    date_from: str | None = None,
    date_to: str | None = None,
):
    try:
        current_df, bounds = _load_scoped_cards_dataframe(
            range=range, year=year, date_from=date_from, date_to=date_to
        )
        current = calculate_discharge(current_df)
        pu = get_production_unit_for_bounds(bounds)
        intensity = per_unit(current, pu) if pu else None

        return {
            "status": "success",
            "card": "Factory Discharge",
            **bounds,
            "value": current,
            "unit": "m³",
            "intensity": intensity,
            "intensity_unit": "m³/Unit",
            "production_unit": pu,
            "meters": sheet_difference_totals(current_df, "wwtp_in", "wwtp_ro_in"),
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/production")
def production_card(
    range: str = "td",
    year: int | None = None,
    date_from: str | None = None,
    date_to: str | None = None,
):
    try:
        _, bounds = _load_scoped_cards_dataframe(
            range=range, year=year, date_from=date_from, date_to=date_to
        )
        pu = get_production_unit_for_bounds(bounds)

        return {
            "status": "success",
            "card": "Production",
            **bounds,
            "value": pu or 0,
            "unit": "Unit",
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/cards")
def all_cards(
    range: str = "td",
    year: int | None = None,
    date_from: str | None = None,
    date_to: str | None = None,
):
    """All dashboard cards in one response.

    ``range`` matches the per-card endpoints.
    - ``td`` - latest day in the selected scope.
    - ``mtd`` - full calendar month of that latest day.
    - ``ytd`` - 1 Jan through latest day in the selected scope.

    Optional ``year`` scopes the cards to that calendar year before applying the range.
    Optional ``date_from`` / ``date_to`` (ISO ``YYYY-MM-DD``) select a custom window instead.
    """
    try:
        current_df, bounds = _load_scoped_cards_dataframe(
            range=range, year=year, date_from=date_from, date_to=date_to
        )

        recycling_meters = sheet_difference_totals(current_df, *WITHDRAWAL_SOURCE_KEYS)
        recycling_meters.update(
            sheet_difference_totals(current_df, "overhead_admin_tank")
        )

        pu = get_production_unit_for_bounds(bounds)
        wd_val = calculate_withdrawal(current_df)
        wd_intensity = per_unit(wd_val, pu) if pu else None

        fd_val = calculate_discharge(current_df)
        fd_intensity = per_unit(fd_val, pu) if pu else None
        recycle_val = calculate_recycle_volume(current_df)
        recycling_percent = calculate_recycling_percent(current_df)

        return {
            "status": "success",
            **bounds,
            "cards": {
                # "fresh_water_tank": {
                #     "card": "Fresh Water Tank",
                #     "value": fetch_meter_total(current_df, METERS["fresh_water_tank"]),
                #     "unit": "m³",
                #     "meters": sheet_difference_totals(current_df, "fresh_water_tank"),
                # },
                "water_withdrawal": {
                    "card": "Water Withdrawal",
                    "value": wd_val,
                    "unit": "m³",
                    "intensity": wd_intensity,
                    "intensity_unit": "m³/Unit",
                    "production_unit": pu,
                    "meters": sheet_difference_totals(current_df, *WITHDRAWAL_SOURCE_KEYS),
                },
                # "recycle_volume": {
                #     "card": "Recycle Volume",
                #     "value": recycle_val,
                #     "unit": "m³",
                #     "meters": 
                #          sheet_difference_totals(current_df, "overhead_admin_tank",*WITHDRAWAL_SOURCE_KEYS),
        
                # },
                "factory_discharge": {
                    "card": "Factory Discharge",
                    "value": fd_val,
                    "unit": "m³",
                    "intensity": fd_intensity,
                    "intensity_unit": "m³/Unit",
                    "production_unit": pu,
                    "meters": sheet_difference_totals(current_df, "wwtp_in", "wwtp_ro_in"),
                },
                "recycling_percent": {
                    "card": "Recycling Percent",
                    "value": recycling_percent,
                    "unit": "%",
                    "absolute_value": round(recycle_val ,2) if recycle_val else 0,
                    "absolute_unit": "%",
                    "meters": recycling_meters,
                },
                "production": {
                    "card": "Production",
                    "value": pu,
                    "unit": "Unit",
                },
            },
        }

    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
