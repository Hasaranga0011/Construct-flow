from fastapi import APIRouter, HTTPException, Query
from typing import List, Optional
from ..models import MaterialCreate, MaterialResponse
from core.database import supabase

router = APIRouter(
    prefix="/materials",
    tags=["Materials"]
)

@router.get("/", response_model=List[MaterialResponse])
def get_materials(project_id: Optional[str] = Query(None, description="Filter by project ID")):
    try:
        query = supabase.table("materials").select("*")
        if project_id:
            query = query.eq("project_id", project_id)
            
        response = query.execute()
        return response.data
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/", response_model=MaterialResponse)
def create_material(material: MaterialCreate):
    try:
        response = supabase.table("materials").insert(material.model_dump()).execute()
        
        if not response.data:
            raise HTTPException(status_code=400, detail="Failed to add material")
            
        return response.data[0]
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/check-stock")
def check_low_stock():
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
                    "type": "warning"
                })
                # PMs might also care, but sticking to admin for simplicity
                
        if notifications:
            supabase.table("notifications").insert(notifications).execute()
            
        return {"checked": len(res.data), "alerts_sent": len(notifications)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
