from fastapi import APIRouter, HTTPException, Query, Request, Depends
from typing import List, Optional
from ..models import MaterialCreate, MaterialResponse
from core.notification_helper import create_notifications, create_notification
from core.database import get_auth_client, client_for_token
from core.security import require_manager_or_admin

router = APIRouter(
    prefix="/materials",
    tags=["Materials"]
)

@router.get("/", response_model=List[MaterialResponse])
def get_materials(request: Request, project_id: Optional[str] = Query(None, description="Filter by project ID")):
    try:
        query = get_auth_client(request).table("materials").select("*")
        if project_id:
            query = query.eq("project_id", project_id)
            
        response = query.execute()
        return response.data
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/", response_model=MaterialResponse)
def create_material(material: MaterialCreate, request: Request, current_user: dict = Depends(require_manager_or_admin)):
    try:
        response = get_auth_client(request).table("materials").insert(material.model_dump()).execute()
        
        if not response.data:
            raise HTTPException(status_code=400, detail="Failed to add material")
            
        return response.data[0]
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/check-stock")
def check_low_stock(current_user: dict = Depends(require_manager_or_admin)):
    return check_stock(client_for_token(current_user["token"]))


def check_stock(supabase):
    try:
        # Check global_stock_quantity < low_stock_threshold
        # Note: in real app, might want to check site_materials too
        res = supabase.table("materials").select("*").execute()
        
        notifications = []
        for mat in res.data:
            if mat.get("global_stock_quantity", 0) < mat.get("low_stock_threshold", 10):
                # Send to admins
                notifications.append({
                    "target_role": "super_admin",
                    "title": "LOW STOCK ALERT",
                    "message": f"Material {mat.get('name')} is running low (Current: {mat.get('global_stock_quantity')})",
                    "type": "general"
                })
                # PMs might also care, but sticking to admin for simplicity
                
        if notifications:
            create_notifications(notifications)
            
        return {"checked": len(res.data), "alerts_sent": len(notifications)}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
