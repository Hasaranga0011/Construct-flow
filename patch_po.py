import re

filepath = 'backend/api/purchase_orders.py'

new_endpoints = """
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
"""

with open(filepath, 'r') as f:
    content = f.read()

# Replace the old confirm and deliver with the new ones
content = re.sub(r'@router\.patch\("/\{po_id\}/confirm"\).*?(?=@router\.post\("/\{po_id\}/invoice"\))', new_endpoints, content, flags=re.DOTALL)

with open(filepath, 'w') as f:
    f.write(content)
