import os
from supabase import create_client

url = os.environ.get("SUPABASE_URL")
key = os.environ.get("SUPABASE_KEY")
supabase = create_client(url, key)

try:
    res = supabase.table("purchase_orders").insert({}).execute()
    print(res)
except Exception as e:
    print("Error:", e)
