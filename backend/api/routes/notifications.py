from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, EmailStr
from typing import Optional
import os
import httpx
from dotenv import load_dotenv

load_dotenv()

router = APIRouter(
    prefix="/notifications",
    tags=["Email Notifications"]
)

RESEND_API_KEY = os.getenv("RESEND_API_KEY", "")
FROM_EMAIL = os.getenv("RESEND_FROM_EMAIL", "ConstructFlow <noreply@constructflow.lk>")


class EmailPayload(BaseModel):
    to: str
    subject: str
    html_body: str
    reply_to: Optional[str] = None


async def send_email(to: str, subject: str, html_body: str) -> dict:
    """Send an email via Resend API."""
    if not RESEND_API_KEY:
        return {"status": "skipped", "reason": "RESEND_API_KEY not configured"}

    async with httpx.AsyncClient() as client:
        response = await client.post(
            "https://api.resend.com/emails",
            headers={
                "Authorization": f"Bearer {RESEND_API_KEY}",
                "Content-Type": "application/json",
            },
            json={
                "from": FROM_EMAIL,
                "to": [to],
                "subject": subject,
                "html": html_body,
            },
            timeout=10.0
        )

    if response.status_code not in (200, 201):
        raise HTTPException(status_code=500, detail=f"Resend error: {response.text}")

    return response.json()


@router.post("/email/send")
async def send_custom_email(payload: EmailPayload):
    """Send a custom email via Resend."""
    result = await send_email(payload.to, payload.subject, payload.html_body)
    return {"success": True, "result": result}


@router.post("/email/material-approved")
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
    return {"success": True, "result": result}


@router.post("/email/material-rejected")
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
        <p style="color: #6B7280;">Your material request has been reviewed:</p>
        <div style="background: #FEF2F2; padding: 16px; border-radius: 8px; margin: 16px 0; border-left: 4px solid #EF4444;">
          <p style="margin: 4px 0;"><strong>Item:</strong> {item_name}</p>
          <p style="margin: 4px 0;"><strong>Reason:</strong> {reason}</p>
        </div>
        <p style="color: #6B7280;">Please contact your Project Manager for further details or to re-submit a revised request.</p>
      </div>
    </div>
    """
    result = await send_email(requester_email, f"Request Rejected: {item_name}", html)
    return {"success": True, "result": result}


@router.get("/email/health")
def email_health():
    """Check if Resend is configured."""
    configured = bool(RESEND_API_KEY)
    return {
        "resend_configured": configured,
        "from_email": FROM_EMAIL if configured else "NOT SET"
    }
