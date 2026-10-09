import os
from dotenv import load_dotenv
from supabase import create_client
import sys

load_dotenv('backend/.env')
url = os.environ.get('SUPABASE_URL')
key = os.environ.get('SUPABASE_KEY')

supabase = create_client(url, key)
try:
    res = supabase.table('salary_slips').select('non_existent_column_123').limit(1).execute()
except Exception as e:
    print("ERROR CAUGHT:")
    print(str(e))
