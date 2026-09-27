from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from datetime import datetime
from core.supabase_client import supabase_db
from core.auth import get_current_user

router = APIRouter()

class POCreate(BaseModel):
    supplier_id: str
    material_id: str
    project_id: str
    quantity_ordered: float
    unit_price: float
    expected_date: str

class InvoiceUpload(BaseModel):
    invoice_url: str

@router.get("/")
def get_purchase_orders(user=Depends(get_current_user)):
    try:
        query = supabase_db.table("purchase_orders").select("*, suppliers(company_name, email)")
        
        if user["role"] == "supplier":
            # Find supplier id
            sup_res = supabase_db.table("suppliers").select("supplier_id").eq("user_id", user["id"]).execute()
            if sup_res.data:
                query = query.eq("supplier_id", sup_res.data[0]["supplier_id"])
                
        res = query.execute()
        return {"data": res.data}
    except Exception as e:
        print(f"Get POs error: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")

@router.post("/")
def create_purchase_order(req: POCreate, user=Depends(get_current_user)):
    try:
        total_price = req.quantity_ordered * req.unit_price
        po_number = f"CF-PO-{int(datetime.now().timestamp())}"
        
        # Get supplier name for legacy field
        sup_res = supabase_db.table("suppliers").select("company_name").eq("supplier_id", req.supplier_id).execute()
        supplier_name = sup_res.data[0]["company_name"] if sup_res.data else "Unknown"
        
        # Get material info
        mat_res = supabase_db.table("materials").select("item_name").eq("id", req.material_id).execute()
        item_name = mat_res.data[0]["item_name"] if mat_res.data else "Items"
        items = f"{req.quantity_ordered}x {item_name}"
        
        data = {
            "supplier_id": req.supplier_id,
            "material_id": req.material_id,
            "project_id": req.project_id,
            "quantity_ordered": req.quantity_ordered,
            "unit_price": req.unit_price,
            "total_price": total_price,
            "expected_date": req.expected_date,
            "status": "Pending Delivery",
            "po_number": po_number,
            "supplier_name": supplier_name,
            "items": items
        }
        
        res = supabase_db.table("purchase_orders").insert(data).execute()
        
        # Notify supplier
        supabase_db.table("notifications").insert({
            "title": "New Purchase Order",
            "message": f"PO {po_number} received from ConstructFlow",
            "type": "info",
            "target_role": "supplier" # Note: in prod we should use user_id of the supplier
        }).execute()
        
        return {"message": "PO created successfully", "data": res.data[0]}
    except Exception as e:
        print(f"Create PO error: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")


class SuggestData(BaseModel):
    suggested_quantity: float
    suggested_date: str
    supplier_notes: str

@router.patch("/{po_id}/approve")
def approve_po(po_id: str, user=Depends(get_current_user)):
    try:
        res = supabase_db.table("purchase_orders").update({"status": "Confirmed"}).eq("id", po_id).execute()
        order = res.data[0]
        supabase_db.table("notifications").insert({
            "title": "PO Approved",
            "message": f"PO {order.get('po_number')} confirmed by supplier",
            "type": "success",
            "target_role": "pm"
        }).execute()
        return {"message": "PO approved", "data": order}
    except Exception as e:
        print(f"Approve PO error: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")

@router.patch("/{po_id}/reject")
def reject_po(po_id: str, user=Depends(get_current_user)):
    try:
        res = supabase_db.table("purchase_orders").update({"status": "Rejected"}).eq("id", po_id).execute()
        order = res.data[0]
        supabase_db.table("notifications").insert({
            "title": "PO Rejected",
            "message": f"PO {order.get('po_number')} was rejected by supplier",
            "type": "error",
            "target_role": "pm"
        }).execute()
        return {"message": "PO rejected", "data": order}
    except Exception as e:
        print(f"Reject PO error: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")

@router.patch("/{po_id}/suggest")
def suggest_po(po_id: str, req: SuggestData, user=Depends(get_current_user)):
    try:
        res = supabase_db.table("purchase_orders").update({
            "status": "Suggested",
            "quantity_ordered": req.suggested_quantity,
            "expected_date": req.suggested_date,
            # We don't have supplier_notes in schema, skip it for now or just log it
        }).eq("id", po_id).execute()
        order = res.data[0]
        supabase_db.table("notifications").insert({
            "title": "PO Suggestion",
            "message": f"Supplier suggested changes for PO {order.get('po_number')}",
            "type": "warning",
            "target_role": "pm"
        }).execute()
        return {"message": "Suggestion submitted", "data": order}
    except Exception as e:
        print(f"Suggest PO error: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")

@router.patch("/{po_id}/deliver")
def deliver_po(po_id: str, user=Depends(get_current_user)):
    try:
        res = supabase_db.table("purchase_orders").update({
            "status": "Delivered",
            "actual_delivery": datetime.now().date().isoformat()
        }).eq("id", po_id).execute()
        order = res.data[0]
        supabase_db.table("notifications").insert({
            "title": "Delivery Sent",
            "message": f"PO {order.get('po_number')} has been dispatched by supplier.",
            "type": "info",
            "target_role": "site_manager"
        }).execute()
        return {"message": "PO marked as delivered", "data": order}
    except Exception as e:
        print(f"Deliver PO error: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")

@router.patch("/{po_id}/receive")
def receive_po(po_id: str, user=Depends(get_current_user)):
    try:
        # Call the secure SQL RPC that increments stock
        res = supabase_db.rpc("deliver_purchase_order", {"p_order_id": po_id}).execute()
        # The RPC handles stock increment and notifications. But since the RPC was originally named "deliver_purchase_order",
        # it marks the status as "Delivered" inside the RPC. We want it to be "Received". We will update it.
        # Actually, let's just do it directly here for simplicity and safety, since RPC might have RLS issues if called via service key.
        
        # We will directly update status and stock.
        res = supabase_db.table("purchase_orders").update({"status": "Received"}).eq("id", po_id).execute()
        order = res.data[0]
        
        if order.get("material_id") and order.get("quantity_ordered"):
            mat_res = supabase_db.table("materials").select("global_stock_quantity").eq("id", order["material_id"]).execute()
            if mat_res.data:
                curr_qty = mat_res.data[0].get("global_stock_quantity", 0)
                new_qty = curr_qty + order["quantity_ordered"]
                supabase_db.table("materials").update({"global_stock_quantity": new_qty}).eq("id", order["material_id"]).execute()
                
        supabase_db.table("notifications").insert({
            "title": "Goods Received",
            "message": f"PO {order.get('po_number')} goods have been received on site.",
            "type": "success",
            "target_role": "pm"
        }).execute()
        
        return {"message": "PO received and stock updated", "data": order}
    except Exception as e:
        print(f"Receive PO error: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")
@router.post("/{po_id}/invoice")
def upload_invoice(po_id: str, req: InvoiceUpload, user=Depends(get_current_user)):
    try:
        res = supabase_db.table("purchase_orders").update({"invoice_url": req.invoice_url}).eq("id", po_id).execute()
        
        supabase_db.table("notifications").insert({
            "title": "Invoice Uploaded",
            "message": f"Invoice uploaded for PO {res.data[0].get('po_number')}",
            "type": "info",
            "target_role": "super_admin"
        }).execute()
        
        return {"message": "Invoice uploaded successfully", "data": res.data[0]}
    except Exception as e:
        print(f"Upload invoice error: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")
