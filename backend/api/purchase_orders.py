from core.notification_helper import create_notifications
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
            sup_res = supabase_db.table("suppliers").select("supplier_id").eq("user_id", user["id"])
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
        create_notifications([{
            "title": "New Purchase Order",
            "message": f"PO {po_number} received from ConstructFlow",
            "type": "general",
            "target_role": "supplier" # Note: in prod we should use user_id of the supplier
        }])
        
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
        create_notifications([{
            "title": "PO Approved",
            "message": f"PO {order.get('po_number')} confirmed by supplier",
            "type": "general",
            "target_role": "pm"
        }])
        return {"message": "PO approved", "data": order}
    except Exception as e:
        print(f"Approve PO error: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")

@router.patch("/{po_id}/reject")
def reject_po(po_id: str, user=Depends(get_current_user)):
    try:
        res = supabase_db.table("purchase_orders").update({"status": "Rejected"}).eq("id", po_id).execute()
        order = res.data[0]
        create_notifications([{
            "title": "PO Rejected",
            "message": f"PO {order.get('po_number')} was rejected by supplier",
            "type": "general",
            "target_role": "pm"
        }])
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
        create_notifications([{
            "title": "PO Suggestion",
            "message": f"Supplier suggested changes for PO {order.get('po_number')}",
            "type": "general",
            "target_role": "pm"
        }])
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
        create_notifications([{
            "title": "Delivery Sent",
            "message": f"PO {order.get('po_number')} has been dispatched by supplier.",
            "type": "general",
            "target_role": "site_manager"
        }])
        return {"message": "PO marked as delivered", "data": order}
    except Exception as e:
        print(f"Deliver PO error: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")

@router.patch("/{po_id}/receive")
def receive_po(po_id: str, user=Depends(get_current_user)):
    try:
        # The RPC handled stock increment and notifications but was broken due to enum. 
        # We will directly update status and stock.
        
        # We will directly update status and stock.
        res = supabase_db.table("purchase_orders").update({"status": "Received"}).eq("id", po_id).execute()
        order = res.data[0]
        
        if order.get("material_id") and order.get("quantity_ordered"):
            mat_res = supabase_db.table("materials").select("global_stock_quantity").eq("id", order["material_id"])
            if mat_res.data:
                curr_qty = mat_res.data[0].get("global_stock_quantity", 0)
                new_qty = curr_qty + order["quantity_ordered"]
                supabase_db.table("materials").update({"global_stock_quantity": new_qty}).eq("id", order["material_id"])
                
        create_notifications([{
            "title": "Goods Received",
            "message": f"PO {order.get('po_number')} goods have been received on site.",
            "type": "general",
            "target_role": "pm"
        }])
        
        return {"message": "PO received and stock updated", "data": order}
    except Exception as e:
        print(f"Receive PO error: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")
@router.post("/{po_id}/invoice")
def upload_invoice(po_id: str, req: InvoiceUpload, user=Depends(get_current_user)):
    try:
        res = supabase_db.table("purchase_orders").update({"invoice_url": req.invoice_url}).eq("id", po_id).execute()
        
        create_notifications([{
            "title": "Invoice Uploaded",
            "message": f"Invoice uploaded for PO {res.data[0].get('po_number')}",
            "type": "general",
            "target_role": "super_admin"
        }])
        
        return {"message": "Invoice uploaded successfully", "data": res.data[0]}
    except Exception as e:
        print(f"Upload invoice error: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")
