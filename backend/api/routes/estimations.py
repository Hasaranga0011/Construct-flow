from fastapi import APIRouter, HTTPException, Request
from typing import List
from pydantic import BaseModel, Field
from ..models import EstimationCreate, EstimationResponse
from core.notification_helper import create_notifications, create_notification
from core.database import get_auth_client

router = APIRouter(
    prefix="/estimations",
    tags=["Estimations"]
)

import numpy as np
from sklearn.linear_model import LinearRegression

class PredictRequest(BaseModel):
    project_name: str
    square_footage: float = Field(gt=0, le=500000, allow_inf_nan=False)
    num_floors: int = Field(gt=0, le=200)
    material_quality: str
    location_index: float = Field(gt=0, allow_inf_nan=False)

import json
from typing import Optional

@router.get("/", response_model=List[EstimationResponse])
def get_estimations(request: Request, district: Optional[str] = None):
    supabase = get_auth_client(request)
    try:
        response = supabase.table("estimations").select("*").order("created_at", desc=True).execute()
        rows = response.data or []
        parsed_results = []
        for r in rows:
            # Extract district/town if stored in columns or inside project_name JSON
            row_district = r.get("district")
            row_town = r.get("town")
            row_lat = r.get("latitude")
            row_lng = r.get("longitude")
            row_proj_id = r.get("project_id")
            
            pname = r.get("project_name", "")
            if (not row_district or not row_town) and pname.startswith("{"):
                try:
                    payload = json.loads(pname)
                    if not row_district:
                        row_district = payload.get("district") or payload.get("inputs", {}).get("district") or payload.get("inputs", {}).get("location")
                    if not row_town:
                        row_town = payload.get("town") or payload.get("inputs", {}).get("town")
                    if row_lat is None:
                        row_lat = payload.get("latitude")
                    if row_lng is None:
                        row_lng = payload.get("longitude")
                    if not row_proj_id:
                        row_proj_id = payload.get("project_id")
                except Exception:
                    pass

            r["district"] = row_district
            r["town"] = row_town
            r["latitude"] = row_lat
            r["longitude"] = row_lng
            r["project_id"] = row_proj_id

            if district:
                if (row_district or "").strip().lower() != district.strip().lower():
                    continue

            parsed_results.append(r)

        return parsed_results
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/", response_model=EstimationResponse)
def create_estimation(estimation: EstimationCreate, request: Request):
    supabase = get_auth_client(request)
    try:
        dumped = estimation.model_dump()
        try:
            response = supabase.table("estimations").insert(dumped).execute()
        except Exception as insert_err:
            # Fallback if DB columns are not yet applied via migration: store in project_name JSON
            err_msg = str(insert_err)
            if "Could not find the" in err_msg or "PGRST204" in err_msg or "column" in err_msg.lower():
                payload = {
                    "title": estimation.project_name,
                    "district": estimation.district,
                    "town": estimation.town,
                    "latitude": estimation.latitude,
                    "longitude": estimation.longitude,
                    "project_id": estimation.project_id
                }
                fallback_data = {
                    "project_name": json.dumps(payload),
                    "estimated_cost": estimation.estimated_cost,
                    "status": estimation.status,
                    "confidence_score": estimation.confidence_score
                }
                response = supabase.table("estimations").insert(fallback_data).execute()
            else:
                raise insert_err
        
        if not response.data:
            raise HTTPException(status_code=400, detail="Failed to create estimation")
            
        created = response.data[0]
        created["district"] = estimation.district
        created["town"] = estimation.town
        created["latitude"] = estimation.latitude
        created["longitude"] = estimation.longitude
        created["project_id"] = estimation.project_id
        return created
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/predict")
def predict_cost(req: PredictRequest, request: Request):
    try:
        # Dummy Training Data for a Simulated ML Model
        # Features: [sqft, floors, location_index]
        X_train = np.array([
            [1000, 1, 1.0], [2000, 2, 1.2], [1500, 1, 1.1],
            [3000, 3, 1.5], [5000, 5, 2.0], [800, 1, 0.9]
        ])
        # Target: Total cost
        y_train = np.array([150000, 350000, 230000, 600000, 1200000, 110000])

        model = LinearRegression()
        model.fit(X_train, y_train)

        # Quality multiplier
        quality_map = {"Standard": 1.0, "Premium": 1.35, "Luxury": 1.8}
        quality_mult = quality_map.get(req.material_quality, 1.0)

        # Predict using scikit-learn
        features = np.array([[req.square_footage, req.num_floors, req.location_index]])
        base_prediction = model.predict(features)[0]
        
        final_cost = max(0.0, float(base_prediction * quality_mult))
        
        # Save to DB
        estimation_data = {
            "project_name": req.project_name,
            "estimated_cost": final_cost,
            "status": "Pending",
            "confidence_score": None
        }
        
        from core.notification_helper import create_notifications, create_notification
        from core.database import get_auth_client
        auth_client = get_auth_client(request)
        db_response = auth_client.table("estimations").insert(estimation_data).execute()
        
        if not db_response.data:
            raise HTTPException(status_code=400, detail="Failed to save prediction to DB")
            
        return db_response.data[0]

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
