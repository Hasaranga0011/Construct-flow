from fastapi import Depends, HTTPException, Security
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from .database import supabase, client_for_token
from typing import Optional

security = HTTPBearer()

def normalize_role(value):
    role = str(value or "").strip().lower().replace(" ", "_")
    return {"admin": "super_admin", "superadmin": "super_admin", "manager": "pm", "project_manager": "pm"}.get(role, role)


import time

_TOKEN_CACHE = {}
_TOKEN_CACHE_TTL = 60  # seconds

def get_current_user(credentials: HTTPAuthorizationCredentials = Security(security)):
    token = credentials.credentials
    now = time.time()
    cached = _TOKEN_CACHE.get(token)
    if cached and (now - cached["cached_at"]) < _TOKEN_CACHE_TTL:
        return cached["user"]

    try:
        # Validate the token directly with Supabase
        user_response = supabase.auth.get_user(token)
        if not user_response.user:
             raise HTTPException(status_code=401, detail="Invalid authentication credentials")
             
        try:
            # Authorization comes from the protected profile, never editable user metadata.
            profile_response = client_for_token(token).table("profiles").select("role").eq("id", user_response.user.id).single().execute()
            role = normalize_role(profile_response.data.get("role") if profile_response.data else None)
        except Exception as profile_err:
            raise HTTPException(status_code=403, detail="An authorized profile is required") from profile_err
        if role not in {"super_admin", "pm", "site_manager", "worker", "client", "supplier"}:
            raise HTTPException(status_code=403, detail="An authorized profile is required")
        
        user_data = {
            "id": user_response.user.id,
            "email": user_response.user.email,
            "role": role,
            "token": token
        }
        if len(_TOKEN_CACHE) > 500:
            _TOKEN_CACHE.clear()
        _TOKEN_CACHE[token] = {"user": user_data, "cached_at": now}
        return user_data
    except HTTPException:
        raise
    except Exception as e:
        print("Auth Error:", e)
        raise HTTPException(status_code=401, detail="Could not validate credentials")

def require_admin(current_user: dict = Depends(get_current_user)):
    if normalize_role(current_user["role"]) != "super_admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    return current_user
    
def require_manager_or_admin(current_user: dict = Depends(get_current_user)):
    if normalize_role(current_user["role"]) not in ["super_admin", "pm"]:
        raise HTTPException(status_code=403, detail="Not enough privileges")
    return current_user
