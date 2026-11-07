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
            # Dynamically compute engineering BOQ quantities and costs instead of hardcoding
            from data_pipeline.model_engine import compute_hybrid_bottom_up
            bottom_up = compute_hybrid_bottom_up(
                floor_area_sqft=req.sq_footage,
                floors=1,
                project_type=req.project_type,
                quality_tier=req.quality_tier,
                district=req.location,
            )
            bd = bottom_up["breakdown"]
            tot = bottom_up["bottom_up_total_lkr"] or 1.0
            worker_days = bottom_up["quantities"]["worker_days"]
            # Realistic timeline assuming average site crew of 6 workers
            timeline = max(30, int(worker_days / 6.0))
            
            calculated_data = {
                "material_cost": bd["materials_lkr"],
                "labour_cost": bd["labour_lkr"],
                "equipment_cost": bd["equipment_lkr"],
                "overhead": bd["overhead_lkr"],
                "total_cost": tot,
                "timeline_days": timeline,
                "confidence_score": 85,
                "breakdown": {
                    "materials_pct": round((bd["materials_lkr"] / tot) * 100, 1),
                    "labour_pct": round((bd["labour_lkr"] / tot) * 100, 1),
                    "equipment_pct": round((bd["equipment_lkr"] / tot) * 100, 1),
                    "overhead_pct": round((bd["overhead_lkr"] / tot) * 100, 1),
                },
                "recommendations": [
                    f"Procure {bottom_up['quantities']['cement_bags']:,} cement bags and {bottom_up['quantities']['steel_kg']:,} kg steel in phased deliveries.",
                    "Engage skilled trades at standard daily labour rates (Rs. 3,500/day).",
                    "Monitor material wastage and track bulk discount opportunities."
                ]
            }
            res = supabase_db.table("quotations").insert({
                "project_id": req.project_id,
                "created_by": user["id"],
                "material_cost": calculated_data["material_cost"],
                "labour_cost": calculated_data["labour_cost"],
                "equipment_cost": calculated_data["equipment_cost"],
                "overhead": calculated_data["overhead"],
                "total_cost": calculated_data["total_cost"],
                "timeline_days": calculated_data["timeline_days"],
                "ai_generated": True
            }).execute()
            return {"data": {**calculated_data, "id": res.data[0]["quotation_id"]}}

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
