from fastapi import APIRouter, HTTPException, Request, Depends, UploadFile, File, Form, Query
from typing import List, Optional, Dict, Any
from datetime import date, datetime, timezone
from ..models import ProjectCreate, ProjectUpdate, ProjectResponse
from core.notification_helper import create_notifications, create_notification
from core.database import client_for_token, get_auth_client
from core.security import get_current_user, require_admin, normalize_role
from core.attendance_setup import ensure_project_attendance, setup_client
import os
import requests
import logging
from uuid import uuid4

logger = logging.getLogger(__name__)
PROJECT_VALIDATION_MESSAGES = {
    'Invalid project fields', 'Invalid project status', 'Assignments must be arrays',
    'PM assignment required', 'Invalid BOQ payload', 'Invalid milestone list',
    'Milestone title required', 'New project milestones must start pending',
    'Invalid BOQ material list', 'Invalid BOQ material', 'Invalid BOQ total',
    'Invalid BOQ line', 'BOQ total must equal its line amounts',
    'Choose an approved worker for project pay rates',
    'Worker rate override requires an assigned worker',
    'BOQ document requires a secure storage URL',
    'A BOQ item cannot change its item type',
}
for assignment_role in ('pm', 'client'):
    PROJECT_VALIDATION_MESSAGES.add(f'Invalid or unapproved assignment for {assignment_role}_id')
for assignment_role in ('site_manager', 'worker', 'supplier', 'admin'):
    PROJECT_VALIDATION_MESSAGES.add(f'Invalid or unapproved {assignment_role} assignment')

router = APIRouter(
    prefix="/projects",
    tags=["Projects"]
)

@router.get("/", response_model=List[ProjectResponse])
def get_projects(request: Request):
    try:
        client = get_auth_client(request)
        response = client.table("projects").select("*").execute()
        return response.data
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

from pydantic import BaseModel, Field

class BulkProjectRequest(BaseModel):
    ids: List[str]

@router.post("/bulk-names")
def get_bulk_project_names(req: BulkProjectRequest, request: Request):
    try:
        service_client = get_auth_client(request)
        res = service_client.table("projects").select("id, name, location").in_("id", req.ids).execute()
        return res.data
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/geocode")
def geocode_location(q: str = Query(min_length=2, max_length=200)):
    from core.location_search import search_locations
    return search_locations(q)


@router.get('/location-suggestions')
def location_suggestions(q: str = Query(min_length=3, max_length=200)):
    from core.location_search import suggest_locations
    return suggest_locations(q)

@router.get("/reverse-geocode")
def reverse_geocode(lat: float, lng: float):
    """
    Reverse geocode coordinates into a readable address string.
    Chains Google Maps -> Photon -> Nominatim.
    """
    from core import geoapify_search
    if geoapify_search.configured():
        return geoapify_search.reverse(lat, lng)
    google_key = os.getenv("EXPO_PUBLIC_GOOGLE_MAPS_API_KEY", "")
    if google_key:
        try:
            g_res = requests.get(
                "https://maps.googleapis.com/maps/api/geocode/json",
                params={"latlng": f"{lat},{lng}", "key": google_key},
                timeout=4
            )
            g_data = g_res.json()
            if g_data.get("status") == "OK" and g_data.get("results"):
                return {"display_name": g_data["results"][0].get("formatted_address")}
        except Exception:
            pass

    headers = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) ConstructFlow/1.0"}
    try:
        r = requests.get(
            "https://photon.komoot.io/reverse",
            params={"lat": lat, "lon": lng},
            headers=headers,
            timeout=5
        )
        if r.status_code == 200:
            features = r.json().get("features", [])
            if features:
                props = features[0].get("properties", {})
                parts = [props.get("name"), props.get("street"), props.get("district"), props.get("city"), props.get("state"), props.get("country")]
                unique_parts = []
                for p in parts:
                    if p and (not unique_parts or unique_parts[-1].lower() != p.lower()):
                        unique_parts.append(p)
                if unique_parts:
                    return {"display_name": ", ".join(unique_parts)}
    except Exception:
        pass

    try:
        from core.location_search import nominatim_data
        osm_data = nominatim_data({"lat": lat, "lon": lng, "format": "json"}, reverse=True)
        if osm_data.get("display_name"):
            return {"display_name": osm_data["display_name"]}
    except Exception:
        pass

    return {"display_name": f"Lat: {lat:.4f}, Lng: {lng:.4f}"}

def send_client_assignment_email(email: str, project_name: str):
    from services.email_service import send_email
    subject = f"Welcome to {project_name} - ConstructFlow"
    from html import escape
    project_name = escape(project_name)
    html = f"""
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background: #F97316; padding: 24px; border-radius: 12px 12px 0 0;">
        <h1 style="color: white; margin: 0;">ConstructFlow</h1>
      </div>
      <div style="padding: 32px; background: white; border: 1px solid #e5e7eb;">
        <h2 style="color: #1F2937;">Welcome to your new project</h2>
        <p style="color: #6B7280;">You have been assigned as the client for:</p>
        <div style="background: #F9FAFB; padding: 16px; border-radius: 8px; margin: 16px 0;">
          <p style="margin: 4px 0;"><strong>Project:</strong> {project_name}</p>
        </div>
        <p style="color: #6B7280;">Please log in to your ConstructFlow Client Portal to track milestones, view estimates, and communicate with your Project Manager.</p>
      </div>
    </div>
    """
    try:
        send_email(email, subject, html)
    except Exception as e:
        print("Failed to dispatch client assignment notification:", e)


def save_project(client, data, project_id=None):
    # Defined in migrations/20260925_workflow_integrity.sql. A failed assignment
    # rolls back the project change as part of the same database transaction.
    try:
        result = client.rpc("save_project_with_assignments", {"p_project_id": project_id, "p_data": data}).execute()
        if result and getattr(result, "data", None):
            return result.data
        raise HTTPException(status_code=503, detail="Project transaction returned no data")
    except HTTPException:
        raise
    except Exception as exc:
        code = str(getattr(exc, "code", ""))
        message = str(getattr(exc, 'message', ''))
        reference = uuid4().hex[:12]
        # Only known application validation text is safe to show or log.
        logger.warning('Project transaction rejected: reference=%s code=%s validation=%s',
                       reference, code if code.isalnum() else 'unknown',
                       message if message in PROJECT_VALIDATION_MESSAGES else 'unclassified')
        if code == 'P0001' and message in PROJECT_VALIDATION_MESSAGES:
            raise HTTPException(status_code=422, detail=message) from exc
        details = {
            '42501': (403, 'You do not have permission to save this project or its assignments.'),
            'P0002': (404, 'Project not found. Refresh your project list.'),
            '23503': (422, 'A selected assignment or BOQ reference is no longer available. Refresh and select it again.'),
            '23514': (422, 'A project, milestone or BOQ value is outside the allowed limits. Check the entered values.'),
            '23505': (409, 'A duplicate assignment or project planning record was found. Check the selected team and BOQ rows.'),
            '22P02': (422, 'A project, assignment or BOQ value has an invalid format.'),
            '22007': (422, 'A project or milestone date is invalid. Use YYYY-MM-DD.'),
            '22008': (422, 'A project or milestone date is outside the allowed range.'),
        }
        status_code, detail = details.get(code, (503, 'Project could not be saved. Contact the administrator with the error reference.'))
        raise HTTPException(status_code=status_code, detail=f'{detail} Reference: {reference} ({code if code.isalnum() else "unknown"}).') from exc


def notify_assigned_client(client, project):
    if project.get("is_test") or not project.get("client_id"):
        return
    try:
        profile = client.table("profiles").select("email").eq("id", project["client_id"]).execute()
        if profile.data and profile.data[0].get("email"):
            send_client_assignment_email(profile.data[0]["email"], project["name"])
    except Exception:
        import logging
        logging.exception("Project saved, but client notification failed")


@router.get("/boq-template")
def get_boq_template(format: str = "csv", kind: str = "blank"):
    from fastapi.responses import StreamingResponse
    from pathlib import Path
    import io

    if format.lower() == "xlsx":
        if kind.lower() == "sample":
            sample_path = Path(__file__).resolve().parents[3] / "ConstructAI_BOQ_Template.xlsx"
            if not sample_path.exists():
                raise HTTPException(status_code=404, detail="Sample BOQ template file not found")
            return StreamingResponse(
                io.BytesIO(sample_path.read_bytes()),
                media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                headers={"Content-Disposition": 'attachment; filename="ConstructAI_BOQ_Template.xlsx"'},
            )

        from core.boq_parser import generate_blank_boq_xlsx
        xlsx_bytes = generate_blank_boq_xlsx()
        return StreamingResponse(
            io.BytesIO(xlsx_bytes),
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": 'attachment; filename="ConstructFlow_Blank_BOQ_Template.xlsx"'},
        )

    from core.boq_parser import get_sample_boq_csv
    return {
        "template": get_sample_boq_csv(),
        "filename": "constructflow_sample_boq.csv"
    }


@router.post("/parse-boq")
async def parse_boq_endpoint(
    file: Optional[UploadFile] = File(None),
    csv_data: Optional[str] = Form(None),
):
    try:
        from core.boq_parser import parse_boq_file, parse_boq_dataframe
        import pandas as pd
        import io
        from core.project_boq import normalize_boq

        if file:
            content = await file.read()
            if not content:
                raise HTTPException(status_code=400, detail="Uploaded file is empty.")
            return normalize_boq(parse_boq_file(content, file.filename or "boq.csv"))
        elif csv_data and csv_data.strip():
            df = pd.read_csv(io.StringIO(csv_data), on_bad_lines="error", nrows=20001, keep_default_na=False)
            return normalize_boq(parse_boq_dataframe(df))
        else:
            raise HTTPException(status_code=400, detail="Please upload an Excel/CSV BOQ file or provide CSV text.")
    except HTTPException:
        raise
    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"BOQ processing error: {str(e)}")


@router.post("", response_model=ProjectResponse, include_in_schema=False)
@router.post("/", response_model=ProjectResponse)
def create_project(project: ProjectCreate, request: Request, current_user: dict = Depends(get_current_user)):
    if current_user["role"] not in {"super_admin", "pm"}:
        raise HTTPException(status_code=403, detail="Manager access required")
    if current_user["role"] == "pm" and (project.pm_id != current_user["id"] or project.admins):
        raise HTTPException(status_code=403, detail="PMs may create only their own projects")
    client = get_auth_client(request)
    dump = project.model_dump(mode="json", exclude_none=True)
    # Auto populate total_budget from BOQ if not set manually
    if (dump.get("total_budget", 0) <= 0) and project.boq_data and project.boq_data.get("total_budget"):
        dump["total_budget"] = float(project.boq_data["total_budget"])

    saved = save_project(client, dump)

    # Assignment synchronization is owned by the database transaction.

    # 4. Safe server-side notifications (never fails project creation)
    notifications_failed = False
    try:
        notifications = []
        if saved.get("pm_id"):
            notifications.append({
                "user_id": None,
                "project_id": saved["id"],
                "target_user_id": saved["pm_id"],
                "target_role": "pm",
                "title": "New Project Assigned",
                "message": f"You have been assigned as Project Manager for: {saved['name']}",
                "type": "general",
                "is_read": False,
            })
        if saved.get("client_id"):
            notifications.append({
                "user_id": None,
                "project_id": saved["id"],
                "target_user_id": saved["client_id"],
                "target_role": "client",
                "title": "Your project has been created",
                "message": f"Welcome to your project: {saved['name']}",
                "type": "general",
                "is_read": False,
            })
        # Admins
        notifications.append({
            "user_id": None,
            "project_id": saved["id"],
            "target_user_id": None,
            "target_role": "super_admin",
            "title": "New Project Created",
            "message": f"Project '{saved['name']}' has been created successfully.",
            "type": "general",
            "is_read": False,
        })
        # Suppliers
        if getattr(project, "suppliers", None):
            for s_id in project.suppliers:
                notifications.append({
                    "user_id": None,
                    "project_id": saved["id"],
                    "target_user_id": s_id,
                    "target_role": "supplier",
                    "title": "New Project Assignment",
                    "message": f"You have been assigned as a supplier for: {saved['name']}",
                    "type": "general",
                    "is_read": False,
                })
        notifications_failed = create_notifications(notifications, workflow=True) != len(notifications)
    except Exception as e:
        import logging
        logging.warning(f"Notification dispatch failed: {e}")
        notifications_failed = True

    try:
        ensure_project_attendance(setup_client(), saved["id"])
        notify_assigned_client(client, saved)
    except Exception:
        pass

    saved["notifications_failed"] = notifications_failed
    return saved


def record_project_audit_log(admin_user: dict, action: str, project_id: str, summary: dict):
    try:
        service_client = setup_client()
        service_client.table("inventory_logs").insert({
            "action": f"project_{action}",
            "notes": f"Admin {admin_user.get('email')} performed {action} on project {project_id}: {summary}",
            "logged_by": admin_user.get("id"),
            "logged_at": datetime.now(timezone.utc).isoformat()
        }).execute()
    except Exception as e:
        import logging
        logging.warning(f"Could not record audit log: {e}")


def get_project_dependencies(project_id: str) -> Dict[str, int]:
    service_client = setup_client()
    deps = {}

    # 1. Direct project_id child tables
    table_cols = [
        ("milestones", "project_id"),
        ("project_expenses", "project_id"),
        ("purchase_orders", "project_id"),
        ("site_workers", "project_id"),
        ("site_manager_sites", "project_id"),
        ("sites", "project_id"),
        ("site_reports", "project_id"),
        ("shared_documents", "project_id"),
        ("material_requests", "project_id"),
        ("materials", "project_id"),
        ("legacy_labour", "project_id"),
        ("legacy_photos", "project_id"),
        ("cost_estimates", "project_id"),
        ("client_messages", "project_id"),
        ("messages", "project_id"),
        ("client_payment_schedule", "project_id"),
        ("variation_orders", "project_id"),
        ("project_role_assignments", "project_id"),
        ("pm_projects", "project_id"),
    ]
    for table, col in table_cols:
        try:
            res = service_client.table(table).select("id", count="exact").eq(col, project_id).execute()
            if res.count:
                deps[table] = res.count
        except Exception:
            pass

    # 2. Site-dependent tables (attendance, issues, site_media)
    try:
        sites_res = service_client.table("sites").select("id").eq("project_id", project_id).execute()
        site_ids = [s["id"] for s in (sites_res.data or [])]
        if site_ids:
            for site_table in ["attendance", "issues", "site_media"]:
                try:
                    res = service_client.table(site_table).select("id", count="exact").in_("site_id", site_ids).execute()
                    if res.count:
                        deps[site_table] = res.count
                except Exception:
                    pass
    except Exception:
        pass

    return deps


@router.patch("/{project_id}", response_model=ProjectResponse)
def update_project(project_id: str, project: ProjectUpdate, request: Request, current_user: dict = Depends(get_current_user)):
    user = current_user if isinstance(current_user, dict) else (
        getattr(request, "state", None) and getattr(request.state, "user", None)
        or {"id": "system-admin", "role": "super_admin"}
    )
    user_role = normalize_role(user.get("role"))
    if user_role not in ("super_admin", "pm"):
        raise HTTPException(status_code=403, detail="Admin or Project Manager access required")

    service_client = setup_client()

    # 1. Fetch existing project to verify existence and check permissions
    existing_res = service_client.table("projects").select("*").eq("id", project_id).execute()
    if not existing_res.data:
        raise HTTPException(status_code=404, detail="Project not found")

    old_project = existing_res.data[0]
    old_pm_id = old_project.get("pm_id")
    old_client_id = old_project.get("client_id")

    # If PM, ensure they manage this project and do not perform admin-only reassignments
    if user_role == "pm":
        if str(old_pm_id) != str(user.get("id")):
            raise HTTPException(status_code=403, detail="You do not have permission to update this project")
        if project.pm_id is not None and str(project.pm_id) != str(old_pm_id):
            raise HTTPException(status_code=403, detail="Only admins can reassign a Project Manager")
        if project.admins:
            raise HTTPException(status_code=403, detail="Only admins can assign administrators")

    # 2. Foreign key and role validation for assigned PM and Client
    if project.pm_id:
        pm_check = service_client.table("profiles").select("id, role, full_name").eq("id", project.pm_id).execute()
        if not pm_check.data:
            raise HTTPException(status_code=400, detail=f"Assigned Project Manager ID '{project.pm_id}' does not exist in user profiles")
        pm_role = normalize_role(pm_check.data[0].get("role"))
        if pm_role not in ("pm", "super_admin"):
            raise HTTPException(status_code=400, detail=f"User '{pm_check.data[0].get('full_name') or project.pm_id}' does not have the Project Manager role")

    if project.client_id:
        client_check = service_client.table("profiles").select("id, role, full_name").eq("id", project.client_id).execute()
        if not client_check.data:
            raise HTTPException(status_code=400, detail=f"Assigned Client ID '{project.client_id}' does not exist in user profiles")
        client_role = normalize_role(client_check.data[0].get("role"))
        if client_role not in ("client", "super_admin"):
            raise HTTPException(status_code=400, detail=f"User '{client_check.data[0].get('full_name') or project.client_id}' does not have the Client role")

    # 3. Extract editable whitelist
    raw_dict = project.model_dump(mode="json", exclude_unset=True)
    if "budget" in raw_dict and "total_budget" not in raw_dict:
        raw_dict["total_budget"] = raw_dict["budget"]

    # Date sanity check
    start_d = raw_dict.get("start_date") or old_project.get("start_date")
    end_d = raw_dict.get("end_date") or old_project.get("end_date")
    if start_d and end_d and str(end_d) < str(start_d):
        raise HTTPException(status_code=400, detail="End date precedes start date")

    whitelist_fields = {
        "name", "location", "address", "status", "total_budget", "start_date",
        "end_date", "client_id", "pm_id", "description", "latitude", "longitude",
        "site_managers", "workers", "suppliers", "admins"
    }
    filtered_data = {k: v for k, v in raw_dict.items() if k in whitelist_fields}

    # 4. Save project with assignments
    client = get_auth_client(request)
    saved = save_project(client, filtered_data, project_id)

    # Assignment synchronization is owned by the database transaction.

    # 7. Best-effort notifications for PM and Client change
    try:
        new_pm_id = saved.get("pm_id")
        if new_pm_id and str(new_pm_id) != str(old_pm_id):
            create_notifications([{
                "user_id": None,
                "project_id": project_id,
                "target_user_id": new_pm_id,
                "target_role": "pm",
                "title": "New Project Assigned",
                "message": f"You have been assigned as Project Manager for: {saved.get('name')}",
                "type": "general",
                "is_read": False,
            }], workflow=True)

        new_client_id = saved.get("client_id")
        if new_client_id and str(new_client_id) != str(old_client_id):
            notify_assigned_client(client, saved)
    except Exception:
        import logging
        logging.exception("Project updated, but PM/client notification failed")

    ensure_project_attendance(setup_client(), project_id)

    # Automated Learning Loop: When project is completed, add row to historical_projects automatically
    if str(saved.get("status") or "").lower() == "completed":
        try:
            import datetime
            import re
            from services.historical_data_service import _get_local_conn, validate_district
            p_name = saved.get("name") or f"Project-{project_id[:8]}"
            raw_loc = saved.get("location") or "Colombo"
            p_dist = validate_district(raw_loc) or "Colombo"
            p_budget = float(saved.get("total_budget") or 0)
            p_spent = float(saved.get("spent_cost") or p_budget or 5_000_000)
            sqft = float(saved.get("square_footage") or 2500)
            now_iso = datetime.datetime.now(datetime.timezone.utc).isoformat()

            # Check if flagged as test data
            is_test_flag = bool(saved.get("is_test"))
            name_lower = p_name.lower()
            is_test_by_name = any(kw in name_lower for kw in ["test", "demo", "sample"])
            is_test_data = is_test_flag or is_test_by_name

            source_val = "sample" if is_test_data else "real"
            verified_val = 0
            evidence = "Test project (excluded from training)" if is_test_data else f"ConstructFlow completed project: {p_name}"

            conn = _get_local_conn()
            cur = conn.cursor()
            cur.execute("""
            INSERT OR REPLACE INTO historical_projects (
                id, project_name, project_type, district, town, floor_area_sqft, floors,
                structure_type, quality_tier, site_condition, start_date, end_date,
                estimate_total_lkr, actual_total_lkr, cost_year, source, evidence_note, verified, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                str(project_id), p_name, saved.get("project_type", "Residential House"),
                p_dist, None, sqft, 1, "RCC frame", "Standard", "Flat",
                saved.get("start_date") or datetime.date.today().isoformat(),
                saved.get("end_date") or datetime.date.today().isoformat(),
                p_budget, p_spent, datetime.date.today().year, source_val, evidence, verified_val, now_iso
            ))
            conn.commit()
            conn.close()
        except Exception as h_err:
            import logging
            logging.warning("Could not auto-record completed project to historical_projects: %s", h_err)

    return saved


@router.delete("/{project_id}")
def delete_project(project_id: str, archive_only: bool = False, confirmation_name: Optional[str] = None, current_user: dict = Depends(require_admin)):
    if not archive_only:
        if not confirmation_name:
            raise HTTPException(422, 'Type the project name to confirm permanent deletion')
        from api.routes.workflow import transition
        return transition(client_for_token(current_user['token']), 'permanently_delete_project', {
            'p_project_id': project_id, 'p_confirmation': confirmation_name,
        })
    service_client = setup_client()
    rows = service_client.table('projects').select('*').eq('id', project_id).execute().data or []
    if not rows:
        raise HTTPException(404, 'Project not found')
    project = rows[0]
    service_client.table('projects').update({'status': 'archived'}).eq('id', project_id).execute()
    record_project_audit_log(current_user, 'archive', project_id, {'name': project.get('name'), 'previous_status': project.get('status')})
    return {'message': 'Project archived successfully', 'status': 'archived'}


@router.post("/{project_id}/restore")
def restore_project(project_id: str, current_user: dict = Depends(require_admin)):
    service_client = setup_client()
    proj_res = service_client.table("projects").select("*").eq("id", project_id).execute()
    if not proj_res.data:
        raise HTTPException(status_code=404, detail="Project not found")

    project = proj_res.data[0]
    project_name = project.get("name") or "Unnamed Project"
    service_client.table("projects").update({"status": "active"}).eq("id", project_id).execute()
    record_project_audit_log(current_user, "restore", project_id, {"name": project_name, "previous_status": project.get("status")})
    return {"message": f"Project '{project_name}' has been restored successfully.", "status": "active"}


from pydantic import BaseModel, Field

def authorized_project_client(project_id, user, *, write):
    if not write and user["role"] not in {"super_admin", "pm", "client"}:
        raise HTTPException(status_code=403, detail="Not enough privileges")
    if write and user["role"] not in {"super_admin", "pm", "site_manager"}:
        raise HTTPException(status_code=403, detail="Not enough privileges")
    client = client_for_token(user["token"])
    response = client.table("projects").select("id, pm_id, client_id").eq("id", project_id).execute()
    if not response.data:
        raise HTTPException(status_code=404, detail="Project not found")
    project = response.data[0]
    if user["role"] == "super_admin":
        return client
    if user["role"] == "pm" and project.get("pm_id") == user["id"]:
        return client
    if not write and user["role"] == "client" and project.get("client_id") == user["id"]:
        return client
    res = client.table("project_role_assignments").select("user_id").eq("project_id", project_id).eq("user_id", user["id"]).execute()
    data = res.data if hasattr(res, "data") else []
    if not data and user["role"] == "site_manager":
        res_sm = client.table("site_manager_sites").select("id").eq("project_id", project_id).eq("site_manager_id", user["id"]).execute()
        data = res_sm.data if hasattr(res_sm, "data") else []
    if not data:
        raise HTTPException(status_code=403, detail="Access denied: not your project")
    return client


@router.post("/{project_id}/attendance-setup")
def prepare_attendance(project_id: str, current_user: dict = Depends(get_current_user)):
    # Check role and persisted project assignment BEFORE privileged setup writes.
    authorized_project_client(project_id, current_user, write=True)
    try:
        return ensure_project_attendance(setup_client(), project_id)
    except Exception as error:
        raise HTTPException(status_code=409, detail=f"Attendance setup failed: {error}")


class MilestoneCreate(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    description: str = Field(default="", max_length=10000)
    due_date: date

@router.post("/{project_id}/milestones")
def create_milestone(project_id: str, payload: MilestoneCreate, current_user: dict = Depends(get_current_user)):
    supabase = authorized_project_client(project_id, current_user, write=True)
    try:
        res = supabase.table("milestones").insert({
            "project_id": project_id,
            "title": payload.title,
            "description": payload.description,
            "due_date": payload.due_date.isoformat(),
            "planned_date": payload.due_date.isoformat(),  # Added to satisfy legacy table constraint
            "status": "Pending"
        }).execute()
        return res.data[0]
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

class MilestoneUpdate(BaseModel):
    status: str
    completion_percentage: Optional[float] = Field(default=None, ge=0, le=100, allow_inf_nan=False)
    description: Optional[str] = None
    media_urls: Optional[List[str]] = None

@router.patch("/{project_id}/milestones/{milestone_id}")
def update_milestone(project_id: str, milestone_id: str, payload: MilestoneUpdate, current_user: dict = Depends(get_current_user)):
    supabase = authorized_project_client(project_id, current_user, write=True)
    try:
        # Update milestone status
        if payload.status not in {"Pending", "In Progress", "Completed"}:
            raise HTTPException(status_code=422, detail="Invalid milestone status")
        if payload.status == "Completed" and payload.completion_percentage not in (None, 100):
            raise HTTPException(status_code=422, detail="Completed milestones must be 100 percent")
        if payload.status == "Pending" and payload.completion_percentage not in (None, 0):
            raise HTTPException(status_code=422, detail="Pending milestones must be zero percent")
        from api.routes.workflow import transition
        return transition(supabase, "update_project_milestone", {
            "p_project_id": project_id, "p_milestone_id": milestone_id,
            "p_data": payload.model_dump(mode="json", exclude_none=True),
        })
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(503, "Milestone update was not saved") from exc

@router.delete("/{project_id}/milestones/{milestone_id}")
def delete_milestone(project_id: str, milestone_id: str, current_user: dict = Depends(get_current_user)):
    supabase = authorized_project_client(project_id, current_user, write=True)
    try:
        res = supabase.table("milestones").delete().eq("id", milestone_id).eq("project_id", project_id).execute()

        # The database trigger recalculates progress inside the deletion transaction.

        return {"success": True}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

import time
from typing import Tuple

_FINANCIALS_CACHE: Dict[str, Tuple[float, Any]] = {}
_FINANCIALS_CACHE_TTL = 30.0  # seconds cache to prevent N-query waterfalls

from ..models import ExpenseCreate, ExpenseResponse

@router.get("/{project_id}/financials")
def get_project_financials(project_id: str, current_user: dict = Depends(get_current_user)):
    """Returns committed cost, actual spend, remaining budget, and total budget for a project.
    Committed = POs in Pending Delivery / Confirmed.
    Actual = POs in Delivered / Received + salary slips paid out.
    Fires budget-overrun notifications at 90% and 100% thresholds.
    """
    supabase = authorized_project_client(project_id, current_user, write=False)
    if current_user["role"] == "client":
        # Authorization has already passed. Only project-scoped aggregate totals are returned.
        supabase = setup_client()
    try:
        # Fetch project budget
        proj = supabase.table("projects").select("total_budget, name, pm_id, client_id").eq("id", project_id).execute()
        if not proj.data:
            raise HTTPException(status_code=404, detail="Project not found")
        total_budget = float(proj.data[0].get("total_budget") or 0)
        pm_id = proj.data[0].get("pm_id")
        project_name = proj.data[0].get("name", "")

        # Count accepted goods, and keep unreceived quantities committed.
        order_rows = supabase.table("purchase_orders").select("status,total_price,quantity_ordered,quantity_received").eq("project_id", project_id).execute().data or []
        actual_po, committed_cost = 0.0, 0.0
        for order in order_rows:
            value = float(order.get("total_price") or 0)
            if order.get("status") == "Received":
                actual_po += value
            elif order.get("status") == "Delivered":
                quantity = float(order.get("quantity_ordered") or 0)
                fraction = min(1.0, max(0.0, float(order.get("quantity_received") or 0) / quantity)) if quantity > 0 else 0
                actual_po += value * fraction
                committed_cost += value * (1 - fraction)
            elif order.get("status") in {"Pending Delivery", "Confirmed"}:
                committed_cost += value

        salary_res = supabase.table("salary_slips").select("total_amount,total_pay").eq("project_id", project_id).eq("status", "Paid").execute()
        actual_payroll = sum(float(r.get("total_amount") if r.get("total_amount") is not None else r.get("total_pay") or 0) for r in (salary_res.data or []))

        # Actual: project expenses
        expense_res = supabase.table("project_expenses") \
            .select("amount") \
            .eq("project_id", project_id) \
            .execute()
        actual_expenses = sum(float(r.get("amount") or 0) for r in (expense_res.data or []))

        actual_spend = actual_po + actual_payroll + actual_expenses
        remaining_budget = total_budget - committed_cost - actual_spend

        result = {
            "project_id": project_id,
            "total_budget": total_budget,
            "committed_cost": committed_cost,
            "actual_spend": actual_spend,
            "actual_po": actual_po,
            "actual_payroll": actual_payroll,
            "actual_expenses": actual_expenses,
            "remaining_budget": remaining_budget,
        }

        # Budget alerts are deduplicated by the transactional ledger triggers.

        return result
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{project_id}/expenses", response_model=List[ExpenseResponse])
def get_project_expenses(project_id: str, current_user: dict = Depends(get_current_user)):
    supabase = authorized_project_client(project_id, current_user, write=current_user['role']=='site_manager')
    try:
        res = supabase.table("project_expenses").select("*").eq("project_id", project_id).order("expense_date", desc=True).execute()
        return res.data
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get('/{project_id}/expense-references')
def expense_references(project_id: str, current_user: dict = Depends(get_current_user)):
    if current_user['role'] not in {'super_admin','pm','site_manager'}:
        raise HTTPException(403,'Project expense access required')
    client=authorized_project_client(project_id,current_user,write=True)
    return client.rpc('expense_boq_references',{'p_project_id':project_id}).execute().data or []

@router.post("/{project_id}/apply-boq")
async def apply_boq_to_existing_project(
    project_id: str,
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user),
):
    """Upload a BOQ Excel/CSV to an existing project and auto-update budget, milestones, materials & labour rates."""
    if current_user["role"] not in {"super_admin", "pm"}:
        raise HTTPException(status_code=403, detail="Not enough privileges")
    client = authorized_project_client(project_id, current_user, write=True)
    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="Uploaded file is empty.")

    from core.boq_parser import parse_boq_file
    from core.project_boq import normalize_boq
    try:
        boq_data = normalize_boq(parse_boq_file(content, file.filename or "boq.xlsx"))
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc

    from api.routes.workflow import transition
    return transition(client, "apply_project_boq", {"p_project_id": project_id, "p_boq": boq_data})



@router.post("/{project_id}/expenses", response_model=ExpenseResponse)
def add_project_expense(project_id: str, expense: ExpenseCreate, current_user: dict = Depends(get_current_user)):
    if current_user["role"] not in {"super_admin", "pm", "site_manager"}:
        raise HTTPException(status_code=403, detail="Not enough privileges")
    supabase = authorized_project_client(project_id, current_user, write=True)
    if expense.project_id != project_id:
        raise HTTPException(status_code=400, detail="Expense project does not match URL")
    try:
        response = supabase.rpc("record_project_expense", {"p_project_id": project_id, "p_data": expense.model_dump(mode="json", exclude_none=True)}).execute()
        _FINANCIALS_CACHE.pop(project_id, None)
        return response.data
    except Exception as exc:
        code = str(getattr(exc, "code", ""))
        raise HTTPException(status_code={"42501":403,"P0001":409,"23514":422}.get(code,503), detail="Expense was not recorded. Check stock, references and database migration.") from exc
