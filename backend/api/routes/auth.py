"""
Authentication and Self-Registration endpoints.
"""
import logging
from typing import Optional, Dict
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, EmailStr
from supabase import create_client

from core.config import settings
from core.phone import normalize_sri_lankan_phone
from core.email_validator import validate_gmail_for_registration
from core.roles import (
    normalize_role,
    INTERNAL_PORTAL_ROLES,
    PARTNER_PORTAL_ROLES,
    ROLE_SUPER_ADMIN,
    ROLE_ADMIN,
    ROLE_SUPPLIER,
)
from services.email_service import send_registration_welcome_email

logger = logging.getLogger("constructflow.auth")

router = APIRouter(prefix="/auth", tags=["Auth"])


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str
    full_name: str
    role: str
    portal: Optional[str] = None  # "internal" or "partner"
    contact_number: Optional[str] = None
    worker_type: Optional[str] = None
    company_name: Optional[str] = None


@router.post("/register")
def register_user(payload: RegisterRequest) -> Dict:
    """
    Self-registration endpoint enforcing strict portal-role boundaries:
    - Internal Portal: pm, site_manager, worker
    - Partner Portal: client, supplier
    - Admin/Super Admin is strictly rejected.
    - Missing or unrecognized role is rejected (never defaults to client).
    """
    if not payload.role or not payload.role.strip():
        raise HTTPException(status_code=400, detail="Please select a role. Role is required for registration.")

    canonical_role = normalize_role(payload.role)

    # Reject administrator roles for self-registration
    if canonical_role in (ROLE_SUPER_ADMIN, ROLE_ADMIN):
        raise HTTPException(
            status_code=403,
            detail="Registration as administrator is not permitted. Admin accounts must be created by system administrators.",
        )

    # Validate portal boundaries
    portal = (payload.portal or "").lower().strip()
    if portal in ("internal", "team"):
        if canonical_role not in INTERNAL_PORTAL_ROLES:
            raise HTTPException(
                status_code=400,
                detail=f"Role '{payload.role}' is not permitted for the Internal Team Portal. Allowed roles: PM, Site Manager, Worker.",
            )
    elif portal in ("partner", "external"):
        if canonical_role not in PARTNER_PORTAL_ROLES:
            raise HTTPException(
                status_code=400,
                detail=f"Role '{payload.role}' is not permitted for the Partner Portal. Allowed roles: Client, Supplier.",
            )
    else:
        # General check: must be in internal or partner portal roles
        if canonical_role not in (INTERNAL_PORTAL_ROLES | PARTNER_PORTAL_ROLES):
            raise HTTPException(
                status_code=400,
                detail=f"Invalid registration role '{payload.role}'.",
            )

    # Validate phone if provided
    normalized_phone = None
    if payload.contact_number:
        try:
            normalized_phone = normalize_sri_lankan_phone(payload.contact_number)
        except ValueError as ve:
            raise HTTPException(status_code=422, detail=str(ve))

    # Strictly validate valid Gmail address for registration
    try:
        normalized_email = validate_gmail_for_registration(payload.email)
    except ValueError as ve:
        raise HTTPException(status_code=422, detail=str(ve))

    if not settings.SUPABASE_SERVICE_ROLE_KEY:
        raise HTTPException(status_code=503, detail="Service role key not configured.")

    admin_db = create_client(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_ROLE_KEY)

    # Create auth user with role firmly attached in both app_metadata and user_metadata
    user_meta = {
        "full_name": payload.full_name,
        "role": canonical_role,
    }
    if normalized_phone:
        user_meta["contact_number"] = normalized_phone
    if payload.company_name:
        user_meta["company_name"] = payload.company_name

    try:
        auth_res = admin_db.auth.admin.create_user({
            "email": normalized_email,
            "password": payload.password,
            "email_confirm": True,
            "app_metadata": {"role": canonical_role},
            "user_metadata": user_meta,
        })
        user_id = auth_res.user.id
    except Exception as e:
        err_str = str(e)
        if "Database error creating new user" in err_str:
            raise HTTPException(
                status_code=500,
                detail="Database error creating new user. The handle_new_user trigger requires the 'is_approved' column and execution permissions. Please apply migration 20261013_fix_registration_trigger.sql in the Supabase SQL Editor."
            )
        raise HTTPException(status_code=400, detail=f"Registration failed: {err_str}")

    # Prepare profile
    is_approved = canonical_role != ROLE_SUPPLIER
    profile_data = {
        "id": user_id,
        "email": normalized_email,
        "full_name": payload.full_name,
        "role": canonical_role,
        "contact_number": normalized_phone,
        "is_approved": is_approved,
    }
    if payload.company_name:
        profile_data["company_name"] = payload.company_name
    if canonical_role == "worker" and payload.worker_type:
        profile_data["worker_type"] = payload.worker_type

    try:
        admin_db.table("profiles").upsert(profile_data).execute()
    except Exception as e:
        if "is_approved" in str(e):
            # Fallback omitting is_approved if column is not yet present
            profile_data_safe = {k: v for k, v in profile_data.items() if k != "is_approved"}
            admin_db.table("profiles").upsert(profile_data_safe).execute()
        else:
            raise HTTPException(status_code=500, detail=f"Could not initialize profile: {e}")

    # 1. Dispatch registration welcome email (without password)
    email_delivery = None
    try:
        frontend_url = getattr(settings, "FRONTEND_URL", "http://localhost:8082")
        email_delivery = send_registration_welcome_email(
            to_email=normalized_email,
            name=payload.full_name,
            role=canonical_role,
            website_url=frontend_url,
        )
        logger.info(f"Registration welcome email dispatched for {normalized_email} (Provider: {email_delivery.get('provider')})")
    except Exception as email_err:
        logger.warning(f"Registration welcome email dispatch failed for {normalized_email}: {email_err}")

    # 2. Insert in-app welcome notification
    try:
        from core.notification_helper import create_notification
        create_notification(
            type="general",
            user_id=user_id,
            title="Welcome to ConstructFlow",
            message=f"Welcome {payload.full_name}! Your account has been registered with the {canonical_role} role.",
            target_user_id=user_id,
            sent_via="in_app"
        )
    except Exception as notif_err:
        logger.warning(f"Could not create welcome notification for {user_id}: {notif_err}")

    return {
        "id": user_id,
        "email": normalized_email,
        "role": canonical_role,
        "is_approved": is_approved,
        "email_delivery": email_delivery,
        "message": "Registration successful" if is_approved else "Registration received. Supplier accounts require admin approval before accessing the dashboard.",
    }


