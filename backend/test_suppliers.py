import os, json, urllib.request

url = os.environ.get('SUPABASE_URL')
key = os.environ.get('SUPABASE_SERVICE_ROLE_KEY')
if not url:
    for line in open('d:/PROJECTS/Construct-flow/backend/.env'):
        if line.startswith('SUPABASE_URL='): url = line.strip().split('=', 1)[1]
        if line.startswith('SUPABASE_SERVICE_ROLE_KEY='): key = line.strip().split('=', 1)[1]

def req(path):
    r = urllib.request.Request(f'{url}/rest/v1/{path}')
    r.add_header('apikey', key)
    r.add_header('Authorization', f'Bearer {key}')
    with urllib.request.urlopen(r) as response:
        return json.loads(response.read())

print("Testing all suppliers...")
suppliers = req("profiles?role=eq.supplier&select=id,full_name")
print(f"Found {len(suppliers)} suppliers.")

for sup in suppliers:
    sid = sup['id']
    name = sup['full_name']
    
    # 1. Test Details Page Query
    # supabase.from('profiles').select('*').eq('id', id).single()
    detail = req(f"profiles?id=eq.{sid}&select=*")
    if len(detail) != 1:
        print(f"FAIL: Supplier Details not found for {name} ({sid})")
        exit(1)
        
    # 2. Test Orders Page Query
    # supabase.from('purchase_orders').select('id, po_number, material_id, quantity_ordered, total_price, status, expected_date, created_at, items, projects(name)').eq('supplier_id', id)
    # The frontend does: select('id, po_number, material_id, quantity_ordered, total_price, status, expected_date, created_at, items, projects(name)')
    try:
        ords = req(f"purchase_orders?supplier_id=eq.{sid}&select=id,po_number,material_id,quantity_ordered,total_price,status,expected_date,created_at,items,projects(name)")
    except Exception as e:
        print(f"FAIL: Orders query failed for {name} ({sid}) with error: {e}")
        exit(1)
        
    print(f"OK: {name} ({sid}) - {len(ords)} orders")

print("All suppliers verified successfully!")
