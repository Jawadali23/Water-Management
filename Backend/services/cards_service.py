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
    df = load_sql_data()
    current_df = get_filtered_dataframe(
        df,
        range,
        year=year,
        date_from=date_from,
        date_to=date_to,
    )
    bounds = get_range_date_bounds(
        df,
        range,
        year=year,
        date_from=date_from,
        date_to=date_to,
    )
    return current_df, bounds


@router.get("/fresh-water-tank")
def fresh_water_tank(
    range: str = "td",
    year: int | None = None,
    date_from: str | None = None,
    date_to: str | None = None,
):
    try:
        current_df, bounds = _load_scoped_cards_dataframe(
            range=range, year=year, date_from=date_from, date_to=date_to
        )
        current = fetch_meter_total(current_df, METERS["fresh_water_tank"])

        return {
            "status": "success",
            "card": "Fresh Water Tank",
            **bounds,
            "value": current,
            "unit": "mÂ³",
            "meters": sheet_difference_totals(current_df, "fresh_water_tank"),
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


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

        return {
            "status": "success",
            "card": "Water Withdrawal",
            **bounds,
            "value": current,
            "unit": "mÂ³",
            "meters": sheet_difference_totals(current_df, *WITHDRAWAL_SOURCE_KEYS),
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/recycle-volume")
def recycle_volume(
    range: str = "td",
    year: int | None = None,
    date_from: str | None = None,
    date_to: str | None = None,
):
    try:
        current_df, bounds = _load_scoped_cards_dataframe(
            range=range, year=year, date_from=date_from, date_to=date_to
        )
        current = calculate_recycle_volume(current_df)

        return {
            "status": "success",
            "card": "Recycle Volume",
            **bounds,
            "value": current,
            "unit": "mÂ³",
            "meters": sheet_difference_totals(
                current_df, "wwtp_ro_in", "wwtp_ro_rejection"
            ),
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


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

        return {
            "status": "success",
            "card": "Factory Discharge",
            **bounds,
            "value": current,
            "unit": "mÂ³",
            "meters": sheet_difference_totals(current_df, "wwtp_in", "wwtp_ro_in"),
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

    ``range`` matches the per-card endpoints (from Excel, reloaded when the file changes).

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
            sheet_difference_totals(current_df, "wwtp_ro_in", "wwtp_ro_rejection")
        )

        return {
            "status": "success",
            **bounds,
            "cards": {
                "fresh_water_tank": {
                    "card": "Fresh Water Tank",
                    "value": fetch_meter_total(current_df, METERS["fresh_water_tank"]),
                    "unit": "mÂ³",
                    "meters": sheet_difference_totals(current_df, "fresh_water_tank"),
                },
                "water_withdrawal": {
                    "card": "Water Withdrawal",
                    "value": calculate_withdrawal(current_df),
                    "unit": "mÂ³",
                    "meters": sheet_difference_totals(current_df, *WITHDRAWAL_SOURCE_KEYS),
                },
                "recycle_volume": {
                    "card": "Recycle Volume",
                    "value": calculate_recycle_volume(current_df),
                    "unit": "mÂ³",
                    "meters": sheet_difference_totals(
                        current_df, "wwtp_ro_in", "wwtp_ro_rejection"
                    ),
                },
                "factory_discharge": {
                    "card": "Factory Discharge",
                    "value": calculate_discharge(current_df),
                    "unit": "mÂ³",
                    "meters": sheet_difference_totals(current_df, "wwtp_in", "wwtp_ro_in"),
                },
                "recycling_percent": {
                    "card": "Recycling Percent",
                    "value": calculate_recycling_percent(current_df),
                    "unit": "%",
                    "meters": recycling_meters,
                },
            },
        }

    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
