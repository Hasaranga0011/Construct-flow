import os
import psycopg2
from dotenv import load_dotenv

load_dotenv('d:/PROJECTS/Construct-flow/backend/.env')
db_url = 'postgres://postgres.zcrhiuajkxxfxanaajiz:X9Y0G1X9Y0G1!@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres'

def migrate():
    conn = psycopg2.connect(db_url)
    conn.autocommit = True
    cursor = conn.cursor()
    
    types_to_add = ['info', 'success', 'warning', 'error', 'order_update']
    for t in types_to_add:
        try:
            cursor.execute(f"ALTER TYPE notification_type ADD VALUE IF NOT EXISTS '{t}';")
            print(f"Added {t}")
        except Exception as e:
            print(f"Error adding {t}: {e}")
            
    cursor.execute("SELECT unnest(enum_range(NULL::notification_type));")
    print("Current values:")
    for row in cursor.fetchall():
        print(row[0])
        
    cursor.close()
    conn.close()

if __name__ == '__main__':
    migrate()
