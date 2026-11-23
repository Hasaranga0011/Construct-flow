"""
Authentication and Self-Registration endpoints.
"""
import logging
from html import escape
from typing import Optional, Dict
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, EmailStr, Field
from uuid import uuid4
from supabase import create_client

from core.config import settings
from core.phone import normalize_sri_lankan_phone
from core.email_validator import validate_gmail_for_registration, GMAIL_TYPO_DOMAINS
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


class PasswordRecoveryRequest(BaseModel):
    email: EmailStr
    redirect_to: Optional[str] = None


@router.post('/password-recovery', status_code=202)
def request_password_recovery(payload: PasswordRecoveryRequest):
    """Use the configured app email transport, with no account enumeration."""
    from core.database import get_service_client
    from services.email_service import send_email
    frontend = settings.FRONTEND_URL.rstrip('/')
    allowed = {frontend + '/reset-password'}
    allowed.update(origin.strip().rstrip('/') + '/reset-password' for origin in settings.CORS_ORIGINS.split(',') if origin.strip())
    allowed.add('constructflow://reset-password')
    redirect = payload.redirect_to or frontend + '/reset-password'
    if redirect not in allowed:
        raise HTTPException(422, 'This password recovery redirect is not allowed')
    message = {'message': 'If an account exists, a password reset link will be sent.'}
    if str(payload.email).lower().endswith('@accounts.example.com'):
        return message
    try:
        result = get_service_client().auth.admin.generate_link({
            'type': 'recovery', 'email': str(payload.email), 'options': {'redirect_to': redirect}
        })
        properties = getattr(result, 'properties', None)
        link = getattr(properties, 'action_link', None)
        if not link and isinstance(result, dict):
            link = result.get('action_link') or (result.get('properties') or {}).get('action_link')
        if not link:
            raise ValueError('Recovery link not returned')
        send_email(str(payload.email), 'ConstructAi — Reset your password',
                   '<h2>Reset your ConstructAi password</h2><p>You requested a password reset.</p>'
                   '<p><a href="' + escape(link, quote=True) + '">Set a new password</a></p>'
                   '<p>If you did not request this, you can ignore this email. Your password has not been changed.</p>')
    except Exception:
        # Never log the provider response: it can contain the one-time action link.
        # Unknown accounts and dispatch failures share the public response.
        logger.warning('Password recovery could not be dispatched; inspect email provider health')
    return message


class RegisterRequest(BaseModel):
    email: Optional[EmailStr] = None
    username: Optional[str] = Field(default=None, pattern=r'^[A-Za-z0-9][A-Za-z0-9_.-]{2,31}$')
    password: str = Field(min_length=12, max_length=128)
    full_name: str = Field(min_length=2, max_length=120)
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

    if bool(payload.email) == bool(payload.username):
        raise HTTPException(422, 'Choose either email or username registration')
    username = payload.username.lower() if payload.username else None
    if username and not normalized_phone:
        raise HTTPException(422, 'A contact number is required for administrator-assisted username recovery')
    # A reserved-domain Auth identifier is never presented as a verified mailbox.
    normalized_email = str(payload.email).strip().lower() if payload.email else f'{uuid4().hex}@accounts.example.com'
    if payload.email and normalized_email.split('@')[-1] in {'gmail.com',*GMAIL_TYPO_DOMAINS}:
        try:
            normalized_email=validate_gmail_for_registration(normalized_email)
        except ValueError as exc:
            raise HTTPException(422,str(exc)) from exc

    if not settings.SUPABASE_SERVICE_ROLE_KEY:
        raise HTTPException(status_code=503, detail="Service role key not configured.")

    admin_db = create_client(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_ROLE_KEY)

    # Create auth user with role firmly attached in both app_metadata and user_metadata
    user_meta = {
        "full_name": payload.full_name,
        "role": canonical_role,
        "identity_kind": 'username' if username else 'email',
        "username": username,
    }
    if normalized_phone:
        user_meta["contact_number"] = normalized_phone
    if payload.company_name:
        user_meta["company_name"] = payload.company_name

    try:
        auth_res = admin_db.auth.admin.create_user({
            "email": normalized_email,
            "password": payload.password,
            "email_confirm": bool(username),
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
    is_approved = canonical_role == "client" and not username
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
        if username:
            admin_db.table('username_accounts').insert({'user_id':user_id,'username':username}).execute()
        admin_db.table("profiles").upsert(profile_data).execute()
    except Exception as exc:
        admin_db.auth.admin.delete_user(user_id)
        raise HTTPException(status_code=503, detail="Registration could not initialize the account") from exc

    if username:
        return {'id':user_id,'username':username,'role':canonical_role,'is_approved':False,
                'message':'Account created. An administrator must verify and approve it before project access. Use your username and password to sign in.'}

    # A real verification email is required; never auto-confirm public accounts.
    try:
        from services.email_service import send_email
        from html import escape
        link = admin_db.auth.admin.generate_link({"type": "magiclink", "email": normalized_email,
            "options": {"redirect_to": settings.FRONTEND_URL.rstrip("/") + ("/partner-login" if canonical_role in {"client", "supplier"} else "/team-login")}})
        action_url = link.properties.action_link
        send_email(normalized_email, "Verify your ConstructFlow email",
                   '<p>Verify your email to finish registration.</p><a href="' + escape(action_url, quote=True) + '">Verify email</a>')
    except Exception as exc:
        admin_db.auth.admin.delete_user(user_id)
        raise HTTPException(status_code=503, detail="Verification email could not be delivered. Please try again later.") from exc

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
            sent_via="in_app",
            workflow=True,
        )
    except Exception as notif_err:
        logger.warning(f"Could not create welcome notification for {user_id}: {notif_err}")

    return {
        "id": user_id,
        "email": normalized_email,
        "role": canonical_role,
        "is_approved": is_approved,
        "email_delivery": email_delivery,
        "message": "Check your email to verify your account. Staff and supplier accounts also require administrator approval.",
    }


class UsernameLogin(BaseModel):
    username: str = Field(min_length=3, max_length=32, pattern=r'^[A-Za-z0-9][A-Za-z0-9_.-]{2,31}$')
    password: str = Field(min_length=1, max_length=128)


@router.post('/username-login')
def username_login(payload: UsernameLogin):
    from core.database import get_service_client
    failure = HTTPException(401, 'Invalid username or password')
    try:
        service=get_service_client()
        rows=service.table('username_accounts').select('user_id').eq('username',payload.username.lower()).execute().data or []
        identity=service.auth.admin.get_user_by_id(rows[0]['user_id']).user if rows else None
        auth_client=create_client(settings.SUPABASE_URL,settings.SUPABASE_KEY)
        result=auth_client.auth.sign_in_with_password({'email':identity.email if identity else 'unknown@accounts.example.com','password':payload.password})
        if not identity or not result.session:
            raise failure
        return {'access_token':result.session.access_token,'refresh_token':result.session.refresh_token}
    except Exception:
        raise failure from None


