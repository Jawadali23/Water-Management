import calendar
from datetime import date, datetime, time, timedelta

import pandas as pd

# ---------------------------------------------------------------------------
# The "business day" for a calendar date D is defined as the half-open window:
#   [ D-1 @ 22:30:00,  D @ 22:30:00 )
# i.e. data recorded after 22:30 on the *previous* calendar day belongs to D.
# ---------------------------------------------------------------------------

_DAY_START_TIME = time(22, 30, 0)  # 22:30 on the PREVIOUS calendar day
_DAY_END_TIME   = time(22, 30, 0)  # 22:30 on the selected calendar day (exclusive)


def _day_window(d: date) -> tuple[pd.Timestamp, pd.Timestamp]:
    """Return the half-open [start, end) timestamps for business-date *d*.

    start = (d - 1 day) @ 22:30:00
    end   =  d          @ 22:30:00   (exclusive – use strict < in filters)
    """
    start = pd.Timestamp(datetime.combine(d - timedelta(days=1), _DAY_START_TIME))
    end   = pd.Timestamp(datetime.combine(d,                      _DAY_END_TIME))
    return start, end


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
    custom_to   = _parse_iso_date(date_to)
    if custom_from or custom_to:
        return df

    if year is None:
        return df

    return df[df["DATE"].dt.year == int(year)]


# ---------------------------------------------------------------------------
# Internal helper: resolve the [start_ts, end_ts) pair for a date range
# ---------------------------------------------------------------------------

def _resolve_window(
    df: pd.DataFrame,
    range_type: str | None,
    *,
    year: int | None,
    date_from: str | None,
    date_to: str | None,
) -> tuple[pd.Timestamp, pd.Timestamp, str]:
    """Return (start_ts, end_ts, resolved_range_label).

    The window is *always* expressed as 22:30-offset timestamps so that a
    single business day D covers  (D-1 @ 22:30 … D @ 22:30).

    For multi-day ranges (mtd / ytd / custom span) the window is:
        start = first_date - 1 day @ 22:30
        end   = last_date         @ 22:30
    """
    custom_from = _parse_iso_date(date_from)
    custom_to   = _parse_iso_date(date_to)

    if custom_from or custom_to:
        scoped_df = _scope_base_dataframe(df, year=year, date_from=date_from, date_to=date_to)
        if scoped_df.empty:
            raise ValueError("No data for the requested range")

        first_d = custom_from or pd.Timestamp(scoped_df["DATE"].min()).date()
        last_d  = custom_to   or pd.Timestamp(scoped_df["DATE"].max()).date()

        if first_d > last_d:
            raise ValueError("Invalid date range: date_from is after date_to")

        start, _ = _day_window(first_d)   # (first_d-1) @ 22:30
        _, end   = _day_window(last_d)    # last_d       @ 22:30
        return start, end, "custom"

    # --- preset ranges ---
    scoped_df = _scope_base_dataframe(df, year=year)
    if scoped_df.empty:
        raise ValueError("No data for the requested year scope")

    # Derive the latest *business date* from the raw data.
    # A raw timestamp T belongs to business date:
    #   T.date()       if T.time() < 22:30
    #   T.date() + 1   if T.time() >= 22:30
    raw_latest: pd.Timestamp = scoped_df["DATE"].max()
    if raw_latest.time() >= _DAY_START_TIME:
        latest_d = raw_latest.date() + timedelta(days=1)
    else:
        latest_d = raw_latest.date()

    if range_type == "td":
        first_d = latest_d
        last_d  = latest_d

    elif range_type == "mtd":
        first_d = date(latest_d.year, latest_d.month, 1)
        _, last_day = calendar.monthrange(latest_d.year, latest_d.month)
        last_d = date(latest_d.year, latest_d.month, last_day)

    elif range_type == "ytd":
        first_d = date(latest_d.year, 1, 1)
        last_d  = latest_d

    else:
        raise ValueError(f"Invalid range_type: {range_type!r}")

    start, _ = _day_window(first_d)
    _, end   = _day_window(last_d)
    return start, end, range_type


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def get_range_date_bounds(
    df,
    range_type: str | None = "td",
    *,
    year: int | None = None,
    date_from: str | None = None,
    date_to: str | None = None,
) -> dict[str, str | None]:
    """Return the 22:30-offset datetime bounds for the active filter.

    The returned ``date_from`` / ``date_to`` strings are ISO-8601 datetimes
    (``YYYY-MM-DDTHH:MM:SS``) so the frontend can display or pass them back
    accurately.

    Example – user selects 2026-06-11:
        date_from = "2026-06-10T22:30:00"
        date_to   = "2026-06-11T22:30:00"
    """
    if df.empty:
        return {"range": range_type, "date_from": None, "date_to": None}

    try:
        start, end, label = _resolve_window(
            df, range_type, year=year, date_from=date_from, date_to=date_to
        )
    except ValueError:
        return {"range": range_type or "custom", "date_from": None, "date_to": None}

    return {
        "range": label,
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
    """Filter *df* to the 22:30-offset window for the requested date / range.

    Rows are included when:
        start_ts <= DATE < end_ts
    where start_ts = (first_business_date - 1 day) @ 22:30
          end_ts   =  last_business_date            @ 22:30
    """
    if df.empty:
        return df

    try:
        start, end, _ = _resolve_window(
            df, range_type, year=year, date_from=date_from, date_to=date_to
        )
    except ValueError:
        return df.iloc[0:0]  # empty frame with same columns

    return df[(df["DATE"] >= start) & (df["DATE"] < end)]


def get_previous_filtered_dataframe(df, range_type: str):
    """Return the comparison period using the same 22:30-offset window logic."""
    if df.empty:
        return df

    raw_latest: pd.Timestamp = df["DATE"].max()
    if raw_latest.time() >= _DAY_START_TIME:
        latest_d = raw_latest.date() + timedelta(days=1)
    else:
        latest_d = raw_latest.date()

    if range_type == "td":
        prev_d = latest_d - timedelta(days=1)
        start, end = _day_window(prev_d)
        return df[(df["DATE"] >= start) & (df["DATE"] < end)]

    elif range_type == "mtd":
        prev_month = latest_d.month - 1
        prev_year  = latest_d.year
        if prev_month == 0:
            prev_month = 12
            prev_year -= 1

        first_d = date(prev_year, prev_month, 1)
        _, last_day = calendar.monthrange(prev_year, prev_month)
        last_d = date(prev_year, prev_month, last_day)

        start, _ = _day_window(first_d)
        _, end   = _day_window(last_d)
        return df[(df["DATE"] >= start) & (df["DATE"] < end)]

    elif range_type == "ytd":
        first_d = date(latest_d.year - 1, 1, 1)
        last_d  = date(latest_d.year - 1, 12, 31)

        start, _ = _day_window(first_d)
        _, end   = _day_window(last_d)
        return df[(df["DATE"] >= start) & (df["DATE"] < end)]

    else:
        raise ValueError(f"Invalid range_type: {range_type!r}")
