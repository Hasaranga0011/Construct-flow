import io
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from reportlab.lib.pagesizes import letter
from reportlab.lib import colors
from reportlab.lib.units import inch
from reportlab.pdfgen import canvas
from core.database import supabase
from datetime import datetime

router = APIRouter(
    prefix="/documents",
    tags=["Documents"]
)

@router.get("/invoice/{project_id}")
def generate_invoice(project_id: str):
    try:
        # Fetch Project Data
        proj_res = supabase.table("projects").select("*").eq("id", project_id).execute()
        if not proj_res.data:
            raise HTTPException(status_code=404, detail="Project not found")
        project = proj_res.data[0]
        
        # Fetch Client Data
        client_res = supabase.table("clients").select("*").eq("project_id", project_id).execute()
        client = client_res.data[0] if client_res.data else {"company_name": "Unknown Client", "name": "N/A"}
        
        # Fetch Estimate to mock invoice lines
        est_res = supabase.table("estimations").select("*").eq("status", "Approved").execute()
        est_cost = 14200000 # Mock default if no estimate found
        if est_res.data:
            est_cost = est_res.data[0].get("estimated_cost", 14200000)

        # Create PDF in memory
        buffer = io.BytesIO()
        c = canvas.Canvas(buffer, pagesize=letter)
        width, height = letter
        
        # Draw Header Background
        c.setFillColor(colors.HexColor("#F97316"))
        c.rect(0, height - 1.2*inch, width, 1.2*inch, fill=1, stroke=0)
        
        # Header Text
        c.setFillColor(colors.white)
        c.setFont("Helvetica-Bold", 24)
        c.drawString(0.5*inch, height - 0.7*inch, "ConstructFlow")
        c.setFont("Helvetica", 14)
        c.drawString(0.5*inch, height - 1.0*inch, "Official Project Invoice")
        
        # Invoice Meta
        c.setFillColor(colors.black)
        c.setFont("Helvetica-Bold", 12)
        c.drawString(0.5*inch, height - 1.8*inch, f"Invoice #: INV-{project_id[:8].upper()}")
        c.setFont("Helvetica", 10)
        c.drawString(0.5*inch, height - 2.0*inch, f"Date: {datetime.now().strftime('%B %d, %Y')}")
        c.drawString(0.5*inch, height - 2.2*inch, f"Status: PAYMENT PENDING")
        
        # Billed To
        c.setFont("Helvetica-Bold", 12)
        c.drawString(width - 3.5*inch, height - 1.8*inch, "Billed To:")
        c.setFont("Helvetica", 10)
        c.drawString(width - 3.5*inch, height - 2.0*inch, f"{client.get('company_name', 'Unknown')}")
        c.drawString(width - 3.5*inch, height - 2.2*inch, f"ATTN: {client.get('name', 'N/A')}")
        c.drawString(width - 3.5*inch, height - 2.4*inch, f"Project: {project.get('name', 'Unknown')}")
        
        # Draw Table Header
        c.setStrokeColor(colors.lightgrey)
        c.line(0.5*inch, height - 3.0*inch, width - 0.5*inch, height - 3.0*inch)
        c.setFont("Helvetica-Bold", 10)
        c.drawString(0.6*inch, height - 2.9*inch, "Description")
        c.drawString(width - 2.0*inch, height - 2.9*inch, "Amount (Rs)")
        c.line(0.5*inch, height - 2.7*inch, width - 0.5*inch, height - 2.7*inch)
        
        # Table Items (Mock split based on estimate)
        materials_cost = est_cost * 0.45
        labor_cost = est_cost * 0.35
        management_cost = est_cost * 0.20
        
        c.setFont("Helvetica", 10)
        y_pos = height - 3.3*inch
        items = [
            ("Structural Materials & Supplies", materials_cost),
            ("Site Labor & Subcontractor Fees", labor_cost),
            ("Project Management & Compliance", management_cost)
        ]
        
        for desc, amt in items:
            c.drawString(0.6*inch, y_pos, desc)
            c.drawString(width - 2.0*inch, y_pos, f"{amt:,.2f}")
            y_pos -= 0.4*inch
            c.line(0.5*inch, y_pos + 0.25*inch, width - 0.5*inch, y_pos + 0.25*inch)
            
        # Total
        c.setFont("Helvetica-Bold", 14)
        c.drawString(width - 3.5*inch, y_pos - 0.4*inch, "Total Due:")
        c.setFillColor(colors.HexColor("#F97316"))
        c.drawString(width - 2.2*inch, y_pos - 0.4*inch, f"Rs. {est_cost:,.2f}")
        
        # Footer
        c.setFillColor(colors.gray)
        c.setFont("Helvetica", 8)
        c.drawCentredString(width/2.0, 0.5*inch, "Thank you for doing business with ConstructFlow. Payment is due within 14 days.")
        
        # Save
        c.showPage()
        c.save()
        
        buffer.seek(0)
        
        headers = {
            'Content-Disposition': f'attachment; filename="Invoice_{project_id[:8]}.pdf"'
        }
        
        return StreamingResponse(buffer, media_type="application/pdf", headers=headers)
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
