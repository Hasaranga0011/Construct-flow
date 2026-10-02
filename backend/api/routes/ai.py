"""
AI / ML endpoints for ConstructFlow.

All three endpoints require a valid Supabase JWT (enforced by the router-level
dependency in main.py).  /insights and /delay-risk additionally scope results
to the caller's assigned projects when the role is 'pm'.
"""

from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any, Dict, List, Optional

import joblib
import numpy as np
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, field_validator

from core.database import client_for_token
from core.security import get_current_user

router = APIRouter(prefix="/ai", tags=["AI Models"])

# ---------------------------------------------------------------------------
# Model registry — loaded once at startup
# ---------------------------------------------------------------------------

_MODELS_DIR = Path(__file__).resolve().parents[2] / "models"
_COST_PKL   = _MODELS_DIR / "cost_predictor.pkl"
_DELAY_PKL  = _MODELS_DIR / "delay_classifier.pkl"
_COST_META  = _MODELS_DIR / "cost_predictor_meta.json"
_DELAY_META = _MODELS_DIR / "delay_classifier_meta.json"

_COST_FEATURES = [
    "square_footage", "location", "project_type", "quality_tier",
    "num_floors", "site_condition", "structure_type", 
    "finishing_flooring", "finishing_sanitary", "finishing_electrical",
    "target_timeline"
]
_DELAY_FEATURES = ["worker_count", "material_usage", "task_progress", "safety_incidents",
                   "equipment_utilization_rate", "material_shortage_alert"]

_cost_model  = None
_delay_model = None
_cost_meta   = {}
_delay_meta  = {}


def _load_models() -> None:
    global _cost_model, _delay_model, _cost_meta, _delay_meta
    if _COST_PKL.exists():
        _cost_model = joblib.load(_COST_PKL)
    if _DELAY_PKL.exists():
        _delay_model = joblib.load(_DELAY_PKL)
    if _COST_META.exists():
        _cost_meta = json.loads(_COST_META.read_text())
    if _DELAY_META.exists():
        _delay_meta = json.loads(_DELAY_META.read_text())


_load_models()

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _require_cost_model():
    if _cost_model is None:
        raise HTTPException(
            status_code=503,
            detail="Model not trained yet — run the training pipeline "
                   "(cd backend/data_pipeline && python train_models.py)"
        )

def _require_delay_model():
    if _delay_model is None:
        raise HTTPException(
            status_code=503,
            detail="Delay model not trained yet — run the training pipeline"
        )

def _feature_importance_list(model, feature_names: List[str]) -> List[Dict]:
    """Return sorted list of {name, value} from model.feature_importances_."""
    regressor = model.named_steps['regressor'] if hasattr(model, 'named_steps') else model
    importances = regressor.feature_importances_
    result = [
        {"name": name, "value": round(float(imp) * 100, 1)}
        for name, imp in zip(feature_names, importances)
    ]
    return sorted(result, key=lambda x: x["value"], reverse=True)


def _prediction_interval(model, X) -> float:
    """
    Estimate a ±confidence width by computing the std-dev of the individual
    tree predictions.  Returns the coefficient of variation (std/mean) as a
    0-100 'uncertainty' score; lower is more confident.
    """
    import pandas as pd
    
    regressor = model.named_steps['regressor'] if hasattr(model, 'named_steps') else model
    preprocessor = model.named_steps['preprocessor'] if hasattr(model, 'named_steps') else None
    
    X_transformed = preprocessor.transform(X) if preprocessor else X
    
    tree_preds = np.array([tree.predict(X_transformed)[0] for tree in regressor.estimators_])
    mean = tree_preds.mean()
    if mean == 0:
        return 50.0
    cv = (tree_preds.std() / abs(mean)) * 100
    # Clamp to [0, 100]; invert so higher = more confident
    uncertainty = min(float(cv), 100.0)
    return round(100.0 - uncertainty, 1)


def _per_input_importance(model, X_row, original_df) -> List[Dict]:
    """
    Approximate per-prediction feature contribution by computing the
    weighted mean of each feature's global importance, scaled by how far
    the input value sits from the training mean of each feature.
    """
    regressor = model.named_steps['regressor'] if hasattr(model, 'named_steps') else model
    importances = regressor.feature_importances_
    
    # Feature ordering is num_features then cat_features based on ColumnTransformer
    feature_names = ["square_footage", "num_floors", "location", "project_type", "quality_tier", "site_condition", "structure_type", "finishing_flooring", "finishing_sanitary", "finishing_electrical", "target_timeline"]
    
    preprocessor = model.named_steps['preprocessor'] if hasattr(model, 'named_steps') else None
    X_transformed = preprocessor.transform(X_row) if preprocessor else X_row
    
    values = X_transformed[0]
    norms = np.abs(values) / (np.abs(values).sum() + 1e-9)
    raw = importances * norms
    total = raw.sum() + 1e-9
    result = [
        {"name": name, "value": round(float(r / total) * 100, 1)}
        for name, r in zip(feature_names, raw)
    ]
    return sorted(result, key=lambda x: x["value"], reverse=True)


# ---------------------------------------------------------------------------
# Request / Response models
# ---------------------------------------------------------------------------

_LOC_MAP   = {"Colombo": 0, "Kandy": 1, "Galle": 2, "Other": 3}
_TYPE_MAP  = {"Residential": 0, "Commercial": 1, "Industrial": 2}
_QUAL_MAP  = {"Standard": 0, "Premium": 1, "Luxury": 2}


class PredictRequest(BaseModel):
    square_footage: float = Field(..., gt=50, le=500_000)
    num_floors: int = Field(..., gt=0, le=100)
    location: str = Field(...)
    project_type: str = Field(...)
    quality_tier: str = Field(...)
    site_condition: str = Field(...)
    structure_type: str = Field(...)
    finishing_flooring: str = Field(...)
    finishing_sanitary: str = Field(...)
    finishing_electrical: str = Field(...)
    target_timeline: str = Field(...)


class PredictResponse(BaseModel):
    estimated_cost: float
    confidence_score: Optional[float]          # 0-100; None when not computable
    model_source: str
    model_trained_on: Optional[str]            # ISO date from metadata
    training_samples: Optional[int]
    feature_contributions: List[Dict[str, Any]]  # Per-this-prediction importance
    features_used: Dict[str, Any]
    disclaimer: str = (
        "This is a model estimate, not a financial commitment. "
        "Confirm all costs with a qualified quantity surveyor before budgeting."
    )


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.post("/predict-cost", response_model=PredictResponse)
def predict_cost(
    req: PredictRequest,
    current_user: dict = Depends(get_current_user),
):
    """
    Predict construction cost using the persisted RandomForestRegressor.
    Returns per-prediction feature contributions and a confidence score
    derived from the spread of individual tree predictions.
    """
    _require_cost_model()

    import pandas as pd
    
    # Build a DataFrame for prediction
    input_data = {
        "square_footage": [req.square_footage],
        "location": [req.location],
        "project_type": [req.project_type],
        "quality_tier": [req.quality_tier],
        "num_floors": [req.num_floors],
        "site_condition": [req.site_condition],
        "structure_type": [req.structure_type],
        "finishing_flooring": [req.finishing_flooring],
        "finishing_sanitary": [req.finishing_sanitary],
        "finishing_electrical": [req.finishing_electrical],
        "target_timeline": [req.target_timeline],
    }
    
    X_df = pd.DataFrame(input_data)

    predicted_cost  = float(_cost_model.predict(X_df)[0])
    confidence      = _prediction_interval(_cost_model, X_df)
    contributions   = _per_input_importance(_cost_model, X_df, input_data)

    return PredictResponse(
        estimated_cost=max(predicted_cost, 0),
        confidence_score=confidence,
        model_source=_cost_meta.get("model_type", "RandomForestRegressor"),
        model_trained_on=_cost_meta.get("trained_at"),
        training_samples=_cost_meta.get("dataset_size"),
        feature_contributions=contributions,
        features_used={
            "sq_ft": req.square_footage,
            "floors": req.num_floors,
            "type": req.project_type,
            "location": req.location,
            "timeline": req.target_timeline,
            "site": req.site_condition,
        },
    )


@router.get("/insights")
def get_insights(
    pm_id: Optional[str] = None,
    current_user: dict = Depends(get_current_user),
):
    """
    Returns ML insights for the dashboard:
      - feature_importance: global importance from the cost model
      - projects: per-project delay-risk scores
      - project_health: counts from real Supabase data
      - model_info: metadata from the last training run
    When role == 'pm', results are filtered to that PM's assigned projects.
    """
    _require_cost_model()
    _require_delay_model()

    db = client_for_token(current_user["token"])
    role = current_user["role"]
    caller_id = current_user["id"]

    # ---- 1. Project Health ------------------------------------------------
    # NOTE: 'square_footage' and 'project_type' do not currently exist on the 'projects' table.
    # We omit them from the select() query to avoid 42703 errors, and handle them gracefully via .get() below.
    project_query = db.table("projects").select(
        "id, name, status, total_budget, spent_cost, pm_id, location"
    )
    if role == "pm":
        project_query = project_query.eq("pm_id", pm_id or caller_id)

    projects_res = project_query.execute()
    projects = projects_res.data or []
    project_ids = [p["id"] for p in projects]

    total   = len(projects)
    active  = sum(1 for p in projects if str(p.get("status") or "").lower() in ("active", "in progress"))
    done    = sum(1 for p in projects if str(p.get("status") or "").lower() == "completed")
    on_budget = sum(
        1 for p in projects
        if float(p.get("spent_cost") or 0) <= float(p.get("total_budget") or 0)
    )
    
    # ---- 1.b Market Trends ------------------------------------------------
    market_trends = []
    completed_projects = [
        p for p in projects 
        if str(p.get("status") or "").lower() == "completed" 
        and p.get("square_footage") and float(p.get("square_footage")) > 0
        and p.get("spent_cost") and float(p.get("spent_cost")) > 0
    ]
    from collections import defaultdict
    trend_groups = defaultdict(list)
    for p in completed_projects:
        loc = p.get("location") or "Other"
        ptype = p.get("project_type") or "Residential"
        sqft = float(p.get("square_footage"))
        cost = float(p.get("spent_cost"))
        trend_groups[(loc, ptype)].append(cost / sqft)

    for (loc, ptype), costs in trend_groups.items():
        market_trends.append({
            "location": loc,
            "project_type": ptype,
            "avg_cost_per_sqft": sum(costs) / len(costs),
            "sample_size": len(costs)
        })
    market_trends.sort(key=lambda x: x["sample_size"], reverse=True)

    project_health = {
        "total": total,
        "active": active,
        "completed": done,
        "on_budget_percent": round(100 * on_budget / total) if total else 0,
        "trending_over_budget": 0  # Will compute this in the delay loop
    }

    # ---- 2. Feature Importance (global, from cost model) ------------------
    feature_importance = _feature_importance_list(_cost_model, _COST_FEATURES)

    # ---- 3. Per-project Delay Risk ----------------------------------------
    project_risks: List[Dict] = []
    if project_ids:
        # Milestone delay signal: how many milestones are past due_date and not completed
        mil_res = db.table("milestones").select(
            "project_id, status, due_date, completion_percentage"
        ).in_("project_id", project_ids).execute()
        milestones = mil_res.data or []

        # Late purchase orders signal
        po_res = db.table("purchase_orders").select(
            "project_id, status, expected_date"
        ).in_("project_id", project_ids).execute()
        pos = po_res.data or []
        import datetime
        today = datetime.date.today().isoformat()

        for project in projects:
            pid = project["id"]
            p_mils = [m for m in milestones if m.get("project_id") == pid]
            p_pos  = [o for o in pos if o.get("project_id") == pid]

            # Milestone overdue ratio
            total_mils   = len(p_mils)
            overdue_mils = sum(
                1 for m in p_mils
                if (m.get("due_date") or "9999") < today
                and m.get("status") not in ("Completed", "Done")
                and (m.get("completion_percentage") or 0) < 100
            )
            milestone_signal = (overdue_mils / total_mils) if total_mils else 0

            # Late PO ratio
            total_pos  = len(p_pos)
            late_pos   = sum(
                1 for o in p_pos
                if (o.get("expected_date") or "9999") < today
                and o.get("status") not in ("Delivered", "Received", "Cancelled")
            )
            suggested_pos = sum(
                1 for o in p_pos if o.get("status") == "Suggested"
            )
            po_signal = ((late_pos + suggested_pos * 0.5) / total_pos) if total_pos else 0

            # Build a feature vector for the delay classifier
            avg_completion = (
                sum(m.get("completion_percentage") or 0 for m in p_mils) / total_mils
                if total_mils else 50
            )
            X_delay = np.array([[
                max(1, project.get("worker_count") or 10),  # fallback
                po_signal * 100,
                avg_completion / 100,
                0,   # safety_incidents (not yet tracked)
                1 - milestone_signal,
                1 if late_pos > 0 else 0,
            ]])

            delay_proba = float(_delay_model.predict_proba(X_delay)[0][1]) * 100

            # Build human-readable risk reason
            reasons = []
            if overdue_mils > 0:
                reasons.append(f"{overdue_mils} milestone{'s' if overdue_mils > 1 else ''} past due")
            if late_pos > 0:
                reasons.append(f"{late_pos} late purchase order{'s' if late_pos > 1 else ''}")
            # ---- Forecasted Cost Overrun ----
            spent_cost = float(project.get("spent_cost") or 0)
            total_budget = float(project.get("total_budget") or 0)
            forecasted_final_cost = None
            is_over_budget = False
            
            if str(project.get("status") or "").lower() in ("active", "in progress") and avg_completion > 0 and avg_completion < 100:
                # Burn rate forecast
                forecasted_final_cost = spent_cost / (avg_completion / 100.0)
                if forecasted_final_cost > total_budget and total_budget > 0:
                    is_over_budget = True
                    project_health["trending_over_budget"] += 1
                    reasons.append(f"Trending over budget (Forecast: LKR {forecasted_final_cost:,.0f} vs Budget: LKR {total_budget:,.0f})")

            recommendation = "; ".join(reasons) if reasons else "On track"

            project_risks.append({
                "project_id": pid,
                "project_name": project.get("name", "Unnamed"),
                "delay_risk": round(delay_proba, 1),
                "recommendation": recommendation,
                "milestone_overdue_count": overdue_mils,
                "late_po_count": late_pos,
                "attendance_gap": 0, # Placeholder for frontend
                "is_over_budget": is_over_budget,
                "forecasted_cost": forecasted_final_cost,
                "total_budget": total_budget
            })

    project_risks.sort(key=lambda x: x["delay_risk"], reverse=True)

    # ---- 4. Labour count --------------------------------------------------
    try:
        labour_res = db.table("labour").select("id").execute()
        labour_count = len(labour_res.data) if labour_res.data else 0
    except Exception:
        labour_count = 0

    return {
        "feature_importance": feature_importance,
        "projects": project_risks,
        "market_trends": market_trends,
        "project_health": project_health,
        "labour_stats": {
            "total_workers": labour_count,
            "productivity_score": None,
        },
        "active_model": _cost_meta.get("model_type", "RandomForestRegressor"),
        "accuracy_score": _cost_meta.get("validation_r2", "Not validated"),
        "total_training_samples": _cost_meta.get("dataset_size", 0),
        "model_info": {
            "cost_model": _cost_meta,
            "delay_model": _delay_meta,
        },
    }

@router.post("/retrain")
def retrain_models(current_user: dict = Depends(get_current_user)):
    """
    Triggers the training pipeline asynchronously. 
    Respects the validation-gate (does not deploy if R2 is worse).
    """
    if current_user["role"] not in ("admin", "super_admin"):
        raise HTTPException(403, "Only admins can trigger model retraining.")
    
    import subprocess
    import sys
    from pathlib import Path
    
    pipeline_script = Path(__file__).resolve().parents[2] / "data_pipeline" / "train_models.py"
    
    # Run non-blocking
    subprocess.Popen([sys.executable, str(pipeline_script)])
    
    return {"status": "success", "message": "Model retraining initiated in the background."}


@router.get("/model-info")
def get_model_info(current_user: dict = Depends(get_current_user)):
    """
    Returns metadata about the currently loaded model artifacts:
    training date, dataset size, features used, and validation metrics.
    Does NOT require admin — any authenticated user may see model provenance.
    """
    cost_ok  = _cost_model is not None
    delay_ok = _delay_model is not None

    return {
        "cost_predictor": {
            "loaded": cost_ok,
            **(_cost_meta if cost_ok else {"error": "Model not trained. Run the training pipeline."}),
        },
        "delay_classifier": {
            "loaded": delay_ok,
            **(_delay_meta if delay_ok else {"error": "Model not trained. Run the training pipeline."}),
        },
    }
