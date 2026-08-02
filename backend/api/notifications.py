from fastapi import APIRouter, HTTPException, Depends
from core.supabase_client import supabase_db
from core.auth import get_current_user

router = APIRouter()

@router.get("/")
def get_notifications(user=Depends(get_current_user)):
    try:
        user_id = user["id"]
        role = user["role"]
        
        res = supabase_db.table("notifications")\
            .select("*")\
            .or_(f"user_id.eq.{user_id},target_role.eq.All,target_role.eq.{role}")\
            .order("created_at", desc=True)\
            .execute()
            
        return {"data": res.data}
    except Exception as e:
        print(f"Get notifications error: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")

@router.patch("/read-all")
def mark_all_read(user=Depends(get_current_user)):
    try:
        user_id = user["id"]
        role = user["role"]
        
        # In supabase postgres, doing bulk updates with or_ can be tricky via python client.
        # We will fetch unread, then update them.
        res = supabase_db.table("notifications")\
            .select("id")\
            .eq("is_read", False)\
            .or_(f"user_id.eq.{user_id},target_role.eq.All,target_role.eq.{role}")\
            .execute()
            
        ids = [row["id"] for row in res.data]
        if ids:
            supabase_db.table("notifications").update({"is_read": True}).in_("id", ids).execute()
            
        return {"message": "All marked as read"}
    except Exception as e:
        print(f"Mark all read error: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")

@router.patch("/{notification_id}/read")
def mark_read(notification_id: str, user=Depends(get_current_user)):
    try:
        supabase_db.table("notifications").update({"is_read": True}).eq("id", notification_id).execute()
        return {"message": "Marked as read"}
    except Exception as e:
        print(f"Mark read error: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")
