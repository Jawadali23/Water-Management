from fastapi import APIRouter, HTTPException

from services.sql_service import get_latest_meter_reading, get_meter_status_snapshot

router = APIRouter(prefix="/api")


@router.get("/meter/{meter_name}")
def get_meter(meter_name: str):
    """Latest flow rate, forward total, status, and timestamp from live meter views."""
    try:
        latest = get_latest_meter_reading(meter_name)
        if not latest:
            raise HTTPException(
                status_code=404,
                detail=f"Meter '{meter_name}' not found",
            )

        return {
            "meter_name": meter_name.upper(),
            "current": latest["current"],
            "flow_rate": latest["flow_rate"],
            "forward_total": latest["current"],
            "status": latest.get("status", "UNKNOWN"),
            "last_update": latest["last_update"].strftime("%Y-%m-%d %H:%M:%S"),
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/meters/live")
def get_live_meters():
    try:
        meters = get_meter_status_snapshot()
        return {"status": "success", "count": len(meters), "data": meters}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
