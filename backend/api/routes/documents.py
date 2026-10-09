import io
from fastapi import APIRouter, HTTPException, Depends
from fastapi.responses import StreamingResponse
from reportlab.lib.pagesizes import letter
from reportlab.lib import colors
from reportlab.lib.units import inch
from reportlab.pdfgen import canvas
from core.notification_helper import create_notifications, create_notification
from core.database import client_for_token
from core.security import get_current_user
from datetime import datetime
import json

router = APIRouter(
    prefix="/documents",
    tags=["Documents"]
)


def _check_project_access(project_id: str, current_user: dict) -> dict:
    """
    Verify the requesting user has access to the given project.
    - admin / super_admin: always allowed
    - pm: must have a row in pm_projects
    - client: must be projects.client_id
    Raises HTTPException 403 if not allowed, 404 if project not found.
    Returns the project row on success.
    """
    supabase = client_for_token(current_user["token"])
    proj_res = supabase.table("projects").select("*").eq("id", project_id).execute()
    if not proj_res.data:
        raise HTTPException(status_code=404, detail="Project not found")

    project = proj_res.data[0]
    role = current_user.get("role", "")
    user_id = current_user.get("id", "")

    if role in ("admin", "super_admin"):
        return project

    if role == "pm":
        pm_check = (
            supabase.table("pm_projects")
            .select("project_id")
            .eq("pm_id", user_id)
            .eq("project_id", project_id)
            .execute()
        )
        if not pm_check.data:
            raise HTTPException(status_code=403, detail="Access denied: not your project")
        return project

    if role == "client":
        if project.get("client_id") != user_id:
            raise HTTPException(status_code=403, detail="Access denied: not your project")
        return project

    raise HTTPException(status_code=403, detail="Access denied: insufficient role")


@router.get("/invoice/{project_id}")
def generate_invoice(
    project_id: str,
    current_user: dict = Depends(get_current_user)
):
    try:
        supabase = client_for_token(current_user["token"])
        project = _check_project_access(project_id, current_user)

        # Fetch Client profile
        client_id = project.get("client_id")
        client = {"full_name": "Unknown Client", "company_name": "N/A"}
        if client_id:
            client_res = supabase.table("profiles").select("full_name, email").eq("id", client_id).execute()
            if client_res.data:
                client = client_res.data[0]

        # Fetch the latest approved estimation for this project
        est_res = (
            supabase.table("estimations")
            .select("result")
            .eq("project_id", project_id)
            .order("created_at", desc=True)
            .limit(1)
            .execute()
        )
        est_cost = project.get("total_budget") or 0
        if est_res.data:
            result = est_res.data[0].get("result") or {}
            if isinstance(result, dict):
                est_cost = result.get("estimated_cost", est_cost)

        # Build the PDF in memory
        buffer = io.BytesIO()
        c = canvas.Canvas(buffer, pagesize=letter)
        width, height = letter

        # Header background
        c.setFillColor(colors.HexColor("#F97316"))
        c.rect(0, height - 1.2 * inch, width, 1.2 * inch, fill=1, stroke=0)

        c.setFillColor(colors.white)
        c.setFont("Helvetica-Bold", 24)
        c.drawString(0.5 * inch, height - 0.7 * inch, "ConstructFlow")
        c.setFont("Helvetica", 14)
        c.drawString(0.5 * inch, height - 1.0 * inch, "Official Project Invoice")

        # Invoice meta
        c.setFillColor(colors.black)
        c.setFont("Helvetica-Bold", 12)
        c.drawString(0.5 * inch, height - 1.8 * inch, f"Invoice #: INV-{project_id[:8].upper()}")
        c.setFont("Helvetica", 10)
        invoice_date = datetime.now().strftime("%d/%m/%Y")
        c.drawString(0.5 * inch, height - 2.0 * inch, f"Date: {invoice_date}")
        c.drawString(0.5 * inch, height - 2.2 * inch, "Status: PAYMENT PENDING")

        # Billed To
        c.setFont("Helvetica-Bold", 12)
        c.drawString(width - 3.5 * inch, height - 1.8 * inch, "Billed To:")
        c.setFont("Helvetica", 10)
        c.drawString(width - 3.5 * inch, height - 2.0 * inch, client.get("full_name", "Unknown"))
        c.drawString(width - 3.5 * inch, height - 2.2 * inch, f"Email: {client.get('email', 'N/A')}")
        c.drawString(width - 3.5 * inch, height - 2.4 * inch, f"Project: {project.get('name', 'Unknown')}")

        # Table header
        c.setStrokeColor(colors.lightgrey)
        c.line(0.5 * inch, height - 3.0 * inch, width - 0.5 * inch, height - 3.0 * inch)
        c.setFont("Helvetica-Bold", 10)
        c.drawString(0.6 * inch, height - 2.9 * inch, "Description")
        c.drawString(width - 2.0 * inch, height - 2.9 * inch, "Amount (Rs.)")
        c.line(0.5 * inch, height - 2.7 * inch, width - 0.5 * inch, height - 2.7 * inch)

        # Line items (proportional split of total estimate)
        materials_cost = est_cost * 0.45
        labor_cost = est_cost * 0.35
        management_cost = est_cost * 0.20

        c.setFont("Helvetica", 10)
        y_pos = height - 3.3 * inch
        items = [
            ("Structural Materials & Supplies", materials_cost),
            ("Site Labour & Subcontractor Fees", labor_cost),
            ("Project Management & Compliance", management_cost),
        ]

        for desc, amt in items:
            c.drawString(0.6 * inch, y_pos, desc)
            c.drawString(width - 2.0 * inch, y_pos, f"{amt:,.2f}")
            y_pos -= 0.4 * inch
            c.line(0.5 * inch, y_pos + 0.25 * inch, width - 0.5 * inch, y_pos + 0.25 * inch)

        # Total
        c.setFont("Helvetica-Bold", 14)
        c.drawString(width - 3.5 * inch, y_pos - 0.4 * inch, "Total Due:")
        c.setFillColor(colors.HexColor("#F97316"))
        c.drawString(width - 2.2 * inch, y_pos - 0.4 * inch, f"Rs. {est_cost:,.2f}")

        # Footer
        c.setFillColor(colors.gray)
        c.setFont("Helvetica", 8)
        c.drawCentredString(
            width / 2.0,
            0.5 * inch,
            "Thank you for doing business with ConstructFlow. Payment is due within 14 days."
        )

        c.showPage()
        c.save()
        buffer.seek(0)

        headers = {
            "Content-Disposition": f'attachment; filename="Invoice_{project_id[:8]}.pdf"'
        }
        return StreamingResponse(buffer, media_type="application/pdf", headers=headers)

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/estimation/{estimation_id}/pdf")
def generate_estimation_pdf(
    estimation_id: str,
    current_user: dict = Depends(get_current_user)
):
    try:
        supabase = client_for_token(current_user["token"])
        
        # Fetch the estimation
        est_res = supabase.table("estimations").select("*").eq("id", estimation_id).execute()
        if not est_res.data:
            raise HTTPException(status_code=404, detail="Estimation not found")
        
        est = est_res.data[0]
        
        # Parse JSON from project_name if available
        title = est.get("project_name", "AI Cost Estimate")
        inputs = None
        contribs = []
        try:
            parsed = json.loads(title)
            if "title" in parsed:
                title = parsed["title"]
                inputs = parsed.get("inputs", {})
                contribs = parsed.get("contributions", [])
        except Exception:
            pass

        # Build the PDF in memory
        buffer = io.BytesIO()
        c = canvas.Canvas(buffer, pagesize=letter)
        width, height = letter

        # Header background
        c.setFillColor(colors.HexColor("#0F1117")) # Dark brand color
        c.rect(0, height - 1.2 * inch, width, 1.2 * inch, fill=1, stroke=0)

        c.setFillColor(colors.white)
        c.setFont("Helvetica-Bold", 24)
        c.drawString(0.5 * inch, height - 0.7 * inch, "ConstructFlow")
        c.setFont("Helvetica", 14)
        c.drawString(0.5 * inch, height - 1.0 * inch, "AI Cost Estimation Report")

        # Meta
        c.setFillColor(colors.black)
        c.setFont("Helvetica-Bold", 12)
        c.drawString(0.5 * inch, height - 1.8 * inch, f"Estimation ID: EST-{str(estimation_id)[:8].upper()}")
        c.setFont("Helvetica", 10)
        est_date = datetime.fromisoformat(est["created_at"].replace("Z", "+00:00")).strftime("%d/%m/%Y")
        c.drawString(0.5 * inch, height - 2.0 * inch, f"Date: {est_date}")
        c.drawString(0.5 * inch, height - 2.2 * inch, f"Status: {est.get('status', 'Pending')}")

        # Project details
        c.setFont("Helvetica-Bold", 12)
        c.drawString(width - 4.0 * inch, height - 1.8 * inch, "Project Overview:")
        c.setFont("Helvetica", 10)
        c.drawString(width - 4.0 * inch, height - 2.0 * inch, title)
        
        if inputs:
            y_input = height - 2.2 * inch
            c.drawString(width - 4.0 * inch, y_input, f"Area: {inputs.get('sq_ft', 'N/A')} sq.ft")
            c.drawString(width - 4.0 * inch, y_input - 0.2*inch, f"Floors: {inputs.get('floors', 'N/A')}")
            c.drawString(width - 4.0 * inch, y_input - 0.4*inch, f"Site: {inputs.get('site', 'N/A')}")
            c.drawString(width - 4.0 * inch, y_input - 0.6*inch, f"Structure: {inputs.get('structure', 'N/A')}")

        # Summary
        y_pos = height - 3.2 * inch
        c.setStrokeColor(colors.lightgrey)
        c.line(0.5 * inch, y_pos, width - 0.5 * inch, y_pos)
        
        c.setFont("Helvetica-Bold", 14)
        c.drawString(0.5 * inch, y_pos - 0.4 * inch, "Estimated Total Cost:")
        c.setFillColor(colors.HexColor("#F97316"))
        c.setFont("Helvetica-Bold", 16)
        c.drawString(3.0 * inch, y_pos - 0.4 * inch, f"Rs. {est.get('estimated_cost', 0):,.2f}")
        c.setFillColor(colors.black)

        if est.get("confidence_score") is not None:
            c.setFont("Helvetica", 10)
            c.drawString(0.5 * inch, y_pos - 0.7 * inch, f"Model Confidence Score: {est.get('confidence_score')}%")

        y_pos -= 1.2 * inch

        # Cost Breakdown table
        c.setFont("Helvetica-Bold", 12)
        c.drawString(0.5 * inch, y_pos, "Cost Contribution Breakdown (Model Output)")
        y_pos -= 0.1 * inch
        
        c.line(0.5 * inch, y_pos, width - 0.5 * inch, y_pos)
        c.setFont("Helvetica-Bold", 10)
        c.drawString(0.6 * inch, y_pos - 0.2 * inch, "Factor")
        c.drawString(width - 2.0 * inch, y_pos - 0.2 * inch, "Weight (%)")
        c.line(0.5 * inch, y_pos - 0.3 * inch, width - 0.5 * inch, y_pos - 0.3 * inch)

        y_pos -= 0.5 * inch
        c.setFont("Helvetica", 10)
        
        if contribs:
            for item in contribs:
                c.drawString(0.6 * inch, y_pos, str(item.get("name", "")))
                c.drawString(width - 2.0 * inch, y_pos, f"{item.get('value', 0):.1f}%")
                y_pos -= 0.25 * inch
                c.setStrokeColor(colors.whitesmoke)
                c.line(0.5 * inch, y_pos + 0.15 * inch, width - 0.5 * inch, y_pos + 0.15 * inch)
        else:
            items = [
                ("Materials", 42.0),
                ("Labour", 26.0),
                ("Equipment", 16.0),
                ("Overhead", 16.0)
            ]
            for desc, pct in items:
                c.drawString(0.6 * inch, y_pos, desc)
                c.drawString(width - 2.0 * inch, y_pos, f"{pct:.1f}%")
                y_pos -= 0.25 * inch
                c.setStrokeColor(colors.whitesmoke)
                c.line(0.5 * inch, y_pos + 0.15 * inch, width - 0.5 * inch, y_pos + 0.15 * inch)

        # Footer
        c.setFillColor(colors.gray)
        c.setFont("Helvetica", 8)
        c.drawCentredString(
            width / 2.0,
            0.5 * inch,
            "Disclaimer: This is an AI-generated estimate and should be validated by a professional Quantity Surveyor."
        )

        c.showPage()
        c.save()
        buffer.seek(0)

        headers = {
            "Content-Disposition": f'attachment; filename="Estimate_{str(estimation_id)[:8]}.pdf"'
        }
        return StreamingResponse(buffer, media_type="application/pdf", headers=headers)

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

