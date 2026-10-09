from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, Field
from typing import Optional
from core.notification_helper import create_notifications, create_notification
from core.database import client_for_token, supabase as admin_supabase
from core.security import get_current_user, require_manager_or_admin
from datetime import datetime
import uuid
import json

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
    unit_price: Optional[float] = Field(default=0.0, ge=0, allow_inf_nan=False)
    expected_date: str
    total_price: Optional[float] = Field(default=0.0, ge=0, allow_inf_nan=False)
    unit: Optional[str] = None

class PurchaseOrderApprove(BaseModel):
    unit_price: Optional[float] = None

class PurchaseOrderSuggest(BaseModel):
    suggested_quantity: float = Field(gt=0, allow_inf_nan=False)
    suggested_date: str
    supplier_notes: Optional[str] = None
    suggested_price: Optional[float] = None

def append_event(order, event):
    log = []
    notes = order.get("supplier_notes")
    if notes:
        try:
            log = json.loads(notes)
            if not isinstance(log, list):
                log = [{"role": "system", "action": "legacy_note", "note": notes}]
        except:
            log = [{"role": "system", "action": "legacy_note", "note": notes}]
            
    if "timestamp" not in event:
        event["timestamp"] = datetime.now().isoformat()
    log.append(event)
    return json.dumps(log)

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
        
        log = [{
            "role": current_user["role"],
            "action": "created",
            "quantity": order.quantity_ordered,
            "date": order.expected_date,
            "timestamp": datetime.now().isoformat()
        }]
        
        # Ensure material_id is a valid UUID
        material_id = order.material_id
        is_valid_uuid = False
        try:
            if material_id:
                uuid.UUID(str(material_id))
                is_valid_uuid = True
        except ValueError:
            pass

        if not is_valid_uuid:
            mat_name = str(material_id) if material_id else f"Material for {po_number}"
            existing = supabase.table("materials").select("id").eq("name", mat_name).eq("project_id", order.project_id).execute()
            if existing.data:
                material_id = existing.data[0]["id"]
            else:
                mat_res = supabase.table("materials").insert({
                    "project_id": order.project_id,
                    "name": mat_name,
                    "unit": order.unit or "Units",
                    "current_stock": 0,
                    "minimum_threshold": 10
                }).execute()
                if mat_res.data:
                    material_id = mat_res.data[0]["id"]
                    
        items_str = f"{order.quantity_ordered} {order.unit or ''} (Material ID: {material_id})"

        po_data = {
            "project_id": order.project_id,
            "supplier_id": order.supplier_id,
            "supplier_name": order.supplier_name,
            "material_id": material_id,
            "quantity_ordered": order.quantity_ordered,
            "unit_price": order.unit_price,
            "total_price": round(order.quantity_ordered * order.unit_price, 2),
            "po_number": po_number,
            "items": items_str,
            "expected_date": order.expected_date,
            "status": "Pending Delivery",
            "supplier_notes": json.dumps(log)
        }
        
        response = supabase.table("purchase_orders").insert(po_data).execute()
        
        if not response.data:
            raise HTTPException(status_code=400, detail="Failed to create purchase order")
            
        # Trigger notification to supplier
        if order.supplier_id:
            try:
                create_notifications([{
                    "user_id": "11111111-1111-1111-1111-111111111111",
                    "project_id": order.project_id,
                    "target_role": "supplier",
                    "target_user_id": order.supplier_id,
                    "title": "New Material Order",
                    "message": f"You have received a new purchase order: {po_number}",
                    "type": "general"
                }])
            except Exception as notif_err:
                print(f"Failed to send notification to supplier: {notif_err}")
            
        return response.data[0]
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.patch("/{po_id}/approve")
def approve_po(po_id: str, data: PurchaseOrderApprove, current_user: dict = Depends(get_current_user)):
    supabase = client_for_token(current_user["token"])
    order = check_order_access(supabase, po_id, current_user)
    if order.get("status") not in {"Pending Delivery", "Confirmed", "Suggested"}:
        raise HTTPException(status_code=409, detail="This order can no longer be changed")
    try:
        qty = order.get("suggested_quantity") or order.get("quantity_ordered") or 0
        final_price = data.unit_price if data.unit_price is not None else order.get("suggested_price") or order.get("unit_price") or 0
        total_cost = round(qty * final_price, 2)
        
        log_json = append_event(order, {
            "role": current_user["role"],
            "user_id": current_user.get("id"),
            "action": "approved",
            "unit_price": final_price,
            "quantity": qty
        })
        
        res = supabase.table("purchase_orders").update({
            "status": "Confirmed",
            "unit_price": final_price,
            "quantity_ordered": qty, # accept suggested qty
            "expected_date": order.get("suggested_date") or order.get("expected_date"),
            "total_price": total_cost,
            "supplier_notes": log_json
        }).eq("id", po_id).execute()
        
        if not res.data:
            raise HTTPException(status_code=404, detail="PO not found")
            
        order = res.data[0]
        # Notify Admin/Manager
        create_notifications([{
            "user_id": "11111111-1111-1111-1111-111111111111",
            "project_id": order.get("project_id"),
            "target_role": "pm",
            "title": "Order Approved",
            "message": f"Supplier has approved purchase order {order.get('po_number')}",
            "type": "general"
        }])
        
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
        log_json = append_event(order, {
            "role": current_user["role"],
            "user_id": current_user.get("id"),
            "action": "rejected"
        })
        res = supabase.table("purchase_orders").update({
            "status": "Rejected",
            "supplier_notes": log_json
        }).eq("id", po_id).execute()

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
                "user_id": "11111111-1111-1111-1111-111111111111",
                "project_id": project_id,
                "target_role": "pm",
                "title": "Order Rejected",
                "message": f"Supplier rejected purchase order {order.get('po_number')}",
                "type": "general",
                "is_read": False,
            },
            {
                "user_id": "11111111-1111-1111-1111-111111111111",
                "project_id": project_id,
                "target_role": "pm",
                "target_user_id": pm_id,
                "title": "⚠️ Supplier Rejected — Shortage Risk",
                "message": (
                    f"PO {order.get('po_number')} was rejected by the supplier. "
                    "Consider raising a new order or sourcing an alternative supplier to avoid material shortages."
                ),
                "type": "general",
                "is_read": False,
            },
        ]
        try:
            create_notifications(notifications_to_insert)
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
        log_json = append_event(order, {
            "role": current_user["role"],
            "user_id": current_user.get("id"),
            "action": "suggested",
            "suggested_quantity": suggestion.suggested_quantity,
            "suggested_date": suggestion.suggested_date,
            "suggested_price": suggestion.suggested_price,
            "note": suggestion.supplier_notes
        })
        res = supabase.table("purchase_orders").update({
            "status": "Suggested",
            "suggested_quantity": suggestion.suggested_quantity,
            "suggested_date": suggestion.suggested_date,
            "supplier_notes": log_json
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
            create_notifications([
                {
                    "user_id": "11111111-1111-1111-1111-111111111111",
                    "project_id": project_id,
                    "target_role": "pm",
                    "target_user_id": pm_id,
                    "title": "Order Counter-Offer",
                    "message": f"Supplier suggested new terms for PO {order.get('po_number')}: qty {suggestion.suggested_quantity}, date {suggestion.suggested_date}",
                    "type": "general",
                    "is_read": False,
                },
                {
                    "user_id": "11111111-1111-1111-1111-111111111111",
                    "project_id": project_id,
                    "target_role": "pm",
                    "target_user_id": pm_id,
                    "title": "⚠️ Review Required — Supplier Cannot Fulfil Original Terms",
                    "message": (
                        f"PO {order.get('po_number')}: supplier cannot supply {order.get('quantity_ordered')} units by {order.get('expected_date')}. "
                        "Review and accept or reject the counter-offer."
                    ),
                    "type": "general",
                    "is_read": False,
                },
            ])
        except Exception:
            import logging
            logging.exception("Suggest notifications failed")

        return res.data[0]
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

def _transition_order(po_id: str, current_user: dict, operation: str):
    client = client_for_token(current_user["token"])
    check_order_access(client, po_id, current_user)
    try:
        from datetime import datetime
        order_res = client.table("purchase_orders").select("*").eq("id", po_id).execute()
        if not order_res.data:
            raise HTTPException(status_code=404, detail="Order not found")
        order = order_res.data[0]

        if operation == "deliver_purchase_order":
            if order["status"] in ["Received", "Delivered"]:
                return order
            if order["status"] != "Confirmed":
                raise HTTPException(status_code=400, detail="Order must be confirmed before delivery")
            
            res = client.table("purchase_orders").update({
                "status": "Delivered", 
                "delivered_at": datetime.now().isoformat(),
                "delivered_by": current_user.get("id")
            }).eq("id", po_id).execute()
            
            from core.notification_helper import create_notifications
            create_notifications([{
                "project_id": order["project_id"], "target_role": "pm", "title": "Goods delivered", "message": f"Purchase order {order.get('po_number')} is ready for receipt confirmation.", "type": "general"
            }, {
                "project_id": order["project_id"], "target_role": "site_manager", "title": "Goods delivered", "message": f"Purchase order {order.get('po_number')} is ready for receipt confirmation.", "type": "general"
            }])
            response_data = res.data[0] if res.data else order
            
        elif operation == "receive_purchase_order":
            if order["status"] == "Received":
                return order
            if order["status"] not in ["Confirmed", "Delivered"]:
                raise HTTPException(status_code=400, detail="Order must be confirmed or delivered before receipt")
                
            res = client.table("purchase_orders").update({
                "status": "Received", 
                "received_at": datetime.now().isoformat(),
                "received_by": current_user.get("id")
            }).eq("id", po_id).execute()
            
            mat_res = client.table("materials").select("id, current_stock").eq("name", order.get("items", "")).eq("project_id", order["project_id"]).execute()
            if mat_res.data:
                mat = mat_res.data[0]
                client.table("materials").update({"current_stock": mat.get("current_stock", 0) + (order.get("quantity_ordered") or 0)}).eq("id", mat["id"]).execute()
            
            from core.notification_helper import create_notifications
            create_notifications([{
                "project_id": order["project_id"], "target_role": "pm", "title": "Goods received", "message": f"Purchase order {order.get('po_number')} was received and added to stock.", "type": "general"
            }, {
                "project_id": order["project_id"], "target_role": "site_manager", "title": "Goods received", "message": f"Purchase order {order.get('po_number')} was received and added to stock.", "type": "general"
            }])
            response_data = res.data[0] if res.data else order
        else:
            response = client.rpc(operation, {"p_order_id": po_id}).execute()
            response_data = response.data

        # Record the actor in history
        try:
            order_res = client.table("purchase_orders").select("*").eq("id", po_id).execute()
            if order_res.data:
                log_json = append_event(order_res.data[0], {
                    "role": current_user["role"],
                    "user_id": current_user.get("id"),
                    "action": operation
                })
                client.table("purchase_orders").update({"supplier_notes": log_json}).eq("id", po_id).execute()
        except Exception as e:
            import logging
            logging.error(f"Failed to append history log for {po_id}: {e}")
            
        return response_data
    except HTTPException:
        raise
    except Exception as exc:
        code = getattr(exc, "code", None)
        status = {"42501": 403, "P0002": 404, "P0001": 409, "23514": 409}.get(code, 500)
        raise HTTPException(status_code=status, detail=str(exc)) from exc


@router.patch("/{po_id}/deliver")
def deliver_po(po_id: str, current_user: dict = Depends(get_current_user)):
    return _transition_order(po_id, current_user, "deliver_purchase_order")


@router.patch("/{po_id}/receive")
def receive_po(po_id: str, current_user: dict = Depends(get_current_user)):
    if current_user["role"] not in {"super_admin", "pm", "site_manager"}:
        raise HTTPException(status_code=403, detail="Only the project team can receive goods")
    return _transition_order(po_id, current_user, "receive_purchase_order")


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
                    "user_id": "11111111-1111-1111-1111-111111111111",
                    "project_id": order.get("project_id"),
                    "target_role": "supplier",
                    "target_user_id": order.get("supplier_id"),
                    "title": "LATE MATERIAL ALERT",
                    "message": f"Order {order.get('po_number')} is overdue! Expected: {order.get('expected_date')}",
                    "type": "delay_risk" # Red alert
                })
                # Also notify admin and PM for operational visibility
                notifications.append({
                    "user_id": "11111111-1111-1111-1111-111111111111",
                    "project_id": order.get("project_id"),
                    "target_role": "super_admin",
                    "title": "LATE MATERIAL ALERT",
                    "message": f"Order {order.get('po_number')} is overdue from supplier! Expected: {order.get('expected_date')}",
                    "type": "delay_risk"
                })
                notifications.append({
                    "user_id": "11111111-1111-1111-1111-111111111111",
                    "project_id": order.get("project_id"),
                    "target_role": "pm",
                    "title": "LATE MATERIAL ALERT",
                    "message": f"Order {order.get('po_number')} is overdue from supplier! Expected: {order.get('expected_date')}",
                    "type": "delay_risk"
                })
                
        if notifications:
            create_notifications(notifications)
            
        return {"checked": len(res.data), "alerts_sent": len(notifications)}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
