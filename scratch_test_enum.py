import os
from supabase import create_client

supabase_url = "https://zcrhiuajkxxfxanaajiz.supabase.co"
supabase_key = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpjcmhpdWFqa3h4ZnhhbmFhaml6Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MTUzMzk5MCwiZXhwIjoyMDk3MTA5OTkwfQ.sym2dVtRY4dwhxrN5zQuo5x8iDeX9XQe5K1VHS1F-g0"

client = create_client(supabase_url, supabase_key)

for test_type in ["INFO", "info", "system", "message", "alert", "Alert", "SUCCESS", "success"]:
    try:
        res = client.table('notifications').insert({
            "type": test_type,
            "title": "New Inquiry: test",
            "message": "test",
            "target_role": "admin",
            "is_read": False,
            "sent_via": "in_app"
        }).execute()
        print(f"SUCCESS with '{test_type}'!")
        break
    except Exception as e:
        print(f"Failed with '{test_type}': {e}")
