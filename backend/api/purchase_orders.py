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

@router.patch("/{po_id}/confirm")
def confirm_po(po_id: str, user=Depends(get_current_user)):
    try:
        res = supabase_db.table("purchase_orders").update({"status": "Confirmed"}).eq("id", po_id).execute()
        
        # Notify PM
        supabase_db.table("notifications").insert({
            "title": "PO Confirmed",
            "message": f"PO {res.data[0].get('po_number')} has been confirmed by supplier",
            "type": "success",
            "target_role": "pm"
        }).execute()
        
        return {"message": "PO confirmed", "data": res.data[0]}
    except Exception as e:
        print(f"Confirm PO error: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")

@router.patch("/{po_id}/deliver")
def deliver_po(po_id: str, user=Depends(get_current_user)):
    try:
        res = supabase_db.table("purchase_orders").update({
            "status": "Delivered",
            "actual_delivery": datetime.now().date().isoformat()
        }).eq("id", po_id).execute()
        
        order = res.data[0]
        
        # Update material stock
        if order.get("material_id") and order.get("quantity_ordered"):
            mat_res = supabase_db.table("materials").select("global_stock_quantity").eq("id", order["material_id"]).execute()
            if mat_res.data:
                curr_qty = mat_res.data[0].get("global_stock_quantity", 0)
                new_qty = curr_qty + order["quantity_ordered"]
                supabase_db.table("materials").update({"global_stock_quantity": new_qty}).eq("id", order["material_id"]).execute()
                
        # Notify PM and Site Manager
        supabase_db.table("notifications").insert([
            {
                "title": "Delivery Received",
                "message": f"PO {order.get('po_number')} delivered.",
                "type": "success",
                "target_role": "pm"
            },
            {
                "title": "Delivery Received",
                "message": f"PO {order.get('po_number')} delivered.",
                "type": "success",
                "target_role": "site_manager"
            }
        ]).execute()
        
        return {"message": "PO marked as delivered", "data": order}
    except Exception as e:
        print(f"Deliver PO error: {e}")
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
