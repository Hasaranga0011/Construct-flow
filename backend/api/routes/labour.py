from fastapi import APIRouter, HTTPException, Query, Request
from typing import List, Optional
from ..models import LabourCreate, LabourResponse
from core.database import supabase
from supabase import create_client
from core.config import settings
from datetime import datetime

router = APIRouter(
    prefix="/labour",
    tags=["Labour"]
)

from supabase import create_client, ClientOptions
from core.config import settings

def get_auth_client(request: Request):
    token = request.headers.get("Authorization", "").replace("Bearer ", "")
    options = ClientOptions(headers={"Authorization": f"Bearer {token}"}) if token else ClientOptions()
    client = create_client(settings.SUPABASE_URL, settings.SUPABASE_KEY, options=options)
    return client

@router.get("/", response_model=List[LabourResponse])
def get_labour(request: Request, project_id: Optional[str] = Query(None, description="Filter by project ID")):
    try:
        client = get_auth_client(request)
        query = client.table("labour").select("*")
        if project_id:
            query = query.eq("project_id", project_id)
            
        response = query.execute()
        return response.data
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/payroll")
def get_payroll(request: Request):
    try:
        client = get_auth_client(request)
        response = client.table("labour").select("project_id, worker_name, hours_worked, date").eq("status", "Present").execute()
        
        # Aggregate logic
        payroll_data = {}
        for row in response.data:
            key = f"{row['project_id']}_{row['worker_name']}"
            if key not in payroll_data:
                payroll_data[key] = {
                    "project_id": row["project_id"],
                    "worker_name": row["worker_name"],
                    "total_hours": 0,
                    "days_present": 0
                }
            payroll_data[key]["total_hours"] += (row["hours_worked"] or 0)
            payroll_data[key]["days_present"] += 1
            
        return list(payroll_data.values())
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/", response_model=LabourResponse)
def create_labour(labour: LabourCreate, request: Request):
    try:
        labour_data = labour.model_dump()
        if labour_data['status'] == 'Present':
             labour_data['check_in_time'] = datetime.utcnow().isoformat()
        
        client = get_auth_client(request)
        response = client.table("labour").insert(labour_data).execute()
        
        if not response.data:
            raise HTTPException(status_code=400, detail="Failed to add labour record")
            
        return response.data[0]
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

from pydantic import BaseModel

class ScanRequest(BaseModel):
    qr_code: str
    site_id: str

@router.post("/scan")
def scan_qr_code(payload: ScanRequest):
    try:
        # 1. Find worker by QR code
        profile_res = supabase.table("profiles").select("id, full_name, role").eq("qr_code", payload.qr_code).single().execute()
        
        if not profile_res.data:
            raise HTTPException(status_code=404, detail="Invalid QR Code: Worker not found")
            
        worker = profile_res.data
        if worker.get("role") != "worker":
            raise HTTPException(status_code=400, detail="User is not a worker")
            
        worker_id = worker["id"]
        
        # 2. Check if worker is assigned to this site
        assignment_res = supabase.table("site_workers").select("id").eq("worker_id", worker_id).eq("site_id", payload.site_id).execute()
        if not assignment_res.data:
            raise HTTPException(status_code=403, detail="Worker is not assigned to this site")
            
        # 3. Check today's attendance record
        today = datetime.utcnow().date().isoformat()
        
        att_res = supabase.table("attendance").select("*").eq("worker_id", worker_id).eq("site_id", payload.site_id).gte("date", today).execute()
        
        now_iso = datetime.utcnow().isoformat()
        
        if not att_res.data:
            # Check-in
            ins_res = supabase.table("attendance").insert({
                "worker_id": worker_id,
                "site_id": payload.site_id,
                "date": today,
                "status": "Present",
                "check_in_time": now_iso
            }).execute()
            
            return {"action": "check_in", "worker_name": worker["full_name"], "time": now_iso}
            
        else:
            # Existing record
            record = att_res.data[0]
            if record.get("check_out_time"):
                raise HTTPException(status_code=400, detail="Worker has already checked out today")
                
            # Check-out
            # Calculate hours worked
            check_in_dt = datetime.fromisoformat(record["check_in_time"].replace('Z', '+00:00'))
            now_dt = datetime.utcnow()
            diff_hours = (now_dt - check_in_dt).total_seconds() / 3600.0
            
            upd_res = supabase.table("attendance").update({
                "check_out_time": now_iso,
                "hours_worked": round(diff_hours, 2)
            }).eq("id", record["id"]).execute()
            
            return {"action": "check_out", "worker_name": worker["full_name"], "time": now_iso, "hours_worked": round(diff_hours, 2)}
            
    except HTTPException as he:
        raise he
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

class SalaryGenerateRequest(BaseModel):
    start_date: str
    end_date: str
    site_id: str

@router.post("/salary/generate")
def generate_salary(payload: SalaryGenerateRequest):
    try:
        # Fetch all attendance records for this site within the date range
        att_res = supabase.table("attendance") \
            .select("worker_id, hours_worked") \
            .eq("site_id", payload.site_id) \
            .gte("date", payload.start_date) \
            .lte("date", payload.end_date) \
            .execute()
            
        if not att_res.data:
            return {"generated": 0, "message": "No attendance records found"}
            
        # Group by worker
        worker_stats = {}
        for row in att_res.data:
            wid = row["worker_id"]
            hrs = row.get("hours_worked") or 0
            if wid not in worker_stats:
                worker_stats[wid] = {"days": 0, "overtime_hours": 0}
                
            worker_stats[wid]["days"] += 1
            if hrs > 8:
                worker_stats[wid]["overtime_hours"] += (hrs - 8)
                
        # Fetch profiles for these workers to get daily_rate
        worker_ids = list(worker_stats.keys())
        prof_res = supabase.table("profiles").select("id, daily_rate").in_("id", worker_ids).execute()
        
        rates = {p["id"]: (p.get("daily_rate") or 1000.0) for p in prof_res.data} # Default to 1000 if not set
        
        slips_to_insert = []
        for wid, stats in worker_stats.items():
            base_salary = stats["days"] * rates[wid]
            # Assuming overtime rate is 1.5x hourly rate (daily_rate / 8)
            hourly_rate = rates[wid] / 8.0
            overtime_pay = stats["overtime_hours"] * (hourly_rate * 1.5)
            total_amount = base_salary + overtime_pay
            
            slips_to_insert.append({
                "worker_id": wid,
                "site_id": payload.site_id,
                "period_start": payload.start_date,
                "period_end": payload.end_date,
                "total_days": stats["days"],
                "total_overtime_hours": stats["overtime_hours"],
                "total_amount": total_amount,
                "status": "Pending"
            })
            
        if slips_to_insert:
            supabase.table("salary_slips").insert(slips_to_insert).execute()
            
        return {"generated": len(slips_to_insert), "slips": slips_to_insert}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
