import sys
from dotenv import load_dotenv
load_dotenv('.env')

sys.path.append('d:/PROJECTS/Construct-flow/backend')
from core.database import client_for_token
from core.config import settings

client = client_for_token(settings.SUPABASE_SERVICE_ROLE_KEY)

# Use postgrest to query information schema? Postgrest might not expose information_schema.
# Wait, I can try inserting without user_id to see if it succeeds now. Maybe my python script had a typo earlier?
try:
    client.table('notifications').insert({
        'project_id': '92bcdb11-8ea3-40dd-97ff-00d7e7981297',
        'title': 'Test 2',
        'message': 'Test 2',
        'type': 'general',
        'target_role': 'pm'
    }).execute()
    print('Insert without user_id succeeded!')
except Exception as e:
    print('Insert without user_id failed:', e)
