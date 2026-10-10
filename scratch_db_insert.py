import os
from supabase import create_client

with open('backend/.env', 'r') as f:
    for line in f:
        if line.startswith('SUPABASE_URL='):
            supabase_url = line.strip().split('=', 1)[1]
        elif line.startswith('SUPABASE_SERVICE_ROLE_KEY='):
            supabase_key = line.strip().split('=', 1)[1]

client = create_client(supabase_url, supabase_key)

try:
    res = client.table('notifications').insert({
        "type": "info",
        "title": "New Inquiry: test",
        "message": "test",
        "target_role": "admin",
        "is_read": False,
        "sent_via": "in_app"
    }).execute()
    print("Success:", res)
except Exception as e:
    print("Error:", e)
