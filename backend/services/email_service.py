import resend
from core.config import settings

if settings.RESEND_API_KEY:
    resend.api_key = settings.RESEND_API_KEY

def send_email(to: str, subject: str, html: str) -> str:
    if not settings.RESEND_API_KEY:
        print(f"Mock send email to {to}: {subject}")
        return "mock_message_id"
        
    try:
        params: resend.Emails.SendParams = {
            "from": "ConstructFlow <noreply@constructflow.lk>",
            "to": [to],
            "subject": subject,
            "html": html,
        }
        
        email = resend.Emails.send(params)
        return email.get("id")
    except Exception as e:
        print(f"Resend email error: {e}")
        raise e

def send_weekly_report(client_email: str, project_name: str, pdf_url: str, summary_data: dict) -> str:
    subject = f"Weekly Progress Report - {project_name}"
    
    html = f"""
    <h2>Weekly Progress Report: {project_name}</h2>
    <p>Please find your automated weekly progress report below.</p>
    
    <h3>Summary</h3>
    <ul>
        <li><strong>Milestones Completed:</strong> {summary_data.get('milestones_completed', 0)}</li>
        <li><strong>Current Budget Spent:</strong> Rs. {summary_data.get('spent', 0)}</li>
        <li><strong>Status:</strong> {summary_data.get('status', 'On Track')}</li>
    </ul>
    
    <p>You can download the full detailed PDF report here:</p>
    <a href="{pdf_url}" style="padding: 10px 20px; background-color: #F97316; color: white; text-decoration: none; border-radius: 5px;">Download PDF Report</a>
    
    <p><br><br>Best regards,<br>ConstructFlow Team</p>
    """
    
    return send_email(client_email, subject, html)
