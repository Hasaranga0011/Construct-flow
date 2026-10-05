import os
from supabase import create_client
from core.config import settings

def check():
    supabase = create_client(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_ROLE_KEY)
    res = supabase.table("purchase_orders").select("id, po_number, project_id, supplier_id").execute()
    print("ORDERS:", res.data)
    
check()
