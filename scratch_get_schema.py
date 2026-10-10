import os
import requests

supabase_url = "https://zcrhiuajkxxfxanaajiz.supabase.co"
supabase_key = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpjcmhpdWFqa3h4ZnhhbmFhaml6Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MTUzMzk5MCwiZXhwIjoyMDk3MTA5OTkwfQ.sym2dVtRY4dwhxrN5zQuo5x8iDeX9XQe5K1VHS1F-g0"

res = requests.get(f"{supabase_url}/rest/v1/", headers={"apikey": supabase_key})
schema = res.json()
print([schema['definitions']['notifications']['properties']['type']])
