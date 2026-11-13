import time
from supabase import create_client, Client
from .config import settings
from fastapi import HTTPException, Request
from supabase import ClientOptions

supabase: Client = create_client(settings.SUPABASE_URL, settings.SUPABASE_KEY)
_service_client: Client | None = None
_TOKEN_CLIENT_CACHE: dict[str, tuple[Client, float]] = {}
_TOKEN_CLIENT_TTL = 600  # 10 minutes
_TOKEN_CLIENT_MAX = 256


def client_for_token(token: str) -> Client:
    now = time.time()
    cached = _TOKEN_CLIENT_CACHE.get(token)
    if cached and (now - cached[1]) < _TOKEN_CLIENT_TTL:
        return cached[0]

    client = create_client(
        settings.SUPABASE_URL,
        settings.SUPABASE_KEY,
        options=ClientOptions(
            headers={"Authorization": f"Bearer {token}"},
            persist_session=False,
            auto_refresh_token=False,
        ),
    )
    if len(_TOKEN_CLIENT_CACHE) >= _TOKEN_CLIENT_MAX:
        _TOKEN_CLIENT_CACHE.clear()
    _TOKEN_CLIENT_CACHE[token] = (client, now)
    return client

def get_auth_client(request: Request) -> Client:
    # Create a new client authenticated with the user's JWT
    auth_header = request.headers.get("Authorization")
    if not auth_header:
        raise HTTPException(status_code=401, detail="Authentication required")
    
    scheme, _, token = auth_header.partition(" ")
    if scheme.lower() != "bearer" or not token.strip():
        raise HTTPException(status_code=401, detail="Authentication required")
    
    return client_for_token(token.strip())

def get_service_client() -> Client:
    global _service_client
    if _service_client is None:
        _service_client = create_client(
            settings.SUPABASE_URL,
            settings.SUPABASE_SERVICE_ROLE_KEY,
            options=ClientOptions(persist_session=False, auto_refresh_token=False),
        )
    return _service_client
