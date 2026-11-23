from fastapi import APIRouter, HTTPException, Depends, Query
from pydantic import BaseModel, EmailStr
from typing import Optional
import os
import httpx
from dotenv import load_dotenv
from core.security import get_current_user, require_admin
from core.database import client_for_token
from core.notification_helper import create_notification
from core.config import settings
load_dotenv()

from typing import List, Optional
from core.database import get_service_client
from supabase import create_client
import logging

def get_admin_supabase():
    try:
        return get_service_client()
    except Exception:
        url = settings.SUPABASE_URL or "https://placeholder.supabase.co"
        key = settings.SUPABASE_SERVICE_ROLE_KEY or settings.SUPABASE_KEY or "placeholder-key"
        return create_client(url, key)

router = APIRouter(
    prefix="/notifications",
    tags=["Email and System Notifications"]
)

RESEND_API_KEY = os.getenv("RESEND_API_KEY", "")
FROM_EMAIL = os.getenv("RESEND_FROM_EMAIL", "ConstructFlow <noreply@constructflow.lk>")

class SystemNotificationPayload(BaseModel):
    title: str
    message: str
    target_role: Optional[str] = None
    target_user_id: Optional[str] = None
    link: Optional[str] = None
    type: Optional[str] = "general"
    project_id: Optional[str] = None

@router.post("/system")
async def send_system_notification(payload: SystemNotificationPayload, current_user: dict = Depends(require_admin)):
    """Send an in-app system notification, verifying caller JWT."""
    saved = create_notification(
        type=payload.type,
        user_id=current_user["id"],
        title=payload.title,
        message=payload.message,
        target_role=payload.target_role,
        target_user_id=payload.target_user_id,
        link=payload.link,
        project_id=payload.project_id,
        is_read=False,
        sent_via="in_app"
    )
    if not saved:
        raise HTTPException(503, "Notification was not saved")
    return {"success": True}

class MarkReadPayload(BaseModel):
    ids: Optional[List[str]] = None
    all: Optional[bool] = False

@router.patch("/mark-read")
async def mark_notifications_read(payload: MarkReadPayload, current_user: dict = Depends(get_current_user)):
    try:
        result = client_for_token(current_user["token"]).rpc("mark_own_notifications_read", {"p_ids": payload.ids, "p_all": bool(payload.all)}).execute()
        return {"success": True, "updated": result.data}
    except Exception as exc:
        raise HTTPException(status_code=503, detail="Could not save notification receipts") from exc

@router.get("/")
def list_notifications(current_user: dict = Depends(get_current_user)):
    try:
        return client_for_token(current_user["token"]).rpc("get_own_notifications").execute().data or []
    except Exception as exc:
        raise HTTPException(status_code=503, detail="Could not load notifications") from exc


@router.get('/feed')
def notification_feed(current_user: dict = Depends(get_current_user), offset: int = Query(0, ge=0, le=1000000)):
    client = client_for_token(current_user['token'])
    try:
        return client.rpc('get_own_notification_feed',{'p_offset':offset}).execute().data or {'items': [], 'unread_count': 0, 'total_count':0}
    except Exception as exc:
        if str(getattr(exc, 'code', '')) == 'PGRST202':
            # Transitional fallback until the owner applies the SQL upgrade.
            rows = client.rpc('get_own_notifications').execute().data or []
            return {'items': rows if offset==0 else [], 'unread_count': sum(not row.get('is_read') for row in rows), 'total_count':len(rows)}
        raise HTTPException(503, 'Could not load notifications') from exc

@router.get("/email/health")
def email_health(current_user: dict = Depends(require_admin)):
    return {"configured": bool(settings.RESEND_API_KEY or os.getenv("BREVO_API_KEY") or settings.SMTP_HOST)}


class EmailPayload(BaseModel):
    to: EmailStr
    subject: str
    html_body: str
    reply_to: Optional[str] = None


from services.email_service import send_email as svc_send_email

async def send_email(to: str, subject: str, html_body: str) -> dict:
    """Send notification and email via Supabase integrated dispatch."""
    try:
        dispatch_status = svc_send_email(to, subject, html_body)
        return {"status": "success", "provider": dispatch_status}
    except Exception as e:
        return {"status": "logged", "error": str(e)}


@router.post("/email/send", dependencies=[Depends(require_admin)])
async def send_custom_email(payload: EmailPayload):
    """Send a custom email via Resend."""
    result = await send_email(payload.to, payload.subject, payload.html_body)
    if result.get("status") != "success":
        raise HTTPException(status_code=502, detail="Email delivery failed")
    return {"success": True, "result": result}


@router.post("/email/material-approved", dependencies=[Depends(require_admin)])
async def notify_material_approved(
    supplier_email: str,
    item_name: str,
    quantity: int,
    unit: str,
    project_name: str
):
    """Send an email to a supplier when a material order is approved."""
    html = f"""
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background: #F97316; padding: 24px; border-radius: 12px 12px 0 0;">
        <h1 style="color: white; margin: 0;">ConstructFlow</h1>
      </div>
      <div style="padding: 32px; background: white; border: 1px solid #e5e7eb;">
        <h2 style="color: #1F2937;">New Approved Material Order</h2>
        <p style="color: #6B7280;">A new order has been approved and requires fulfillment:</p>
        <div style="background: #F9FAFB; padding: 16px; border-radius: 8px; margin: 16px 0;">
          <p style="margin: 4px 0;"><strong>Item:</strong> {item_name}</p>
          <p style="margin: 4px 0;"><strong>Quantity:</strong> {quantity} {unit}</p>
          <p style="margin: 4px 0;"><strong>Project:</strong> {project_name}</p>
        </div>
        <p style="color: #6B7280;">Please log in to your ConstructFlow Supplier Portal to confirm and schedule delivery.</p>
      </div>
      <div style="padding: 16px; background: #F9FAFB; border-radius: 0 0 12px 12px; text-align: center;">
        <p style="color: #9CA3AF; font-size: 12px;">ConstructFlow — Construction Management System</p>
      </div>
    </div>
    """
    result = await send_email(supplier_email, f"New Order: {quantity} {unit} of {item_name}", html)
    if result.get("status") != "success":
        raise HTTPException(status_code=502, detail="Email delivery failed")
    return {"success": True, "result": result}


@router.post("/email/material-rejected", dependencies=[Depends(require_admin)])
async def notify_material_rejected(
    requester_email: str,
    item_name: str,
    reason: str
):
    """Send an email to a site manager when their material request is rejected."""
    html = f"""
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background: #EF4444; padding: 24px; border-radius: 12px 12px 0 0;">
        <h1 style="color: white; margin: 0;">ConstructFlow</h1>
      </div>
      <div style="padding: 32px; background: white; border: 1px solid #e5e7eb;">
        <h2 style="color: #1F2937;">Material Request Rejected</h2>
        <p style="color: #6B7280;">Your material request could not be approved at this time:</p>
        <div style="background: #F9FAFB; padding: 16px; border-radius: 8px; margin: 16px 0;">
          <p style="margin: 4px 0;"><strong>Item:</strong> {item_name}</p>
          <p style="margin: 4px 0; color: #EF4444;"><strong>Reason:</strong> {reason}</p>
        </div>
      </div>
      <div style="padding: 16px; background: #F9FAFB; border-radius: 0 0 12px 12px; text-align: center;">
        <p style="color: #9CA3AF; font-size: 12px;">ConstructFlow — Construction Management System</p>
      </div>
    </div>
    """
    result = await send_email(requester_email, f"Request Rejected: {item_name}", html)
    if result.get("status") != "success":
        raise HTTPException(status_code=502, detail="Email delivery failed")
    return {"success": True, "result": result}
