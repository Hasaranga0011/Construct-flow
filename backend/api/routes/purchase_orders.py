from fastapi import APIRouter, HTTPException, Depends, Body
from pydantic import BaseModel, Field, HttpUrl, field_validator, model_validator
from typing import Optional
from uuid import UUID
from core.notification_helper import create_notifications, create_notification
from core.database import client_for_token, supabase as admin_supabase, get_service_client
from core.security import get_current_user, require_manager_or_admin
from datetime import datetime, date
import uuid
import json
import math

router = APIRouter(
    prefix="/purchase-orders",
    tags=["Purchase Orders"]
)

@router.get("")
def list_purchase_orders(project_id: Optional[str] = None, current_user: dict = Depends(get_current_user)):
    if current_user["role"] not in {"super_admin", "pm", "site_manager", "supplier"}:
        raise HTTPException(status_code=403, detail="Procurement access required")
    client = client_for_token(current_user["token"])
    query = client.table("purchase_orders").select("*")
    if project_id:
        query = query.eq("project_id", project_id)
    if current_user["role"] == "supplier":
        query = query.eq("supplier_id", current_user["id"])
    return query.order("created_at", desc=True).limit(500).execute().data or []


class InvoiceReference(BaseModel):
    invoice_url: HttpUrl


@router.post("/{po_id}/invoice")
def attach_invoice(po_id: str, payload: InvoiceReference, current_user: dict = Depends(get_current_user)):
    client = client_for_token(current_user["token"])
    check_order_access(client, po_id, current_user)
    if current_user["role"] not in {"supplier", "super_admin"}:
        raise HTTPException(status_code=403, detail="Only the supplier or administrator may attach invoices")
    if payload.invoice_url.scheme != "https":
        raise HTTPException(status_code=422, detail="Invoice URL must use HTTPS")
    result = client.table("purchase_orders").update({"invoice_url": str(payload.invoice_url)}).eq("id", po_id).execute()
    if not result.data:
        raise HTTPException(status_code=409, detail="Invoice was not saved")
    return result.data[0]

class PurchaseOrderCreate(BaseModel):
    request_id: Optional[UUID] = None
    boq_item_id: Optional[UUID] = None
    supplier_id: Optional[str] = None
    supplier_name: str = Field(min_length=1, max_length=300)
    material_id: str = Field(min_length=1, max_length=300)
    project_id: str = Field(min_length=1, max_length=100)
    quantity_ordered: float = Field(gt=0, allow_inf_nan=False)
    unit_price: float = Field(default=0.0, ge=0, allow_inf_nan=False)
    expected_date: date
    total_price: Optional[float] = Field(default=0.0, ge=0, allow_inf_nan=False)
    unit: Optional[str] = Field(default=None, min_length=1, max_length=50)

    @field_validator('supplier_name', 'material_id', 'project_id', 'unit', mode='before')
    @classmethod
    def trim_labels(cls, value):
        return value.strip() if isinstance(value, str) else value

    @model_validator(mode='after')
    def finite_order_total(self):
        if not math.isfinite(self.quantity_ordered * self.unit_price):
            raise ValueError('The order total is too large')
        return self


def replay_purchase_order(client, order, order_id):
    """The primary key makes concurrent retries unique; RLS still scopes the lookup."""
    rows = client.table('purchase_orders').select('*').eq('id', order_id).execute().data or []
    if not rows:
        return None
    saved = rows[0]
    expected = {
        'project_id': order.project_id, 'supplier_id': order.supplier_id,
        'quantity_ordered': order.quantity_ordered, 'unit_price': order.unit_price,
        'expected_date': order.expected_date.isoformat(),
    }
    if order.boq_item_id:
        expected['boq_item_id'] = str(order.boq_item_id)
    if any(saved.get(key) != value for key, value in expected.items()):
        raise HTTPException(409, 'This submission was already used for different order details. Refresh before creating another order.')
    original_material_id = str(saved.get('items', '')).rsplit('(Material ID: ', 1)[-1].removesuffix(')')
    same_material = order.material_id in {str(saved.get('material_id')), original_material_id}
    if not same_material:
        material = client.table('materials').select('name').eq('id', saved.get('material_id')).execute().data or []
        same_material = bool(material and material[0]['name'] == order.material_id)
    expected_items = f"{order.quantity_ordered} {order.unit or ''} (Material ID: {original_material_id})"
    if not same_material or saved.get('items') != expected_items:
        raise HTTPException(409, 'This submission was already used for a different material or unit.')
    return saved

class PurchaseOrderApprove(BaseModel):
    unit_price: Optional[float] = Field(default=None, ge=0, allow_inf_nan=False)

class PurchaseOrderSuggest(BaseModel):
    suggested_quantity: float = Field(gt=0, allow_inf_nan=False)
    suggested_date: date
    supplier_notes: Optional[str] = None
    suggested_price: Optional[float] = Field(default=None, ge=0, allow_inf_nan=False)


class ReceiptQuantity(BaseModel):
    quantity: float = Field(gt=0, allow_inf_nan=False)
    receipt_id: UUID
    note: Optional[str] = Field(default=None, max_length=2000)

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
        site_assignment = client.table("site_manager_sites").select("id").eq("project_id", order.get("project_id")).eq("site_manager_id", user["id"]).execute()
        if site_assignment.data:
            return order
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
    order_id = str(uuid.uuid5(uuid.NAMESPACE_URL, f"constructflow:order:{current_user['id']}:{order.project_id}:{order.request_id}")) if order.request_id else None
    if order_id:
        existing = replay_purchase_order(supabase, order, order_id)
        if existing:
            return existing
    if not order.supplier_id:
        raise HTTPException(status_code=422, detail="Choose an assigned supplier")
    from core.access import project_member
    supplier = supabase.table("profiles").select("role,is_approved").eq("id", order.supplier_id).execute().data or []
    if not supplier or supplier[0].get("role") != "supplier" or supplier[0].get("is_approved") is not True:
        raise HTTPException(status_code=422, detail="Supplier must be approved")
    if not project_member(supabase, order.project_id, order.supplier_id, "supplier"):
        raise HTTPException(status_code=422, detail="Supplier is not assigned to this project")
    try:
        po_number = f"PO-{str(uuid.uuid4())[:8].upper()}"

        log = [{
            "role": current_user["role"],
            "action": "created",
            "quantity": order.quantity_ordered,
            "date": order.expected_date.isoformat(),
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
            "expected_date": order.expected_date.isoformat(),
            "status": "Pending Delivery",
            "supplier_notes": json.dumps(log)
        }

        if order.boq_item_id:
            po_data["boq_item_id"] = str(order.boq_item_id)
        if order_id:
            po_data['id'] = order_id
        response = supabase.table("purchase_orders").insert(po_data).execute()

        if not response.data:
            raise HTTPException(status_code=400, detail="Failed to create purchase order")

        # Trigger notification to supplier
        if order.supplier_id:
            try:
                create_notifications([{
                    "user_id": None,
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
        code = str(getattr(e, 'code', ''))
        if code == '23505' and order_id:
            existing = replay_purchase_order(supabase, order, order_id)
            if existing:
                return existing
        raise HTTPException(status_code={'P0001':409,'23514':422,'42501':403}.get(code,500), detail=str(getattr(e, 'message', None) or e)) from e

@router.patch("/{po_id}/approve")
def approve_po(po_id: str, data: PurchaseOrderApprove, current_user: dict = Depends(get_current_user)):
    supabase = client_for_token(current_user["token"])
    order = check_order_access(supabase, po_id, current_user)
    if current_user["role"] not in {"supplier", "super_admin", "pm"}:
        raise HTTPException(status_code=403, detail="Supplier or purchasing manager action required")
    if current_user["role"] == "pm" and order.get("status") != "Suggested":
        raise HTTPException(status_code=403, detail="PMs may only review supplier counter-offers")
    if order.get("status") not in {"Pending Delivery", "Confirmed", "Suggested"}:
        raise HTTPException(status_code=409, detail="This order can no longer be changed")
    if current_user["role"] == "supplier" and order.get("status") == "Suggested":
        raise HTTPException(403,"Project management must accept a supplier counter-offer")
    if order.get("status") == "Confirmed":
        if data.unit_price is None or data.unit_price == order.get("unit_price"):
            return order
        raise HTTPException(409,"Confirmed prices require a new counter-offer")
    try:
        qty = order.get("suggested_quantity") or order.get("quantity_ordered") or 0
        final_price = data.unit_price if data.unit_price is not None else (order.get("suggested_price") if order.get("suggested_price") is not None else order.get("unit_price") or 0)
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
        }).eq("id", po_id).eq("status", order["status"]).execute()

        if not res.data:
            raise HTTPException(status_code=404, detail="PO not found")

        order = res.data[0]

        # Record confirmed supplier unit price to material_prices
        try:
            import datetime
            from services.historical_data_service import record_material_price
            project = supabase.table("projects").select("is_test").eq("id", order["project_id"]).execute().data or []
            if project and project[0].get("is_test"):
                raise ValueError("Test supplier prices are excluded from market evidence")
            record_material_price(
                material=order.get("item_name") or order.get("material") or "Material",
                unit_price=float(final_price or 0),
                supplier_name=current_user.get("full_name") or "Supplier",
                district=None,
                order_date=datetime.date.today().isoformat(),
                purchase_order_id=po_id,
            )
        except Exception:
            pass

        # Notify Admin/Manager
        create_notifications([{
            "user_id": None,
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
    if current_user["role"] not in {"supplier", "super_admin", "pm"}:
        raise HTTPException(status_code=403, detail="Supplier or purchasing manager action required")
    if current_user["role"] == "pm" and order.get("status") != "Suggested":
        raise HTTPException(status_code=403, detail="PMs may only review supplier counter-offers")
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
        }).eq("id", po_id).eq("status", order["status"]).execute()

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
                "user_id": None,
                "project_id": project_id,
                "target_role": "pm",
                "title": "Order Rejected",
                "message": f"Supplier rejected purchase order {order.get('po_number')}",
                "type": "general",
                "is_read": False,
            },
            {
                "user_id": None,
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
    if current_user["role"] not in {"supplier", "super_admin", "pm"}:
        raise HTTPException(status_code=403, detail="Supplier or purchasing manager action required")
    if current_user["role"] == "pm" and order.get("status") != "Suggested":
        raise HTTPException(status_code=403, detail="PMs may only review supplier counter-offers")
    if order.get("status") not in {"Pending Delivery", "Confirmed", "Suggested"}:
        raise HTTPException(status_code=409, detail="This order can no longer be changed")
    try:
        log_json = append_event(order, {
            "role": current_user["role"],
            "user_id": current_user.get("id"),
            "action": "suggested",
            "suggested_quantity": suggestion.suggested_quantity,
            "suggested_date": suggestion.suggested_date.isoformat(),
            "suggested_price": suggestion.suggested_price,
            "note": suggestion.supplier_notes
        })
        res = supabase.table("purchase_orders").update({
            "status": "Suggested",
            "suggested_quantity": suggestion.suggested_quantity,
            "suggested_date": suggestion.suggested_date.isoformat(),
            "suggested_price": suggestion.suggested_price,
            "supplier_notes": log_json
        }).eq("id", po_id).eq("status", order["status"]).execute()

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
                    "user_id": None,
                    "project_id": project_id,
                    "target_role": "pm",
                    "target_user_id": pm_id,
                    "title": "Order Counter-Offer",
                    "message": f"Supplier suggested new terms for PO {order.get('po_number')}: qty {suggestion.suggested_quantity}, date {suggestion.suggested_date}",
                    "type": "general",
                    "is_read": False,
                },
                {
                    "user_id": None,
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
    order = check_order_access(client, po_id, current_user)
    try:
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
                client.table("purchase_orders").update({"supplier_notes": log_json}).eq("id", po_id).eq("status", order_res.data[0]["status"]).execute()
        except Exception as e:
            import logging
            logging.error(f"Failed to append history log for {po_id}: {e}")

        return response_data
    except HTTPException:
        raise
    except Exception as exc:
        code = getattr(exc, "code", None)
        if not code and hasattr(exc, "args") and exc.args and isinstance(exc.args[0], dict):
            code = exc.args[0].get("code")
        err_msg = str(exc).lower()

        status = {"42501": 403, "P0002": 404, "P0001": 409, "23514": 409}.get(code, 500)
        raise HTTPException(status_code=status, detail=str(exc)) from exc


@router.patch("/{po_id}/deliver")
def deliver_po(po_id: str, current_user: dict = Depends(get_current_user)):
    return _transition_order(po_id, current_user, "deliver_purchase_order")


@router.patch("/{po_id}/receive")
def receive_po(po_id: str, current_user: dict = Depends(get_current_user), payload: Optional[ReceiptQuantity] = Body(None)):
    if current_user["role"] not in {"super_admin", "pm", "site_manager"}:
        raise HTTPException(status_code=403, detail="Only the project team can receive goods")
    if isinstance(payload, ReceiptQuantity):
        from api.routes.workflow import transition
        client = client_for_token(current_user["token"])
        check_order_access(client, po_id, current_user)
        return transition(client, "receive_purchase_order_quantity", {
            "p_order_id": po_id, "p_quantity": payload.quantity,
            "p_receipt_id": str(payload.receipt_id), "p_note": payload.note,
        })
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
                    "user_id": None,
                    "project_id": order.get("project_id"),
                    "target_role": "supplier",
                    "target_user_id": order.get("supplier_id"),
                    "title": "LATE MATERIAL ALERT",
                    "message": f"Order {order.get('po_number')} is overdue! Expected: {order.get('expected_date')}",
                    "type": "delay_risk" # Red alert
                })
                # Also notify admin and PM for operational visibility
                notifications.append({
                    "user_id": None,
                    "project_id": order.get("project_id"),
                    "target_role": "super_admin",
                    "title": "LATE MATERIAL ALERT",
                    "message": f"Order {order.get('po_number')} is overdue from supplier! Expected: {order.get('expected_date')}",
                    "type": "delay_risk"
                })
                notifications.append({
                    "user_id": None,
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
