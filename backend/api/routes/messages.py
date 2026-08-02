from fastapi import APIRouter, HTTPException, Query
from typing import List
from pydantic import BaseModel
from core.database import supabase
from datetime import datetime

router = APIRouter(
    prefix="/messages",
    tags=["Messages"]
)

class MessageCreate(BaseModel):
    project_id: str
    sender_id: str
    receiver_id: str
    content: str

@router.post("/")
def send_message(payload: MessageCreate):
    try:
        data = {
            "project_id": payload.project_id,
            "sender_id": payload.sender_id,
            "receiver_id": payload.receiver_id,
            "content": payload.content,
            "is_read": False,
            "created_at": datetime.utcnow().isoformat()
        }
        res = supabase.table("client_messages").insert(data).execute()
        return res.data[0]
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/{project_id}")
def get_messages(project_id: str):
    try:
        res = supabase.table("client_messages") \
            .select("*, sender:profiles!sender_id(full_name, role)") \
            .eq("project_id", project_id) \
            .order("created_at", {"ascending": True}) \
            .execute()
        return res.data
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
