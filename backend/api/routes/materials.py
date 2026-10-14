from fastapi import APIRouter, HTTPException, Query, Request, Depends
from typing import List, Optional
from pydantic import BaseModel
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

class MaterialCatalogItem(BaseModel):
    name: str
    unit: str = "Units"
    category: str = "General"
    reference_price: float = 0.0

@router.get("/catalog")
def get_material_catalog(request: Request):
    """
    Returns the global material catalog.
    If material_catalog table exists, returns from it; otherwise builds dynamically
    from distinct rows in materials table to ensure non-breaking backwards compatibility.
    """
    supabase = get_auth_client(request)
    try:
        res = supabase.table("material_catalog").select("*").order("name").execute()
        if res.data:
            return res.data
    except Exception:
        pass

    # Fallback: distinct materials from project stock table
    try:
        res = supabase.table("materials").select("id, name, unit, category, unit_price").order("name").execute()
        items = {}
        for row in res.data:
            key = (row.get("name", "").strip(), (row.get("unit") or "Units").strip())
            if not key[0]:
                continue
            if key not in items:
                items[key] = {
                    "id": row.get("id"),
                    "name": key[0],
                    "unit": key[1],
                    "category": row.get("category") or "General",
                    "reference_price": row.get("unit_price") or 0.0,
                }
        return list(items.values())
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/catalog")
def create_catalog_material(item: MaterialCatalogItem, request: Request, current_user: dict = Depends(require_manager_or_admin)):
    """
    Creates a new material in the catalog (Admin & PM only).
    """
    supabase = get_auth_client(request)
    try:
        # Check if table exists
        insert_data = {
            "name": item.name.strip(),
            "unit": item.unit.strip(),
            "category": item.category.strip(),
            "reference_price": item.reference_price,
        }
        res = supabase.table("material_catalog").insert(insert_data).execute()
        if res.data:
            return res.data[0]
    except Exception:
        # Fallback to inserting in materials table with empty project_id or dummy
        pass

    try:
        # Fallback: create in materials table
        res = supabase.table("materials").insert({
            "name": item.name.strip(),
            "unit": item.unit.strip(),
            "category": item.category.strip(),
            "current_stock": 0,
            "minimum_threshold": 10,
            "unit_price": item.reference_price,
        }).execute()
        if res.data:
            return res.data[0]
        raise HTTPException(status_code=400, detail="Failed to create material")
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
