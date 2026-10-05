import sys
from dotenv import load_dotenv
load_dotenv('.env')

sys.path.append('d:/PROJECTS/Construct-flow/backend')
from core.database import client_for_token
from core.config import settings

client = client_for_token(settings.SUPABASE_SERVICE_ROLE_KEY)
res = client.table('notifications').select('type').limit(10).execute()
print(set([r['type'] for r in res.data]))
