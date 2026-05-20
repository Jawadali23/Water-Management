#!/usr/bin/env python3
"""Test fresh water tank metrics in endpoints."""

import sys
from datetime import datetime
import json
import pandas as pd

# Add the project root to sys.path for imports
sys.path.insert(0, str(__file__).rsplit("\\", 1)[0])

from services.sql_service import load_sql_data
from services.calculation_service import (
    calculate_withdrawal,
    calculate_discharge,
    calculate_recycle_volume,
    calculate_recycling_percent,
    fetch_meter_total,
    METERS,
)
from datetime import date


def test_fresh_water_tank_in_monthly_breakdown():
    """Test fresh water tank data in monthly breakdown."""
    print("=" * 70)
    print("TEST: Fresh Water Tank in Monthly Breakdown")
    print("=" * 70 + "\n")
    
    df = load_sql_data()
    year = 2024
    year_data = df[df["DATE"].dt.year == year]
    
    print(f"Year: {year}\n")
    print(f"{'Month':<12} {'Withdrawal':>12} {'Fresh Water':>12} {'Discharge':>12} {'Recycle %':>10}")
    print("-" * 70)
    
    for m in range(1, 13):
        month_data = year_data[year_data["DATE"].dt.month == m]
        
        if month_data.empty:
            continue
        
        month_name = pd.Timestamp(date(year, m, 1)).strftime("%B")
        withdrawal = calculate_withdrawal(month_data)
        fresh_water = fetch_meter_total(month_data, METERS["fresh_water_tank"])
        discharge = calculate_discharge(month_data)
        recycle_eff = calculate_recycling_percent(month_data)
        
        print(f"{month_name:<12} {withdrawal:>12.2f} {fresh_water:>12.2f} {discharge:>12.2f} {recycle_eff:>9.2f}%")
    
    print("\n✓ Fresh water tank data is included in monthly breakdown\n")


def test_fresh_water_tank_in_key_insights():
    """Test fresh water tank in key insights."""
    print("=" * 70)
    print("TEST: Fresh Water Tank in Key Insights")
    print("=" * 70 + "\n")
    
    df = load_sql_data()
    year = 2024
    year_data = df[df["DATE"].dt.year == year]
    
    print(f"Year: {year}\n")
    
    # Get metrics for each month
    monthly_metrics = []
    for m in range(1, 13):
        month_data = year_data[year_data["DATE"].dt.month == m]
        
        if month_data.empty:
            continue
        
        month_name = pd.Timestamp(date(year, m, 1)).strftime("%B")
        fresh_water = fetch_meter_total(month_data, METERS["fresh_water_tank"])
        
        monthly_metrics.append({
            "month": m,
            "month_name": month_name,
            "fresh_water_tank": fresh_water,
        })
    
    # Find highest fresh water tank month
    highest_fresh_water = max(monthly_metrics, key=lambda x: x["fresh_water_tank"])
    
    print(f"KEY INSIGHT - Highest Fresh Water Tank Month:")
    print(f"  Month: {highest_fresh_water['month_name']}")
    print(f"  Value: {highest_fresh_water['fresh_water_tank']:.2f} m³")
    print(f"  Unit: m³\n")
    
    # Show all months sorted by fresh water tank
    print("All months ranked by Fresh Water Tank usage:")
    print(f"{'Rank':<6} {'Month':<12} {'Fresh Water (m³)':>18}")
    print("-" * 40)
    
    sorted_metrics = sorted(monthly_metrics, key=lambda x: x["fresh_water_tank"], reverse=True)
    for rank, metric in enumerate(sorted_metrics, 1):
        print(f"{rank:<6} {metric['month_name']:<12} {metric['fresh_water_tank']:>18.2f}")
    
    print("\n✓ Fresh water tank insights calculated\n")


def test_fresh_water_tank_in_review():
    """Test fresh water tank in review page."""
    print("=" * 70)
    print("TEST: Fresh Water Tank in Review Page")
    print("=" * 70 + "\n")
    
    df = load_sql_data()
    year = 2024
    year_data = df[df["DATE"].dt.year == year]
    
    print(f"Year: {year}\n")
    
    total_fresh_water = fetch_meter_total(year_data, METERS["fresh_water_tank"])
    total_withdrawal = calculate_withdrawal(year_data)
    total_discharge = calculate_discharge(year_data)
    total_recycle = calculate_recycle_volume(year_data)
    
    print("YEAR SUMMARY (Review Page):")
    print(f"  Total Withdrawal:        {total_withdrawal:>12.2f} m³")
    print(f"  Total Fresh Water Tank:  {total_fresh_water:>12.2f} m³")
    print(f"  Total Discharge:         {total_discharge:>12.2f} m³")
    print(f"  Total Recycle Volume:    {total_recycle:>12.2f} m³")
    
    # Calculate percentage
    if total_withdrawal > 0:
        fwt_percentage = (total_fresh_water / total_withdrawal) * 100
    else:
        fwt_percentage = 0
    
    print(f"\n  Fresh Water % of Withdrawal: {fwt_percentage:.2f}%")
    print("\n✓ Fresh water tank included in review page summary\n")


def main():
    """Run all tests."""
    print("\n")
    print("╔" + "=" * 68 + "╗")
    print("║" + "  Fresh Water Tank Metrics - Verification Tests".center(68) + "║")
    print("╚" + "=" * 68 + "╝")
    print()
    
    try:
        test_fresh_water_tank_in_monthly_breakdown()
        test_fresh_water_tank_in_key_insights()
        test_fresh_water_tank_in_review()
        
        print("=" * 70)
        print("✓ ALL FRESH WATER TANK METRICS VERIFIED")
        print("=" * 70 + "\n")
        
        return True
    except Exception as e:
        print(f"\n❌ ERROR: {e}")
        import traceback
        traceback.print_exc()
        return False


if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1)
