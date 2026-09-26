from supabase import create_client, Client
from .config import settings
from fastapi import HTTPException, Request
from supabase import ClientOptions

supabase: Client = create_client(settings.SUPABASE_URL, settings.SUPABASE_KEY)

def client_for_token(token: str) -> Client:
    return create_client(settings.SUPABASE_URL, settings.SUPABASE_KEY,
                         options=ClientOptions(headers={"Authorization": f"Bearer {token}"},
                                               persist_session=False, auto_refresh_token=False))

def get_auth_client(request: Request) -> Client:
    # Create a new client authenticated with the user's JWT
    auth_header = request.headers.get("Authorization")
    if not auth_header:
        raise HTTPException(status_code=401, detail="Authentication required")
    
    scheme, _, token = auth_header.partition(" ")
    if scheme.lower() != "bearer" or not token.strip():
        raise HTTPException(status_code=401, detail="Authentication required")
    
    return client_for_token(token.strip())
