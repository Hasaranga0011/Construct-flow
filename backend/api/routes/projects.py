from fastapi import APIRouter, HTTPException, Request, Depends
from typing import List, Optional, Dict, Any
from datetime import datetime, timezone
from ..models import ProjectCreate, ProjectUpdate, ProjectResponse
from core.notification_helper import create_notifications, create_notification
from core.database import client_for_token, get_auth_client
from core.security import get_current_user, require_admin, normalize_role
from core.attendance_setup import ensure_project_attendance, setup_client
import os
import requests

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
def get_bulk_project_names(req: BulkProjectRequest):
    try:
        from supabase import create_client
        from core.config import settings
        service_client = create_client(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_ROLE_KEY)
        res = service_client.table("projects").select("id, name, location").in_("id", req.ids).execute()
        return res.data
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/debug_schema")
def debug_schema(request: Request):
    client = get_auth_client(request)
    return client.rpc("run_query", {"query": "SELECT column_name, column_default, data_type FROM information_schema.columns WHERE table_name = 'site_manager_sites'"}).execute().data

@router.get("/geocode")
def geocode_location(q: str):
    """
    Geocode a place or address string into latitude, longitude, and display name.
    Chains Google Maps (if enabled) -> Photon (Komoot/OSM) -> Nominatim.
    """
    if not q or not q.strip():
        return []
    query = q.strip()

    # 1. Google Geocoding (if active and configured)
    google_key = os.getenv("EXPO_PUBLIC_GOOGLE_MAPS_API_KEY", "")
    if google_key:
        try:
            g_res = requests.get(
                "https://maps.googleapis.com/maps/api/geocode/json",
                params={"address": query, "key": google_key},
                timeout=4
            )
            g_data = g_res.json()
            if g_data.get("status") == "OK" and g_data.get("results"):
                mapped = []
                for item in g_data["results"]:
                    geom = item.get("geometry", {}).get("location", {})
                    mapped.append({
                        "lat": geom.get("lat"),
                        "lon": geom.get("lng"),
                        "display_name": item.get("formatted_address")
                    })
                if mapped:
                    return mapped
        except Exception:
            pass

    # 2. Photon (free OpenStreetMap search with typo tolerance)
    headers = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) ConstructFlow/1.0"}
    try:
        r = requests.get(
            "https://photon.komoot.io/api/",
            params={"q": query, "limit": 5},
            headers=headers,
            timeout=5
        )
        if r.status_code == 200:
            features = r.json().get("features", [])
            if features:
                results = []
                for f in features:
                    props = f.get("properties", {})
                    coords = f.get("geometry", {}).get("coordinates", [0, 0])
                    name = props.get("name") or ""
                    street = props.get("street") or ""
                    district = props.get("district") or ""
                    city = props.get("city") or ""
                    state = props.get("state") or ""
                    country = props.get("country") or "Sri Lanka"
                    parts = [p for p in [name, street, district, city, state, country] if p]
                    unique_parts = []
                    for p in parts:
                        if not unique_parts or unique_parts[-1].lower() != p.lower():
                            unique_parts.append(p)
                    results.append({
                        "lat": coords[1],
                        "lon": coords[0],
                        "display_name": ", ".join(unique_parts) or name or "Selected Location"
                    })
                if results:
                    return results
    except Exception:
        pass

    # 3. Nominatim fallback
    try:
        osm_res = requests.get(
            "https://nominatim.openstreetmap.org/search",
            params={"q": query, "format": "json", "limit": 5, "countrycodes": "lk"},
            headers=headers,
            timeout=5
        )
        if osm_res.status_code == 200:
            osm_data = osm_res.json()
            if isinstance(osm_data, list) and osm_data:
                return [{
                    "lat": float(item["lat"]),
                    "lon": float(item["lon"]),
                    "display_name": item.get("display_name", "")
                } for item in osm_data]
    except Exception:
        pass

    return []

@router.get("/reverse-geocode")
def reverse_geocode(lat: float, lng: float):
    """
    Reverse geocode coordinates into a readable address string.
    Chains Google Maps -> Photon -> Nominatim.
    """
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
        osm_res = requests.get(
            "https://nominatim.openstreetmap.org/reverse",
            params={"lat": lat, "lon": lng, "format": "json"},
            headers=headers,
            timeout=5
        )
        if osm_res.status_code == 200:
            osm_data = osm_res.json()
            if osm_data.get("display_name"):
                return {"display_name": osm_data["display_name"]}
    except Exception:
        pass

    return {"display_name": f"Lat: {lat:.4f}, Lng: {lng:.4f}"}

def send_client_assignment_email(email: str, project_name: str):
    from services.email_service import send_email
    subject = f"Welcome to {project_name} - ConstructFlow"
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
    service_client = setup_client()
    clean_data = {k: v for k, v in data.items() if k not in ("site_managers", "workers", "suppliers", "admins")}
    try:
        result = client.rpc("save_project_with_assignments", {
            "p_project_id": project_id, "p_data": data,
        }).execute()
        if result and getattr(result, "data", None):
            return result.data
    except Exception as e:
        import logging
        logging.warning(f"save_project_with_assignments RPC skipped or failed: {e}")

    # Fallback or direct update via service client
    if project_id:
        upd = service_client.table("projects").update(clean_data).eq("id", project_id).execute()
        if upd.data and len(upd.data) > 0:
            return upd.data[0]
        raise HTTPException(status_code=400, detail="Project update failed: database returned 0 modified rows. Please verify permissions.")
    else:
        ins = service_client.table("projects").insert(clean_data).execute()
        if ins.data and len(ins.data) > 0:
            return ins.data[0]
        raise HTTPException(status_code=400, detail="Project creation failed: database returned empty result.")


def notify_assigned_client(client, project):
    if not project.get("client_id"):
        return
    try:
        profile = client.table("profiles").select("email").eq("id", project["client_id"]).execute()
        if profile.data and profile.data[0].get("email"):
            send_client_assignment_email(profile.data[0]["email"], project["name"])
    except Exception:
        import logging
        logging.exception("Project saved, but client notification failed")


@router.post("/", response_model=ProjectResponse)
def create_project(project: ProjectCreate, request: Request):
    client = get_auth_client(request)
    saved = save_project(client, project.model_dump(mode="json", exclude_none=True, exclude={"milestones"}))
    service_client = setup_client()
    
    # 1. Sync PM and Client assignments
    try:
        if saved.get("pm_id"):
            service_client.table("pm_projects").delete().eq("project_id", saved["id"]).execute()
            service_client.table("pm_projects").insert({"project_id": saved["id"], "pm_id": saved["pm_id"]}).execute()
            service_client.table("project_role_assignments").delete().eq("project_id", saved["id"]).eq("role", "pm").execute()
            service_client.table("project_role_assignments").insert({"project_id": saved["id"], "user_id": saved["pm_id"], "role": "pm"}).execute()

        if saved.get("client_id"):
            service_client.table("project_role_assignments").delete().eq("project_id", saved["id"]).eq("role", "client").execute()
            service_client.table("project_role_assignments").insert({"project_id": saved["id"], "user_id": saved["client_id"], "role": "client"}).execute()
    except Exception as e:
        import logging
        logging.warning(f"Could not sync pm/client assignments: {e}")

    # 2. Sync site_manager_sites and site_workers
    try:
        if project.site_managers is not None:
            client.table("site_manager_sites").delete().eq("project_id", saved["id"]).execute()
            if project.site_managers:
                import uuid
                sm_inserts = [{"id": str(uuid.uuid4()), "project_id": saved["id"], "site_manager_id": sm_id} for sm_id in project.site_managers]
                client.table("site_manager_sites").insert(sm_inserts).execute()
        
        if project.workers is not None:
            client.table("site_workers").delete().eq("project_id", saved["id"]).execute()
            if project.workers:
                import uuid
                w_inserts = [{"id": str(uuid.uuid4()), "project_id": saved["id"], "worker_id": w_id} for w_id in project.workers]
                client.table("site_workers").insert(w_inserts).execute()

        if getattr(project, "suppliers", None) is not None:
            client.table("project_role_assignments").delete().eq("project_id", saved["id"]).eq("role", "supplier").execute()
            if project.suppliers:
                import uuid
                supp_inserts = [{"id": str(uuid.uuid4()), "project_id": saved["id"], "user_id": s_id, "role": "supplier"} for s_id in project.suppliers]
                client.table("project_role_assignments").insert(supp_inserts).execute()
    except Exception as e:
        import logging
        logging.warning(f"Failed to sync site managers, workers or suppliers: {e}")

    # 3. Create milestones if provided in creation payload
    if project.milestones:
        try:
            valid_milestones = [
                {
                    "project_id": saved["id"],
                    "title": m.get("title"),
                    "description": m.get("description", ""),
                    "due_date": str(m.get("due_date")),
                    "planned_date": str(m.get("due_date")),
                    "status": m.get("status", "Pending")
                }
                for m in project.milestones if m.get("title") and m.get("due_date")
            ]
            if valid_milestones:
                service_client.table("milestones").insert(valid_milestones).execute()
        except Exception as e:
            import logging
            logging.warning(f"Failed to create project milestones: {e}")

    # 4. Safe server-side notifications (never fails project creation)
    notifications_failed = False
    try:
        notifications = []
        if saved.get("pm_id"):
            notifications.append({
                "user_id": "11111111-1111-1111-1111-111111111111",
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
                "user_id": "11111111-1111-1111-1111-111111111111",
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
            "user_id": "11111111-1111-1111-1111-111111111111",
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
                    "user_id": "11111111-1111-1111-1111-111111111111",
                    "project_id": saved["id"],
                    "target_user_id": s_id,
                    "target_role": "supplier",
                    "title": "New Project Assignment",
                    "message": f"You have been assigned as a supplier for: {saved['name']}",
                    "type": "general",
                    "is_read": False,
                })
        create_notifications(notifications)
    except Exception as e:
        import logging
        logging.warning(f"Notification dispatch failed: {e}")
        notifications_failed = True

    try:
        ensure_project_attendance(service_client, saved["id"])
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

    # 5. Sync PM & Client assignment tables reliably via service_client
    try:
        if "pm_id" in filtered_data:
            target_pm = filtered_data["pm_id"]
            service_client.table("pm_projects").delete().eq("project_id", project_id).execute()
            service_client.table("project_role_assignments").delete().eq("project_id", project_id).eq("role", "pm").execute()
            if target_pm:
                service_client.table("pm_projects").insert({"project_id": project_id, "pm_id": target_pm}).execute()
                service_client.table("project_role_assignments").insert({"project_id": project_id, "user_id": target_pm, "role": "pm"}).execute()

        if "client_id" in filtered_data:
            target_client = filtered_data["client_id"]
            service_client.table("project_role_assignments").delete().eq("project_id", project_id).eq("role", "client").execute()
            if target_client:
                service_client.table("project_role_assignments").insert({"project_id": project_id, "user_id": target_client, "role": "client"}).execute()
    except Exception as e:
        import logging
        logging.warning(f"Failed to sync pm_projects/client assignments: {e}")

    # 6. Sync site_manager_sites, site_workers, suppliers, and admins
    try:
        if project.site_managers is not None:
            service_client.table("site_manager_sites").delete().eq("project_id", project_id).execute()
            service_client.table("project_role_assignments").delete().eq("project_id", project_id).eq("role", "site_manager").execute()
            if project.site_managers:
                import uuid
                sm_inserts = [{"id": str(uuid.uuid4()), "project_id": project_id, "site_manager_id": sm_id} for sm_id in project.site_managers]
                service_client.table("site_manager_sites").insert(sm_inserts).execute()
                pra_inserts = [{"project_id": project_id, "user_id": sm_id, "role": "site_manager"} for sm_id in project.site_managers]
                service_client.table("project_role_assignments").insert(pra_inserts).execute()

        if project.workers is not None:
            service_client.table("site_workers").delete().eq("project_id", project_id).execute()
            service_client.table("project_role_assignments").delete().eq("project_id", project_id).eq("role", "worker").execute()
            if project.workers:
                import uuid
                w_inserts = [{"id": str(uuid.uuid4()), "project_id": project_id, "worker_id": w_id} for w_id in project.workers]
                service_client.table("site_workers").insert(w_inserts).execute()
                pra_inserts = [{"project_id": project_id, "user_id": w_id, "role": "worker"} for w_id in project.workers]
                service_client.table("project_role_assignments").insert(pra_inserts).execute()

        if getattr(project, "suppliers", None) is not None:
            service_client.table("project_role_assignments").delete().eq("project_id", project_id).eq("role", "supplier").execute()
            if project.suppliers:
                supp_inserts = [{"project_id": project_id, "user_id": s_id, "role": "supplier"} for s_id in project.suppliers]
                service_client.table("project_role_assignments").insert(supp_inserts).execute()
                
                # Best-effort supplier notifications
                try:
                    notifs = [{
                        "user_id": "11111111-1111-1111-1111-111111111111",
                        "project_id": project_id,
                        "target_user_id": s_id,
                        "target_role": "supplier",
                        "title": "New Project Assignment",
                        "message": f"You have been assigned as a supplier for project: {saved.get('name', 'Unknown')}",
                        "type": "general",
                        "is_read": False,
                    } for s_id in project.suppliers]
                    create_notifications(notifs)
                except Exception:
                    pass

        if getattr(project, "admins", None) is not None and user_role == "super_admin":
            service_client.table("project_role_assignments").delete().eq("project_id", project_id).eq("role", "admin").execute()
            if project.admins:
                adm_inserts = [{"project_id": project_id, "user_id": a_id, "role": "admin"} for a_id in project.admins]
                service_client.table("project_role_assignments").insert(adm_inserts).execute()
    except Exception:
        import logging
        logging.exception("Failed to sync site_manager_sites, site_workers, suppliers or admins")

    # 7. Best-effort notifications for PM and Client change
    try:
        new_pm_id = saved.get("pm_id")
        if new_pm_id and str(new_pm_id) != str(old_pm_id):
            create_notifications([{
                "user_id": "11111111-1111-1111-1111-111111111111",
                "project_id": project_id,
                "target_user_id": new_pm_id,
                "target_role": "pm",
                "title": "New Project Assigned",
                "message": f"You have been assigned as Project Manager for: {saved.get('name')}",
                "type": "general",
                "is_read": False,
            }])

        new_client_id = saved.get("client_id")
        if new_client_id and str(new_client_id) != str(old_client_id):
            notify_assigned_client(client, saved)
    except Exception:
        import logging
        logging.exception("Project updated, but PM/client notification failed")

    ensure_project_attendance(setup_client(), project_id)
    return saved


@router.delete("/{project_id}")
def delete_project(project_id: str, archive_only: bool = False, current_user: dict = Depends(require_admin)):
    service_client = setup_client()
    
    # 1. Verify project exists
    proj_res = service_client.table("projects").select("*").eq("id", project_id).execute()
    if not proj_res.data:
        raise HTTPException(status_code=404, detail="Project not found")
    
    project = proj_res.data[0]
    project_name = project.get("name") or "Unnamed Project"

    # 2. Archive handling
    if archive_only or str(project.get("status", "")).lower() != "archived":
        if archive_only:
            service_client.table("projects").update({"status": "archived"}).eq("id", project_id).execute()
            record_project_audit_log(current_user, "archive", project_id, {"name": project_name, "previous_status": project.get("status")})
            return {"message": f"Project '{project_name}' has been archived successfully.", "status": "archived"}

    # 3. Dependency check for permanent deletion
    deps = get_project_dependencies(project_id)
    
    # Financial and operational history check
    blocking_keys = {
        "purchase_orders": "purchase orders",
        "project_expenses": "expenses",
        "attendance": "attendance records",
        "site_reports": "site reports",
        "variation_orders": "variation orders",
        "material_requests": "material requests",
        "cost_estimates": "cost estimates",
        "client_payment_schedule": "payment schedule entries",
        "shared_documents": "shared documents",
        "milestones": "milestones"
    }

    blocking_items = []
    for k, label in blocking_keys.items():
        if deps.get(k, 0) > 0:
            blocking_items.append(f"{deps[k]} {label}")

    if blocking_items:
        detail_msg = f"This project has {', '.join(blocking_items)}. Archive it instead."
        raise HTTPException(status_code=409, detail=detail_msg)

    # 4. Permanent delete for safe/empty projects
    try:
        # Delete auxiliary dependents first
        service_client.table("notifications").delete().eq("project_id", project_id).execute()
        service_client.table("client_activity").delete().eq("project_id", project_id).execute()
        service_client.table("project_role_assignments").delete().eq("project_id", project_id).execute()
        service_client.table("pm_projects").delete().eq("project_id", project_id).execute()
        service_client.table("site_workers").delete().eq("project_id", project_id).execute()
        service_client.table("site_manager_sites").delete().eq("project_id", project_id).execute()
        service_client.table("materials").delete().eq("project_id", project_id).execute()
        service_client.table("sites").delete().eq("project_id", project_id).execute()

        # Delete project row
        del_res = service_client.table("projects").delete().eq("id", project_id).execute()
        if not del_res.data:
            raise HTTPException(status_code=404, detail="Project could not be deleted")

        record_project_audit_log(current_user, "permanent_delete", project_id, {
            "name": project_name,
            "previous_status": project.get("status"),
            "deleted_at": datetime.now(timezone.utc).isoformat()
        })

        return {"message": f"Project '{project_name}' was permanently deleted.", "status": "deleted"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to delete project: {str(e)}")


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
    title: str
    description: str
    due_date: str

@router.post("/{project_id}/milestones")
def create_milestone(project_id: str, payload: MilestoneCreate, current_user: dict = Depends(get_current_user)):
    supabase = authorized_project_client(project_id, current_user, write=True)
    try:
        res = supabase.table("milestones").insert({
            "project_id": project_id,
            "title": payload.title,
            "description": payload.description,
            "due_date": payload.due_date,
            "planned_date": payload.due_date,  # Added to satisfy legacy table constraint
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
        updates = {"status": payload.status}
        if payload.completion_percentage is not None:
            updates["completion_percentage"] = payload.completion_percentage
        elif payload.status == "Completed":
            updates["completion_percentage"] = 100
        if payload.description is not None:
            updates["description"] = payload.description
        res = supabase.table("milestones").update(updates).eq("id", milestone_id).eq("project_id", project_id).execute()

        if not res.data:
            raise HTTPException(status_code=404, detail="Milestone not found")

        # Insert any new media
        if payload.media_urls:
            media_inserts = [{"milestone_id": milestone_id, "url": url} for url in payload.media_urls]
            supabase.table("milestone_media").insert(media_inserts).execute()

        # Recalculate project completion percentage
        all_ms = supabase.table("milestones").select("status").eq("project_id", project_id).execute()
        if all_ms.data:
            total = len(all_ms.data)
            completed = sum(1 for ms in all_ms.data if ms.get("status") == "Completed")
            percentage = int((completed / total) * 100)
            supabase.table("projects").update({"completion_percentage": percentage}).eq("id", project_id).execute()

        # Notify the client about the milestone update.
        try:
            proj = supabase.table("projects").select("client_id, name").eq("id", project_id).execute()
            if proj.data and proj.data[0].get("client_id"):
                create_notifications([{
                    "user_id": current_user["id"],
                    "project_id": project_id,
                    "target_user_id": proj.data[0]["client_id"],
                    "target_role": "client",
                    "title": "Milestone Updated",
                    "message": f"A milestone has been updated to '{payload.status}' on your project '{proj.data[0].get('name', '')}'.",
                    "type": "general",
                    "is_read": False,
                }])
        except Exception:
            import logging
            logging.exception("Milestone updated but client notification failed")

        return res.data[0]
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/{project_id}/milestones/{milestone_id}")
def delete_milestone(project_id: str, milestone_id: str, current_user: dict = Depends(get_current_user)):
    supabase = authorized_project_client(project_id, current_user, write=True)
    try:
        res = supabase.table("milestones").delete().eq("id", milestone_id).eq("project_id", project_id).execute()

        # Recalculate project completion percentage
        all_ms = supabase.table("milestones").select("status").eq("project_id", project_id).execute()
        if all_ms.data:
            total = len(all_ms.data)
            completed = sum(1 for ms in all_ms.data if ms.get("status") == "Completed")
            percentage = int((completed / total) * 100)
            supabase.table("projects").update({"completion_percentage": percentage}).eq("id", project_id).execute()
        else:
            supabase.table("projects").update({"completion_percentage": 0}).eq("id", project_id).execute()

        return {"success": True}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

from ..models import ExpenseCreate, ExpenseResponse

@router.get("/{project_id}/financials")
def get_project_financials(project_id: str, current_user: dict = Depends(get_current_user)):
    """Returns committed cost, actual spend, remaining budget, and total budget for a project.
    Committed = POs in Pending Delivery / Confirmed.
    Actual = POs in Delivered / Received + salary slips paid out.
    Fires budget-overrun notifications at 90% and 100% thresholds.
    """
    supabase = authorized_project_client(project_id, current_user, write=False)
    try:
        # Fetch project budget
        proj = supabase.table("projects").select("total_budget, name, pm_id, client_id").eq("id", project_id).execute()
        if not proj.data:
            raise HTTPException(status_code=404, detail="Project not found")
        total_budget = float(proj.data[0].get("total_budget") or 0)
        pm_id = proj.data[0].get("pm_id")
        project_name = proj.data[0].get("name", "")

        # Committed: POs not yet delivered
        committed_res = supabase.table("purchase_orders") \
            .select("total_price") \
            .eq("project_id", project_id) \
            .in_("status", ["Pending Delivery", "Confirmed"]) \
            .execute()
        committed_cost = sum(float(r.get("total_price") or 0) for r in (committed_res.data or []))

        # Actual: delivered/received POs
        actual_po_res = supabase.table("purchase_orders") \
            .select("total_price") \
            .eq("project_id", project_id) \
            .in_("status", ["Delivered", "Received"]) \
            .execute()
        actual_po = sum(float(r.get("total_price") or 0) for r in (actual_po_res.data or []))

        # Actual: salary slips (via workers on this project)
        worker_res = supabase.table("site_workers").select("worker_id").eq("project_id", project_id).execute()
        project_worker_ids = [r["worker_id"] for r in (worker_res.data or [])]
        
        actual_payroll = 0
        if project_worker_ids:
            salary_res = supabase.table("salary_slips") \
                .select("total_amount") \
                .in_("worker_id", project_worker_ids) \
                .execute()
            actual_payroll = sum(
                float(r.get("total_amount") or 0)
                for r in (salary_res.data or [])
            )

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

        # Budget overrun notifications (90% and 100% thresholds)
        if total_budget > 0:
            utilisation = (committed_cost + actual_spend) / total_budget
            if utilisation >= 1.0:
                _fire_overrun_notification(supabase, project_id, project_name, pm_id, 100, current_user["id"])
            elif utilisation >= 0.9:
                _fire_overrun_notification(supabase, project_id, project_name, pm_id, 90, current_user["id"])

        return result
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


def _fire_overrun_notification(supabase, project_id: str, project_name: str, pm_id, threshold_pct: int, current_user_id: str):
    """Insert a budget-overrun warning notification for PM and admin."""
    import logging
    try:
        notifications = [
            {
                "user_id": current_user_id,
                "project_id": project_id,
                "target_role": "super_admin",
                "title": f"Budget {threshold_pct}% Exceeded",
                "message": f"Project '{project_name}' has used {threshold_pct}% or more of its budget.",
                "type": "general",
                "is_read": False,
            }
        ]
        if pm_id:
            notifications.append({
                "user_id": current_user_id,
                "project_id": project_id,
                "target_user_id": pm_id,
                "target_role": "pm",
                "title": f"Budget {threshold_pct}% Exceeded",
                "message": f"Project '{project_name}' has used {threshold_pct}% or more of its budget.",
                "type": "general",
                "is_read": False,
            })
        create_notifications(notifications)
    except Exception:
        logging.exception("Failed to insert budget overrun notifications")


@router.get("/{project_id}/expenses", response_model=List[ExpenseResponse])
def get_project_expenses(project_id: str, current_user: dict = Depends(get_current_user)):
    supabase = authorized_project_client(project_id, current_user, write=False)
    try:
        res = supabase.table("project_expenses").select("*").eq("project_id", project_id).order("expense_date", desc=True).execute()
        return res.data
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/{project_id}/expenses", response_model=ExpenseResponse)
def add_project_expense(project_id: str, expense: ExpenseCreate, current_user: dict = Depends(get_current_user)):
    if current_user["role"] not in {"super_admin", "pm"}:
        raise HTTPException(status_code=403, detail="Not enough privileges")
    supabase = authorized_project_client(project_id, current_user, write=True)
    try:
        if expense.project_id != project_id:
            raise HTTPException(status_code=400, detail="Expense project does not match URL")
        expense_data = expense.model_dump()
        if expense_data.get('expense_date'):
            expense_data['expense_date'] = expense_data['expense_date'].isoformat()
        else:
            del expense_data['expense_date']

        res = supabase.table("project_expenses").insert(expense_data).execute()
        if not res.data:
            raise HTTPException(status_code=400, detail="Failed to create expense")

        # Recalculate spent_cost
        all_exp = supabase.table("project_expenses").select("amount").eq("project_id", project_id).execute()
        total_spent = sum(float(e.get("amount", 0)) for e in all_exp.data) if all_exp.data else 0.0

        supabase.table("projects").update({"spent_cost": total_spent}).eq("id", project_id).execute()

        return res.data[0]
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
