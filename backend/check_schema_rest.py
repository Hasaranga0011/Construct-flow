import os, json
from supabase import create_client, Client

url: str = os.environ.get("SUPABASE_URL")
key: str = os.environ.get("SUPABASE_KEY")
if not url:
    for line in open('d:/PROJECTS/Construct-flow/backend/.env'):
        if line.startswith('SUPABASE_URL='): url = line.strip().split('=', 1)[1]
        if line.startswith('SUPABASE_KEY='): key = line.strip().split('=', 1)[1]

supabase: Client = create_client(url, key)

try:
    res = supabase.table('purchase_orders').select('*').limit(1).execute()
    print("Columns:", list(res.data[0].keys()) if res.data else "No rows")
except Exception as e:
    print(e)
