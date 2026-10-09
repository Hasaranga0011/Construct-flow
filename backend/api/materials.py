from core.notification_helper import create_notifications
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional
from core.supabase_client import supabase_db
from core.auth import get_current_user

router = APIRouter()

class MaterialRequest(BaseModel):
    project_id: str
    material_id: str
    quantity: float
    requested_by: str
    item_name: str
    unit: str
    notes: Optional[str] = None

class MaterialRequestUpdate(BaseModel):
    status: str

@router.get("/")
def get_materials(user=Depends(get_current_user)):
    try:
        res = supabase_db.table("materials").select("*").execute()
        materials = res.data
        
        for m in materials:
            qty = m.get("global_stock_quantity", 0)
            threshold = m.get("low_stock_threshold", 0)
            
            if qty == 0:
                m["status"] = "Out of Stock"
            elif qty < threshold:
                m["status"] = "Low Stock"
            else:
                m["status"] = "In Stock"
                
        return {"data": materials}
    except Exception as e:
        print(f"Get materials error: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")

@router.get("/low-stock")
def get_low_stock(user=Depends(get_current_user)):
    try:
        res = supabase_db.table("materials").select("*").execute()
        low_stock = [m for m in res.data if m.get("global_stock_quantity", 0) < m.get("low_stock_threshold", 0)]
        return {"data": low_stock}
    except Exception as e:
        print(f"Get low stock error: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")

@router.post("/requests")
def create_request(req: MaterialRequest, user=Depends(get_current_user)):
    try:
        data = req.dict()
        data["status"] = "Pending Approval"
        res = supabase_db.table("material_requests").insert(data).execute()
        
        # Notify admin
        notification = {
            "title": "New Material Request",
            "message": f"Request for {req.quantity} {req.unit} of {req.item_name}",
            "type": "general",
            "target_role": "super_admin",
            "is_read": False
        }
        create_notifications(notification)
        
        return {"message": "Request created", "data": res.data[0]}
    except Exception as e:
        print(f"Create material request error: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")

@router.patch("/requests/{request_id}")
def update_request(request_id: str, req: MaterialRequestUpdate, user=Depends(get_current_user)):
    try:
        # Fetch request
        req_res = supabase_db.table("material_requests").select("*").eq("id", request_id).execute()
        if not req_res.data:
            raise HTTPException(status_code=404, detail="Request not found")
            
        request = req_res.data[0]
        
        # Update status
        update_res = supabase_db.table("material_requests").update({"status": req.status}).eq("id", request_id).execute()
        
        # If approved, deduct from stock (simple logic for now, production should be transactional)
        if req.status == 'Approved':
            mat_res = supabase_db.table("materials").select("global_stock_quantity").eq("id", request["material_id"])
            if mat_res.data:
                current_qty = mat_res.data[0].get("global_stock_quantity", 0)
                new_qty = max(0, current_qty - request["quantity"])
                supabase_db.table("materials").update({"global_stock_quantity": new_qty}).eq("id", request["material_id"])
                
        return {"message": f"Request marked as {req.status}", "data": update_res.data[0]}
    except HTTPException:
        raise
    except Exception as e:
        print(f"Update material request error: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")
