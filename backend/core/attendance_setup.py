"""Fill missing records for existing assignments; never invent NIC values."""
from uuid import uuid5, NAMESPACE_URL
from supabase import create_client
from core.config import settings


def setup_client():
    if not settings.SUPABASE_SERVICE_ROLE_KEY:
        raise RuntimeError("Attendance setup requires the server database credential")
    return create_client(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_ROLE_KEY)


def ensure_project_attendance(client, project_id):
    projects = client.table("projects").select("id,location").eq("id", project_id).execute().data or []
    if not projects:
        raise ValueError("Project not found")
    sites = client.table("sites").select("id,project_id,site_manager_id").eq("project_id", project_id).order("id").execute().data or []
    if not sites:
        managers = client.table("site_manager_sites").select("site_manager_id").eq("project_id", project_id).order("site_manager_id").execute().data or []
        site = {"id": str(uuid5(NAMESPACE_URL, "constructflow:attendance-site:" + project_id)),
                "project_id": project_id, "address": projects[0].get("location") or "",
                "site_manager_id": managers[0]["site_manager_id"] if managers else None}
        # Concurrent callers converge on one ID without overwriting existing data.
        client.table("sites").upsert(site, on_conflict="id", ignore_duplicates=True).execute()
        sites = client.table("sites").select("id,project_id,site_manager_id").eq("project_id", project_id).order("id").execute().data or []
        if not sites:
            raise RuntimeError("Attendance site could not be created")
    assigned = client.table("site_workers").select("id,worker_id").eq("project_id", project_id).execute().data or []
    for assignment in assigned:
        assigned_id = assignment["worker_id"]
        records = client.table("workers").select("id,user_id").eq("id", assigned_id).execute().data or []
        if records:
            continue
        linked = client.table("workers").select("id,user_id").eq("user_id", assigned_id).execute().data or []
        if linked:
            continue
        profiles = client.table("profiles").select("id,daily_rate,worker_type").eq("id", assigned_id).execute().data or []
        if not profiles:
            raise ValueError("An assigned worker account no longer exists")
        profile = profiles[0]
        skills = {"carpenter", "mason", "electrician", "plumber", "painter", "welder", "general_labour", "supervisor"}
        skill = str(profile.get("worker_type") or "").lower()
        record = {"id": profile["id"], "user_id": profile["id"], "nic_number": None,
                  "skill_type": skill if skill in skills else "general_labour",
                  "daily_rate": profile.get("daily_rate") or 0}
        client.table("workers").upsert(record, on_conflict="id", ignore_duplicates=True).execute()
    return sites
