import os
from fastapi.testclient import TestClient
from main import app

client = TestClient(app)

def test_excel_endpoints():
    print("=" * 60)
    print("TEST: Excel API Endpoints")
    print("=" * 60)

    # 1. Clean up any previous test Excel files
    excel_file = "manual_meter_readings.xlsx"
    if os.path.exists(excel_file):
        try:
            os.remove(excel_file)
            print(f"Removed existing {excel_file} for clean test")
        except Exception as e:
            print(f"Warning: Could not remove {excel_file}: {e}")

    # 2. Test saving a manual reading
    test_reading = {
        "date": "2026-05-18",
        "time": "12:00:00",
        "meter_name": "WELL WATER",
        "reading": 150.5,
        "unit": "m³",
        "user": "Test User",
        "remarks": "Test reading insertion"
    }

    print("Sending POST request to /api/save-manual-reading...")
    response = client.post("/api/save-manual-reading", json=test_reading)
    print(f"Response status code: {response.status_code}")
    print(f"Response json: {response.json()}")

    assert response.status_code == 200
    assert response.json()["status"] == "success"
    assert os.path.exists(excel_file), "Excel file was not created!"
    print("[SUCCESS] Save Manual Reading Endpoint PASSED")

    # 3. Test downloading the Excel file
    print("\nSending GET request to /api/download-excel...")
    response = client.get("/api/download-excel")
    print(f"Response status code: {response.status_code}")
    print(f"Response headers: {response.headers.get('content-type')}")

    assert response.status_code == 200
    assert "spreadsheet" in response.headers.get("content-type", "")
    print("[SUCCESS] Download Excel Endpoint PASSED")
    print("=" * 60)

if __name__ == "__main__":
    test_excel_endpoints()
