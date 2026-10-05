from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from datetime import datetime
import calendar
from core.supabase_client import supabase_db
from core.auth import get_current_user

router = APIRouter()

class PayrollGenerate(BaseModel):
    month: int
    year: int

@router.get("/")
def get_payroll(user=Depends(get_current_user)):
    try:
        query = supabase_db.table("payroll").select("*, labour(name, trade)")
        if user["role"] == "worker":
            lab_res = supabase_db.table("labour").select("id").eq("user_id", user["id"]).execute()
            if lab_res.data:
                query = query.eq("worker_id", lab_res.data[0]["id"])
        
        res = query.execute()
        return {"data": res.data}
    except Exception as e:
        print(f"Get payroll error: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")

@router.post("/generate")
def generate_payroll(req: PayrollGenerate, user=Depends(get_current_user)):
    try:
        month_str = f"{req.year}-{req.month:02d}"
        start_date = f"{month_str}-01"
        _, last_day = calendar.monthrange(req.year, req.month)
        end_date = f"{month_str}-{last_day}"
        
        # Get active workers
        workers_res = supabase_db.table("labour").select("*").eq("is_active", True).execute()
        workers = workers_res.data
        
        generated_count = 0
        for w in workers:
            # Skip if already generated for this month
            existing = supabase_db.table("payroll").select("id").eq("worker_id", w["id"]).eq("month_year", month_str).execute()
            if existing.data:
                continue
                
            # Get attendance for month
            att_res = supabase_db.table("attendance").select("*").eq("worker_id", w["id"]).gte("date", start_date).lte("date", end_date).execute()
            attendance = att_res.data
            
            present_days = [a for a in attendance if a.get("status") == "Present"]
            total_days = len(present_days)
            total_hours = sum(a.get("hours_worked", 0) for a in present_days)
            overtime_hours = sum(a.get("overtime_hours", 0) for a in present_days)
            
            daily_rate = w.get("daily_rate", 0)
            basic_pay = total_days * daily_rate
            hourly_rate = daily_rate / 8 if daily_rate else 0
            overtime_pay = overtime_hours * hourly_rate * 1.5
            total_pay = basic_pay + overtime_pay
            
            if total_days > 0:
                supabase_db.table("payroll").insert({
                    "project_id": w.get("assigned_project_id"),
                    "worker_id": w["id"],
                    "month_year": month_str,
                    "total_days": total_days,
                    "amount": total_pay,
                    "status": "pending"
                }).execute()
                generated_count += 1
                
        if generated_count > 0:
            supabase_db.table("notifications").insert({
                "title": "Payroll Generated",
                "message": f"{generated_count} payroll records ready for approval for {month_str}",
                "type": "general",
                "target_role": "super_admin"
            }).execute()
            
        return {"message": "Payroll generated", "count": generated_count}
    except Exception as e:
        print(f"Generate payroll error: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")

@router.patch("/{payroll_id}/approve")
def approve_payroll(payroll_id: str, user=Depends(get_current_user)):
    try:
        res = supabase_db.table("payroll").update({"status": "approved"}).eq("id", payroll_id).execute()
        
        # Notify worker
        if res.data:
            worker_id = res.data[0].get("worker_id")
            lab_res = supabase_db.table("labour").select("user_id").eq("id", worker_id).execute()
            if lab_res.data and lab_res.data[0].get("user_id"):
                supabase_db.table("notifications").insert({
                    "title": "Payroll Approved",
                    "message": "Your payroll for this month has been approved.",
                    "type": "general",
                    "user_id": lab_res.data[0]["user_id"]
                }).execute()
                
        return {"message": "Payroll approved", "data": res.data[0] if res.data else None}
    except Exception as e:
        print(f"Approve payroll error: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")

@router.patch("/{payroll_id}/paid")
def mark_payroll_paid(payroll_id: str, user=Depends(get_current_user)):
    try:
        res = supabase_db.table("payroll").update({"status": "paid"}).eq("id", payroll_id).execute()
        return {"message": "Payroll marked as paid", "data": res.data[0] if res.data else None}
    except Exception as e:
        print(f"Mark paid payroll error: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")
