"""
Admin-only user management endpoints.

All endpoints require super_admin role.
These are registered in main.py under /api/admin with the global secure_dependency.
"""
from __future__ import annotations

import logging
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
from services.email_service import send_credentials_welcome_email

logger = logging.getLogger("constructflow.admin")

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
    client = create_client(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_ROLE_KEY)
    if hasattr(client, "auth") and hasattr(client.auth, "_http_client"):
        client.auth._http_client.timeout = httpx.Timeout(25.0)
    return client


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

from core.phone import normalize_sri_lankan_phone
from core.roles import (
    normalize_role,
    is_role_match,
    ALL_CANONICAL_ROLES,
    ROLE_SUPER_ADMIN,
    ROLE_PM,
    ROLE_SITE_MANAGER,
    ROLE_CLIENT,
    ROLE_WORKER,
    ROLE_SUPPLIER,
)

_ALLOWED_ROLES = {
    ROLE_SUPER_ADMIN,
    ROLE_PM,
    ROLE_SITE_MANAGER,
    ROLE_CLIENT,
    ROLE_WORKER,
    ROLE_SUPPLIER,
}


class CreateUserRequest(BaseModel):
    email: EmailStr
    full_name: str
    role: str
    contact_number: Optional[str] = None
    send_email: bool = True
    password: Optional[str] = None  # If None, a secure random password is generated
    worker_type: Optional[str] = None
    daily_rate: Optional[float] = None


@router.post("/users")
def create_user(
    payload: CreateUserRequest,
    current_user: dict = Depends(get_current_user),
) -> Dict:
    _require_admin(current_user)
    canonical_role = normalize_role(payload.role)
    if not canonical_role or canonical_role not in ALL_CANONICAL_ROLES or canonical_role == "pending":
        raise HTTPException(status_code=400, detail=f"Invalid role: {payload.role}")

    # Validate phone if provided
    normalized_phone = None
    if payload.contact_number:
        try:
            normalized_phone = normalize_sri_lankan_phone(payload.contact_number)
        except ValueError as ve:
            raise HTTPException(status_code=422, detail=str(ve))

    password = payload.password or _generate_password()
    admin_db = _admin_supabase()
    email_delivery = None
    new_uid = None
    invite_link = None

    user_meta = {"full_name": payload.full_name, "role": canonical_role}
    if normalized_phone:
        user_meta["contact_number"] = normalized_phone

    # 1. User Creation & Email Dispatch via Supabase
    if payload.send_email:
        try:
            # Native Supabase invitation sends real email directly through Supabase Auth mailer
            invite_res = admin_db.auth.admin.invite_user_by_email(
                payload.email,
                options={
                    "data": user_meta,
                    "redirect_to": f"{getattr(settings, 'FRONTEND_URL', 'http://localhost:8082')}/reset-password"
                }
            )
            new_uid = invite_res.user.id
            if password:
                admin_db.auth.admin.update_user_by_id(new_uid, {
                    "password": password,
                    "app_metadata": {"role": canonical_role}
                })
            email_delivery = {
                "success": True,
                "sent_to_inbox": True,
                "provider": "supabase",
                "message": f"Invitation email delivered to {payload.email} via Supabase Auth"
            }
        except Exception as invite_err:
            err_msg = str(invite_err)
            # If user already registered, send password reset / access email via Supabase
            if "already" in err_msg.lower() or "registered" in err_msg.lower():
                try:
                    users_list = admin_db.auth.admin.list_users()
                    matching = next((u for u in users_list if getattr(u, 'email', None) == payload.email), None)
                    if matching:
                        new_uid = matching.id
                        admin_db.auth.admin.update_user_by_id(new_uid, {
                            "password": password,
                            "app_metadata": {"role": canonical_role},
                            "user_metadata": user_meta
                        })
                    admin_db.auth.reset_password_for_email(
                        payload.email,
                        {"redirect_to": f"{getattr(settings, 'FRONTEND_URL', 'http://localhost:8082')}/reset-password"}
                    )
                    email_delivery = {
                        "success": True,
                        "sent_to_inbox": True,
                        "provider": "supabase",
                        "message": f"User access email delivered to {payload.email} via Supabase Auth"
                    }
                except Exception:
                    pass

            # If Supabase email mailer fails or rate limits, generate direct Supabase action link
            if not new_uid:
                try:
                    gen_res = admin_db.auth.admin.generate_link({
                        "type": "invite",
                        "email": payload.email,
                        "options": {
                            "data": user_meta,
                            "redirect_to": f"{getattr(settings, 'FRONTEND_URL', 'http://localhost:8082')}/reset-password"
                        }
                    })
                    new_uid = gen_res.user.id
                    if hasattr(gen_res, "properties") and hasattr(gen_res.properties, "action_link"):
                        invite_link = gen_res.properties.action_link
                    elif hasattr(gen_res, "action_link"):
                        invite_link = gen_res.action_link
                    elif isinstance(gen_res, dict):
                        invite_link = gen_res.get("action_link") or (gen_res.get("properties") or {}).get("action_link")

                    if password and new_uid:
                        admin_db.auth.admin.update_user_by_id(new_uid, {
                            "password": password,
                            "app_metadata": {"role": canonical_role}
                        })
                except Exception as gen_err:
                    logger.warning(f"generate_link failed: {gen_err}")

            # Fallback to create_user if new_uid is still not created
            if not new_uid:
                try:
                    auth_res = admin_db.auth.admin.create_user({
                        "email": payload.email,
                        "password": password,
                        "email_confirm": True,
                        "app_metadata": {"role": canonical_role},
                        "user_metadata": user_meta,
                    })
                    new_uid = auth_res.user.id
                except Exception as create_err:
                    raise HTTPException(status_code=400, detail=f"Could not create auth user: {create_err}")

            # Attempt fallback email dispatch if SMTP or Resend configured
            fallback_res = _send_credentials_email(payload.email, payload.full_name, password, canonical_role)
            if fallback_res.get("sent_to_inbox"):
                email_delivery = fallback_res
            else:
                is_rate_limited = "rate limit" in err_msg.lower()
                email_delivery = {
                    "success": True if invite_link else False,
                    "sent_to_inbox": False,
                    "provider": "supabase_link" if invite_link else "local_audit",
                    "error": err_msg,
                    "invite_link": invite_link,
                    "rate_limited": is_rate_limited,
                    "message": (
                        "Supabase built-in mailer rate limit exceeded (3 emails/hour on Free tier). Direct invite link generated."
                        if is_rate_limited
                        else f"User created, but email delivery over network failed: {err_msg}"
                    )
                }
    else:
        try:
            auth_res = admin_db.auth.admin.create_user({
                "email": payload.email,
                "password": password,
                "email_confirm": True,
                "app_metadata": {"role": canonical_role},
                "user_metadata": user_meta,
            })
            new_uid = auth_res.user.id
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Could not create auth user: {e}")

    # 2. Upsert profile with validated canonical role and phone
    profile_data = {
        "id": new_uid,
        "email": payload.email,
        "full_name": payload.full_name,
        "role": canonical_role,
        "contact_number": normalized_phone,
        "is_approved": canonical_role != "supplier",
    }
    if canonical_role == "worker":
        profile_data["worker_type"] = payload.worker_type
        profile_data["daily_rate"] = payload.daily_rate

    try:
        admin_db.table("profiles").upsert(profile_data).execute()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to save profile: {e}")

    # 3. Read back the profile row to confirm saved role equals requested role
    read_back = admin_db.table("profiles").select("role, contact_number").eq("id", new_uid).single().execute()
    saved_role = read_back.data.get("role") if read_back.data else None
    if not is_role_match(saved_role, canonical_role):
        raise HTTPException(
            status_code=500,
            detail=f"Role mismatch after creation: requested '{canonical_role}', but saved profile has '{saved_role}'"
        )

    # 4. Insert welcome notification into Supabase notifications table
    try:
        from core.notification_helper import create_notification
        create_notification(
            type="general",
            user_id=new_uid,
            title="Welcome to ConstructFlow",
            message=f"Welcome {payload.full_name}! Your account has been setup with the {canonical_role} role.",
            target_user_id=new_uid,
            sent_via="in_app"
        )
    except Exception:
        pass

    sent_to_inbox = bool(email_delivery and email_delivery.get("sent_to_inbox"))
    return {
        "id": new_uid,
        "email": payload.email,
        "role": canonical_role,
        "contact_number": normalized_phone,
        "password_sent": payload.send_email,
        "email_delivery": email_delivery,
        "invite_link": invite_link,
        "temporary_password": password if not sent_to_inbox else None,
    }


@router.get("/users/role-audit")
def audit_user_roles(current_user: dict = Depends(get_current_user)) -> Dict:
    """Audit user roles between Auth metadata and Profiles table to detect mismatches."""
    _require_admin(current_user)
    admin_db = _admin_supabase()

    try:
        auth_users = admin_db.auth.admin.list_users()
        profiles_res = admin_db.table("profiles").select("id, email, full_name, role").execute()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Could not fetch users for audit: {e}")

    profiles_by_id = {p["id"]: p for p in (profiles_res.data or [])}
    mismatches = []

    for u in auth_users:
        uid = str(u.id)
        profile = profiles_by_id.get(uid)
        
        # Meta role prioritized from app_metadata then user_metadata
        app_meta = getattr(u, "app_metadata", {}) or {}
        user_meta = getattr(u, "user_metadata", {}) or {}
        auth_role = app_meta.get("role") or user_meta.get("role")
        profile_role = profile.get("role") if profile else None

        if profile and auth_role and not is_role_match(auth_role, profile_role):
            mismatches.append({
                "id": uid,
                "email": u.email,
                "full_name": profile.get("full_name"),
                "auth_metadata_role": auth_role,
                "profile_role": profile_role,
            })

    return {
        "total_audited": len(auth_users),
        "mismatches_count": len(mismatches),
        "mismatches": mismatches,
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
    canonical = normalize_role(payload.role)
    if not canonical or canonical not in _ALLOWED_ROLES:
        raise HTTPException(status_code=400, detail=f"Invalid role: {payload.role}")

    db = client_for_token(current_user["token"])
    # Use the SECURITY DEFINER RPC so the role update bypasses RLS safely
    res = db.rpc("admin_set_user_role", {
        "p_user_id": user_id,
        "p_role": canonical,
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


def _send_credentials_email(email: str, name: str, password: str, role: str) -> Dict:
    return send_credentials_welcome_email(
        to_email=email,
        name=name,
        password=password,
        role=role,
        website_url=getattr(settings, "FRONTEND_URL", "http://localhost:8082")
    )
