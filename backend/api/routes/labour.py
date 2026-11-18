from fastapi import APIRouter, HTTPException, Query, Depends
from typing import List, Optional
from ..models import LabourCreate, LabourResponse
from core.notification_helper import create_notifications, create_notification
from core.database import client_for_token
from core.security import require_manager_or_admin, get_current_user
from datetime import datetime, timezone
from zoneinfo import ZoneInfo
from core.worker_payroll import calculate_payroll, summarize_salary_slips, _is_present

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

def attendance_site_scope(client, allowed_projects, project_id=None):
    if project_id and allowed_projects is not None and project_id not in allowed_projects:
        raise HTTPException(403, 'Access denied: not your project')
    project_ids = [project_id] if project_id else allowed_projects
    if project_ids == []:
        return {}
    query = client.table('sites').select('id,project_id')
    if project_ids is not None:
        query = query.in_('project_id',project_ids)
    return {row['id']:row['project_id'] for row in query.execute().data or []}


def attendance_people(client, records):
    ids = list({row['worker_id'] for row in records if row.get('worker_id')})
    if not ids:
        return {}
    workers = client.table('workers').select('id,user_id').in_('id',ids).execute().data or []
    identities = {row['id']:row.get('user_id') or row['id'] for row in workers}
    profile_ids = list({identities.get(worker_id,worker_id) for worker_id in ids})
    profiles = client.table('profiles').select('id,full_name,daily_rate,worker_type').in_('id',profile_ids).execute().data or []
    by_id = {row['id']:row for row in profiles}
    return {worker_id:{**by_id.get(identities.get(worker_id,worker_id),{}),'id':identities.get(worker_id,worker_id)} for worker_id in ids}


@router.get("/", response_model=List[LabourResponse])
def get_labour(project_id: Optional[str] = Query(None, description="Filter by project ID"), current_user: dict = Depends(get_current_user)):
    try:
        client = client_for_token(current_user["token"])
        allowed_projects = managed_project_ids(client, current_user)
        site_to_project = attendance_site_scope(client,allowed_projects,project_id)
        if not site_to_project:
            return []
        records = client.table('attendance').select('*').in_('site_id',list(site_to_project)).execute().data or []
        people = attendance_people(client,records)

        # Map back to LabourResponse format for backwards compatibility
        mapped = []
        for row in records:
            prof = people.get(row['worker_id'],{})
            mapped.append({
                "id": row["id"],
                "project_id": site_to_project[row['site_id']],
                "site_id":row['site_id'],
                "worker_id":row['worker_id'],
                "role":prof.get('worker_type') or 'worker',
                "created_at":row['created_at'],
                "worker_name": prof.get("full_name") or "Unknown Worker",
                "date": row["date"],
                "status": row.get("status") or "Present",
                "check_in_time": row.get("check_in_time"),
                "check_out_time": row.get("check_out_time"),
                "hours_worked": row.get("hours_worked") or 0
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
        site_to_project = attendance_site_scope(client,allowed_projects)
        if not site_to_project:
            return []
        records = client.table('attendance').select('*').in_('site_id',list(site_to_project)).execute().data or []
        people = attendance_people(client,records)

        # Aggregate logic
        payroll_data = {}
        for row in records:
            raw_site = row.get("site_id")
            proj_id = site_to_project.get(raw_site, raw_site)
            if allowed_projects is not None and proj_id not in allowed_projects:
                continue

            prof = people.get(row['worker_id'],{})
            worker_name = prof.get("full_name") or "Unknown Worker"
            daily_rate = prof.get("daily_rate")

            key = (proj_id,prof['id'])
            if key not in payroll_data:
                payroll_data[key] = {
                    "project_id": proj_id,
                    "worker_id": prof['id'],
                    "worker_name": worker_name,
                    "total_hours": 0,
                    "days_present": 0,
                    "daily_rate": daily_rate,
                    "records":[],
                }
            payroll_data[key]['records'].append(row)

        for summary in payroll_data.values():
            totals = calculate_payroll(summary.pop('records'),0)
            summary.update(total_hours=totals['total_hours'],days_present=totals['total_days'],overtime_hours=totals['overtime_hours'])

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

        # Identity, assignment and physical-site checks precede every write.
        profiles = client.table('profiles').select('id,full_name,role,is_approved,worker_type').eq('id', labour.worker_id).execute().data or []
        if not profiles or profiles[0].get('role') != 'worker' or profiles[0].get('is_approved') is not True:
            raise HTTPException(403, 'Select an approved worker identity')
        profile = profiles[0]
        workers = client.table('workers').select('id,user_id,site_id').eq('user_id', profile['id']).execute().data or []
        if not workers:
            raise HTTPException(409, 'The selected worker has no attendance record configured')
        worker = workers[0]
        site_scope = attendance_site_scope(client, allowed_projects, labour.project_id)
        if not site_scope:
            raise HTTPException(409, 'This project has no linked attendance site')
        assigned = client.table('site_workers').select('worker_id').eq('project_id', labour.project_id).execute().data or []
        if not any(row['worker_id'] in {worker['id'], profile['id']} for row in assigned):
            raise HTTPException(403, 'This worker is not assigned to the selected project')
        site_id = worker.get('site_id') or sorted(site_scope)[0]
        if site_id not in site_scope:
            raise HTTPException(403, 'This worker is assigned to a different physical site')

        now = datetime.now(timezone.utc)
        work_date = labour.work_date
        check_in = labour.check_in_time if labour.status == 'Present' else None
        hours = labour.hours_worked if labour.status == 'Present' else 0
        if check_in:
            if check_in.tzinfo is None:
                raise HTTPException(422, 'Check-in time must include its timezone')
            actual_date = check_in.astimezone(ZoneInfo('Asia/Colombo')).date()
            if 'work_date' in labour.model_fields_set and actual_date != work_date:
                raise HTTPException(422, 'Check-in time and attendance date must match')
            work_date = actual_date
        elif labour.status == 'Present':
            if hours or work_date != now.astimezone(ZoneInfo('Asia/Colombo')).date():
                raise HTTPException(422, 'A check-in time is required for completed work hours')
            check_in = now
        if work_date > now.astimezone(ZoneInfo('Asia/Colombo')).date():
            raise HTTPException(422, 'Future attendance cannot be recorded')
        from datetime import timedelta
        check_out = check_in + timedelta(hours=hours) if check_in and hours else None
        if check_in and check_in > now or check_out and check_out > now:
            raise HTTPException(422, 'Record completed work hours only, or use zero hours for an open check-in')
        payload = {'site_id': site_id, 'worker_id': worker['id'], 'date': work_date.isoformat(),
                   'status': labour.status, 'hours_worked': hours, 'overtime_hours': max(hours - 8, 0),
                   'check_in_time': check_in.isoformat() if check_in else None,
                   'check_out_time': check_out.isoformat() if check_out else None}
        response = client.table('attendance').insert(payload).execute()
        if not response.data:
            raise HTTPException(400, 'Failed to add attendance record')
        inserted = response.data[0]
        return {**inserted, 'project_id': labour.project_id, 'site_id': site_id,
                'worker_name': profile.get('full_name') or 'Worker',
                'role': profile.get('worker_type') or 'worker'}
    except HTTPException:
        raise
    except Exception as e:
        if getattr(e, 'code', None) == '23505':
            raise HTTPException(409, 'Attendance already exists for this worker, site and date') from e
        if getattr(e, 'code', None) == '42501':
            raise HTTPException(403, 'Attendance is not permitted for this assignment') from e
        raise HTTPException(status_code=500, detail=str(e))


from pydantic import BaseModel, Field

class ScanRequest(BaseModel):
    qr_code: str
    site_id: str

@router.post("/scan")
def scan_qr_code(payload: ScanRequest, current_user: dict = Depends(get_current_user)):
    if current_user["role"] not in {"super_admin", "pm", "site_manager"}:
        raise HTTPException(status_code=403, detail="Not enough privileges")
    supabase = client_for_token(current_user["token"])
    try:
        # 1. Find worker by QR code (supporting raw qr_code UUID, profile id, worker_code, or JSON)
        code = payload.qr_code.strip()
        if code.startswith("{") and code.endswith("}"):
            try:
                import json
                parsed_qr = json.loads(code)
                code = str(parsed_qr.get("qr_code") or parsed_qr.get("worker_id") or parsed_qr.get("id") or parsed_qr.get("user_id") or code).strip()
            except Exception:
                pass

        profile_res = supabase.table("profiles").select("id, full_name, role").eq("qr_code", code).execute()
        if not profile_res.data:
            # Fallback: check profile ID
            profile_res = supabase.table("profiles").select("id, full_name, role").eq("id", code).execute()
        if not profile_res.data:
            # Fallback: check worker_code (ignore if column does not exist)
            try:
                profile_res = supabase.table("profiles").select("id, full_name, role").eq("worker_code", code).execute()
            except Exception:
                profile_res = type("EmptyRes", (), {"data": []})()

        worker_row = None
        if not profile_res.data:
            # Fallback: check workers.id directly
            direct_worker = supabase.table("workers").select("id, user_id, site_id").eq("id", code).execute()
            if direct_worker.data:
                worker_row = direct_worker.data[0] if isinstance(direct_worker.data, list) else direct_worker.data
                if worker_row.get("user_id"):
                    profile_res = supabase.table("profiles").select("id, full_name, role").eq("id", worker_row["user_id"]).execute()

        if not profile_res.data:
            raise HTTPException(status_code=404, detail="Invalid QR Code: Worker not found")

        worker = profile_res.data[0] if isinstance(profile_res.data, list) else profile_res.data
        worker_profile_id = worker["id"]

        if worker_row is None:
            worker_res = supabase.table("workers").select("id, user_id, site_id").eq("user_id", worker_profile_id).execute()
            if not worker_res.data:
                raise HTTPException(status_code=409, detail="Worker profile is not linked to a worker record")
            worker_row = worker_res.data[0] if isinstance(worker_res.data, list) else worker_res.data
        worker_id = worker_row["id"]

        # 2. Resolve target project and linked attendance site
        raw_target_id = payload.site_id
        project_id = raw_target_id
        site_id = None
        direct_site = supabase.table("sites").select("id, project_id").eq("id", raw_target_id).execute()
        if direct_site.data and isinstance(direct_site.data, list) and direct_site.data[0].get("project_id"):
            site_id = direct_site.data[0]["id"]
            project_id = direct_site.data[0]["project_id"]

        allowed = managed_project_ids(supabase, current_user)
        if allowed is not None and project_id not in allowed:
            raise HTTPException(status_code=403, detail="This project is not assigned to you")

        if not site_id:
            site_query = supabase.table("sites").select("id").eq("project_id", project_id)
            if current_user["role"] == "site_manager":
                site_query = site_query.eq("site_manager_id", current_user["id"])
            sites = site_query.order("id").execute()
            if not sites.data:
                raise HTTPException(status_code=409, detail="This project has no linked attendance site")
            site_id = sites.data[0]["id"]

        assigned_site_id = worker_row.get("site_id")
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

            # Check-out: calculate real hours and minutes
            check_in_dt = datetime.fromisoformat(record["check_in_time"].replace('Z', '+00:00'))
            now_dt = datetime.now(timezone.utc)
            if check_in_dt.tzinfo is None:
                check_in_dt = check_in_dt.replace(tzinfo=timezone.utc)
            if (now_dt - check_in_dt).total_seconds() < 30:
                raise HTTPException(status_code=409, detail="Duplicate scan ignored. Wait before checking out.")

            diff_seconds = max(0.0, (now_dt - check_in_dt).total_seconds())
            total_minutes = max(0, round(diff_seconds / 60.0))
            hours = total_minutes // 60
            minutes = total_minutes % 60
            formatted_duration = f"{hours}h {minutes}m"
            diff_hours = round(total_minutes / 60.0, 2)
            overtime_minutes = max(0, total_minutes - 480)
            overtime_hours = round(overtime_minutes / 60.0, 2)

            upd_res = supabase.table("attendance").update({
                "check_out_time": now_iso,
                "hours_worked": diff_hours,
                "overtime_hours": overtime_hours
            }).eq("id", record["id"]).is_("check_out_time", "null").execute()

            if not upd_res.data:
                raise HTTPException(status_code=409, detail="Attendance changed; refresh before scanning again")
            return {
                "action": "check_out",
                "worker_name": worker["full_name"],
                "time": now_iso,
                "hours_worked": diff_hours,
                "overtime_hours": overtime_hours,
                "formatted_hours": formatted_duration
            }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

class SalaryGenerateRequest(BaseModel):
    start_date: str
    end_date: str
    site_id: str


class SalaryPayment(BaseModel):
    amount: float = Field(ge=0, allow_inf_nan=False)


@router.patch('/salary/{slip_id}/paid')
def record_salary_payment(slip_id: str, payload: SalaryPayment, current_user: dict = Depends(require_manager_or_admin)):
    client = client_for_token(current_user['token'])
    rows = client.table('salary_slips').select('*').eq('id', slip_id).execute().data or []
    if not rows:
        raise HTTPException(404, 'Salary slip not found')
    slip = rows[0]
    project_id = slip.get('project_id')
    if not project_id:
        raise HTTPException(409, 'Reconcile this legacy salary slip with its project first')
    from core.access import require_project_member
    require_project_member(client, project_id, current_user)
    total = slip.get('total_amount') if slip.get('total_amount') is not None else slip.get('total_pay')
    from decimal import Decimal
    if total is None or Decimal(str(total)) != Decimal(str(payload.amount)):
        raise HTTPException(422, 'Confirm the exact salary slip amount')
    if slip.get('status') == 'Paid':
        return slip
    if slip.get('status') not in {'Draft', 'Approved', 'Pending', 'Generated'}:
        raise HTTPException(409, 'This salary slip cannot be paid')
    result = client.table('salary_slips').update({'status':'Paid'}).eq('id',slip_id).eq('project_id',project_id).eq('status',slip['status']).execute().data or []
    if not result:
        raise HTTPException(409, 'Salary slip changed; refresh before recording payment')
    return result[0]

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

        project_rows = supabase.table("projects").select("*").eq("id", project_id).execute().data or []
        is_test_project = bool(project_rows and project_rows[0].get("is_test"))

        # Resolve all site IDs that belong to this project
        project_sites = supabase.table("sites").select("id").eq("project_id", project_id).execute().data or []
        candidate_site_ids = list(set([s["id"] for s in project_sites] + [payload.site_id, project_id]))

        # Attendance query: use site_id, not project_id
        records = supabase.table("attendance").select("*").in_("site_id", candidate_site_ids).gte("date", payload.start_date).lte("date", payload.end_date).execute().data or []
        present_records = [r for r in records if _is_present(r)]
        if any(not r.get("reviewed_at") for r in present_records):
            raise HTTPException(status_code=409, detail="Review and approve attendance before generating salary slips")
        if not present_records:
            return {"generated": 0, "slips": []}

        # Resolve attendance worker_id (which could be workers.id) to profiles.id
        raw_worker_ids = list(set([r["worker_id"] for r in present_records if r.get("worker_id")]))
        workers_lookup = supabase.table("workers").select("id, user_id").in_("id", raw_worker_ids).execute().data or []
        worker_id_to_user_id = {w["id"]: w["user_id"] for w in workers_lookup if w.get("user_id")}

        # Group attendance records by profile user_id
        user_records_map = {}
        for r in present_records:
            w_id = r.get("worker_id")
            uid = worker_id_to_user_id.get(w_id, w_id)
            if uid:
                user_records_map.setdefault(uid, []).append(r)

        target_uids = list(user_records_map.keys())
        if not target_uids:
            return {"generated": 0, "slips": []}

        profiles = supabase.table("profiles").select("id,daily_rate,worker_type,full_name,email").in_("id", target_uids).execute().data or []
        profile_by_user = {p["id"]: p for p in profiles}
        boq_plan = dict(project_rows[0].get("boq_data") or {}) if project_rows else {}
        if boq_plan:
            boq_plan["labour_overrides"] = supabase.table("project_boq_worker_rates").select("worker_id,daily_rate").eq("project_id",project_id).execute().data or []
        existing_slips = supabase.table('salary_slips').select('id,worker_id,period_start,period_end,status').eq('project_id',project_id).in_('worker_id',target_uids).lte('period_start',payload.end_date).gte('period_end',payload.start_date).execute().data or []
        conflicts = [row for row in existing_slips if row['period_start'] != payload.start_date or row['period_end'] != payload.end_date]
        if conflicts:
            raise HTTPException(409, detail={
                'code':'payroll_overlap',
                'message':'Salary slips already cover part of this pay period. No new slips were created. Review the existing slips and choose a non-overlapping period.',
                'conflicts':[{**row,'worker_name':profile_by_user.get(row['worker_id'],{}).get('full_name') or 'Worker'} for row in conflicts],
            })
        existing_workers = {row['worker_id'] for row in existing_slips}
        # Worker preference settings are stored in worker_details, not profiles.
        try:
            from core.database import get_service_client
            from core.config import settings
            if settings.SUPABASE_SERVICE_ROLE_KEY:
                preference_rows = get_service_client().table("worker_details").select("user_id,notification_preferences").in_("user_id", target_uids).execute().data or []
                for preference in preference_rows:
                    if preference["user_id"] in profile_by_user:
                        profile_by_user[preference["user_id"]]["notification_preferences"] = preference.get("notification_preferences") or {}
        except Exception:
            # An unavailable preference store must not result in an unsolicited email.
            for profile in profile_by_user.values():
                profile["notification_preferences"] = {"email": False, "in_app": True}


        slips_to_insert = []
        for uid, worker_records in user_records_map.items():
            if uid in existing_workers:
                continue

            prof = profile_by_user.get(uid, {})
            from core.project_boq import resolve_boq_pay_terms
            daily_rate, overtime_rate, rate_source = resolve_boq_pay_terms(boq_plan, prof)
            pay = calculate_payroll(worker_records, daily_rate, overtime_rate)
            slips_to_insert.append({
                "worker_id": uid,
                "project_id": project_id,
                "month": start.replace(day=1).isoformat(),
                "period_start": payload.start_date,
                "period_end": payload.end_date,
                **{key: pay[key] for key in ("total_days", "total_hours", "overtime_hours", "basic_pay", "overtime_pay", "total_pay")},
                "total_amount": pay["total_pay"],
                "daily_rate": pay["daily_rate"],
                "status": "Draft"
            })
            if boq_plan:
                trade = str(prof.get('worker_type') or '').strip().casefold()
                rate_lines = [row for row in boq_plan.get('labour_rates', []) if str(row.get('trade') or row.get('role') or '').strip().casefold() == trade]
                slips_to_insert[-1].update({'rate_source': rate_source, 'boq_revision': project_rows[0].get('boq_revision')})
                if len(rate_lines) == 1 and rate_lines[0].get('id'):
                    slips_to_insert[-1]['boq_item_id'] = rate_lines[0]['id']
        user_ids = [s["worker_id"] for s in slips_to_insert]
        if slips_to_insert:
            supabase.table("salary_slips").insert(slips_to_insert).execute()

            # Notify each worker in-app and by email about their new salary slip.
            try:
                notifications_to_insert = []
                for uid in user_ids:
                    notifications_to_insert.append({
                        "user_id": current_user["id"],
                        "project_id": project_id,
                        "target_user_id": uid,
                        "target_role": "worker",
                        "title": "Salary Slip Ready",
                        "message": f"Your salary slip for {payload.start_date} to {payload.end_date} is ready. Log in to view it.",
                        "type": "general",
                        "link": "/worker/payroll",
                        "is_read": False,
                    })
                    profile = profile_by_user.get(uid)
                    if not is_test_project and profile and profile.get("email") and (profile.get("notification_preferences") or {}).get("email", True):
                        try:
                            from services.email_service import send_email
                            from html import escape
                            from core.config import settings
                            name = escape(profile.get("full_name") or "there")
                            p_url = f"{getattr(settings, 'FRONTEND_URL', 'http://localhost:8082').rstrip('/')}/worker/payroll"
                            html_body = (
                                f"<p>Hi {name},</p>"
                                f"<p>Your salary slip for <b>{payload.start_date} to {payload.end_date}</b> has been generated.</p>"
                                f'<p><a href="{p_url}">View your payslip on ConstructFlow</a></p>'
                            )
                            send_email(profile["email"], "Your ConstructFlow Salary Slip is Ready", html_body)
                        except Exception:
                            import logging
                            logging.exception("Failed payroll email for worker %s", uid)
                notifications_to_insert = [n for n in notifications_to_insert if (profile_by_user.get(n["target_user_id"], {}).get("notification_preferences") or {}).get("in_app", True)]
                if notifications_to_insert:
                    create_notifications(notifications_to_insert)
            except Exception:
                import logging
                logging.exception("Payroll notification step failed (slips were still inserted)")

        return {"generated": len(slips_to_insert), "already_generated":len(existing_workers), "slips": slips_to_insert}
    except HTTPException:
        raise
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc
    except Exception as e:
        if str(getattr(e,'code','')) == '23505':
            raise HTTPException(409, detail={'code':'payroll_changed','message':'Payroll for this period was generated by another request. Refresh the existing salary slips before trying again.'}) from e
        import logging
        logging.exception('Salary generation failed')
        raise HTTPException(503, 'Salary slips could not be generated. Please retry or contact your administrator.') from e


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
    workers_res = client.table("workers").select("id").eq("user_id", uid).execute().data or []
    worker_ids = list({uid, *[w["id"] for w in workers_res if w.get("id")]})
    slips = client.table("salary_slips").select("*").in_("worker_id",worker_ids).lte("period_start",end).gte("period_end",start).order("period_start").execute().data or []
    if slips:
        return summarize_salary_slips(slips,start,end)
    records = client.table("attendance").select("*").in_("worker_id", worker_ids).gte("date", start).lte("date", end).execute().data or []
    profile = client.table("profiles").select("id,daily_rate,worker_type").eq("id", uid).single().execute().data or {}
    try:
        from core.project_boq import estimate_project_payroll
        plans_by_site = {}
        site_ids = list({row['site_id'] for row in records if row.get('site_id')})
        if site_ids:
            sites = client.table('sites').select('id,project_id').in_('id',site_ids).execute().data or []
            project_ids = list({row['project_id'] for row in sites if row.get('project_id')})
            projects = client.table('projects').select('id,boq_data').in_('id',project_ids).execute().data or [] if project_ids else []
            boq_by_project = {row['id']: dict(row.get('boq_data') or {}) for row in projects}
            boq_ids = [key for key, value in boq_by_project.items() if value]
            overrides = client.table('project_boq_worker_rates').select('project_id,worker_id,daily_rate').in_('project_id',boq_ids).eq('worker_id',uid).execute().data or [] if boq_ids else []
            for row in overrides:
                boq_by_project[row['project_id']].setdefault('labour_overrides',[]).append(row)
            plans_by_site = {row['id']: {'project_id':row['project_id'],'boq_data':boq_by_project.get(row['project_id'])} for row in sites if row.get('project_id')}
        return {**estimate_project_payroll(records, profile, plans_by_site), "final": False}
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
