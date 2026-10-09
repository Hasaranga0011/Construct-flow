import os, json, urllib.request

url: str = os.environ.get('SUPABASE_URL')
key: str = os.environ.get('SUPABASE_SERVICE_ROLE_KEY')
if not url:
    for line in open('d:/PROJECTS/Construct-flow/backend/.env'):
        if line.startswith('SUPABASE_URL='): url = line.strip().split('=', 1)[1]
        if line.startswith('SUPABASE_SERVICE_ROLE_KEY='): key = line.strip().split('=', 1)[1]

req = urllib.request.Request(f'{url}/rest/v1/')
req.add_header('apikey', key)
req.add_header('Authorization', f'Bearer {key}')
with urllib.request.urlopen(req) as response:
    schema = json.loads(response.read())

for table in ['purchase_orders', 'materials']:
    print(f'--- {table} ---')
    props = schema.get('definitions', {}).get(table, {}).get('properties', {})
    for col, details in props.items():
        print(f"{col}: {details.get('type')}")
