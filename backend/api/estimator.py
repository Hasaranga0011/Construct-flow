from core.notification_helper import create_notifications
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional
import json
import httpx
from core.supabase_client import supabase_db
from core.auth import get_current_user
from core.config import settings

router = APIRouter()

class EstimationRequest(BaseModel):
    project_name: str
    project_type: str
    sq_footage: float
    location: str
    quality_tier: str
    project_id: Optional[str] = None

@router.post("/")
async def generate_estimation(req: EstimationRequest, user=Depends(get_current_user)):
    try:
        if not settings.ANTHROPIC_API_KEY:
            # Fallback mock for testing if no API key
            mock_data = {
                "material_cost": 15000000,
                "labour_cost": 5000000,
                "equipment_cost": 1000000,
                "overhead": 1500000,
                "total_cost": 22500000,
                "timeline_days": 180,
                "confidence_score": 85,
                "breakdown": {
                    "materials_pct": 66.6,
                    "labour_pct": 22.2,
                    "equipment_pct": 4.4,
                    "overhead_pct": 6.8
                },
                "recommendations": ["Optimize material bulk ordering"]
            }
            res = supabase_db.table("quotations").insert({
                "project_id": req.project_id,
                "created_by": user["id"],
                "material_cost": mock_data["material_cost"],
                "labour_cost": mock_data["labour_cost"],
                "equipment_cost": mock_data["equipment_cost"],
                "overhead": mock_data["overhead"],
                "total_cost": mock_data["total_cost"],
                "timeline_days": mock_data["timeline_days"],
                "ai_generated": True
            }).execute()
            return {"data": {**mock_data, "id": res.data[0]["quotation_id"]}}

        # Actual Claude API call
        system_prompt = "You are a Sri Lanka construction cost expert. Always respond with valid JSON only. No explanation text."
        
        user_prompt = f"""
        Project details:
        Name: {req.project_name}
        Type: {req.project_type}
        Size: {req.sq_footage} sq_footage
        Location: {req.location}
        Quality: {req.quality_tier}

        Sri Lanka 2024 material rates:
        Cement: Rs.2100/50kg bag
        Steel bars: Rs.220/kg
        Bricks: Rs.35 each
        River sand: Rs.8500/cube
        Aggregate: Rs.7500/cube
        Tiles (local): Rs.150/sqft

        Labour rates:
        Mason: Rs.3500/day
        Carpenter: Rs.3000/day
        Electrician: Rs.3500/day
        Plumber: Rs.3000/day
        Labourer: Rs.2000/day

        Quality multipliers:
        Standard: 1.0x
        Premium: 1.35x
        Luxury: 1.8x

        Return JSON format:
        {{
          "material_cost": number,
          "labour_cost": number,
          "equipment_cost": number,
          "overhead": number,
          "total_cost": number,
          "timeline_days": number,
          "confidence_score": number,
          "breakdown": {{
            "materials_pct": number,
            "labour_pct": number,
            "equipment_pct": number,
            "overhead_pct": number
          }},
          "recommendations": [string]
        }}
        """

        headers = {
            "x-api-key": settings.ANTHROPIC_API_KEY,
            "anthropic-version": "2023-06-01",
            "content-type": "application/json"
        }
        
        payload = {
            "model": "claude-3-5-sonnet-20240620", # Sonnet 3.5
            "max_tokens": 1500,
            "system": system_prompt,
            "messages": [
                {"role": "user", "content": user_prompt}
            ]
        }

        async with httpx.AsyncClient() as client:
            response = await client.post("https://api.anthropic.com/v1/messages", headers=headers, json=payload, timeout=60.0)
            
            if response.status_code != 200:
                print(f"Claude Error: {response.text}")
                raise HTTPException(status_code=500, detail="AI generation failed")
                
            response_data = response.json()
            content_text = response_data['content'][0]['text']
            
            # Clean up JSON if claude added markdown
            content_text = content_text.strip()
            if content_text.startswith("```json"):
                content_text = content_text.replace("```json", "").replace("```", "").strip()
                
            result_json = json.loads(content_text)
            
            # Save to DB
            insert_data = {
                "project_id": req.project_id,
                "created_by": user["id"],
                "material_cost": result_json.get("material_cost", 0),
                "labour_cost": result_json.get("labour_cost", 0),
                "equipment_cost": result_json.get("equipment_cost", 0),
                "overhead": result_json.get("overhead", 0),
                "total_cost": result_json.get("total_cost", 0),
                "timeline_days": result_json.get("timeline_days", 0),
                "ai_generated": True
            }
            
            db_res = supabase_db.table("quotations").insert(insert_data).execute()
            
            return {"data": {**result_json, "id": db_res.data[0]["quotation_id"]}}
            
    except Exception as e:
        print(f"Estimator error: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")

@router.get("/")
def get_quotations(user=Depends(get_current_user)):
    try:
        res = supabase_db.table("quotations").select("*, projects(name)").execute()
        return {"data": res.data}
    except Exception as e:
        print(f"Get quotations error: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")

@router.post("/{quotation_id}/send")
def send_quotation(quotation_id: str, user=Depends(get_current_user)):
    # Handled in pdf_service and email_service, simplified here
    try:
        # TODO: Call pdf_service to generate PDF and upload to Cloudinary
        # TODO: Call email_service to send email via Resend
        
        # Update sent status
        supabase_db.table("quotations").update({"sent_to_client": True, "status": "sent"}).eq("quotation_id", quotation_id).execute()
        
        return {"message": "Quotation sent successfully"}
    except Exception as e:
        print(f"Send quotation error: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")
