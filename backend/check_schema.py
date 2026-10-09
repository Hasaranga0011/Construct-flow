import psycopg2, os
from urllib.parse import urlparse
import json

db_url = os.environ.get('SUPABASE_DATABASE_URL', '')
if not db_url:
    for line in open('d:/PROJECTS/Construct-flow/backend/.env'):
        if line.startswith('SUPABASE_DATABASE_URL='):
            db_url = line.strip().split('=', 1)[1]
            break

parsed = urlparse(db_url.replace('"', ''))
try:
    conn = psycopg2.connect(
        dbname=parsed.path[1:],
        user=parsed.username,
        password=parsed.password,
        host=parsed.hostname,
        port=parsed.port
    )
    cur = conn.cursor()
    
    cur.execute('''
        SELECT column_name, data_type 
        FROM information_schema.columns 
        WHERE table_name = 'purchase_orders' 
        ORDER BY ordinal_position;
    ''')
    po_cols = cur.fetchall()
    print('purchase_orders:', json.dumps(po_cols))
    
    cur.execute('''
        SELECT column_name, data_type 
        FROM information_schema.columns 
        WHERE table_name = 'materials' 
        ORDER BY ordinal_position;
    ''')
    mat_cols = cur.fetchall()
    print('materials:', json.dumps(mat_cols))
    
except Exception as e:
    print('Error:', e)
