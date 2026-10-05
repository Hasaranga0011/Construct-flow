import sys
from dotenv import load_dotenv
load_dotenv('.env')

sys.path.append('d:/PROJECTS/Construct-flow/backend')
from core.database import client_for_token
from core.config import settings

client = client_for_token(settings.SUPABASE_SERVICE_ROLE_KEY)
# Just do a test insert
try:
    client.table('notifications').insert({
        'user_id': '11111111-1111-1111-1111-111111111111',
        'project_id': '92bcdb11-8ea3-40dd-97ff-00d7e7981297',
        'title': 'Test',
        'message': 'Test',
        'type': 'general',
        'target_role': 'pm'
    }).execute()
    print('Insert succeeded with dummy user_id')
except Exception as e:
    print('Insert failed:', e)
