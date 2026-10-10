import os
import psycopg2
from urllib.parse import urlparse

with open('backend/.env', 'r') as f:
    for line in f:
        if line.startswith('SUPABASE_DB_URL='):
            db_url = line.strip().split('=', 1)[1]

conn = psycopg2.connect(db_url)
cur = conn.cursor()

cur.execute("""
SELECT enumlabel
FROM pg_enum
JOIN pg_type ON pg_enum.enumtypid = pg_type.oid
WHERE pg_type.typname = 'notification_type';
""")
rows = cur.fetchall()
print("Allowed notification_type values:", [r[0] for r in rows])

cur.close()
conn.close()
