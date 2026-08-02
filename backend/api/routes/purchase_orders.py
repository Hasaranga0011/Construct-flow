from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional
from core.database import supabase
from datetime import datetime
import uuid

router = APIRouter(
    prefix="/purchase-orders",
    tags=["Purchase Orders"]
)

class PurchaseOrderCreate(BaseModel):
    supplier_id: Optional[str] = None
    supplier_name: str
    material_id: str
    project_id: str
    quantity_ordered: float
    unit_price: float
    expected_date: str
    total_price: float
    unit: Optional[str] = None

class PurchaseOrderSuggest(BaseModel):
    suggested_quantity: float
    suggested_date: str
    supplier_notes: Optional[str] = None

@router.post("")
def create_purchase_order(order: PurchaseOrderCreate):
    try:
        po_number = f"PO-{str(uuid.uuid4())[:8].upper()}"
        
        # In a real app we'd fetch the material name, but we can store it in items as JSON or string
        # For now, let's just make items string describe the order
        items_str = f"{order.quantity_ordered} {order.unit or ''} (Material ID: {order.material_id})"
        
        po_data = {
            "project_id": order.project_id,
            "supplier_id": order.supplier_id,
            "supplier_name": order.supplier_name,
            "material_id": order.material_id,
            "quantity_ordered": order.quantity_ordered,
            "unit_price": order.unit_price,
            "total_price": order.total_price,
            "po_number": po_number,
            "items": items_str,
            "expected_date": order.expected_date,
            "status": "Pending Delivery"
        }
        
        response = supabase.table("purchase_orders").insert(po_data).execute()
        
        if not response.data:
            raise HTTPException(status_code=400, detail="Failed to create purchase order")
            
        # Trigger notification to supplier
        if order.supplier_id:
            try:
                supabase.table("notifications").insert({
                    "project_id": order.project_id,
                    "target_role": "supplier",
                    "target_user_id": order.supplier_id,
                    "title": "New Material Order",
                    "message": f"You have received a new purchase order: {po_number}",
                    "type": "info"
                }).execute()
            except Exception as notif_err:
                print(f"Failed to send notification to supplier: {notif_err}")
            
        return response.data[0]
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.patch("/{po_id}/approve")
def approve_po(po_id: str):
    try:
        res = supabase.table("purchase_orders").update({"status": "Confirmed"}).eq("id", po_id).execute()
        
        if not res.data:
            raise HTTPException(status_code=404, detail="PO not found")
            
        order = res.data[0]
        # Notify Admin/Manager
        supabase.table("notifications").insert({
            "project_id": order.get("project_id"),
            "target_role": "Manager",
            "title": "Order Approved",
            "message": f"Supplier has approved purchase order {order.get('po_number')}",
            "type": "success"
        }).execute()
        
        return res.data[0]
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.patch("/{po_id}/reject")
def reject_po(po_id: str):
    try:
        res = supabase.table("purchase_orders").update({"status": "Rejected"}).eq("id", po_id).execute()
        
        if not res.data:
            raise HTTPException(status_code=404, detail="PO not found")
            
        order = res.data[0]
        # Notify Admin/Manager
        supabase.table("notifications").insert({
            "project_id": order.get("project_id"),
            "target_role": "Manager",
            "title": "Order Rejected",
            "message": f"Supplier rejected purchase order {order.get('po_number')}",
            "type": "error"
        }).execute()
        
        return res.data[0]
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.patch("/{po_id}/suggest")
def suggest_po(po_id: str, suggestion: PurchaseOrderSuggest):
    try:
        res = supabase.table("purchase_orders").update({
            "status": "Suggested",
            "suggested_quantity": suggestion.suggested_quantity,
            "suggested_date": suggestion.suggested_date,
            "supplier_notes": suggestion.supplier_notes
        }).eq("id", po_id).execute()
        
        if not res.data:
            raise HTTPException(status_code=404, detail="PO not found")
            
        order = res.data[0]
        # Notify Admin/Manager
        supabase.table("notifications").insert({
            "project_id": order.get("project_id"),
            "target_role": "Manager",
            "title": "Order Counter-Offer",
            "message": f"Supplier suggested new terms for PO {order.get('po_number')}",
            "type": "warning"
        }).execute()
        
        return res.data[0]
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.patch("/{po_id}/deliver")
def deliver_po(po_id: str):
    try:
        res = supabase.table("purchase_orders").update({
            "status": "Delivered"
        }).eq("id", po_id).execute()
        
        if not res.data:
            raise HTTPException(status_code=404, detail="PO not found")
            
        order = res.data[0]
        
        # Update material stock
        if order.get("material_id") and order.get("quantity_ordered"):
            mat_res = supabase.table("materials").select("global_stock_quantity").eq("id", order["material_id"]).execute()
            if mat_res.data:
                curr_qty = mat_res.data[0].get("global_stock_quantity") or 0
                new_qty = float(curr_qty) + float(order["quantity_ordered"])
                supabase.table("materials").update({"global_stock_quantity": new_qty}).eq("id", order["material_id"]).execute()
                
        # Notify roles
        supabase.table("notifications").insert([
            {
                "project_id": order.get("project_id"),
                "target_role": "Manager",
                "title": "Materials Delivered",
                "message": f"Order {order.get('po_number')} arrived at site.",
                "type": "success"
            },
            {
                "project_id": order.get("project_id"),
                "target_role": "site_manager",
                "title": "Materials Delivered",
                "message": f"Order {order.get('po_number')} arrived at site.",
                "type": "success"
            }
        ]).execute()
        
        return order
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/check-late")
def check_late_materials():
    try:
        # Find orders that are Pending Delivery or Confirmed, and expected_date is in the past
        today = datetime.now().date().isoformat()
        res = supabase.table("purchase_orders")\
            .select("*")\
            .in_("status", ["Pending Delivery", "Confirmed"])\
            .lt("expected_date", today)\
            .execute()
            
        notifications = []
        for order in res.data:
            if order.get("supplier_id"):
                notifications.append({
                    "project_id": order.get("project_id"),
                    "target_role": "supplier",
                    "target_user_id": order.get("supplier_id"),
                    "title": "LATE MATERIAL ALERT",
                    "message": f"Order {order.get('po_number')} is overdue! Expected: {order.get('expected_date')}",
                    "type": "error" # Red alert
                })
                
        if notifications:
            supabase.table("notifications").insert(notifications).execute()
            
        return {"checked": len(res.data), "alerts_sent": len(notifications)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
