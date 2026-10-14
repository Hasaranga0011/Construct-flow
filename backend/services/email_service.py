import os
import smtplib
import logging
from datetime import datetime
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from typing import Dict, Tuple, Optional
import httpx
import resend
from core.config import settings
from core.roles import normalize_role
from supabase import create_client as create_sb_client

logger = logging.getLogger("constructflow.email")

# Ensure logs directory exists for audit trails
LOGS_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "logs")
os.makedirs(LOGS_DIR, exist_ok=True)
SENT_EMAILS_LOG_PATH = os.path.join(LOGS_DIR, "sent_credentials_emails.log")

ROLE_METADATA = {
    "super_admin": {
        "title": "Super Administrator",
        "portal_name": "Admin Portal",
        "portal_path": "/admin-login",
        "summary": "Full executive platform governance, user management, and system-wide visibility.",
        "responsibilities": [
            "Organization and user account administration with role-based access control",
            "Project approvals, milestone reviews, and global budget allocation auditing",
            "Real-time visibility across all active construction sites and inventory levels",
            "System-wide analytics, financial reports, and AI delay risk predictions"
        ]
    },
    "pm": {
        "title": "Project Manager",
        "portal_name": "Internal Team Portal",
        "portal_path": "/team-login",
        "summary": "Strategic project lifecycle execution, milestone coordination, and cost control.",
        "responsibilities": [
            "Project planning, milestone progress tracking, and expense budget supervision",
            "AI-powered delay risk identification and proactive bottleneck resolution",
            "Resource allocation, labor deployment, and purchase order approvals",
            "Collaborative communication with clients, suppliers, and site managers"
        ]
    },
    "site_manager": {
        "title": "Site Manager",
        "portal_name": "Internal Team Portal",
        "portal_path": "/team-login",
        "summary": "On-site field operations, workforce check-ins, and daily site logistics.",
        "responsibilities": [
            "Daily workforce attendance check-in and check-out via QR scan verification",
            "On-site material inventory logs, delivery receipts, and low-stock alerts",
            "Daily construction progress reporting and on-site issue logging",
            "Safety oversight and immediate escalation of structural impediments"
        ]
    },
    "worker": {
        "title": "Construction Specialist / Worker",
        "portal_name": "Internal Team Portal",
        "portal_path": "/team-login",
        "summary": "Verified shift attendance, work history tracking, and automated digital payslips.",
        "responsibilities": [
            "Digital QR-code attendance check-in at site entry and exit points",
            "Automated shift hours, overtime calculation, and digital attendance history",
            "Access to monthly salary slips, payment records, and daily task assignments",
            "Direct communication with on-site supervisors and project coordinators"
        ]
    },
    "client": {
        "title": "Valued Project Client",
        "portal_name": "Partner & Client Portal",
        "portal_path": "/partner-login",
        "summary": "Transparent, real-time insight into your ongoing construction projects.",
        "responsibilities": [
            "Live tracking of project milestones, overall completion velocity, and timeline",
            "Review verified site inspection updates, progress photos, and media logs",
            "Financial estimate transparency, expense tracking, and variation order reviews",
            "Direct messaging with your assigned Project Manager"
        ]
    },
    "supplier": {
        "title": "Material Supplier Partner",
        "portal_name": "Partner & Client Portal",
        "portal_path": "/partner-login",
        "summary": "Procurement coordination, purchase order fulfillment, and delivery dispatch.",
        "responsibilities": [
            "Receive, review, and confirm purchase orders from project managers in real time",
            "Provide estimated delivery schedules and dispatch tracking updates",
            "Coordinate bulk material deliveries directly with designated site managers",
            "Maintain product catalog pricing, available units, and invoice archives"
        ]
    }
}


def get_role_info(role: str) -> dict:
    canonical = normalize_role(role) or role.lower().replace(" ", "_")
    return ROLE_METADATA.get(canonical, {
        "title": role.replace("_", " ").title(),
        "portal_name": "ConstructFlow Portal",
        "portal_path": "/team-login",
        "summary": "Access your designated workspace on ConstructFlow.",
        "responsibilities": [
            "Collaborate on construction workflows and track project deliverables",
            "Access real-time information relevant to your organization"
        ]
    })


def generate_welcome_credentials_email(
    name: str,
    email: str,
    password: Optional[str] = None,
    role: str = "worker",
    website_url: Optional[str] = None
) -> Tuple[str, str, str]:
    """
    Generates customized email HTML, Plain Text, and Subject for user accounts.
    Includes:
      - ConstructFlow platform branding & website details
      - Direct role-based login portal URL
      - Complete account credentials (Name, Email, Role, and password if provided)
      - Detailed platform introduction & role-specific responsibilities
      - 3-step Getting Started instructions & security guidance
    """
    base_url = (website_url or getattr(settings, "FRONTEND_URL", "http://localhost:8082")).rstrip("/")
    role_info = get_role_info(role)
    portal_url = f"{base_url}{role_info['portal_path']}"
    role_title = role_info["title"]
    portal_name = role_info["portal_name"]

    has_password = bool(password and str(password).strip())

    if has_password:
        subject = "Welcome to ConstructFlow - Your Account Credentials & Portal Access"
        intro_action = "created"
        card_header = "Your Sign-In Credentials"
        password_html_row = f"""<tr>
                        <td style="color: #64748B; font-weight: 600; padding: 4px 0;">Temporary Password:</td>
                        <td style="color: #EA580C; font-weight: 700; padding: 4px 0; font-family: Consolas, monospace; font-size: 15px;">
                          <span style="background: #FFFFFF; padding: 3px 8px; border-radius: 6px; border: 1px dashed #F97316;">{password}</span>
                        </td>
                      </tr>"""
        password_text_row = f"Temporary Password:   {password}"
        step2_html = "<li><strong>Enter Your Credentials:</strong> Sign in using your registered email and temporary password provided above.</li>"
        step3_html = "<li><strong>Update Your Password:</strong> Go to your <em>Profile / Settings</em> screen to replace the temporary password with your permanent password.</li>"
        step2_text = "2. Sign in with your registered email and the temporary password above."
        step3_text = "3. Navigate to Profile / Settings to update your password to a personal one."
        security_html = "<strong>Security Notice:</strong> Keep your login credentials strictly confidential. ConstructFlow staff will never ask for your password. If you did not request this account, please notify our administrative support team immediately."
        security_text = "Please do not share these credentials with anyone. Change your temporary password immediately upon first sign-in."
    else:
        subject = "Welcome to ConstructFlow - Your Account & Portal Access"
        intro_action = "registered"
        card_header = "Your Sign-In Details"
        password_html_row = """<tr>
                        <td style="color: #64748B; font-weight: 600; padding: 4px 0;">Password:</td>
                        <td style="color: #047857; font-weight: 600; padding: 4px 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 13px;">
                          <span style="background: #ECFDF5; color: #047857; padding: 3px 8px; border-radius: 6px; border: 1px solid #A7F3D0;">•••••••• (Set by you during registration)</span>
                        </td>
                      </tr>"""
        password_text_row = "Password:             •••••••• (Set by you during registration)"
        step2_html = "<li><strong>Sign In:</strong> Sign in using your registered email and the password you created during registration.</li>"
        step3_html = f"<li><strong>Explore Your Workspace:</strong> Access your project dashboards, notifications, and role-specific construction intelligence tools on the {portal_name}.</li>"
        step2_text = "2. Sign in with your registered email and the password you created during registration."
        step3_text = "3. Access your project dashboards, notifications, and role-specific tools."
        security_html = "<strong>Security Notice:</strong> For your security, your personal password is never transmitted via email. Keep your password confidential. ConstructFlow staff will never ask for your password."
        security_text = "For your security, your personal password is never transmitted via email. Keep your login credentials confidential."

    responsibilities_html = "".join([
        f'<li style="margin-bottom: 8px; color: #374151;">{resp}</li>'
        for resp in role_info["responsibilities"]
    ])

    responsibilities_text = "\n".join([f"  * {resp}" for resp in role_info["responsibilities"]])

    html = f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{subject}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #F1F5F9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1E293B;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #F1F5F9; padding: 32px 16px;">
    <tr>
      <td align="center">
        <!-- Main Container -->
        <table role="presentation" width="100%" style="max-width: 620px; background-color: #FFFFFF; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 20px rgba(0, 0, 0, 0.08); border: 1px solid #E2E8F0;">
          
          <!-- Header Banner -->
          <tr>
            <td style="background: linear-gradient(135deg, #0F172A 0%, #1E293B 100%); padding: 36px 32px; text-align: center; border-bottom: 4px solid #EA580C;">
              <table role="presentation" width="100%">
                <tr>
                  <td align="center">
                    <div style="display: inline-block; background: #EA580C; color: #FFFFFF; font-weight: 900; font-size: 24px; padding: 8px 18px; border-radius: 10px; letter-spacing: -0.5px;">
                      Construct<span style="color: #FED7AA;">Ai</span>
                    </div>
                    <div style="color: #94A3B8; font-size: 13px; text-transform: uppercase; letter-spacing: 1.5px; margin-top: 8px; font-weight: 600;">
                      AI Construction Management Platform
                    </div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Body Content -->
          <tr>
            <td style="padding: 36px 32px;">
              
              <!-- Welcome Title -->
              <h1 style="margin: 0 0 12px 0; font-size: 22px; font-weight: 800; color: #0F172A; line-height: 1.3;">
                Welcome to ConstructFlow, {name}!
              </h1>
              <p style="margin: 0 0 24px 0; font-size: 15px; color: #475569; line-height: 1.6;">
                Your user account has been successfully {intro_action}. You have been assigned the role of 
                <strong style="color: #EA580C;">{role_title}</strong> on the 
                <strong>{portal_name}</strong>.
              </p>

              <!-- Credentials Card -->
              <table role="presentation" width="100%" style="background: #FFF7ED; border: 1px solid #FDBA74; border-left: 5px solid #EA580C; border-radius: 12px; margin: 0 0 28px 0;" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="padding: 20px 24px;">
                    <div style="font-size: 12px; font-weight: 800; text-transform: uppercase; letter-spacing: 1px; color: #C2410C; margin-bottom: 12px;">
                      {card_header}
                    </div>
                    <table role="presentation" width="100%" style="font-size: 14px; line-height: 1.6;">
                      <tr>
                        <td style="width: 130px; color: #64748B; font-weight: 600; padding: 4px 0;">Login Email:</td>
                        <td style="color: #0F172A; font-weight: 700; padding: 4px 0; font-family: Consolas, monospace;">{email}</td>
                      </tr>
                      {password_html_row}
                      <tr>
                        <td style="color: #64748B; font-weight: 600; padding: 4px 0;">Assigned Role:</td>
                        <td style="color: #0F172A; font-weight: 600; padding: 4px 0;">{role_title}</td>
                      </tr>
                      <tr>
                        <td style="color: #64748B; font-weight: 600; padding: 4px 0;">Designated Portal:</td>
                        <td style="color: #0F172A; font-weight: 600; padding: 4px 0;">{portal_name}</td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <!-- CTA Button -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin: 0 0 32px 0;">
                <tr>
                  <td align="center">
                    <a href="{portal_url}" style="display: inline-block; background: #EA580C; color: #FFFFFF; text-decoration: none; font-size: 15px; font-weight: 700; padding: 14px 36px; border-radius: 10px; box-shadow: 0 4px 12px rgba(234, 88, 12, 0.3); transition: background 0.2s;">
                      Sign In to {portal_name} &rarr;
                    </a>
                  </td>
                </tr>
                <tr>
                  <td align="center" style="padding-top: 10px;">
                    <span style="font-size: 12px; color: #94A3B8;">Portal URL: 
                      <a href="{portal_url}" style="color: #EA580C; text-decoration: underline;">{portal_url}</a>
                    </span>
                  </td>
                </tr>
              </table>

              <!-- Section: About ConstructFlow -->
              <div style="background: #F8FAFC; border-radius: 12px; padding: 20px 24px; margin-bottom: 24px; border: 1px solid #E2E8F0;">
                <h2 style="margin: 0 0 10px 0; font-size: 16px; font-weight: 700; color: #0F172A;">
                  About the ConstructFlow Platform
                </h2>
                <p style="margin: 0 0 12px 0; font-size: 13.5px; color: #475569; line-height: 1.6;">
                  ConstructFlow is an enterprise AI-powered construction intelligence ecosystem. It integrates project scheduling, 
                  automated QR workforce check-ins, procurement pipelines, and predictive machine-learning cost & delay risk estimation 
                  into one unified environment.
                </p>
                <div style="font-size: 13.5px; font-weight: 600; color: #0F172A; margin-bottom: 8px;">
                  Your Capabilities as {role_title}:
                </div>
                <ul style="margin: 0; padding-left: 20px; font-size: 13px; line-height: 1.6;">
                  {responsibilities_html}
                </ul>
              </div>

              <!-- Section: Getting Started Steps -->
              <div style="border-top: 1px solid #E2E8F0; padding-top: 24px; margin-bottom: 24px;">
                <h3 style="margin: 0 0 12px 0; font-size: 15px; font-weight: 700; color: #0F172A;">
                  Getting Started in 3 Easy Steps
                </h3>
                <ol style="margin: 0; padding-left: 20px; font-size: 13.5px; color: #475569; line-height: 1.7;">
                  <li><strong>Open Your Portal:</strong> Click the access button above or visit <a href="{portal_url}" style="color: #EA580C;">{portal_url}</a>.</li>
                  {step2_html}
                  {step3_html}
                </ol>
              </div>

              <!-- Security Notice Alert -->
              <table role="presentation" width="100%" style="background: #FEF2F2; border: 1px solid #FECACA; border-radius: 8px; margin-bottom: 24px;" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="padding: 12px 16px;">
                    <div style="font-size: 12px; color: #991B1B; line-height: 1.5;">
                      {security_html}
                    </div>
                  </td>
                </tr>
              </table>

              <!-- Support & Assistance -->
              <p style="margin: 0; font-size: 13px; color: #64748B; line-height: 1.6;">
                Need help or have questions? Contact your project administrator or our technical support team at 
                <a href="mailto:support@constructflow.com" style="color: #EA580C; font-weight: 600;">support@constructflow.com</a>.
              </p>

            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color: #0F172A; padding: 24px 32px; text-align: center; color: #94A3B8; font-size: 12px; line-height: 1.6;">
              <div style="font-weight: 700; color: #FFFFFF; font-size: 13px; margin-bottom: 4px;">ConstructFlow Technologies</div>
              <div>AI-Driven Construction Operations & Management Platform</div>
              <div style="margin-top: 8px; color: #64748B;">
                &copy; {datetime.now().year} ConstructFlow. All rights reserved. &bull; <a href="{base_url}" style="color: #F97316; text-decoration: none;">{base_url}</a>
              </div>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
"""

    text = f"""
===================================================================
WELCOME TO CONSTRUCTFLOW - AI CONSTRUCTION PLATFORM
===================================================================

Dear {name},

Welcome to ConstructFlow! Your account has been {intro_action} with the role of {role_title}.

-------------------------------------------------------------------
{card_header.upper()}
-------------------------------------------------------------------
Login Email:          {email}
{password_text_row}
Assigned Role:        {role_title}
Designated Portal:    {portal_name}
Portal Login URL:     {portal_url}

-------------------------------------------------------------------
ABOUT CONSTRUCTFLOW
-------------------------------------------------------------------
ConstructFlow is an intelligent AI-powered construction operations platform 
designed to unify project scheduling, real-time QR workforce attendance, 
material procurement, and predictive cost and delay risk management.

Your Responsibilities as {role_title}:
{responsibilities_text}

-------------------------------------------------------------------
GETTING STARTED IN 3 STEPS
-------------------------------------------------------------------
1. Visit your designated portal: {portal_url}
{step2_text}
{step3_text}

-------------------------------------------------------------------
SECURITY NOTICE
-------------------------------------------------------------------
{security_text}

If you have questions, contact support at support@constructflow.com.

Website: {base_url}
(c) {datetime.now().year} ConstructFlow Technologies. All rights reserved.
===================================================================
"""

    return html, text, subject


def _send_email_via_smtp_or_resend(
    to_email: str,
    subject: str,
    html_content: str,
    text_content: str
) -> Tuple[bool, str, Optional[str], Optional[str]]:
    """
    Attempts delivery of email via SMTP first (direct mailer), then Resend API fallback.
    Returns: (sent_to_inbox, provider, message, error)
    """
    last_error = None

    # Transport 1: SMTP (if configured)
    smtp_host = getattr(settings, "SMTP_HOST", None)
    if smtp_host is None:
        smtp_host = os.getenv("SMTP_HOST", "")

    smtp_user = getattr(settings, "SMTP_USER", None)
    if smtp_user is None:
        smtp_user = os.getenv("SMTP_USER", "")

    smtp_password = getattr(settings, "SMTP_PASSWORD", None)
    if smtp_password is None:
        smtp_password = os.getenv("SMTP_PASSWORD", "")
    smtp_password = smtp_password.replace(" ", "").strip() if smtp_password else ""

    if smtp_host and smtp_user and smtp_password:
        try:
            smtp_port_val = getattr(settings, "SMTP_PORT", None)
            if smtp_port_val is None:
                smtp_port_val = os.getenv("SMTP_PORT", 587)
            smtp_port = int(smtp_port_val or 587)

            smtp_from = getattr(settings, "SMTP_FROM_EMAIL", None)
            if not smtp_from:
                smtp_from = os.getenv("SMTP_FROM_EMAIL", smtp_user)

            use_tls = getattr(settings, "SMTP_USE_TLS", True)

            msg = MIMEMultipart("alternative")
            msg["Subject"] = subject
            msg["From"] = f"ConstructFlow <{smtp_from}>"
            msg["To"] = to_email

            if text_content:
                msg.attach(MIMEText(text_content, "plain", "utf-8"))
            msg.attach(MIMEText(html_content, "html", "utf-8"))

            if smtp_port == 465:
                server = smtplib.SMTP_SSL(smtp_host, smtp_port, timeout=15)
            else:
                server = smtplib.SMTP(smtp_host, smtp_port, timeout=15)
                if use_tls:
                    server.starttls()

            server.login(smtp_user, smtp_password)
            server.sendmail(smtp_from, [to_email], msg.as_string())
            server.quit()

            logger.info(f"Email sent via SMTP to {to_email}")
            return True, "smtp", f"Email delivered directly to {to_email} via SMTP", None
        except Exception as e:
            last_error = f"SMTP error: {e}"
            logger.warning(f"SMTP transmission error: {e}")

    # Transport 2: Resend API
    resend_key = getattr(settings, "RESEND_API_KEY", None)
    if resend_key is None:
        resend_key = os.getenv("RESEND_API_KEY", "")

    from_email = getattr(settings, "RESEND_FROM_EMAIL", None)
    if not from_email:
        from_email = os.getenv("RESEND_FROM_EMAIL", "ConstructFlow <onboarding@resend.dev>")

    if resend_key:
        try:
            payload = {
                "from": from_email,
                "to": [to_email],
                "subject": subject,
                "html": html_content,
                "text": text_content,
            }
            res = httpx.post(
                "https://api.resend.com/emails",
                headers={"Authorization": f"Bearer {resend_key}", "Content-Type": "application/json"},
                json=payload,
                timeout=12
            )
            if res.status_code in (200, 201):
                res_data = res.json()
                logger.info(f"Email sent via Resend to {to_email} (ID: {res_data.get('id')})")
                return True, "resend", f"Email delivered successfully via Resend to {to_email}", None
            else:
                # If custom domain wasn't verified, retry with onboarding@resend.dev
                if "onboarding@resend.dev" not in from_email:
                    logger.info("Retrying Resend with onboarding@resend.dev sandbox domain...")
                    payload["from"] = "ConstructFlow <onboarding@resend.dev>"
                    retry_res = httpx.post(
                        "https://api.resend.com/emails",
                        headers={"Authorization": f"Bearer {resend_key}", "Content-Type": "application/json"},
                        json=payload,
                        timeout=12
                    )
                    if retry_res.status_code in (200, 201):
                        res_data = retry_res.json()
                        return True, "resend", f"Email delivered via Resend sandbox to {to_email}", None
                    else:
                        last_error = f"Resend error ({retry_res.status_code}): {retry_res.text}"
                else:
                    last_error = f"Resend error ({res.status_code}): {res.text}"
        except Exception as e:
            last_error = f"Resend connection error: {e}"
            logger.warning(f"Resend transmission error: {e}")

    return False, "none", "", last_error


def send_registration_welcome_email(
    to_email: str,
    name: str,
    role: str,
    website_url: Optional[str] = None
) -> Dict:
    """
    Sends customized welcome email to a self-registered user using the exact same template,
    WITHOUT including the password they created during registration.
    """
    html_content, text_content, subject = generate_welcome_credentials_email(
        name=name,
        email=to_email,
        password=None,
        role=role,
        website_url=website_url
    )

    base_url = (website_url or getattr(settings, "FRONTEND_URL", "http://localhost:8082")).rstrip("/")
    role_info = get_role_info(role)
    portal_url = f"{base_url}{role_info['portal_path']}"

    result = {
        "success": False,
        "sent_to_inbox": False,
        "provider": "none",
        "message": "",
        "to": to_email,
        "portal_url": portal_url,
        "timestamp": datetime.now().isoformat(),
        "error": None
    }

    # Record to audit log (protect password from log)
    try:
        with open(SENT_EMAILS_LOG_PATH, "a", encoding="utf-8") as f:
            f.write(f"\n--- [{datetime.now().isoformat()}] REGISTRATION WELCOME TO: {to_email} | ROLE: {role} ---\n")
            f.write(f"PORTAL: {portal_url}\n")
            f.write("PASSWORD: [PROTECTED - SET BY USER DURING REGISTRATION]\n")
            f.write(text_content)
            f.write("\n" + "=" * 70 + "\n")
    except Exception as e:
        logger.warning(f"Could not write to credentials log: {e}")

    sent_to_inbox, provider, message, error = _send_email_via_smtp_or_resend(
        to_email=to_email,
        subject=subject,
        html_content=html_content,
        text_content=text_content
    )

    if sent_to_inbox:
        result.update({
            "success": True,
            "sent_to_inbox": True,
            "provider": provider,
            "message": message
        })
    else:
        result.update({
            "success": False,
            "sent_to_inbox": False,
            "provider": "local_audit",
            "message": f"Welcome email recorded to system audit log ({SENT_EMAILS_LOG_PATH}), but not sent over network.",
            "error": error or "No active SMTP or Resend mailer configured"
        })

    return result


def send_credentials_welcome_email(
    to_email: str,
    name: str,
    password: Optional[str] = None,
    role: str = "worker",
    website_url: Optional[str] = None
) -> Dict:
    """
    Sends customized welcome and credentials email to a newly created user.
    If password is None, delegates to send_registration_welcome_email.
    Uses Supabase Auth, SMTP, or Resend, falling back gracefully to audit logging.
    """
    if not password:
        return send_registration_welcome_email(
            to_email=to_email,
            name=name,
            role=role,
            website_url=website_url
        )

    html_content, text_content, subject = generate_welcome_credentials_email(
        name=name,
        email=to_email,
        password=password,
        role=role,
        website_url=website_url
    )

    base_url = (website_url or getattr(settings, "FRONTEND_URL", "http://localhost:8082")).rstrip("/")
    role_info = get_role_info(role)
    portal_url = f"{base_url}{role_info['portal_path']}"

    result = {
        "success": False,
        "sent_to_inbox": False,
        "provider": "none",
        "message": "",
        "to": to_email,
        "portal_url": portal_url,
        "timestamp": datetime.now().isoformat(),
        "error": None
    }

    # Record email content to audit log
    try:
        with open(SENT_EMAILS_LOG_PATH, "a", encoding="utf-8") as f:
            f.write(f"\n--- [{datetime.now().isoformat()}] TO: {to_email} | ROLE: {role} ---\n")
            f.write(f"PORTAL: {portal_url}\n")
            f.write(f"TEMP_PASSWORD: {password}\n")
            f.write(text_content)
            f.write("\n" + "=" * 70 + "\n")
    except Exception as e:
        logger.warning(f"Could not write to credentials log: {e}")

    last_error = None

    # Transport 1: Supabase Auth Native Email Dispatch (Primary Project Provider)
    if settings.SUPABASE_URL and settings.SUPABASE_SERVICE_ROLE_KEY:
        try:
            sb_admin = create_sb_client(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_ROLE_KEY)
            if hasattr(sb_admin, "auth") and hasattr(sb_admin.auth, "_http_client"):
                sb_admin.auth._http_client.timeout = httpx.Timeout(25.0)
            redirect_target = f"{base_url}/reset-password"
            user_meta = {"full_name": name, "role": role}

            try:
                invite_res = sb_admin.auth.admin.invite_user_by_email(
                    to_email,
                    options={"data": user_meta, "redirect_to": redirect_target}
                )
                sb_uid = invite_res.user.id
                if password:
                    sb_admin.auth.admin.update_user_by_id(sb_uid, {
                        "password": password,
                        "app_metadata": {"role": role}
                    })
                logger.info(f"Invitation email successfully delivered via Supabase Auth to {to_email}")
                result.update({
                    "success": True,
                    "sent_to_inbox": True,
                    "provider": "supabase",
                    "user_id": sb_uid,
                    "message": f"Invitation email delivered successfully to {to_email} via Supabase"
                })
                return result
            except Exception as invite_err:
                err_str = str(invite_err).lower()
                if "already" in err_str or "registered" in err_str:
                    logger.info(f"User {to_email} already exists; sending Supabase password recovery email...")
                    sb_admin.auth.reset_password_for_email(to_email, {"redirect_to": redirect_target})
                    result.update({
                        "success": True,
                        "sent_to_inbox": True,
                        "provider": "supabase",
                        "message": f"User access email delivered via Supabase to {to_email}"
                    })
                    return result
                else:
                    last_error = f"Supabase Auth error: {invite_err}"
                    logger.warning(f"Supabase invite error: {invite_err}")
                    # If Supabase built-in mailer is rate-limited, generate official action_link
                    try:
                        gen_res = sb_admin.auth.admin.generate_link({
                            "type": "invite",
                            "email": to_email,
                            "options": {"data": user_meta, "redirect_to": redirect_target}
                        })
                        act_link = None
                        if hasattr(gen_res, "properties") and hasattr(gen_res.properties, "action_link"):
                            act_link = gen_res.properties.action_link
                        elif hasattr(gen_res, "action_link"):
                            act_link = gen_res.action_link
                        elif isinstance(gen_res, dict):
                            act_link = gen_res.get("action_link") or (gen_res.get("properties") or {}).get("action_link")

                        result["action_link"] = act_link
                        result["user_id"] = getattr(gen_res.user, "id", None) if hasattr(gen_res, "user") else None
                        if password and result["user_id"]:
                            sb_admin.auth.admin.update_user_by_id(result["user_id"], {
                                "password": password,
                                "app_metadata": {"role": role}
                            })
                        logger.info(f"Generated official Supabase invite link for {to_email}")
                    except Exception as gen_err:
                        logger.warning(f"Could not generate Supabase fallback link: {gen_err}")
        except Exception as sb_err:
            last_error = f"Supabase client error: {sb_err}"
            logger.warning(f"Supabase connection error: {sb_err}")

    # Transport 2: SMTP or Resend
    sent_to_inbox, provider, message, error = _send_email_via_smtp_or_resend(
        to_email=to_email,
        subject=subject,
        html_content=html_content,
        text_content=text_content
    )

    if sent_to_inbox:
        result.update({
            "success": True,
            "sent_to_inbox": True,
            "provider": provider,
            "message": message
        })
        return result

    # Transport 3: Fallback (recorded locally)
    has_link = bool(result.get("action_link"))
    result.update({
        "success": has_link,
        "sent_to_inbox": False,
        "provider": "supabase_link" if has_link else "local_audit",
        "message": (
            f"Supabase rate limit reached. Direct Supabase invite link generated and credentials recorded to audit log ({SENT_EMAILS_LOG_PATH})."
            if has_link
            else f"Credentials recorded to system audit log ({SENT_EMAILS_LOG_PATH}), but not sent over the network to {to_email}."
        ),
        "error": last_error or error or "Supabase email rate limit reached and no fallback SMTP configured"
    })
    return result


def send_email(to: str, subject: str, html: str) -> str:
    """General utility email function with SMTP and Resend support."""
    sent_to_inbox, provider, _, _ = _send_email_via_smtp_or_resend(
        to_email=to,
        subject=subject,
        html_content=html,
        text_content=""
    )
    if sent_to_inbox:
        return f"{provider}_sent"

    logger.info(f"Mock email to {to}: {subject}")
    return "mock_message_id"


