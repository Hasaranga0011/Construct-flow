"""Shared project membership checks for privileged server operations."""
from fastapi import HTTPException
from core.security import normalize_role


def project_member(client, project_id: str, user_id: str, role: str) -> bool:
    role = normalize_role(role)
    if role == "super_admin":
        return True
    projects = client.table("projects").select("id,pm_id,client_id").eq("id", project_id).execute().data or []
    if not projects:
        return False
    if role == "pm" and projects[0].get("pm_id") == user_id:
        return True
    if role == "client" and projects[0].get("client_id") == user_id:
        return True
    assignments = client.table("project_role_assignments").select("role").eq("project_id", project_id).eq("user_id", user_id).execute().data or []
    if any(normalize_role(row.get("role")) == role for row in assignments):
        return True
    if role == "site_manager":
        return bool(client.table("site_manager_sites").select("id").eq("project_id", project_id).eq("site_manager_id", user_id).execute().data)
    if role == "supplier":
        return bool(client.table("purchase_orders").select("id").eq("project_id", project_id).eq("supplier_id", user_id).execute().data)
    if role == "worker":
        if client.table("site_workers").select("id").eq("project_id", project_id).eq("worker_id", user_id).execute().data:
            return True
        workers = client.table("workers").select("id").eq("user_id", user_id).execute().data or []
        return any(client.table("site_workers").select("id").eq("project_id", project_id).eq("worker_id", worker["id"]).execute().data for worker in workers)
    return False


def require_project_member(client, project_id: str, user: dict):
    if not project_member(client, project_id, user["id"], user["role"]):
        raise HTTPException(status_code=403, detail="You are not a participant of this project")
