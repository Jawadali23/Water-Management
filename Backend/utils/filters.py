import calendar
from datetime import date, datetime

import pandas as pd


def _parse_iso_date(value: str | None) -> date | None:
    if value is None:
        return None
    v = str(value).strip()
    if not v:
        return None
    # Accept ISO "YYYY-MM-DD"
    return datetime.strptime(v, "%Y-%m-%d").date()


def _scope_base_dataframe(
    df: pd.DataFrame,
    *,
    year: int | None = None,
    date_from: str | None = None,
    date_to: str | None = None,
) -> pd.DataFrame:
    """Apply a year scope only when the caller is not using an explicit date range."""
    if df.empty:
        return df

    custom_from = _parse_iso_date(date_from)
    custom_to = _parse_iso_date(date_to)
    if custom_from or custom_to:
        return df

    if year is None:
        return df

    return df[df["DATE"].dt.year == int(year)]


def get_range_date_bounds(
    df,
    range_type: str | None = "td",
    *,
    year: int | None = None,
    date_from: str | None = None,
    date_to: str | None = None,
) -> dict[str, str | None]:
    """ISO date bounds for the active filter (aligned with get_filtered_dataframe).

    For ``mtd``, ``date_from`` / ``date_to`` span the full calendar month (1st through
    last day). Totals still sum only rows present in the sheet for that month.
    """
    if df.empty:
        return {
            "range": range_type,
            "date_from": None,
            "date_to": None,
        }

    custom_from = _parse_iso_date(date_from)
    custom_to = _parse_iso_date(date_to)
    if custom_from or custom_to:
        scoped_df = _scope_base_dataframe(
            df, year=year, date_from=date_from, date_to=date_to
        )
        if scoped_df.empty:
            return {
                "range": "custom",
                "date_from": None,
                "date_to": None,
            }
        # Custom selection from frontend (not anchored to latest date)
        dmin = pd.Timestamp(scoped_df["DATE"].min()).normalize().date()
        dmax = pd.Timestamp(scoped_df["DATE"].max()).normalize().date()
        start = custom_from or dmin
        end = custom_to or dmax
        if start > end:
            raise ValueError("Invalid date range")
        return {
            "range": "custom",
            "date_from": start.isoformat(),
            "date_to": end.isoformat(),
        }

    scoped_df = _scope_base_dataframe(df, year=year)
    if scoped_df.empty:
        return {
            "range": range_type,
            "date_from": None,
            "date_to": None,
        }

    latest_ts = pd.Timestamp(scoped_df["DATE"].max()).normalize()
    latest_d = latest_ts.date()

    if range_type == "td":
        start = latest_d
        end = latest_d
    elif range_type == "mtd":
        start = date(latest_d.year, latest_d.month, 1)
        _, last_day = calendar.monthrange(latest_d.year, latest_d.month)
        end = date(latest_d.year, latest_d.month, last_day)
    elif range_type == "ytd":
        start = date(latest_d.year, 1, 1)
        end = latest_d
    else:
        raise ValueError("Invalid range")

    return {
        "range": range_type,
        "date_from": start.isoformat(),
        "date_to": end.isoformat(),
    }


def get_filtered_dataframe(
    df,
    range_type: str | None = "td",
    *,
    year: int | None = None,
    date_from: str | None = None,
    date_to: str | None = None,
):
    if df.empty:
        return df

    custom_from = _parse_iso_date(date_from)
    custom_to = _parse_iso_date(date_to)
    if custom_from or custom_to:
        start = (
            pd.Timestamp(custom_from)
            if custom_from
            else pd.Timestamp(df["DATE"].min()).normalize()
        )
        end = (
            pd.Timestamp(custom_to)
            if custom_to
            else pd.Timestamp(df["DATE"].max()).normalize()
        )
        if start > end:
            raise ValueError("Invalid date range")
        return df[(df["DATE"].dt.normalize() >= start) & (df["DATE"].dt.normalize() <= end)]

    scoped_df = _scope_base_dataframe(df, year=year)
    if scoped_df.empty:
        return scoped_df

    latest_date = scoped_df["DATE"].max()

    if range_type == "td":
        filtered = scoped_df[scoped_df["DATE"].dt.date == latest_date.date()]

    elif range_type == "mtd":
        filtered = scoped_df[
            (scoped_df["DATE"].dt.month == latest_date.month)
            & (scoped_df["DATE"].dt.year == latest_date.year)
        ]

    elif range_type == "ytd":
        filtered = scoped_df[scoped_df["DATE"].dt.year == latest_date.year]

    else:
        raise ValueError("Invalid range")

    return filtered


def get_previous_filtered_dataframe(df, range_type: str):
    latest_date = df["DATE"].max()

    if range_type == "td":
        previous_date = latest_date - pd.Timedelta(days=1)

        filtered = df[df["DATE"].dt.date == previous_date.date()]

    elif range_type == "mtd":
        previous_month = latest_date.month - 1
        year = latest_date.year

        if previous_month == 0:
            previous_month = 12
            year -= 1

        filtered = df[
            (df["DATE"].dt.month == previous_month)
            & (df["DATE"].dt.year == year)
        ]

    elif range_type == "ytd":
        filtered = df[df["DATE"].dt.year == latest_date.year - 1]

    else:
        raise ValueError("Invalid range")

    return filtered
