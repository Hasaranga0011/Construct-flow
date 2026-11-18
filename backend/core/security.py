from fastapi import Depends, HTTPException, Security
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from .database import supabase, client_for_token
from typing import Optional
import httpx

security = HTTPBearer()

def normalize_role(value):
    role = str(value or "").strip().lower().replace(" ", "_")
    return {"admin": "super_admin", "superadmin": "super_admin", "manager": "pm", "project_manager": "pm"}.get(role, role)


import time

_TOKEN_CACHE = {}
_TOKEN_CACHE_TTL = 300  # seconds


def _decode_jwt_claims(token: str) -> dict:
    import base64
    import json
    parts = token.split(".")
    if len(parts) != 3:
        return {}
    payload_b64 = parts[1]
    padding = "=" * (-len(payload_b64) % 4)
    return json.loads(base64.urlsafe_b64decode(payload_b64 + padding).decode("utf-8"))


def _fetch_auth_user(token: str):
    try:
        return supabase.auth.get_user(token)
    except (httpx.HTTPError, OSError, TimeoutError):
        # Retry once with a fresh client if the shared keep-alive socket was reset
        return client_for_token(token).auth.get_user(token)


def get_current_user(credentials: HTTPAuthorizationCredentials = Security(security)):
    token = (credentials.credentials or "").strip()
    if not token:
        raise HTTPException(status_code=401, detail="Could not validate credentials")
    try:
        # Validate the token directly with Supabase
        user_response = _fetch_auth_user(token)
        if not user_response.user:
             raise HTTPException(status_code=401, detail="Invalid authentication credentials")

        try:
            # Authorization comes from the protected profile, never editable user metadata.
            profile_response = client_for_token(token).table("profiles").select("role,is_approved").eq("id", user_response.user.id).single().execute()
            role = normalize_role(profile_response.data.get("role") if profile_response.data else None)
        except Exception as profile_err:
            raise HTTPException(status_code=403, detail="An authorized profile is required") from profile_err
        if role not in {"super_admin", "pm", "site_manager", "worker", "client", "supplier"}:
            raise HTTPException(status_code=403, detail="An authorized profile is required")
        if profile_response.data.get("is_approved") is not True:
            raise HTTPException(status_code=403, detail="Your account is pending administrator approval")

        user_data = {
            "id": user_response.user.id,
            "email": user_response.user.email,
            "role": role,
            "token": token
        }
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


def get_authenticated_identity(credentials: HTTPAuthorizationCredentials = Security(security)):
    """Validate identity for onboarding before a role has been approved."""
    try:
        response = _fetch_auth_user(credentials.credentials)
        if not response.user:
            raise ValueError("Missing user")
        return {"id": response.user.id, "email": response.user.email}
    except Exception as exc:
        raise HTTPException(status_code=401, detail="Invalid authentication credentials") from exc
