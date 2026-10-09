import psycopg2
import os
from dotenv import load_dotenv

load_dotenv('backend/.env')
url = os.environ.get('DATABASE_URL')
if not url:
    print('No DATABASE_URL found')
else:
    conn = psycopg2.connect(url)
    cur = conn.cursor()
    cur.execute("SELECT column_name, data_type FROM information_schema.columns WHERE table_name='salary_slips';")
    print(cur.fetchall())
