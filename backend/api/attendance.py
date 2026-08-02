from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime
from core.supabase_client import supabase_db
from core.auth import get_current_user

router = APIRouter()

class CheckInRequest(BaseModel):
    worker_id: str
    site_id: str

class CheckOutRequest(BaseModel):
    worker_id: str

@router.post("/checkin")
def check_in(req: CheckInRequest, user=Depends(get_current_user)):
    try:
        today = datetime.now().date().isoformat()
        
        # Check no duplicate checkin today
        existing = supabase_db.table("attendance").select("id").eq("worker_id", req.worker_id).eq("date", today).execute()
        if existing.data:
            raise HTTPException(status_code=400, detail="Worker already checked in today")
        
        # Insert attendance record
        data = {
            "worker_id": req.worker_id,
            "date": today,
            "check_in_time": datetime.now().isoformat(),
            "qr_scan_verified": True,
            "site_id": req.site_id,
            "status": "Present",
            "logged_by": user['id']
        }
        res = supabase_db.table("attendance").insert(data).execute()
        return {"message": "Checked in successfully", "data": res.data[0]}
    except HTTPException:
        raise
    except Exception as e:
        print(f"Check-in error: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")

@router.post("/checkout")
def check_out(req: CheckOutRequest, user=Depends(get_current_user)):
    try:
        today = datetime.now().date().isoformat()
        now = datetime.now()
        
        # Fetch today's attendance for worker
        res = supabase_db.table("attendance").select("*").eq("worker_id", req.worker_id).eq("date", today).execute()
        
        if not res.data:
            raise HTTPException(status_code=404, detail="No check-in record found for today")
            
        record = res.data[0]
        if record.get("check_out_time"):
            raise HTTPException(status_code=400, detail="Already checked out")
            
        check_in_time = datetime.fromisoformat(record["check_in_time"].replace("Z", "+00:00"))
        
        # Calculate hours
        diff = now.timestamp() - check_in_time.timestamp()
        hours_worked = round(diff / 3600, 2)
        overtime_hours = round(max(0, hours_worked - 8), 2)
        
        # Update record
        update_data = {
            "check_out_time": now.isoformat(),
            "hours_worked": hours_worked,
            "overtime_hours": overtime_hours
        }
        update_res = supabase_db.table("attendance").update(update_data).eq("id", record["id"]).execute()
        
        return {
            "message": "Checked out successfully",
            "hours_worked": hours_worked,
            "overtime_hours": overtime_hours,
            "data": update_res.data[0]
        }
    except HTTPException:
        raise
    except Exception as e:
        print(f"Check-out error: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")

@router.get("/today")
def get_today_attendance(site_id: Optional[str] = None, user=Depends(get_current_user)):
    try:
        today = datetime.now().date().isoformat()
        query = supabase_db.table("attendance").select("*, labour!inner(name, trade)").eq("date", today)
        if site_id:
            query = query.eq("site_id", site_id)
            
        res = query.execute()
        return {"data": res.data}
    except Exception as e:
        print(f"Get today attendance error: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")

@router.get("/worker/{worker_id}")
def get_worker_history(worker_id: str, user=Depends(get_current_user)):
    try:
        # Fetch history
        res = supabase_db.table("attendance").select("*").eq("worker_id", worker_id).order("date", desc=True).execute()
        
        # Calculate summary
        total_days = len(res.data)
        total_hours = sum([r.get("hours_worked") or 0 for r in res.data])
        total_overtime = sum([r.get("overtime_hours") or 0 for r in res.data])
        
        summary = {
            "total_days": total_days,
            "total_hours": total_hours,
            "total_overtime": total_overtime
        }
        
        return {"data": res.data, "summary": summary}
    except Exception as e:
        print(f"Get worker history error: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")
