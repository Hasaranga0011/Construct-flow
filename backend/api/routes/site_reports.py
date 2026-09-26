from fastapi import APIRouter, HTTPException, Depends
from typing import List, Optional
from pydantic import BaseModel
from core.database import client_for_token
from core.security import get_current_user
from datetime import datetime, timezone

router = APIRouter(
    prefix="/site-reports",
    tags=["Site Reports"]
)


class MaterialUsed(BaseModel):
    name: str
    qty: float
    unit: Optional[str] = None


class SiteReportCreate(BaseModel):
    project_id: str
    site_id: Optional[str] = None
    date: str                              # YYYY-MM-DD
    work_completed: str
    workers_present_count: Optional[int] = None
    materials_used: Optional[List[MaterialUsed]] = None
    photos: Optional[List[str]] = None    # Cloudinary URLs
    blockers: Optional[str] = None


@router.post("/")
def create_site_report(payload: SiteReportCreate, current_user: dict = Depends(get_current_user)):
    """Submit a daily site report. Only site managers assigned to the project may do this."""
    if current_user["role"] not in {"site_manager", "super_admin"}:
        raise HTTPException(status_code=403, detail="Only site managers can submit site reports")

    supabase = client_for_token(current_user["token"])

    # Verify the site manager is actually assigned to this project.
    if current_user["role"] == "site_manager":
        assignment = supabase.table("site_manager_sites") \
            .select("id") \
            .eq("site_manager_id", current_user["id"]) \
            .eq("project_id", payload.project_id) \
            .execute()
        if not assignment.data:
            raise HTTPException(status_code=403, detail="You are not assigned to this project")

    try:
        report_data = {
            "project_id": payload.project_id,
            "site_id": payload.site_id,
            "site_manager_id": current_user["id"],
            "date": payload.date,
            "work_completed": payload.work_completed,
            "workers_present_count": payload.workers_present_count,
            "materials_used": [m.model_dump() for m in payload.materials_used] if payload.materials_used else None,
            "photos": payload.photos or [],
            "blockers": payload.blockers,
            "created_at": datetime.now(timezone.utc).isoformat(),
        }

        res = supabase.table("site_reports").insert(report_data).execute()
        if not res.data:
            raise HTTPException(status_code=400, detail="Failed to create site report")

        report = res.data[0]

        # Notify PM about the new report.
        try:
            proj = supabase.table("projects").select("pm_id, name").eq("id", payload.project_id).execute()
            if proj.data and proj.data[0].get("pm_id"):
                supabase.table("notifications").insert({
                    "project_id": payload.project_id,
                    "target_user_id": proj.data[0]["pm_id"],
                    "target_role": "pm",
                    "title": "New Site Report",
                    "message": f"A new daily site report has been submitted for '{proj.data[0].get('name', 'your project')}' on {payload.date}.",
                    "type": "info",
                    "is_read": False,
                }).execute()
        except Exception:
            import logging
            logging.exception("Site report PM notification failed")

        return report
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{project_id}")
def get_site_reports(project_id: str, current_user: dict = Depends(get_current_user)):
    """Get all site reports for a project. PM, admin, client, and assigned site managers can view."""
    supabase = client_for_token(current_user["token"])

    role = current_user["role"]
    uid = current_user["id"]

    # Verify access based on role.
    if role == "client":
        proj = supabase.table("projects").select("client_id").eq("id", project_id).execute()
        if not proj.data or proj.data[0].get("client_id") != uid:
            raise HTTPException(status_code=403, detail="Access denied")
    elif role == "pm":
        proj = supabase.table("projects").select("pm_id").eq("id", project_id).execute()
        if not proj.data or proj.data[0].get("pm_id") != uid:
            raise HTTPException(status_code=403, detail="Access denied")
    elif role == "site_manager":
        assignment = supabase.table("site_manager_sites") \
            .select("id") \
            .eq("site_manager_id", uid) \
            .eq("project_id", project_id) \
            .execute()
        if not assignment.data:
            raise HTTPException(status_code=403, detail="Not assigned to this project")
    elif role != "super_admin":
        raise HTTPException(status_code=403, detail="Access denied")

    try:
        res = supabase.table("site_reports") \
            .select("""
                id, project_id, site_id, site_manager_id, date,
                work_completed, workers_present_count, materials_used,
                photos, blockers, created_at,
                site_manager:profiles!site_manager_id(full_name, avatar_url)
            """) \
            .eq("project_id", project_id) \
            .order("date", desc=True) \
            .execute()
        return res.data or []
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
