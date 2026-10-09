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

@router.get("/", response_model=List[EstimationResponse])
def get_estimations(request: Request):
    supabase = get_auth_client(request)
    try:
        response = supabase.table("estimations").select("*").order("created_at", desc=True).execute()
        return response.data
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/", response_model=EstimationResponse)
def create_estimation(estimation: EstimationCreate, request: Request):
    supabase = get_auth_client(request)
    try:
        response = supabase.table("estimations").insert(estimation.model_dump()).execute()
        
        if not response.data:
            raise HTTPException(status_code=400, detail="Failed to create estimation")
            
        return response.data[0]
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
