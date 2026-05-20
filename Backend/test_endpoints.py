#!/usr/bin/env python3
"""Test script for the year-filtering endpoints."""

import sys
from datetime import datetime

import pandas as pd

# Add the project root to sys.path for imports
sys.path.insert(0, str(__file__).rsplit("\\", 1)[0])

from services.calculation_service import (
    calculate_discharge,
    calculate_recycle_volume,
    calculate_recycling_percent,
    calculate_withdrawal,
)
from services.sql_service import load_sql_data


def test_data_loading():
    """Test if Excel data loads correctly."""
    print("=" * 60)
    print("TEST 1: Data Loading")
    print("=" * 60)

    df = load_sql_data()

    if df.empty:
        print("ERROR: No data loaded from Excel")
        return False

    print("Data loaded successfully")
    print(f"  - Total rows: {len(df)}")
    print(f"  - Date range: {df['DATE'].min()} to {df['DATE'].max()}")
    print(f"  - Available years: {sorted(df['DATE'].dt.year.unique())}")
    print(f"  - Columns: {list(df.columns)}")

    return True


def test_monthly_breakdown():
    """Test the monthly breakdown calculation logic."""
    print("\n" + "=" * 60)
    print("TEST 2: Monthly Breakdown (Year 2024)")
    print("=" * 60)

    df = load_sql_data()
    if df.empty:
        print("ERROR: No data loaded")
        return False

    year = 2024
    year_data = df[df["DATE"].dt.year == year]

    if year_data.empty:
        print(f"WARNING: No data for year {year}, trying latest year")
        year = int(df["DATE"].dt.year.max())
        year_data = df[df["DATE"].dt.year == year]

    print(f"Processing year: {year}")
    print(f"Data points: {len(year_data)}")
    print()

    for m in range(1, 13):
        month_data = year_data[year_data["DATE"].dt.month == m]

        if month_data.empty:
            continue

        month_name = pd.Timestamp(pd.Timestamp.now().replace(month=m)).strftime("%B")
        withdrawal = calculate_withdrawal(month_data)
        discharge = calculate_discharge(month_data)
        recycle_eff = calculate_recycling_percent(month_data)

        print(
            f"{month_name:12} | Withdrawal: {withdrawal:10.2f} | "
            f"Discharge: {discharge:10.2f} | Recycle: {recycle_eff:6.2f}%"
        )

    print("Monthly breakdown test completed")
    return True


def test_key_insights():
    """Test the key insights calculation logic."""
    print("\n" + "=" * 60)
    print("TEST 3: Key Insights (Year 2024)")
    print("=" * 60)

    df = load_sql_data()
    if df.empty:
        print("ERROR: No data loaded")
        return False

    year = 2024
    year_data = df[df["DATE"].dt.year == year]

    if year_data.empty:
        print(f"WARNING: No data for year {year}, trying latest year")
        year = int(df["DATE"].dt.year.max())
        year_data = df[df["DATE"].dt.year == year]

    print(f"Processing year: {year}\n")

    monthly_metrics = []
    for m in range(1, 13):
        month_data = year_data[year_data["DATE"].dt.month == m]

        if month_data.empty:
            continue

        month_name = pd.Timestamp(pd.Timestamp.now().replace(month=m)).strftime("%B")
        withdrawal = calculate_withdrawal(month_data)
        discharge = calculate_discharge(month_data)
        recycle_eff = calculate_recycling_percent(month_data)

        monthly_metrics.append(
            {
                "month": m,
                "month_name": month_name,
                "withdrawal": withdrawal,
                "discharge": discharge,
                "recycle_efficiency": recycle_eff,
            }
        )

    if monthly_metrics:
        highest_intake = max(monthly_metrics, key=lambda x: x["withdrawal"])
        lowest_intake = min(monthly_metrics, key=lambda x: x["withdrawal"])
        best_recycle = max(monthly_metrics, key=lambda x: x["recycle_efficiency"])
        highest_discharge = max(monthly_metrics, key=lambda x: x["discharge"])

        print(
            f"Highest intake month: {highest_intake['month_name']} "
            f"({highest_intake['withdrawal']:.2f} m3)"
        )
        print(
            f"Lowest intake month: {lowest_intake['month_name']} "
            f"({lowest_intake['withdrawal']:.2f} m3)"
        )
        print(
            f"Best recycle month: {best_recycle['month_name']} "
            f"({best_recycle['recycle_efficiency']:.2f}%)"
        )
        print(
            f"Highest discharge month: {highest_discharge['month_name']} "
            f"({highest_discharge['discharge']:.2f} m3)"
        )

        overall_eff = calculate_recycling_percent(year_data)
        print(f"Overall recycle efficiency: {overall_eff:.2f}%")
        print("\nKey insights test completed")
        return True

    print("ERROR: No monthly data available")
    return False


def main():
    """Run all tests."""
    print("\n")
    print("+" + "=" * 58 + "+")
    print("|" + "  Water Management System - Endpoint Tests".center(58) + "|")
    print("+" + "=" * 58 + "+")

    results = []

    try:
        results.append(("Data Loading", test_data_loading()))
        results.append(("Monthly Breakdown", test_monthly_breakdown()))
        results.append(("Key Insights", test_key_insights()))
    except Exception as e:
        print(f"\nERROR: {e}")
        import traceback

        traceback.print_exc()
        return False

    print("\n" + "=" * 60)
    print("TEST SUMMARY")
    print("=" * 60)

    for test_name, passed in results:
        status = "PASSED" if passed else "FAILED"
        print(f"{test_name:30} {status}")

    all_passed = all(passed for _, passed in results)
    print("\n" + ("All tests passed!" if all_passed else "Some tests failed"))

    return all_passed


if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1)
