from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, Field, field_validator
from core.security import get_current_user
import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestRegressor
from typing import Dict, Any, Optional

router = APIRouter(
    prefix="/ai",
    tags=["AI Models"]
)

# --- ML Model Setup (Synthetic Training) ---

model = RandomForestRegressor(n_estimators=50, random_state=42)
is_trained = False

def train_mock_model():
    """Generates synthetic historical construction data and trains the random forest regressor."""
    global model, is_trained

    np.random.seed(42)
    n_samples = 1000

    # Features: sq_ft, location_encoded, type_encoded, quality_encoded
    sq_ft = np.random.randint(1000, 10000, n_samples)
    location = np.random.randint(0, 4, n_samples)
    project_type = np.random.randint(0, 3, n_samples)
    quality = np.random.randint(0, 3, n_samples)

    base_rates = np.where(project_type == 0, 8000, np.where(project_type == 1, 12000, 15000))
    loc_multipliers = np.where(location == 0, 1.2, np.where(location == 1, 1.05, 1.0))
    qual_multipliers = np.where(quality == 1, 1.5, np.where(quality == 2, 2.0, 1.0))

    noise = np.random.normal(0, 500000, n_samples)
    cost = (sq_ft * base_rates * loc_multipliers * qual_multipliers) + noise

    X = np.column_stack((sq_ft, location, project_type, quality))
    y = cost

    model.fit(X, y)
    is_trained = True

# Trigger training on module load
train_mock_model()

# --- Endpoint Models ---

class PredictRequest(BaseModel):
    square_footage: float = Field(..., gt=0, le=500000, allow_inf_nan=False, description="Square footage must be between 1 and 500,000")
    location: str = Field(..., description="One of: Colombo, Kandy, Galle, Other")
    project_type: str = Field(..., description="One of: Residential, Commercial, Industrial")
    quality_tier: str = Field(..., description="One of: Standard, Premium, Luxury")

    @field_validator("location")
    def validate_location(cls, v):
        allowed = {"Colombo", "Kandy", "Galle", "Other"}
        if v not in allowed:
            raise ValueError(f"location must be one of: {', '.join(sorted(allowed))}")
        return v

    @field_validator("project_type")
    def validate_project_type(cls, v):
        allowed = {"Residential", "Commercial", "Industrial"}
        if v not in allowed:
            raise ValueError(f"project_type must be one of: {', '.join(sorted(allowed))}")
        return v

    @field_validator("quality_tier")
    def validate_quality_tier(cls, v):
        allowed = {"Standard", "Premium", "Luxury"}
        if v not in allowed:
            raise ValueError(f"quality_tier must be one of: {', '.join(sorted(allowed))}")
        return v

class PredictResponse(BaseModel):
    estimated_cost: float
    confidence_score: Optional[int] = None
    model_source: str = "synthetic_demo"
    warning: str = "Prototype estimate trained on synthetic data; accuracy has not been validated."
    features_used: Dict[str, Any]

# --- Endpoints ---

@router.post("/predict-cost", response_model=PredictResponse)
def predict_cost(
    req: PredictRequest,
    current_user: dict = Depends(get_current_user)
):
    if not is_trained:
        raise HTTPException(status_code=500, detail="Model not trained yet.")

    try:
        loc_map = {'Colombo': 0, 'Kandy': 1, 'Galle': 2, 'Other': 3}
        type_map = {'Residential': 0, 'Commercial': 1, 'Industrial': 2}
        qual_map = {'Standard': 0, 'Premium': 1, 'Luxury': 2}

        loc_encoded = loc_map.get(req.location, 3)
        type_encoded = type_map.get(req.project_type, 0)
        qual_encoded = qual_map.get(req.quality_tier, 0)

        X_input = np.array([[req.square_footage, loc_encoded, type_encoded, qual_encoded]])
        predicted_cost = float(model.predict(X_input)[0])

        return PredictResponse(
            estimated_cost=predicted_cost,
            confidence_score=None,
            features_used={
                "sq_ft": req.square_footage,
                "location": req.location,
                "type": req.project_type,
                "quality": req.quality_tier
            }
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/insights")
def get_insights(current_user: dict = Depends(get_current_user)):
    """Returns AI generated insights for the ML Dashboard mixed with real data."""
    from core.database import client_for_token
    supabase_db = client_for_token(current_user["token"])

    # 1. Project Health Overview
    projects_res = supabase_db.table("projects").select("id, status, total_budget, spent_cost").execute()
    projects = projects_res.data or []
    total_projects = len(projects)
    active_projects = sum(1 for p in projects if p.get("status") == "In Progress")
    completed_projects = sum(1 for p in projects if p.get("status") == "Completed")

    project_health = {
        "total": total_projects,
        "active": active_projects,
        "completed": completed_projects,
        "on_budget_percent": round(100 * sum(1 for p in projects if float(p.get("spent_cost") or 0) <= float(p.get("total_budget") or 0)) / total_projects) if total_projects else 0
    }

    # 2. Feature Importance from Random Forest
    if is_trained:
        importances = model.feature_importances_
        features = ["Square Footage", "Location", "Project Type", "Quality Tier"]
        feature_importance_data = [
            {"name": f, "value": round(float(imp) * 100, 1)}
            for f, imp in zip(features, importances)
        ]
        feature_importance_data = sorted(feature_importance_data, key=lambda x: x["value"], reverse=True)
    else:
        feature_importance_data = []

    # 3. Market Trends (LKR per sq ft — Sri Lanka construction cost index)
    market_trends = []  # No verified market-price source is configured.

    # 4. Labour Stats
    try:
        labour_res = supabase_db.table("labour").select("id").execute()
        labour_count = len(labour_res.data) if labour_res.data else 0
    except Exception:
        labour_count = 0

    return {
        "feature_importance": feature_importance_data,
        "market_trends": market_trends,
        "project_health": project_health,
        "labour_stats": {
            "total_workers": labour_count,
            "productivity_score": None
        },
        "active_model": "RandomForestRegressor (synthetic demo)",
        "accuracy_score": "Not validated",
        "total_training_samples": 1000 if is_trained else 0
    }
