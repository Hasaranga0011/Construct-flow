from core.database import supabase

try:
    res = supabase.table('milestones').select('*').limit(1).execute()
    print("Columns:", list(res.data[0].keys()) if res.data else "No rows. Need to check via POST or insert.")
except Exception as e:
    print("Error:", e)
