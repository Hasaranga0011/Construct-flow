"""
AI / ML endpoints for ConstructFlow.

All three endpoints require a valid Supabase JWT (enforced by the router-level
dependency in main.py).  /insights and /delay-risk additionally scope results
to the caller's assigned projects when the role is 'pm'.
"""

from __future__ import annotations

import datetime
import json
import os
import time
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import joblib
import numpy as np
import pandas as pd
from fastapi import APIRouter, Depends, HTTPException, File, UploadFile, Form
from pydantic import BaseModel, Field, field_validator

from core.notification_helper import create_notifications, create_notification
from core.database import client_for_token
from core.security import get_current_user
from data_pipeline.model_engine import (
    predict_cost_hybrid,
    compute_rule_based_delay_risk,
    train_and_evaluate_cost_model,
    extract_normalized_feature_importances,
)
from services.historical_data_service import (
    import_historical_projects_from_csv,
    import_historical_projects_from_file,
    import_price_indices_from_csv,
    get_all_real_projects,
    get_real_projects_count,
    get_all_historical_projects_for_display,
    get_sample_csv_template,
    SRI_LANKA_DISTRICTS,
    validate_district,
)

router = APIRouter(prefix="/ai", tags=["AI Models"])

_INSIGHTS_CACHE: Dict[str, Tuple[float, Any]] = {}
_INSIGHTS_CACHE_TTL = 20  # seconds

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


import logging

logger = logging.getLogger(__name__)


def _load_models() -> None:
    """
    Load persisted ML artifacts from disk.

    Each artifact is loaded independently so one corrupted / version-incompatible
    file cannot prevent the others (or the rest of the app) from loading.
    On any failure the relevant global is left as None and a clear ERROR is
    written to the log — the app continues to boot, and endpoints that need
    the model return 503 instead of crashing.
    """
    global _cost_model, _delay_model, _cost_meta, _delay_meta

    if _COST_PKL.exists():
        try:
            _cost_model = joblib.load(_COST_PKL)
            # Fix joblib deadlock in Uvicorn threads
            if hasattr(_cost_model, 'named_steps') and hasattr(_cost_model.named_steps.get('regressor'), 'n_jobs'):
                _cost_model.named_steps['regressor'].n_jobs = 1
            elif hasattr(_cost_model, 'n_jobs'):
                _cost_model.n_jobs = 1
            logger.info("cost_predictor loaded OK from %s", _COST_PKL)
        except Exception as exc:  # KeyError, pickle errors, version mismatches…
            _cost_model = None
            logger.error(
                "FAILED to load cost_predictor from %s — model will be unavailable. "
                "Re-run data_pipeline/train_models.py to regenerate. Error: %s",
                _COST_PKL, exc,
            )
    else:
        logger.warning("cost_predictor.pkl not found at %s — skipping.", _COST_PKL)

    if _DELAY_PKL.exists():
        try:
            _delay_model = joblib.load(_DELAY_PKL)
            # Fix joblib deadlock in Uvicorn threads
            if hasattr(_delay_model, 'n_jobs'):
                _delay_model.n_jobs = 1
            logger.info("delay_classifier loaded OK from %s", _DELAY_PKL)
        except Exception as exc:
            _delay_model = None
            logger.error(
                "FAILED to load delay_classifier from %s — model will be unavailable. "
                "Error: %s", _DELAY_PKL, exc,
            )
    else:
        logger.warning("delay_classifier.pkl not found at %s — skipping.", _DELAY_PKL)

    if _COST_META.exists():
        try:
            _cost_meta = json.loads(_COST_META.read_text())
        except Exception as exc:
            logger.error("Failed to parse cost_predictor_meta.json: %s", exc)

    if _DELAY_META.exists():
        try:
            _delay_meta = json.loads(_DELAY_META.read_text())
        except Exception as exc:
            logger.error("Failed to parse delay_classifier_meta.json: %s", exc)


_load_models()

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _require_cost_model():
    """Raise 503 if the cost model failed to load or was never trained."""
    if _cost_model is None:
        raise HTTPException(
            status_code=503,
            detail=(
                "Cost prediction model is not available — the artifact is missing or "
                "failed to load (possible version mismatch or corruption). "
                "Contact the administrator or re-run data_pipeline/train_models.py."
            ),
        )


def _require_delay_model():
    """Raise 503 if the delay classifier failed to load or was never trained."""
    if _delay_model is None:
        raise HTTPException(
            status_code=503,
            detail=(
                "Delay risk model is not available — the artifact is missing or "
                "failed to load. "
                "Contact the administrator or re-run data_pipeline/train_models.py."
            ),
        )

def _feature_importance_list(model, feature_names: Optional[List[str]] = None) -> List[Dict]:
    """Return sorted list of {name, value} from model with 100% normalization across all 9 features."""
    if _cost_meta and _cost_meta.get("feature_importances"):
        return _cost_meta["feature_importances"]
    if model is not None:
        try:
            return extract_normalized_feature_importances(model)
        except Exception as e:
            logger.warning("Could not extract feature importances from pipeline: %s", e)
    return [
        {"key": "project_type", "name": "Project Type", "value": 30.0},
        {"key": "district", "name": "District / Location", "value": 25.0},
        {"key": "quality_tier", "name": "Quality Tier", "value": 20.0},
        {"key": "structure_type", "name": "Structure Type", "value": 10.0},
        {"key": "site_condition", "name": "Site Condition", "value": 7.0},
        {"key": "floors", "name": "Number of Floors", "value": 4.0},
        {"key": "cost_year", "name": "Cost Year", "value": 2.0},
        {"key": "price_index", "name": "Price Index (CIDA Escalation)", "value": 1.5},
        {"key": "floor_area_sqft", "name": "Floor Area (Sq Ft)", "value": 0.5},
    ]


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

SRI_LANKA_DISTRICTS = [
    "Ampara", "Anuradhapura", "Badulla", "Batticaloa", "Colombo",
    "Galle", "Gampaha", "Hambantota", "Jaffna", "Kalutara",
    "Kandy", "Kegalle", "Kilinochchi", "Kurunegala", "Mannar",
    "Matale", "Matara", "Monaragala", "Mullaitivu", "Nuwara Eliya",
    "Polonnaruwa", "Puttalam", "Ratnapura", "Trincomalee", "Vavuniya"
]
_DISTRICTS_LOWER = {d.lower(): d for d in SRI_LANKA_DISTRICTS}

_LOC_MAP   = {"Colombo": 0, "Kandy": 1, "Galle": 2, "Other": 3}
_TYPE_MAP  = {"Residential": 0, "Commercial": 1, "Industrial": 2}
_QUAL_MAP  = {"Standard": 0, "Premium": 1, "Luxury": 2}


class PredictRequest(BaseModel):
    square_footage: float = Field(..., gt=50, le=500_000)
    num_floors: int = Field(1, gt=0, le=100)
    location: Optional[str] = None
    district: Optional[str] = None
    town: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    project_type: str = Field("Residential")
    quality_tier: str = Field("Standard")
    site_condition: str = Field("Level")
    structure_type: str = Field("RCC frame")
    finishing_flooring: str = Field("Standard")
    finishing_sanitary: str = Field("Standard")
    finishing_electrical: str = Field("Standard")
    target_timeline: str = Field("Standard")


class PredictResponse(BaseModel):
    estimated_cost: float
    confidence_score: Optional[float] = None          # 0-100; None when not computable
    estimated_range_min: Optional[float] = None
    estimated_range_max: Optional[float] = None
    estimated_range_display: Optional[str] = None
    bottom_up_estimate: Optional[float] = None
    ml_correction_factor: Optional[float] = None
    cost_breakdown: Optional[Dict[str, Any]] = None
    quantities_summary: Optional[Dict[str, Any]] = None
    real_projects_count: Optional[int] = 0
    validation_mape: Optional[float] = None
    validation_status: Optional[str] = None
    model_source: str = "hybrid_real_calibrated"
    model_trained_on: Optional[str] = None            # ISO date from metadata
    training_samples: Optional[int] = None
    feature_contributions: List[Dict[str, Any]] = []  # Per-this-prediction importance
    features_used: Dict[str, Any]
    district: str
    town: Optional[str] = None
    location_note: Optional[str] = None
    disclaimer: str = (
        "This is a probabilistic model estimate with standard early-stage variance (±15-20%). "
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
    Predict construction cost using the hybrid model engine:
    1. Quantity-based bottom-up BOQ calculation (materials, daily labour at Rs. 3,500, overheads)
    2. ML Log-Scale Cost-Per-Square-Foot Regressor
    3. Honest prediction uncertainty range (e.g. Rs. X to Rs. Y)
    """
    # Resolve and validate district
    raw_loc = (req.district or req.location or "").strip()
    if not raw_loc:
        raise HTTPException(status_code=422, detail="District is required for project estimation.")
    
    canonical_district = _DISTRICTS_LOWER.get(raw_loc.lower())
    if not canonical_district:
        raise HTTPException(
            status_code=422,
            detail=f"Unknown district '{raw_loc}'. Must be one of the 25 Sri Lankan districts."
        )

    # Legacy/demo mock test support if specifically monkeypatched
    if _cost_meta.get("data_source") == "synthetic_demo" and hasattr(_cost_model, "predict"):
        import pandas as pd
        features = pd.DataFrame([{
            "SquareFootage": req.square_footage,
            "Floors": req.num_floors or 1,
            "Location": canonical_district,
            "Quality": req.quality_tier,
            "Type": req.project_type,
        }])
        pred_cost = float(_cost_model.predict(features)[0])
        return PredictResponse(
            estimated_cost=pred_cost,
            confidence_score=None,
            estimated_range_min=pred_cost * 0.85,
            estimated_range_max=pred_cost * 1.15,
            estimated_range_display=f"LKR {pred_cost*0.85:,.0f} to LKR {pred_cost*1.15:,.0f}",
            bottom_up_estimate=pred_cost,
            ml_correction_factor=1.0,
            cost_breakdown={},
            quantities_summary={},
            real_projects_count=0,
            validation_mape=None,
            validation_status="Not enough real data yet (based on 0 real projects)",
            model_source=_cost_meta.get("data_source", "synthetic_demo"),
            model_trained_on=None,
            training_samples=0,
            feature_contributions=[],
            district=canonical_district,
            town=req.town.strip() if req.town else None,
            location_note="Synthetic demo model (not validated against real projects)",
            features_used={"sq_ft": req.square_footage, "type": req.project_type, "district": canonical_district},
        )

    # 1. Run Hybrid Prediction
    hybrid_res = predict_cost_hybrid(
        floor_area_sqft=req.square_footage,
        num_floors=req.num_floors,
        district=canonical_district,
        project_type=req.project_type,
        quality_tier=req.quality_tier,
        structure_type=req.structure_type,
        site_condition=req.site_condition,
    )

    # 2. Regional data availability note
    real_count = hybrid_res.get("real_projects_count", 0)
    location_note = f"Calibrated using hybrid quantity models and {real_count} real project records."
    try:
        db = client_for_token(current_user["token"])
        proj_res = db.table("projects").select("id, location, status").ilike("location", f"%{canonical_district}%").execute()
        matches = proj_res.data or []
        if len(matches) >= 2:
            location_note += f" ({len(matches)} active projects located in {canonical_district})"
    except Exception:
        pass

    # Feature contribution breakdown for frontend compatibility
    breakdown = hybrid_res.get("cost_breakdown") or {}
    total = sum(breakdown.values()) or 1.0
    contributions = [
        {"name": "Materials", "value": round((breakdown.get("materials_lkr", 0) / total) * 100, 1)},
        {"name": "Labour", "value": round((breakdown.get("labour_lkr", 0) / total) * 100, 1)},
        {"name": "Equipment & Plant", "value": round((breakdown.get("equipment_lkr", 0) / total) * 100, 1)},
        {"name": "Overheads & Preliminaries", "value": round((breakdown.get("overhead_lkr", 0) / total) * 100, 1)},
    ]

    return PredictResponse(
        estimated_cost=hybrid_res["estimated_cost_lkr"],
        confidence_score=None,
        estimated_range_min=hybrid_res["estimated_range_min_lkr"],
        estimated_range_max=hybrid_res["estimated_range_max_lkr"],
        estimated_range_display=hybrid_res["estimated_range_display"],
        bottom_up_estimate=hybrid_res["bottom_up_estimate_lkr"],
        ml_correction_factor=hybrid_res["ml_correction_factor"],
        cost_breakdown=hybrid_res["cost_breakdown"],
        quantities_summary=hybrid_res["quantities_summary"],
        real_projects_count=real_count,
        validation_mape=hybrid_res.get("validation_mape"),
        validation_status=hybrid_res.get("validation_status"),
        model_source=_cost_meta.get("model_type", "Log-Scale Cost-Per-SqFt Regressor"),
        model_trained_on=_cost_meta.get("trained_at"),
        training_samples=real_count,
        feature_contributions=contributions,
        district=canonical_district,
        town=req.town.strip() if req.town else None,
        location_note=location_note,
        features_used={
            "sq_ft": req.square_footage,
            "floors": req.num_floors,
            "type": req.project_type,
            "location": canonical_district,
            "district": canonical_district,
            "town": req.town.strip() if req.town else None,
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

    cache_key = f"{caller_id}:{role}:{pm_id or ''}"
    now = time.time()
    if cache_key in _INSIGHTS_CACHE:
        cached_time, cached_payload = _INSIGHTS_CACHE[cache_key]
        if (now - cached_time) < _INSIGHTS_CACHE_TTL:
            return cached_payload

    # ---- 1. Project Health (Excluding test data) --------------------------
    raw_projects = []
    try:
        project_query = db.table("projects").select(
            "id, name, status, total_budget, spent_cost, pm_id, location, is_test"
        )
        if role == "pm":
            project_query = project_query.eq("pm_id", pm_id or caller_id)
        projects_res = project_query.execute()
        raw_projects = projects_res.data or []
    except Exception:
        try:
            project_query = db.table("projects").select(
                "id, name, status, total_budget, spent_cost, pm_id, location"
            )
            if role == "pm":
                project_query = project_query.eq("pm_id", pm_id or caller_id)
            projects_res = project_query.execute()
            raw_projects = projects_res.data or []
        except Exception:
            raw_projects = []

    # Exclude projects flagged is_test or with test/demo/sample keywords
    def is_test_project(p: dict) -> bool:
        if p.get("is_test") is True or p.get("is_test") == 1:
            return True
        p_name = (p.get("name") or "").lower()
        return any(kw in p_name for kw in ("test", "demo", "sample"))

    projects = [p for p in raw_projects if not is_test_project(p)]
    project_ids = [p["id"] for p in projects]

    total   = len(projects)
    active  = sum(1 for p in projects if str(p.get("status") or "").lower() in ("active", "in progress"))
    done    = sum(1 for p in projects if str(p.get("status") or "").lower() == "completed")
    on_budget = sum(
        1 for p in projects
        if float(p.get("spent_cost") or 0) <= float(p.get("total_budget") or 0)
    )
    
    # Real Evaluation Metrics & Historical Projects
    real_projects_list = get_all_real_projects()
    real_count = len(real_projects_list)

    cost_meta_data = {}
    if _COST_META.exists():
        try:
            cost_meta_data = json.loads(_COST_META.read_text())
        except Exception:
            pass

    # ---- 1.b Market Trends (Requires >= 3 projects per district & type) ----
    trend_groups = defaultdict(list)
    # Include verified historical completed projects
    for hp in real_projects_list:
        sqft = float(hp.get("floor_area_sqft") or 0)
        cost = float(hp.get("actual_total_lkr") or 0)
        dist = validate_district(hp.get("district")) or hp.get("district") or "Colombo"
        ptype = hp.get("project_type") or "Residential House"
        if sqft > 0 and cost > 0:
            trend_groups[(dist, ptype)].append(cost / sqft)

    # Include live completed non-test projects
    for p in projects:
        if str(p.get("status") or "").lower() == "completed":
            sqft = float(p.get("square_footage") or 0)
            cost = float(p.get("spent_cost") or 0)
            if sqft > 0 and cost > 0:
                dist = validate_district(p.get("location")) or p.get("location") or "Colombo"
                ptype = p.get("project_type") or "Residential House"
                trend_groups[(dist, ptype)].append(cost / sqft)

    market_trends = []
    pending_market_trends = []

    for (loc, ptype), costs in trend_groups.items():
        sample_size = len(costs)
        if sample_size >= 3:
            market_trends.append({
                "location": loc,
                "project_type": ptype,
                "avg_cost_per_sqft": round(sum(costs) / sample_size, 2),
                "sample_size": sample_size
            })
        else:
            pending_market_trends.append({
                "location": loc,
                "project_type": ptype,
                "group_label": f"{loc} / {ptype}",
                "sample_size": sample_size,
                "needed": 3,
                "short": 3 - sample_size,
                "message": f"{loc} / {ptype}: {sample_size} of 3 needed"
            })

    market_trends.sort(key=lambda x: x["sample_size"], reverse=True)
    pending_market_trends.sort(key=lambda x: (-x["sample_size"], x["group_label"]))

    project_health = {
        "total": total,
        "active": active,
        "completed": done,
        "on_budget_percent": round(100 * on_budget / total) if total else 0,
        "trending_over_budget": 0  # Computed in delay loop
    }

    # ---- 2. Feature Importance (100% normalized across all 9 features) ----
    feature_importance = _feature_importance_list(_cost_model)
    cost_driver_note = cost_meta_data.get(
        "cost_driver_note",
        "The model predicts log cost per sq ft, so floor area has a small direct importance by design."
    )
    cost_driver_is_indicative = (real_count < 30)

    # ---- 3. Per-project Delay Risk & Labour Count (Excluding test data) ----
    project_risks: List[Dict] = []
    labour_count = 0

    if project_ids:
        try:
            mil_res = db.table("milestones").select(
                "project_id, status, due_date, completion_percentage"
            ).in_("project_id", project_ids).execute()
            milestones = mil_res.data or []
        except Exception as e:
            logger.warning("Failed fetching milestones: %s", e)
            milestones = []

        try:
            po_res = db.table("purchase_orders").select(
                "project_id, status, expected_date"
            ).in_("project_id", project_ids).execute()
            pos = po_res.data or []
        except Exception as e:
            logger.warning("Failed fetching purchase orders: %s", e)
            pos = []

        try:
            att_res = db.table("attendance").select("id", count="exact", head=True).execute()
            labour_count = att_res.count if att_res.count is not None else len(att_res.data or [])
        except Exception as e:
            logger.warning("Failed fetching attendance: %s", e)
            labour_count = 0
    else:
        milestones = []
        pos = []
        try:
            att_res = db.table("attendance").select("id", count="exact", head=True).execute()
            labour_count = att_res.count if att_res.count is not None else len(att_res.data or [])
        except Exception:
            labour_count = 0

    if project_ids:
        today = datetime.date.today().isoformat()
        mils_by_proj = defaultdict(list)
        for m in milestones:
            mils_by_proj[m.get("project_id")].append(m)

        pos_by_proj = defaultdict(list)
        for o in pos:
            pos_by_proj[o.get("project_id")].append(o)

        for project in projects:
            pid = project["id"]
            p_mils = mils_by_proj[pid]
            p_pos  = pos_by_proj[pid]
            spent_cost = float(project.get("spent_cost") or 0)
            total_budget = float(project.get("total_budget") or 0)

            risk_info = compute_rule_based_delay_risk(
                project_id=pid,
                project_name=project.get("name", "Unnamed"),
                milestones=p_mils,
                purchase_orders=p_pos,
                attendance_count=labour_count,
                total_budget=total_budget,
                spent_cost=spent_cost,
            )

            if risk_info.get("is_over_budget"):
                project_health["trending_over_budget"] += 1

            project_risks.append(risk_info)

    project_risks.sort(key=lambda x: x["delay_risk"], reverse=True)

    # Accuracy Metrics (Held-out cross validation only)
    mape_val = cost_meta_data.get("validation_mape")
    mae_val = cost_meta_data.get("validation_mae")
    baseline_mape = cost_meta_data.get("baseline_mape")
    evaluation_method = cost_meta_data.get("evaluation_method", f"Leave-one-out, n = {real_count}")
    is_indicative = (real_count < 100)
    confidence_interval_note = cost_meta_data.get("confidence_interval_note", "Indicative (n < 100)" if is_indicative else "Statistically robust (n ≥ 100)")
    confidence_interval_display = cost_meta_data.get("confidence_interval_display", "")

    if real_count < 30:
        accuracy_display = f"Not enough real projects yet ({real_count} of 30). Estimates use the rate-based baseline."
        accuracy_status = f"Not enough real projects yet ({real_count} of 30). Estimates use the rate-based baseline."
    else:
        accuracy_display = f"{mape_val}% MAPE"
        accuracy_status = f"Validated on {real_count} held-out real projects ({evaluation_method}, MAPE: {mape_val}%)"

    # Historical estimate-vs-actual projects table data with rates, cost_year, provenance & summary
    all_display_projects = get_all_historical_projects_for_display(limit=200)
    historical_summary = []
    valid_summary_variances = []

    for hp in all_display_projects:
        sqft = float(hp.get("floor_area_sqft") or 0)
        est = float(hp.get("estimate_total_lkr") or 0) if hp.get("estimate_total_lkr") else None
        act = float(hp.get("actual_total_lkr") or 0) if hp.get("actual_total_lkr") else None
        
        est_sqft = round(est / sqft, 2) if est and sqft > 0 else None
        act_sqft = round(act / sqft, 2) if act and sqft > 0 else None

        var_pct = None
        if est and est > 0 and act is not None:
            var_pct = round(((act - est) / est) * 100.0, 1)

        source_val = hp.get("source") or "real"
        verified_val = bool(hp.get("verified", 1))

        row_item = {
            "id": hp.get("id"),
            "project_name": hp.get("project_name"),
            "project_type": hp.get("project_type"),
            "district": hp.get("district"),
            "town": hp.get("town"),
            "floor_area_sqft": sqft,
            "cost_year": hp.get("cost_year") or datetime.date.today().year,
            "estimate_total_lkr": est,
            "actual_total_lkr": act,
            "estimate_cost_per_sqft": est_sqft,
            "actual_cost_per_sqft": act_sqft,
            "variance_pct": var_pct,
            "source": source_val,
            "verified": verified_val,
            "evidence_note": hp.get("evidence_note"),
            "imported_by": hp.get("imported_by"),
            "start_date": hp.get("start_date"),
        }
        historical_summary.append(row_item)

        # Only verified real projects with valid estimate and actual count toward summary statistics
        if est and act and var_pct is not None and source_val != "sample" and verified_val:
            valid_summary_variances.append(var_pct)

    summary_count = len(valid_summary_variances)
    mean_variance = round(sum(valid_summary_variances) / summary_count, 1) if summary_count > 0 else 0.0
    mean_abs_variance = round(sum(abs(v) for v in valid_summary_variances) / summary_count, 1) if summary_count > 0 else 0.0
    summary_warning = (
        f"Summary statistics are based on fewer than 10 projects ({summary_count} of 10) and may fluctuate."
        if summary_count < 10 else None
    )

    table_summary = {
        "count": summary_count,
        "mean_variance_pct": mean_variance,
        "mean_abs_variance_pct": mean_abs_variance,
        "warning": summary_warning,
    }

    result_payload = {
        "feature_importance": feature_importance,
        "cost_driver_note": cost_driver_note,
        "cost_driver_is_indicative": cost_driver_is_indicative,
        "projects": project_risks,
        "market_trends": market_trends,
        "pending_market_trends": pending_market_trends,
        "project_health": project_health,
        "labour_stats": {
            "total_workers": labour_count,
            "productivity_score": None,
        },
        "active_model": cost_meta_data.get("model_type", "Log-Scale Cost-Per-SqFt Regressor"),
        "accuracy_score": accuracy_display,
        "accuracy_status": accuracy_status,
        "evaluation_method": evaluation_method,
        "validation_mape": mape_val,
        "validation_mae": mae_val,
        "baseline_mape": baseline_mape,
        "real_projects_count": real_count,
        "verified_real_count": real_count,
        "total_training_samples": cost_meta_data.get("total_training_samples", real_count),
        "is_indicative": is_indicative,
        "confidence_interval_note": confidence_interval_note,
        "confidence_interval_display": confidence_interval_display,
        "historical_projects": historical_summary,
        "historical_summary_metrics": table_summary,
        "model_info": {
            "cost_model": cost_meta_data,
            "delay_model": {"type": "Rule-Based Deterministic", "factors": ["Milestones", "Purchase Orders", "Budget Overrun"]},
        },
    }

    _INSIGHTS_CACHE[cache_key] = (now, result_payload)
    return result_payload


@router.post("/retrain")
def retrain_models(current_user: dict = Depends(get_current_user)):
    """
    Retrains the Cost Predictor on real completed projects.
    Excludes synthetic rows from accuracy evaluation.
    """
    if current_user["role"] not in ("admin", "super_admin", "pm"):
        raise HTTPException(403, "Only administrators and project managers can trigger model retraining.")

    meta = train_and_evaluate_cost_model()
    _INSIGHTS_CACHE.clear()
    _load_models()

    return {
        "status": "success",
        "message": "Model retrained successfully.",
        "real_projects_count": meta.get("real_projects_count", 0),
        "validation_status": meta.get("validation_status"),
        "validation_mape": meta.get("validation_mape"),
    }


class ImportCSVRequest(BaseModel):
    csv_content: str
    evidence_note: Optional[str] = None


@router.post("/import-historical-projects")
def import_historical_projects_endpoint(
    payload: ImportCSVRequest,
    current_user: dict = Depends(get_current_user),
):
    """
    Admin CSV import for past projects' actual costs from QS / contractor BOQs.
    Requires evidence_note (QS firm, contractor, BOQ file reference).
    Validates:
      - 25 Sri Lankan districts
      - Positive area and costs
      - End date after start date
      - Deduplicates by (project_name, start_date)
    """
    if current_user["role"] not in ("admin", "super_admin", "pm"):
        raise HTTPException(403, "Only administrators and project managers can import historical project data.")

    evidence = str(payload.evidence_note or "").strip()
    if not evidence:
        raise HTTPException(
            status_code=400,
            detail="A source note / evidence note is required per batch (e.g., QS firm, contractor, BOQ file reference)."
        )

    try:
        user_identity = current_user.get("email") or current_user.get("id") or "Admin"
        res = import_historical_projects_from_csv(
            csv_content=payload.csv_content,
            evidence_note=evidence,
            imported_by=user_identity,
        )
        # Automatically retrain model if rows were inserted
        if res.get("inserted", 0) > 0:
            train_and_evaluate_cost_model()
            _INSIGHTS_CACHE.clear()
            _load_models()
        return res
    except Exception as e:
        logger.error("Error importing historical projects: %s", e)
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/import-historical-projects-file")
async def import_historical_projects_file_endpoint(
    file: UploadFile = File(...),
    evidence_note: str = Form(...),
    current_user: dict = Depends(get_current_user),
):
    """
    Admin file upload import (CSV, XLSX, XLS) for past projects' actual costs from QS / contractor BOQs.
    Requires evidence_note (QS firm, contractor, BOQ file reference).
    """
    if current_user["role"] not in ("admin", "super_admin", "pm"):
        raise HTTPException(403, "Only administrators and project managers can import historical project data.")

    evidence = str(evidence_note or "").strip()
    if not evidence:
        raise HTTPException(
            status_code=400,
            detail="A source note / evidence note is required per batch (e.g., QS firm, contractor, BOQ file reference)."
        )

    file_bytes = await file.read()
    if not file_bytes:
        raise HTTPException(status_code=400, detail="Uploaded file is empty.")

    try:
        user_identity = current_user.get("email") or current_user.get("id") or "Admin"
        res = import_historical_projects_from_file(
            file_bytes=file_bytes,
            filename=file.filename or "import.csv",
            evidence_note=evidence,
            imported_by=user_identity,
        )
        if res.get("inserted", 0) > 0:
            train_and_evaluate_cost_model()
            _INSIGHTS_CACHE.clear()
            _load_models()
        return res
    except Exception as e:
        logger.error("Error importing historical projects from file: %s", e)
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/historical-projects")
def get_historical_projects_endpoint(
    current_user: dict = Depends(get_current_user),
):
    """Returns all real historical projects and their variance."""
    return get_all_real_projects()


@router.get("/historical-template")
def get_historical_template_endpoint(
    current_user: dict = Depends(get_current_user),
):
    """Downloads sample CSV template for historical project import."""
    return {"template": get_sample_csv_template()}


@router.post("/import-price-indices")
def import_price_indices_endpoint(
    payload: ImportCSVRequest,
    current_user: dict = Depends(get_current_user),
):
    """
    Admin CSV import for CIDA Bulletin of Construction Statistics price indices.
    Columns: material_group, month (YYYY-MM), index_value.
    """
    if current_user["role"] not in ("admin", "super_admin"):
        raise HTTPException(403, "Only administrators can import CIDA price indices.")

    try:
        res = import_price_indices_from_csv(payload.csv_content)
        return res
    except Exception as e:
        logger.error("Error importing price indices: %s", e)
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/model-info")
def get_model_info(current_user: dict = Depends(get_current_user)):
    """
    Returns metadata about the currently loaded model artifacts:
    training date, real dataset size, and validation metrics (MAPE, MAE).
    """
    cost_ok = _cost_model is not None

    return {
        "cost_predictor": {
            "loaded": cost_ok,
            **(_cost_meta if cost_ok else {"error": "Model not trained. Run the training pipeline."}),
        },
        "delay_classifier": {
            "loaded": True,
            "type": "Rule-Based Deterministic",
            "factors": ["Milestones overdue", "Purchase orders late", "Budget overrun forecast"],
        },
    }
