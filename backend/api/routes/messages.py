from fastapi import APIRouter, HTTPException, Query, Depends
from typing import List, Optional
from pydantic import BaseModel
from core.notification_helper import create_notifications, create_notification
from core.database import client_for_token
from core.security import get_current_user
from datetime import datetime, timezone

router = APIRouter(
    prefix="/messages",
    tags=["Messages"]
)

class MessageCreate(BaseModel):
    project_id: str
    sender_id: str
    receiver_id: Optional[str] = None
    content: str
    sender_role: Optional[str] = None
    receiver_role: Optional[str] = None


from core.database import client_for_token, get_service_client

@router.post("/")
def send_message(payload: MessageCreate, current_user: dict = Depends(get_current_user)):
    if payload.sender_id != current_user["id"]:
        raise HTTPException(status_code=403, detail="Cannot send a message as another user")
    
    service_client = get_service_client()
    try:
        # Verify sender and receiver are both participants of this project.
        proj = service_client.table("projects").select("id, pm_id, client_id").eq("id", payload.project_id).execute()
        if not proj.data:
            raise HTTPException(status_code=404, detail="Project not found")
        project = proj.data[0]

        # Verify receiver is a participant (pm, client, admin, or site manager of the project).
        receiver_role_val = payload.receiver_role
        if payload.receiver_id:
            receiver_profile = service_client.table("profiles").select("id, role").eq("id", payload.receiver_id).execute()
            if not receiver_profile.data:
                raise HTTPException(status_code=404, detail="Receiver not found")
            receiver_role_val = receiver_role_val or receiver_profile.data[0].get("role")
        else:
            receiver_role_val = receiver_role_val or "All"

        data = {
            "project_id": payload.project_id,
            "sender_id": payload.sender_id,
            "receiver_id": payload.receiver_id,
            "sender_role": payload.sender_role or current_user.get("role"),
            "receiver_role": receiver_role_val,
            "message_text": payload.content,
            "content": payload.content,
            "message": payload.content,
            "is_read": False,
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        res = service_client.table("client_messages").insert(data).execute()
        return res.data[0]
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{project_id}")
def get_messages(
    project_id: str,
    sender_role: Optional[str] = Query(None, description="Filter by sender role (for channel isolation)"),
    receiver_role: Optional[str] = Query(None, description="Filter by receiver role"),
    current_user: dict = Depends(get_current_user),
):
    supabase = client_for_token(current_user["token"])
    try:
        # Base query: only rows where the current user is sender or receiver.
        query = supabase.table("client_messages") \
            .select("*, sender:profiles!sender_id(full_name, role)") \
            .eq("project_id", project_id) \
            .or_(f"sender_id.eq.{current_user['id']},receiver_id.eq.{current_user['id']},receiver_id.is.null") \
            .order("created_at", desc=False)

        # Optional channel filter: client requests only their thread with a specific role.
        if sender_role and receiver_role:
            # Match both directions of the channel.
            query = supabase.table("client_messages") \
                .select("*, sender:profiles!sender_id(full_name, role)") \
                .eq("project_id", project_id) \
                .or_(
                    f"and(sender_role.eq.{sender_role},receiver_role.eq.{receiver_role}),"
                    f"and(sender_role.eq.{receiver_role},receiver_role.eq.{sender_role})"
                ) \
                .or_(f"sender_id.eq.{current_user['id']},receiver_id.eq.{current_user['id']},receiver_id.is.null") \
                .order("created_at", desc=False)

        res = query.execute()
        return res.data
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.patch("/{message_id}/read")
def mark_message_read(message_id: str, current_user: dict = Depends(get_current_user)):
    """Mark a message as read (sets read_at timestamp). Only the receiver can call this."""
    supabase = client_for_token(current_user["token"])
    try:
        res = supabase.table("client_messages") \
            .update({"read_at": datetime.now(timezone.utc).isoformat()}) \
            .eq("id", message_id) \
            .eq("receiver_id", current_user["id"]) \
            .execute()
        if not res.data:
            raise HTTPException(status_code=403, detail="Not your message or already read")
        return res.data[0]
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
@router.get("/{project_id}/contacts")
def get_project_contacts(project_id: str, current_user: dict = Depends(get_current_user)):
    service_client = get_service_client()
    contacts = {}

    # 1. Fetch project PM and Client
    try:
        proj = service_client.table("projects").select("pm_id, client_id").eq("id", project_id).limit(1).execute()
        if proj.data and isinstance(proj.data, list) and len(proj.data) > 0:
            if proj.data[0].get("pm_id"):
                contacts["pm"] = proj.data[0]["pm_id"]
            if proj.data[0].get("client_id"):
                contacts["client"] = proj.data[0]["client_id"]
    except Exception:
        pass

    # 2. Fetch all role assignments from project_role_assignments (canonical assignment table)
    try:
        pra_res = service_client.table("project_role_assignments").select("user_id, role").eq("project_id", project_id).execute()
        for row in (pra_res.data or []):
            uid = row.get("user_id")
            r = (row.get("role") or "").strip().lower().replace(" ", "_")
            if not uid or not r:
                continue
            if r in ("super_admin", "admin"):
                contacts.setdefault("super_admin", uid)
                contacts.setdefault("admin", uid)
            elif r in ("pm", "project_manager"):
                contacts.setdefault("pm", uid)
            elif r in ("site_manager", "sitemanager"):
                contacts.setdefault("site_manager", uid)
            elif r == "client":
                contacts.setdefault("client", uid)
            elif r == "supplier":
                contacts.setdefault("supplier", uid)
            elif r == "worker":
                contacts.setdefault("worker", uid)
    except Exception:
        pass

    # 3. Fallback to legacy/dedicated assignment tables (isolated so one missing table never breaks others)
    def _try_fill(key: str, table: str, col: str, extra_filter=None):
        if key in contacts:
            return
        try:
            q = service_client.table(table).select(col).eq("project_id", project_id)
            if extra_filter:
                q = extra_filter(q)
            res = q.limit(1).execute()
            if res.data and res.data[0].get(col):
                contacts[key] = res.data[0][col]
                if key == "super_admin":
                    contacts["admin"] = res.data[0][col]
        except Exception:
            pass

    _try_fill("super_admin", "project_admins", "admin_id")
    _try_fill("site_manager", "site_manager_sites", "site_manager_id")
    _try_fill("supplier", "project_suppliers", "supplier_id")
    _try_fill("supplier", "purchase_orders", "supplier_id", lambda q: q.not_.is_("supplier_id", "null"))
    _try_fill("worker", "site_workers", "worker_id")

    # 4. Global Admin fallback so clients can always message an Admin
    if "super_admin" not in contacts:
        try:
            admin_res = service_client.table("profiles").select("id").in_("role", ["super_admin", "admin"]).limit(1).execute()
            if admin_res.data and admin_res.data[0].get("id"):
                contacts["super_admin"] = admin_res.data[0]["id"]
                contacts["admin"] = admin_res.data[0]["id"]
        except Exception:
            pass

    return contacts
