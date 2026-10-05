import sys
from dotenv import load_dotenv
load_dotenv('.env')

sys.path.append('d:/PROJECTS/Construct-flow/backend')
from core.database import client_for_token
from core.config import settings
# We don't have exec_sql. I will just do a test insert to see if project_id or supplier_id complain about type.
