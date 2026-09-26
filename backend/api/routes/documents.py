import io
from fastapi import APIRouter, HTTPException, Depends
from fastapi.responses import StreamingResponse
from reportlab.lib.pagesizes import letter
from reportlab.lib import colors
from reportlab.lib.units import inch
from reportlab.pdfgen import canvas
from core.database import client_for_token
from core.security import get_current_user
from datetime import datetime

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
