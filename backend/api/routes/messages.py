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
    try:
        contacts = {}
        # Fetch project PM
        proj = service_client.table("projects").select("pm_id").eq("id", project_id).limit(1).execute()
        if proj.data and isinstance(proj.data, list) and len(proj.data) > 0 and proj.data[0].get("pm_id"):
            contacts["pm"] = proj.data[0]["pm_id"]
        
        # Fetch site manager
        sm_res = service_client.table("site_manager_sites").select("site_manager_id").eq("project_id", project_id).limit(1).execute()
        if sm_res.data and isinstance(sm_res.data, list) and len(sm_res.data) > 0 and sm_res.data[0].get("site_manager_id"):
            contacts["site_manager"] = sm_res.data[0]["site_manager_id"]
            
        # Fetch admin
        admin_res = service_client.table("profiles").select("id").eq("role", "super_admin").limit(1).execute()
        if admin_res.data and isinstance(admin_res.data, list) and len(admin_res.data) > 0 and admin_res.data[0].get("id"):
            contacts["super_admin"] = admin_res.data[0]["id"]
            
        return contacts
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
