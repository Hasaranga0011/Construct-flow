from supabase import create_client, Client
from core.config import settings

def get_supabase_client() -> Client:
    url: str = settings.SUPABASE_URL
    key: str = settings.SUPABASE_KEY
    if not url or not key:
        print("Warning: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is not set.")
    try:
        supabase: Client = create_client(url, key)
        return supabase
    except Exception as e:
        print(f"Failed to initialize Supabase client: {e}")
        raise e

supabase_db = get_supabase_client()
