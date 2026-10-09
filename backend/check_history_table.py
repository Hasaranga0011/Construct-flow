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
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public' AND table_name LIKE '%order%'
    ''')
    tables = cur.fetchall()
    print('Tables:', json.dumps(tables))
except Exception as e:
    print('Error:', e)
