from supabase import create_client, Client
from .config import settings

supabase: Client = create_client(settings.SUPABASE_URL, settings.SUPABASE_KEY)

def get_auth_client(request) -> Client:
    # Create a new client authenticated with the user's JWT
    auth_header = request.headers.get("Authorization")
    if not auth_header:
        return supabase # fallback to anon
    
    token = auth_header.replace("Bearer ", "")
    
    from supabase import ClientOptions
    options = ClientOptions(headers={"Authorization": f"Bearer {token}"})
    return create_client(settings.SUPABASE_URL, settings.SUPABASE_KEY, options=options)
