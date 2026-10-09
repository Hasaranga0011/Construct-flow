import os
from supabase import create_client, ClientOptions

SUPABASE_URL = os.getenv("SUPABASE_URL", "https://zcrhiuajkxxfxanaajiz.supabase.co")
# Try to get service role key from env or use the literal from .env
SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpjcmhpdWFqa3h4ZnhhbmFhaml6Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MTUzMzk5MCwiZXhwIjoyMDk3MTA5OTkwfQ.sym2dVtRY4dwhxrN5zQuo5x8iDeX9XQe5K1VHS1F-g0")

supabase_admin = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, options=ClientOptions(persist_session=False, auto_refresh_token=False))

queries = [
    "ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'info'",
    "ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'success'",
    "ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'warning'",
    "ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'error'"
]

for query in queries:
    try:
        # Some custom run_query implementations use named parameter, some use an object. 
        # Let's try passing the query directly or as an object.
        res = supabase_admin.rpc('run_query', {'query': query}).execute()
        print(f'Success for {query}: {res.data}')
    except Exception as e:
        print(f'Error for {query}: {e}')
