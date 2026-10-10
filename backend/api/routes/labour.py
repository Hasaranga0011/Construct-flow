from fastapi import APIRouter, HTTPException, Query, Depends
from typing import List, Optional
from ..models import LabourCreate, LabourResponse
from core.notification_helper import create_notifications, create_notification
from core.database import client_for_token
from core.security import require_manager_or_admin, get_current_user
from datetime import datetime, timezone
from zoneinfo import ZoneInfo
from core.worker_payroll import calculate_payroll

router = APIRouter(
    prefix="/labour",
    tags=["Labour"]
)

def managed_project_ids(client, current_user: dict) -> Optional[List[str]]:
    if current_user["role"] == "super_admin":
        return None
    if current_user["role"] == "pm":
        response = client.table("projects").select("id").eq("pm_id", current_user["id"]).execute()
        return [row["id"] for row in (response.data or [])]
    if current_user["role"] == "site_manager":
        response = client.table("site_manager_sites").select("project_id").eq("site_manager_id", current_user["id"]).execute()
        return [row["project_id"] for row in (response.data or [])]
    raise HTTPException(status_code=403, detail="Not enough privileges")

@router.get("/", response_model=List[LabourResponse])
def get_labour(project_id: Optional[str] = Query(None, description="Filter by project ID"), current_user: dict = Depends(get_current_user)):
    try:
        client = client_for_token(current_user["token"])
        allowed_projects = managed_project_ids(client, current_user)
        query = client.table("attendance").select(
            "id, date, status, check_in_time, check_out_time, hours_worked, site_id, worker_id, workers(profiles(full_name))"
        )
        if project_id:
            if allowed_projects is not None and project_id not in allowed_projects:
                raise HTTPException(status_code=403, detail="Access denied: not your project")
            query = query.eq("site_id", project_id)
        elif allowed_projects is not None:
            if not allowed_projects:
                return []
            query = query.in_("site_id", allowed_projects)
            
        response = query.execute()
        
        # Map back to LabourResponse format for backwards compatibility
        mapped = []
        for row in (response.data or []):
            prof = row.get("workers", {}).get("profiles", {}) if row.get("workers") else {}
            mapped.append({
                "id": row["id"],
                "project_id": row["site_id"],
                "worker_name": prof.get("full_name", "Unknown Worker"),
                "date": row["date"],
                "status": row["status"],
                "check_in_time": row.get("check_in_time"),
                "check_out_time": row.get("check_out_time"),
                "hours_worked": row.get("hours_worked")
            })
        return mapped
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/payroll")
def get_payroll(current_user: dict = Depends(require_manager_or_admin)):
    try:
        client = client_for_token(current_user["token"])
        allowed_projects = managed_project_ids(client, current_user)
        query = client.table("attendance").select(
            "hours_worked, date, status, site_id, workers(profiles(full_name, daily_rate))"
        ).eq("status", "Present")
        
        if allowed_projects is not None and not allowed_projects:
            return []
            
        response = query.execute()
        
        # Aggregate logic
        payroll_data = {}
        for row in (response.data or []):
            proj_id = row.get("site_id")
            if allowed_projects is not None and proj_id not in allowed_projects:
                continue
            
            prof = row.get("workers", {}).get("profiles", {}) if row.get("workers") else {}
            worker_name = prof.get("full_name", "Unknown Worker")
            daily_rate = prof.get("daily_rate", 3500)
            
            hours = row.get("hours_worked") or 0
            key = f"{proj_id}_{worker_name}"
            if key not in payroll_data:
                payroll_data[key] = {
                    "project_id": proj_id,
                    "worker_name": worker_name,
                    "total_hours": 0,
                    "days_present": 0,
                    "daily_rate": daily_rate
                }
            payroll_data[key]["total_hours"] += hours
            payroll_data[key]["days_present"] += 1
            
        return list(payroll_data.values())
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/", response_model=LabourResponse)
def create_labour(labour: LabourCreate, current_user: dict = Depends(get_current_user)):
    if current_user["role"] not in {"super_admin", "pm", "site_manager"}:
        raise HTTPException(status_code=403, detail="Not enough privileges")
    try:
        client = client_for_token(current_user["token"])
        allowed_projects = managed_project_ids(client, current_user)
        if allowed_projects is not None and labour.project_id not in allowed_projects:
            raise HTTPException(status_code=403, detail="Access denied: not your project")
        
        # Look up worker_id by name (since legacy API used worker_name)
        prof_res = client.table("profiles").select("id").eq("full_name", labour.worker_name).execute()
        if not prof_res.data:
            raise HTTPException(status_code=404, detail="Worker profile not found")
        user_id = prof_res.data[0]["id"]
        
        worker_res = client.table("workers").select("id").eq("user_id", user_id).execute()
        if not worker_res.data:
            raise HTTPException(status_code=404, detail="Worker record not found")
        worker_id = worker_res.data[0]["id"]

        att_data = {
            "site_id": labour.project_id,
            "worker_id": worker_id,
            "date": labour.date,
            "status": labour.status,
            "hours_worked": labour.hours_worked
        }
        if labour.status == 'Present':
             att_data['check_in_time'] = datetime.now(timezone.utc).isoformat()
        
        response = client.table("attendance").insert(att_data).execute()
        
        if not response.data:
            raise HTTPException(status_code=400, detail="Failed to add labour record")
            
        inserted = response.data[0]
        return {
            "id": inserted["id"],
            "project_id": inserted["site_id"],
            "worker_name": labour.worker_name,
            "date": inserted["date"],
            "status": inserted["status"],
            "check_in_time": inserted.get("check_in_time"),
            "check_out_time": inserted.get("check_out_time"),
            "hours_worked": inserted.get("hours_worked")
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

from pydantic import BaseModel

class ScanRequest(BaseModel):
    qr_code: str
    site_id: str

@router.post("/scan")
def scan_qr_code(payload: ScanRequest, current_user: dict = Depends(get_current_user)):
    if current_user["role"] not in {"super_admin", "pm", "site_manager"}:
        raise HTTPException(status_code=403, detail="Not enough privileges")
    supabase = client_for_token(current_user["token"])
    try:
        # 1. Find worker by QR code
        profile_res = supabase.table("profiles").select("id, full_name, role").eq("qr_code", payload.qr_code).single().execute()
        
        if not profile_res.data:
            raise HTTPException(status_code=404, detail="Invalid QR Code: Worker not found")
            
        worker = profile_res.data
        # We skip checking worker.get("role") != "worker" because a DB trigger 
        # forces new profiles to 'client'. We rely on the workers table link instead.
            
        worker_profile_id = worker["id"]

        worker_res = supabase.table("workers").select("id, user_id, site_id").eq("user_id", worker_profile_id).single().execute()
        if not worker_res.data:
            raise HTTPException(status_code=409, detail="Worker profile is not linked to a worker record")
        worker_id = worker_res.data["id"]
        
        # The API accepts a project ID; attendance.site_id references sites.id.
        project_id = payload.site_id
        allowed = managed_project_ids(supabase, current_user)
        if allowed is not None and project_id not in allowed:
            raise HTTPException(status_code=403, detail="This project is not assigned to you")
        site_query = supabase.table("sites").select("id").eq("project_id", project_id)
        if current_user["role"] == "site_manager":
            site_query = site_query.eq("site_manager_id", current_user["id"])
        sites = site_query.order("id").execute()
        if not sites.data:
            raise HTTPException(status_code=409, detail="This project has no linked attendance site")
        site_id = sites.data[0]["id"]
        assigned_site_id = worker_res.data.get("site_id")
        if assigned_site_id and assigned_site_id != site_id:
            raise HTTPException(status_code=403, detail="This worker is assigned to a different site. Ask the Project Manager to update their assignment.")
        assignment_res = supabase.table("site_workers").select("worker_id").eq("project_id", project_id).execute()
        if not any(row["worker_id"] in {worker_id, worker_profile_id} for row in (assignment_res.data or [])):
            raise HTTPException(status_code=403, detail="This worker is not assigned to your site. Ask the Project Manager to update their assignment.")

        # 3. Check today's attendance record
        today = datetime.now(ZoneInfo("Asia/Colombo")).date().isoformat()
        now_iso = datetime.now(timezone.utc).isoformat()
        att_res = supabase.table("attendance") \
            .select("id, check_in_time, check_out_time") \
            .eq("worker_id", worker_id) \
            .eq("site_id", site_id) \
            .eq("date", today) \
            .execute()
        if not att_res.data:
            # Check-in
            ins_res = supabase.table("attendance").insert({
                "worker_id": worker_id,
                "site_id": site_id,
                "date": today,
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
            now_dt = datetime.now(timezone.utc)
            if check_in_dt.tzinfo is None:
                check_in_dt = check_in_dt.replace(tzinfo=timezone.utc)
            diff_hours = (now_dt - check_in_dt).total_seconds() / 3600.0
            
            upd_res = supabase.table("attendance").update({
                "check_out_time": now_iso,
                "hours_worked": round(diff_hours, 2),
                "overtime_hours": round(max(diff_hours - 8, 0), 2)
            }).eq("id", record["id"]).execute()
            
            return {"action": "check_out", "worker_name": worker["full_name"], "time": now_iso, "hours_worked": round(diff_hours, 2)}
            
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

class SalaryGenerateRequest(BaseModel):
    start_date: str
    end_date: str
    site_id: str

@router.post("/salary/generate")
def generate_salary(payload: SalaryGenerateRequest, current_user: dict = Depends(require_manager_or_admin)):
    supabase = client_for_token(current_user["token"])
    try:
        from datetime import date
        try:
            start, end = date.fromisoformat(payload.start_date), date.fromisoformat(payload.end_date)
            if end < start:
                raise ValueError()
        except ValueError:
            raise HTTPException(status_code=422, detail="Choose a valid pay period")
        allowed = managed_project_ids(supabase, current_user)
        site_rows = supabase.table("sites").select("id,project_id").eq("id", payload.site_id).execute().data or []
        project_id = site_rows[0]["project_id"] if site_rows else payload.site_id
        if allowed is not None and project_id not in allowed:
            raise HTTPException(status_code=403, detail="This project is not assigned to you")
        records = supabase.table("attendance").select("*").eq("project_id", project_id).gte("date", payload.start_date).lte("date", payload.end_date).execute().data or []
        user_ids = sorted({r["worker_id"] for r in records if r.get("status") == "Present"})
        if not user_ids:
            return {"generated": 0, "slips": []}
        profiles = supabase.table("profiles").select("id,daily_rate").in_("id", user_ids).execute().data or []
        slips_to_insert = []
        for profile in profiles:
            uid = profile["id"]
            existing = supabase.table("salary_slips").select("id").eq("worker_id", uid).eq("period_start", payload.start_date).eq("period_end", payload.end_date).execute().data
            if existing:
                continue
            # Aggregate the worker's period within this manager's RLS scope.
            own_records = supabase.table("attendance").select("*").eq("worker_id", uid).gte("date", payload.start_date).lte("date", payload.end_date).execute().data or []
            pay = calculate_payroll(own_records, profile.get("daily_rate"))
            slips_to_insert.append({"worker_id": uid, "month": payload.start_date,
                "period_start": payload.start_date, "period_end": payload.end_date,
                **{key: pay[key] for key in ("total_days", "total_hours", "overtime_hours", "basic_pay", "overtime_pay", "total_pay")},
                "total_amount": pay["total_pay"], "daily_rate": pay["daily_rate"], "status": "Generated"})
        user_ids = [s["worker_id"] for s in slips_to_insert]
        if slips_to_insert:
            supabase.table("salary_slips").insert(slips_to_insert).execute()

            # Notify each worker in-app and by email about their new salary slip.
            try:
                profiles_res = supabase.table("profiles").select("id, email, full_name, notification_preferences").in_("id", user_ids).execute()
                profile_by_user = {p["id"]: p for p in (profiles_res.data or [])}
                notifications_to_insert = []
                for uid in user_ids:
                    notifications_to_insert.append({
                        "target_user_id": uid,
                        "target_role": "worker",
                        "title": "Salary Slip Ready",
                        "message": f"Your salary slip for {payload.start_date} to {payload.end_date} is ready. Log in to view it.",
                        "type": "general",
                        "link": "/worker/payroll",
                        "is_read": False,
                    })
                    profile = profile_by_user.get(uid)
                    if profile and profile.get("email") and (profile.get("notification_preferences") or {}).get("email", True):
                        try:
                            import httpx, os
                            resend_key = os.environ.get("RESEND_API_KEY", "")
                            if resend_key:
                                from html import escape
                                name = escape(profile.get("full_name") or "there")
                                email_response = httpx.post(
                                    "https://api.resend.com/emails",
                                    headers={"Authorization": f"Bearer {resend_key}", "Content-Type": "application/json"},
                                    json={
                                        "from": os.environ.get("RESEND_FROM_EMAIL", "noreply@constructflow.lk"),
                                        "to": [profile["email"]],
                                        "subject": "Your ConstructFlow Salary Slip is Ready",
                                        "html": (
                                            f"<p>Hi {name},</p>"
                                            f"<p>Your salary slip for <b>{payload.start_date} to {payload.end_date}</b> "
                                            "has been generated.</p>"
                                            f'<p><a href="{os.environ.get("FRONTEND_URL", "http://localhost:8081").rstrip("/")}/worker/payroll">View your payslip</a></p>'
                                        ),
                                    },
                                    timeout=10,
                                )
                                email_response.raise_for_status()
                        except Exception:
                            import logging
                            logging.exception("Failed payroll email for worker %s", uid)
                notifications_to_insert = [n for n in notifications_to_insert if (profile_by_user.get(n["target_user_id"], {}).get("notification_preferences") or {}).get("in_app", True)]
                if notifications_to_insert:
                    create_notifications(notifications_to_insert)
            except Exception:
                import logging
                logging.exception("Payroll notification step failed (slips were still inserted)")

        return {"generated": len(slips_to_insert), "slips": slips_to_insert}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/worker/payroll")
def worker_payroll(month: str = Query(..., pattern=r"^\d{4}-\d{2}$"), current_user: dict = Depends(get_current_user)):
    import calendar
    if current_user["role"] != "worker":
        raise HTTPException(status_code=403, detail="Worker access only")
    try:
        year, number = map(int, month.split("-"))
        start, end = month + "-01", f"{month}-{calendar.monthrange(year, number)[1]}"
    except ValueError:
        raise HTTPException(status_code=422, detail="Choose a valid month")
    client = client_for_token(current_user["token"])
    uid = current_user["id"]
    records = client.table("attendance").select("*").eq("worker_id", uid).gte("date", start).lte("date", end).execute().data or []
    profile = client.table("profiles").select("daily_rate").eq("id", uid).single().execute().data
    slips = client.table("salary_slips").select("*").eq("worker_id", uid).eq("period_start", start).eq("period_end", end).order("created_at", desc=True).execute().data or []
    if slips:
        slip = slips[0]
        return {**slip, "total_pay": slip.get("total_amount") if slip.get("total_amount") is not None else slip.get("total_pay"), "final": True, "slip_number": slip.get("slip_number")}
    try:
        return {**calculate_payroll(records, profile.get("daily_rate")), "final": False}
    except ValueError as error:
        raise HTTPException(status_code=409, detail=str(error))


@router.get("/worker/site")
def worker_site(current_user: dict = Depends(get_current_user)):
    if current_user["role"] != "worker":
        raise HTTPException(status_code=403, detail="Worker access only")
    client = client_for_token(current_user["token"])
    uid = current_user["id"]
    workers = client.table("workers").select("id").eq("user_id", uid).execute().data or []
    ids = list({uid, *[w["id"] for w in workers]})
    assignments = client.table("site_workers").select("project_id,assigned_at").in_("worker_id", ids).order("assigned_at", desc=True).execute().data or []
    if not assignments:
        return None
    project_id = assignments[0]["project_id"]
    projects = client.table("projects").select("id,name,location,start_date,end_date").eq("id", project_id).execute().data or []
    sites = client.table("sites").select("*").eq("project_id", project_id).eq("active", True).order("id").execute().data or []
    if not projects or not sites:
        return None
    worker_sites = client.table("workers").select("site_id").eq("user_id", uid).execute().data or []
    assigned_site_id = next((w["site_id"] for w in worker_sites if w.get("site_id")), None)
    if assigned_site_id:
        sites = [s for s in sites if s["id"] == assigned_site_id]
        if not sites:
            return None
    site = sites[0]
    manager = None
    if site.get("site_manager_id"):
        # Only expose contact fields for the already-authorized assigned site's manager.
        # Workers cannot SELECT another profile directly through the Data API.
        from core.attendance_setup import setup_client
        managers = setup_client().table("profiles").select("full_name,contact_number").eq("id", site["site_manager_id"]).execute().data or []
        manager = managers[0] if managers else None
    return {"project": projects[0], "site": site, "manager": manager}
