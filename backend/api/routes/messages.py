from fastapi import APIRouter, HTTPException, Query, Depends
from typing import List, Optional
from pydantic import BaseModel
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
    receiver_id: str
    content: str
    sender_role: Optional[str] = None
    receiver_role: Optional[str] = None


@router.post("/")
def send_message(payload: MessageCreate, current_user: dict = Depends(get_current_user)):
    if payload.sender_id != current_user["id"]:
        raise HTTPException(status_code=403, detail="Cannot send a message as another user")
    supabase = client_for_token(current_user["token"])
    try:
        # Verify sender and receiver are both participants of this project.
        proj = supabase.table("projects").select("id, pm_id, client_id").eq("id", payload.project_id).execute()
        if not proj.data:
            raise HTTPException(status_code=404, detail="Project not found")
        project = proj.data[0]

        # Verify receiver is a participant (pm, client, admin, or site manager of the project).
        receiver_profile = supabase.table("profiles").select("id, role").eq("id", payload.receiver_id).execute()
        if not receiver_profile.data:
            raise HTTPException(status_code=404, detail="Receiver not found")

        data = {
            "project_id": payload.project_id,
            "sender_id": payload.sender_id,
            "receiver_id": payload.receiver_id,
            "sender_role": payload.sender_role or current_user.get("role"),
            "receiver_role": payload.receiver_role or receiver_profile.data[0].get("role"),
            "content": payload.content,
            "is_read": False,
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        res = supabase.table("client_messages").insert(data).execute()
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
            .or_(f"sender_id.eq.{current_user['id']},receiver_id.eq.{current_user['id']}") \
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
                .or_(f"sender_id.eq.{current_user['id']},receiver_id.eq.{current_user['id']}") \
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
