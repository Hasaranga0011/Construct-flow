import os
import requests
from dotenv import load_dotenv

load_dotenv()
supabase_url = os.environ.get("SUPABASE_URL")
supabase_key = os.environ.get("SUPABASE_KEY")

url = f"{supabase_url}/rest/v1/purchase_orders?select=*&limit=1"
headers = {
    "apikey": supabase_key,
    "Authorization": f"Bearer {supabase_key}"
}
response = requests.get(url, headers=headers)
print("Status:", response.status_code)
if response.status_code == 200:
    data = response.json()
    if data:
        print("Columns:", list(data[0].keys()))
    else:
        print("No data, but we can try an OPTIONS request to get schema")
        options = requests.options(url, headers=headers)
        print("OPTIONS headers:", options.headers)
else:
    print("Error:", response.text)
