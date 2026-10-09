import os
from dotenv import load_dotenv
from supabase import create_client

load_dotenv('backend/.env')
url = os.environ.get('SUPABASE_URL')
key = os.environ.get('SUPABASE_KEY')

supabase = create_client(url, key)
res = supabase.table('salary_slips').select('*').limit(1).execute()
if res.data:
    print(list(res.data[0].keys()))
else:
    print("Table exists but is empty. Trying to insert a dummy row to get schema... actually no, let me just try getting columns from postgrest by fetching with a limit=0")
    # Actually supabase-py doesn't expose headers easily for the OPTIONS method, so let's just use requests to send an OPTIONS request to the REST API.
    import requests
    headers = {
        'apikey': key,
        'Authorization': f'Bearer {key}',
    }
    # To get column definitions from postgrest, we can just GET with limit=0 and Accept: application/json
    r = requests.get(f"{url}/rest/v1/salary_slips?limit=0", headers=headers)
    print("HTTP STATUS:", r.status_code)
    print("RESPONSE:", r.text)
