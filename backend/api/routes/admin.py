"""
Admin-only user management endpoints.

All endpoints require super_admin role.
These are registered in main.py under /api/admin with the global secure_dependency.
"""
from __future__ import annotations

import os
import secrets
import string
from typing import Any, Dict, List, Optional

import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, EmailStr
from supabase import create_client

from core.config import settings
from core.notification_helper import create_notifications, create_notification
from core.database import client_for_token
from core.security import get_current_user

router = APIRouter(prefix="/admin", tags=["Admin"])


def _require_admin(current_user: dict) -> dict:
    if current_user.get("role") != "super_admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    return current_user


def _admin_supabase():
    """Service-role client — has full table access regardless of RLS."""
    if not settings.SUPABASE_SERVICE_ROLE_KEY:
        raise HTTPException(
            status_code=503,
            detail="Service role key not configured; admin operations unavailable",
        )
    return create_client(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_ROLE_KEY)


# -----------------------------------------------------------------------
# GET /admin/users
# -----------------------------------------------------------------------

@router.get("/users")
def list_users(current_user: dict = Depends(get_current_user)) -> List[Dict]:
    _require_admin(current_user)
    db = _admin_supabase()
    
    # 1. Fetch profiles
    res = db.table("profiles").select(
        "id, email, full_name, role, is_approved, created_at, company_name, contact_number, bio, avatar_url, worker_type"
    ).order("created_at", desc=True).execute()
    profiles = res.data or []
    
    # 2. Fetch auth users to get the raw_user_meta_data (which bypasses the trigger issue)
    auth_users_res = db.auth.admin.list_users()
    auth_users = auth_users_res.users if auth_users_res else []
    
    auth_meta_map = {u.id: u.user_metadata or {} for u in auth_users}
    
    # 3. Merge metadata into profiles
    for p in profiles:
        uid = p["id"]
        meta = auth_meta_map.get(uid, {})
        # Prioritize meta role/name over profiles (since trigger forces 'client')
        if meta.get("role"):
            p["role"] = meta.get("role")
        if meta.get("full_name"):
            p["full_name"] = meta.get("full_name")
            
    return profiles


# -----------------------------------------------------------------------
# POST /admin/users  — create a user and email credentials
# -----------------------------------------------------------------------

class CreateUserRequest(BaseModel):
    email: EmailStr
    full_name: str
    role: str
    send_email: bool = True
    password: Optional[str] = None  # If None, a secure random password is generated
    worker_type: Optional[str] = None
    daily_rate: Optional[float] = None


_ALLOWED_ROLES = {"super_admin", "pm", "site_manager", "worker", "client", "supplier"}


@router.post("/users")
def create_user(
    payload: CreateUserRequest,
    current_user: dict = Depends(get_current_user),
) -> Dict:
    _require_admin(current_user)
    if payload.role not in _ALLOWED_ROLES:
        raise HTTPException(status_code=400, detail=f"Invalid role: {payload.role}")

    password = payload.password or _generate_password()
    admin_db = _admin_supabase()

    # Create auth user
    try:
        auth_res = admin_db.auth.admin.create_user({
            "email": payload.email,
            "password": password,
            "email_confirm": True,
            "user_metadata": {"full_name": payload.full_name},
        })
        new_uid = auth_res.user.id
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Could not create auth user: {e}")

    # Upsert profile
    profile_data = {
        "id": new_uid,
        "email": payload.email,
        "full_name": payload.full_name,
        "role": payload.role,
        "is_approved": payload.role != "supplier",
    }
    if payload.role == "worker":
        profile_data["worker_type"] = payload.worker_type
        profile_data["daily_rate"] = payload.daily_rate

    admin_db.table("profiles").upsert(profile_data).execute()

    # Send credentials email
    if payload.send_email:
        _send_credentials_email(payload.email, payload.full_name, password, payload.role)

    return {
        "id": new_uid,
        "email": payload.email,
        "role": payload.role,
        "password_sent": payload.send_email,
    }


# -----------------------------------------------------------------------
# PATCH /admin/users/{user_id}/role
# -----------------------------------------------------------------------

class SetRoleRequest(BaseModel):
    role: str


@router.patch("/users/{user_id}/role")
def set_user_role(
    user_id: str,
    payload: SetRoleRequest,
    current_user: dict = Depends(get_current_user),
) -> Dict:
    _require_admin(current_user)
    if payload.role not in _ALLOWED_ROLES:
        raise HTTPException(status_code=400, detail=f"Invalid role: {payload.role}")

    db = client_for_token(current_user["token"])
    # Use the SECURITY DEFINER RPC so the role update bypasses RLS safely
    res = db.rpc("admin_set_user_role", {
        "p_user_id": user_id,
        "p_role": payload.role,
    }).execute()
    return res.data or {"ok": True}


# -----------------------------------------------------------------------
# PATCH /admin/users/{user_id}/approve  — approve a supplier
# -----------------------------------------------------------------------

@router.patch("/users/{user_id}/approve")
def approve_supplier(
    user_id: str,
    current_user: dict = Depends(get_current_user),
) -> Dict:
    _require_admin(current_user)
    db = client_for_token(current_user["token"])
    res = db.rpc("admin_approve_supplier", {"p_user_id": user_id}).execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="Supplier not found or already approved")
    return res.data


# -----------------------------------------------------------------------
# DELETE /admin/users/{user_id}
# -----------------------------------------------------------------------

@router.delete("/users/{user_id}")
def delete_user(
    user_id: str,
    current_user: dict = Depends(get_current_user),
) -> Dict:
    _require_admin(current_user)
    admin_db = _admin_supabase()
    
    try:
        # Delete from Supabase Auth (this cascades to profiles if foreign keys are set up correctly)
        # We use the admin api
        res = admin_db.auth.admin.delete_user(user_id)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to delete auth user: {e}")
        
    return {"ok": True, "message": "User deleted successfully"}


# -----------------------------------------------------------------------
# Helpers
# -----------------------------------------------------------------------

def _generate_password(length: int = 14) -> str:
    alphabet = string.ascii_letters + string.digits + "!@#$%^&*"
    return "".join(secrets.choice(alphabet) for _ in range(length))


def _send_credentials_email(email: str, name: str, password: str, role: str):
    resend_key = os.getenv("RESEND_API_KEY", "")
    from_email = os.getenv("RESEND_FROM_EMAIL", "ConstructFlow <noreply@constructflow.lk>")
    if not resend_key:
        return

    portal_map = {
        "super_admin": "Admin Portal",
        "pm": "Internal Team Portal",
        "site_manager": "Internal Team Portal",
        "worker": "Internal Team Portal",
        "client": "Partner Portal",
        "supplier": "Partner Portal",
    }
    portal = portal_map.get(role, "ConstructFlow")

    html = f"""
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background: #F97316; padding: 24px; border-radius: 12px 12px 0 0;">
        <h1 style="color: white; margin: 0;">ConstructFlow</h1>
      </div>
      <div style="padding: 32px; background: white; border: 1px solid #e5e7eb;">
        <h2 style="color: #1F2937;">Welcome to ConstructFlow, {name}!</h2>
        <p style="color: #6B7280;">An account has been created for you on the <strong>{portal}</strong>.</p>
        <div style="background: #F9FAFB; padding: 16px; border-radius: 8px; margin: 16px 0; font-family: monospace;">
          <p style="margin: 4px 0;"><strong>Email:</strong> {email}</p>
          <p style="margin: 4px 0;"><strong>Password:</strong> {password}</p>
          <p style="margin: 4px 0;"><strong>Role:</strong> {role}</p>
        </div>
        <p style="color: #EF4444; font-size: 13px;">
          Please log in and change your password immediately. Do not share these credentials.
        </p>
      </div>
    </div>
    """

    try:
        httpx.post(
            "https://api.resend.com/emails",
            headers={"Authorization": f"Bearer {resend_key}", "Content-Type": "application/json"},
            json={
                "from": from_email,
                "to": [email],
                "subject": f"Your ConstructFlow {portal} credentials",
                "html": html,
            },
            timeout=10,
        )
    except Exception:
        import logging
        logging.exception(f"Failed to send credentials email to {email}")
