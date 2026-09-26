from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, Field
from typing import Optional
from core.database import client_for_token
from core.security import get_current_user, require_manager_or_admin
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
    quantity_ordered: float = Field(gt=0, allow_inf_nan=False)
    unit_price: float = Field(ge=0, allow_inf_nan=False)
    expected_date: str
    total_price: float = Field(ge=0, allow_inf_nan=False)
    unit: Optional[str] = None

class PurchaseOrderSuggest(BaseModel):
    suggested_quantity: float = Field(gt=0, allow_inf_nan=False)
    suggested_date: str
    supplier_notes: Optional[str] = None

def check_order_access(client, po_id, user):
    result = client.table("purchase_orders").select("*").eq("id", po_id).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="PO not found")
    order = result.data[0]
    if user["role"] == "super_admin":
        return order
    if user["role"] == "supplier" and order.get("supplier_id") == user["id"]:
        return order
    if user["role"] == "pm":
        project = client.table("projects").select("pm_id").eq("id", order.get("project_id")).execute()
        if project.data and project.data[0].get("pm_id") == user["id"]:
            return order
    if user["role"] == "site_manager":
        assignment = client.table("project_role_assignments").select("user_id").eq("project_id", order.get("project_id")).eq("user_id", user["id"]).eq("role", "site_manager").execute()
        if assignment.data:
            return order
    raise HTTPException(status_code=403, detail="Access denied: not your order")


@router.post("")
def create_purchase_order(order: PurchaseOrderCreate, current_user: dict = Depends(require_manager_or_admin)):
    supabase = client_for_token(current_user["token"])
    if current_user["role"] != "super_admin":
        project = supabase.table("projects").select("pm_id").eq("id", order.project_id).execute()
        if not project.data or project.data[0].get("pm_id") != current_user["id"]:
            raise HTTPException(status_code=403, detail="Access denied: not your project")
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
            "total_price": round(order.quantity_ordered * order.unit_price, 2),
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
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.patch("/{po_id}/approve")
def approve_po(po_id: str, current_user: dict = Depends(get_current_user)):
    supabase = client_for_token(current_user["token"])
    order = check_order_access(supabase, po_id, current_user)
    if order.get("status") not in {"Pending Delivery", "Confirmed", "Suggested"}:
        raise HTTPException(status_code=409, detail="This order can no longer be changed")
    try:
        res = supabase.table("purchase_orders").update({"status": "Confirmed"}).eq("id", po_id).execute()
        
        if not res.data:
            raise HTTPException(status_code=404, detail="PO not found")
            
        order = res.data[0]
        # Notify Admin/Manager
        supabase.table("notifications").insert({
            "project_id": order.get("project_id"),
            "target_role": "pm",
            "title": "Order Approved",
            "message": f"Supplier has approved purchase order {order.get('po_number')}",
            "type": "success"
        }).execute()
        
        return res.data[0]
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.patch("/{po_id}/reject")
def reject_po(po_id: str, current_user: dict = Depends(get_current_user)):
    supabase = client_for_token(current_user["token"])
    order = check_order_access(supabase, po_id, current_user)
    if order.get("status") not in {"Pending Delivery", "Confirmed", "Suggested"}:
        raise HTTPException(status_code=409, detail="This order can no longer be changed")
    try:
        res = supabase.table("purchase_orders").update({"status": "Rejected"}).eq("id", po_id).execute()

        if not res.data:
            raise HTTPException(status_code=404, detail="PO not found")

        order = res.data[0]
        project_id = order.get("project_id")

        # Fetch PM of the project for targeted notification.
        pm_id = None
        try:
            proj = supabase.table("projects").select("pm_id").eq("id", project_id).execute()
            if proj.data:
                pm_id = proj.data[0].get("pm_id")
        except Exception:
            pass

        # Notify PM with an explicit shortage-risk warning.
        notifications_to_insert = [
            {
                "project_id": project_id,
                "target_role": "pm",
                "title": "Order Rejected",
                "message": f"Supplier rejected purchase order {order.get('po_number')}",
                "type": "error",
                "is_read": False,
            },
            {
                "project_id": project_id,
                "target_role": "pm",
                "target_user_id": pm_id,
                "title": "⚠️ Supplier Rejected — Shortage Risk",
                "message": (
                    f"PO {order.get('po_number')} was rejected by the supplier. "
                    "Consider raising a new order or sourcing an alternative supplier to avoid material shortages."
                ),
                "type": "warning",
                "is_read": False,
            },
        ]
        try:
            supabase.table("notifications").insert(notifications_to_insert).execute()
        except Exception:
            import logging
            logging.exception("Rejection notifications failed")

        return res.data[0]
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.patch("/{po_id}/suggest")
def suggest_po(po_id: str, suggestion: PurchaseOrderSuggest, current_user: dict = Depends(get_current_user)):
    supabase = client_for_token(current_user["token"])
    order = check_order_access(supabase, po_id, current_user)
    if order.get("status") not in {"Pending Delivery", "Confirmed", "Suggested"}:
        raise HTTPException(status_code=409, detail="This order can no longer be changed")
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
        project_id = order.get("project_id")

        # Fetch PM for targeted notification.
        pm_id = None
        try:
            proj = supabase.table("projects").select("pm_id").eq("id", project_id).execute()
            if proj.data:
                pm_id = proj.data[0].get("pm_id")
        except Exception:
            pass

        # Counter-offer notification + shortage-risk warning.
        try:
            supabase.table("notifications").insert([
                {
                    "project_id": project_id,
                    "target_role": "pm",
                    "target_user_id": pm_id,
                    "title": "Order Counter-Offer",
                    "message": f"Supplier suggested new terms for PO {order.get('po_number')}: qty {suggestion.suggested_quantity}, date {suggestion.suggested_date}",
                    "type": "warning",
                    "is_read": False,
                },
                {
                    "project_id": project_id,
                    "target_role": "pm",
                    "target_user_id": pm_id,
                    "title": "⚠️ Review Required — Supplier Cannot Fulfil Original Terms",
                    "message": (
                        f"PO {order.get('po_number')}: supplier cannot supply {order.get('quantity_ordered')} units by {order.get('expected_date')}. "
                        "Review and accept or reject the counter-offer."
                    ),
                    "type": "warning",
                    "is_read": False,
                },
            ]).execute()
        except Exception:
            import logging
            logging.exception("Suggest notifications failed")

        return res.data[0]
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.patch("/{po_id}/deliver")
def deliver_po(po_id: str, current_user: dict = Depends(get_current_user)):
    client = client_for_token(current_user["token"])
    check_order_access(client, po_id, current_user)
    # The database function locks the order and updates stock in one transaction.
    result = client.rpc("deliver_purchase_order", {"p_order_id": po_id}).execute()
    return result.data


@router.patch("/{po_id}/receive")
def receive_po(po_id: str, current_user: dict = Depends(get_current_user)):
    """Confirm goods at the project/site and perform the single stock increment."""
    if current_user["role"] not in {"super_admin", "pm", "site_manager"}:
        raise HTTPException(status_code=403, detail="Only the project team can receive goods")
    client = client_for_token(current_user["token"])
    order = check_order_access(client, po_id, current_user)
    result = client.rpc("receive_purchase_order", {"p_order_id": po_id}).execute()

    # Notify PM that goods have been confirmed received.
    try:
        project_id = order.get("project_id")
        proj = client.table("projects").select("pm_id, name").eq("id", project_id).execute()
        if proj.data and proj.data[0].get("pm_id"):
            client.table("notifications").insert({
                "project_id": project_id,
                "target_user_id": proj.data[0]["pm_id"],
                "target_role": "pm",
                "title": "Goods Received",
                "message": f"PO {order.get('po_number')} has been confirmed received and stock updated.",
                "type": "success",
                "is_read": False,
            }).execute()
    except Exception:
        import logging
        logging.exception("Goods-received notification failed")

    return result.data


@router.post("/check-late")
def check_late_materials(current_user: dict = Depends(require_manager_or_admin)):
    return check_late_orders(client_for_token(current_user["token"]))


def check_late_orders(supabase):
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
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
