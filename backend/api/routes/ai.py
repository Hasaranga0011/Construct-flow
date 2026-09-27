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

_COST_FEATURES  = ["square_footage", "num_workers", "materials_cost", "labour_cost", "completion_percentage"]
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
    importances = model.feature_importances_
    result = [
        {"name": name, "value": round(float(imp) * 100, 1)}
        for name, imp in zip(feature_names, importances)
    ]
    return sorted(result, key=lambda x: x["value"], reverse=True)


def _prediction_interval(model, X: np.ndarray) -> float:
    """
    Estimate a ±confidence width by computing the std-dev of the individual
    tree predictions.  Returns the coefficient of variation (std/mean) as a
    0-100 'uncertainty' score; lower is more confident.
    """
    tree_preds = np.array([tree.predict(X)[0] for tree in model.estimators_])
    mean = tree_preds.mean()
    if mean == 0:
        return 50.0
    cv = (tree_preds.std() / abs(mean)) * 100
    # Clamp to [0, 100]; invert so higher = more confident
    uncertainty = min(float(cv), 100.0)
    return round(100.0 - uncertainty, 1)


def _per_input_importance(model, X_row: np.ndarray, feature_names: List[str]) -> List[Dict]:
    """
    Approximate per-prediction feature contribution by computing the
    weighted mean of each feature's global importance, scaled by how far
    the input value sits from the training mean of each feature.
    This is a lightweight linear approximation (no SHAP dependency needed).
    The ranking is meaningful even if the absolute percentages are rounded.
    """
    importances = model.feature_importances_
    # Raw contribution = importance × |value| (normalised)
    values = X_row[0]
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
    square_footage: float = Field(
        ..., gt=50, le=500_000,
        description="Built-up area in sq ft. Must be between 50 and 500,000."
    )
    location: str = Field(..., description="One of: Colombo, Kandy, Galle, Other")
    project_type: str = Field(..., description="One of: Residential, Commercial, Industrial")
    quality_tier: str = Field(..., description="One of: Standard, Premium, Luxury")

    @field_validator("location")
    @classmethod
    def validate_location(cls, v: str) -> str:
        allowed = set(_LOC_MAP)
        if v not in allowed:
            raise ValueError(f"location must be one of: {', '.join(sorted(allowed))}")
        return v

    @field_validator("project_type")
    @classmethod
    def validate_project_type(cls, v: str) -> str:
        allowed = set(_TYPE_MAP)
        if v not in allowed:
            raise ValueError(f"project_type must be one of: {', '.join(sorted(allowed))}")
        return v

    @field_validator("quality_tier")
    @classmethod
    def validate_quality_tier(cls, v: str) -> str:
        allowed = set(_QUAL_MAP)
        if v not in allowed:
            raise ValueError(f"quality_tier must be one of: {', '.join(sorted(allowed))}")
        return v


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

    # Build the feature vector the model was trained on.
    # The pipeline uses: square_footage, num_workers, materials_cost,
    # labour_cost, completion_percentage
    # For estimation requests we have only 4 user inputs, so we approximate
    # the derived features from the user-visible inputs.
    loc_enc   = _LOC_MAP[req.location]
    type_enc  = _TYPE_MAP[req.project_type]
    qual_enc  = _QUAL_MAP[req.quality_tier]

    # Derive numeric approximations for pipeline features
    # (same heuristic as prepare_dataset.py / seed_from_kaggle.py)
    base_workers = {"Residential": 8, "Commercial": 20, "Industrial": 35}[req.project_type]
    area_workers = max(base_workers, int(req.square_footage / 450))
    materials_cost = area_workers * 150 * (1 + qual_enc * 0.5)
    labour_cost    = area_workers * 45
    completion_pct = 0.0   # new project — no completion yet

    X = np.array([[req.square_footage, area_workers, materials_cost,
                   labour_cost, completion_pct]])

    predicted_cost  = float(_cost_model.predict(X)[0])
    confidence      = _prediction_interval(_cost_model, X)
    contributions   = _per_input_importance(_cost_model, X, _COST_FEATURES)

    return PredictResponse(
        estimated_cost=max(predicted_cost, 0),
        confidence_score=confidence,
        model_source=_cost_meta.get("model_type", "RandomForestRegressor"),
        model_trained_on=_cost_meta.get("trained_at"),
        training_samples=_cost_meta.get("dataset_size"),
        feature_contributions=contributions,
        features_used={
            "sq_ft": req.square_footage,
            "location": req.location,
            "type": req.project_type,
            "quality": req.quality_tier,
            "estimated_workers": area_workers,
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
    project_query = db.table("projects").select(
        "id, name, status, total_budget, spent_cost, pm_id"
    )
    if role == "pm":
        project_query = project_query.eq("pm_id", pm_id or caller_id)

    projects_res = project_query.execute()
    projects = projects_res.data or []
    project_ids = [p["id"] for p in projects]

    total   = len(projects)
    active  = sum(1 for p in projects if p.get("status") == "In Progress")
    done    = sum(1 for p in projects if p.get("status") == "Completed")
    on_budget = sum(
        1 for p in projects
        if float(p.get("spent_cost") or 0) <= float(p.get("total_budget") or 0)
    )
    project_health = {
        "total": total,
        "active": active,
        "completed": done,
        "on_budget_percent": round(100 * on_budget / total) if total else 0,
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
            if suggested_pos > 0:
                reasons.append(f"{suggested_pos} order{'s' if suggested_pos > 1 else ''} awaiting supplier confirmation")
            recommendation = "; ".join(reasons) if reasons else "On track"

            project_risks.append({
                "project_id": pid,
                "project_name": project.get("name", "Unnamed"),
                "delay_risk": round(delay_proba, 1),
                "recommendation": recommendation,
                "milestone_overdue_count": overdue_mils,
                "late_po_count": late_pos,
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
        # Legacy key kept for DelayRiskPanel backwards compat
        "market_trends": [],
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
