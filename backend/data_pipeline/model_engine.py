"""
ConstructFlow Real Construction Cost & Delay Model Engine.

Implements:
1. Log-scale Cost-per-Square-Foot prediction:
   Target = ln(actual_total_lkr / floor_area_sqft)
   Predicted Cost = exp(prediction) * floor_area_sqft
2. Segmented Baseline Benchmark (rate per sq ft by district, type, and quality tier)
3. Honest Evaluation: Chronological train/test split, strict MAPE & MAE on real projects ONLY
4. Validation Gate: Model only deploys if it beats the simple baseline on real held-out projects
5. Hybrid Bottom-Up Estimator (Quantities x latest prices + labour at Rs. 3,500/day + 15% overhead)
6. Honest Uncertainty Prediction Range (conformal/residual interval)
7. Time-adjusted price index escalation (CIDA price indices)
8. Delay Risk: 100% rule-based from live milestones, POs, and attendance
"""

from __future__ import annotations
from core.verified_ml import ModelNotReady, load_verified_model

import datetime
import hashlib
import io
import tempfile
import json
import logging
import math
import os
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import joblib
import numpy as np
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.ensemble import RandomForestRegressor
from sklearn.metrics import mean_absolute_error
from sklearn.model_selection import KFold
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder

from services.historical_data_service import (
    get_all_real_projects,
    get_real_projects_count,
    get_construction_price_index,
    SRI_LANKA_DISTRICTS,
    DISTRICTS_LOWER,
    PROJECT_TYPES,
    QUALITY_TIERS,
)

logger = logging.getLogger(__name__)

CATEGORICAL_FEATURES = ["district", "project_type", "quality_tier", "structure_type", "site_condition"]
NUMERIC_FEATURES = ["floors", "floor_area_sqft", "cost_year", "price_index"]
NUMERICAL_FEATURES = NUMERIC_FEATURES
ALL_FEATURES = ["district", "project_type", "quality_tier", "structure_type", "site_condition", "floors", "floor_area_sqft", "cost_year", "price_index"]
FEATURES = ALL_FEATURES

FEATURE_DISPLAY_NAMES = {
    "project_type": "Project Type",
    "district": "District / Location",
    "quality_tier": "Quality Tier",
    "structure_type": "Structure Type",
    "site_condition": "Site Condition",
    "floors": "Number of Floors",
    "cost_year": "Cost Year",
    "price_index": "Price Index (CIDA Escalation)",
    "floor_area_sqft": "Floor Area (Sq Ft)",
}

MODELS_DIR = Path(os.environ.get("CONSTRUCTFLOW_MODEL_DIR", str(Path(__file__).resolve().parents[1] / "models")))
MODELS_DIR.mkdir(parents=True, exist_ok=True)

COST_MODEL_PKL = MODELS_DIR / "cost_predictor.pkl"
COST_META_JSON = MODELS_DIR / "cost_predictor_meta.json"

# Base rate benchmarks per sqft in LKR (2025-2026 market rates)
BASE_RATES_BY_TYPE = {
    "Residential House": 11_500.0,
    "Commercial Building": 18_000.0,
    "Apartment Complex": 16_500.0,
    "Industrial": 13_000.0,
    "Warehouse": 9_500.0,
    "Road Construction": 7_000.0,
    "Renovation": 8_500.0,
}

QUALITY_MULTIPLIERS = {
    "Standard": 1.0,
    "Premium": 1.35,
    "Luxury": 1.85,
}

DISTRICT_MULTIPLIERS = {
    "Colombo": 1.28, "Gampaha": 1.15, "Kalutara": 1.10,
    "Kandy": 1.12, "Matale": 0.98, "Nuwara Eliya": 1.14,
    "Galle": 1.09, "Matara": 1.05, "Hambantota": 1.02,
    "Jaffna": 1.08, "Kilinochchi": 0.98, "Mannar": 0.99,
    "Vavuniya": 0.97, "Mullaitivu": 0.98, "Batticaloa": 1.04,
    "Ampara": 0.97, "Trincomalee": 1.05, "Kurunegala": 1.02,
    "Puttalam": 1.00, "Anuradhapura": 0.98, "Polonnaruwa": 0.98,
    "Badulla": 1.03, "Monaragala": 0.96, "Ratnapura": 1.01,
    "Kegalle": 1.02,
}

# Sri Lanka standard daily labour rate
STANDARD_DAILY_LABOUR_RATE = 3_500.0


def calculate_mape(actuals: np.ndarray, predictions: np.ndarray) -> float:
    """Computes Mean Absolute Percentage Error (MAPE)."""
    valid = actuals > 0
    if not np.any(valid):
        return 0.0
    return float(np.mean(np.abs((actuals[valid] - predictions[valid]) / actuals[valid])) * 100.0)


def compute_baseline_cost_per_sqft(district: str, project_type: str, quality_tier: str) -> float:
    """Simple baseline lookup: rate per sqft by district and quality tier."""
    base = BASE_RATES_BY_TYPE.get(project_type, 12_000.0)
    qual = QUALITY_MULTIPLIERS.get(quality_tier, 1.0)
    dist = DISTRICT_MULTIPLIERS.get(district, 1.0)
    return base * qual * dist


def compute_hybrid_bottom_up(
    floor_area_sqft: float,
    floors: int,
    project_type: str,
    quality_tier: str,
    district: str,
    site_condition: str = "Flat",
    cost_year: Optional[int] = None,
) -> Dict[str, Any]:
    """
    Computes a realistic quantity-based bottom-up BOQ estimate:
    Materials (cement, steel, sand, aggregate, finishes) +
    Labour (worker-days x Rs. 3,500) + 15% overhead.
    """
    qual_mult = QUALITY_MULTIPLIERS.get(quality_tier, 1.0)
    dist_mult = DISTRICT_MULTIPLIERS.get(district, 1.0)
    sloped_factor = 1.15 if "slope" in site_condition.lower() else (1.25 if "excavat" in site_condition.lower() or "piling" in site_condition.lower() else 1.0)

    # Time escalation from CIDA price indices (Base 2025: 246.0)
    target_year = int(cost_year) if cost_year else datetime.date.today().year
    escalation_factor = get_construction_price_index(target_year) / 246.0

    # Physical quantity proxies per sqft
    cement_bags = floor_area_sqft * 0.38
    steel_kg = floor_area_sqft * 3.6
    sand_cubes = floor_area_sqft * 0.012
    aggregate_cubes = floor_area_sqft * 0.015

    # Current unit prices in LKR
    cement_cost = cement_bags * 2_350.0 * dist_mult * escalation_factor
    steel_cost = steel_kg * 290.0 * dist_mult * escalation_factor
    sand_cost = sand_cubes * 24_000.0 * dist_mult * escalation_factor
    aggregate_cost = aggregate_cubes * 22_000.0 * dist_mult * escalation_factor

    # Finishes, MEP, masonry
    finishes_base = 2_800.0 * qual_mult * dist_mult * escalation_factor
    finishes_cost = floor_area_sqft * finishes_base

    total_materials = (cement_cost + steel_cost + sand_cost + aggregate_cost + finishes_cost) * sloped_factor

    # Labour: ~1.0 worker-day per sqft across structural + finishing phases
    worker_days = floor_area_sqft * 0.95 * (1.1 if floors > 2 else 1.0)
    total_labour = worker_days * STANDARD_DAILY_LABOUR_RATE

    # Equipment & Machinery
    total_equipment = floor_area_sqft * 450.0 * (1.2 if floors > 2 else 1.0)

    # Overhead & Preliminaries (15%)
    subtotal = total_materials + total_labour + total_equipment
    total_overhead = subtotal * 0.15

    grand_total = subtotal + total_overhead

    return {
        "bottom_up_total_lkr": round(grand_total, 2),
        "breakdown": {
            "materials_lkr": round(total_materials, 2),
            "labour_lkr": round(total_labour, 2),
            "equipment_lkr": round(total_equipment, 2),
            "overhead_lkr": round(total_overhead, 2),
        },
        "quantities": {
            "cement_bags": round(cement_bags, 1),
            "steel_kg": round(steel_kg, 1),
            "sand_cubes": round(sand_cubes, 2),
            "aggregate_cubes": round(aggregate_cubes, 2),
            "worker_days": round(worker_days, 1),
            "daily_labour_rate_lkr": STANDARD_DAILY_LABOUR_RATE,
        },
    }


def _build_pipeline() -> Pipeline:
    """Creates a fresh Pipeline for RandomForestRegressor with ColumnTransformer."""
    preprocessor = ColumnTransformer(
        transformers=[
            ("num", "passthrough", NUMERIC_FEATURES),
            ("cat", OneHotEncoder(handle_unknown="ignore", sparse_output=False), CATEGORICAL_FEATURES),
        ]
    )
    return Pipeline([
        ("preprocessor", preprocessor),
        ("regressor", RandomForestRegressor(n_estimators=100, max_depth=12, min_samples_leaf=2, random_state=42, n_jobs=1)),
    ])


def _generate_parametric_bootstrap(n_samples: int = 300) -> List[Dict[str, Any]]:
    """Generates calibrated parametric bootstrap rows for pre-training when real data is small."""
    bootstrap_rows = []
    for _ in range(n_samples):
        dist = np.random.choice(SRI_LANKA_DISTRICTS)
        ptype = np.random.choice(PROJECT_TYPES)
        qtier = np.random.choice(QUALITY_TIERS)
        floors = int(np.random.choice([1, 2, 3, 4], p=[0.4, 0.35, 0.15, 0.1]))
        sqft = float(np.random.randint(800, 15_000))
        site = np.random.choice(["Flat", "Sloped", "Requires Excavation/Piling"], p=[0.7, 0.2, 0.1])
        c_year = int(np.random.choice([2023, 2024, 2025, 2026], p=[0.1, 0.3, 0.4, 0.2]))
        p_idx = get_construction_price_index(c_year)

        base_rate = compute_baseline_cost_per_sqft(dist, ptype, qtier)
        # Apply realistic market variance (+/- 8%)
        rate_actual = base_rate * (1.0 + np.random.normal(0, 0.08)) * (p_idx / 246.0)
        total_act = rate_actual * sqft
        bootstrap_rows.append({
            "project_name": f"Parametric-Bootstrap-{len(bootstrap_rows)}",
            "district": dist,
            "project_type": ptype,
            "quality_tier": qtier,
            "floors": floors,
            "structure_type": "RCC frame",
            "site_condition": site,
            "floor_area_sqft": sqft,
            "cost_year": c_year,
            "price_index": p_idx,
            "start_date": f"{c_year}-01-01",
            "actual_total_lkr": total_act,
            "cost_per_sqft": rate_actual,
            "log_cost_per_sqft": math.log(max(rate_actual, 100.0)),
            "source": "synthetic",
        })
    return bootstrap_rows


def extract_normalized_feature_importances(model: Pipeline) -> List[Dict[str, Any]]:
    """
    Extracts and normalizes feature importances across all features (including cost_year, price_index).
    Sums one-hot encoded categories back to their parent features.
    Guarantees sum is strictly 100.0% and lists every feature.
    """
    regressor = model.named_steps["regressor"] if hasattr(model, "named_steps") else model
    preprocessor = model.named_steps["preprocessor"] if hasattr(model, "named_steps") else None

    # Base default weights if model importances are not yet accessible
    base_defaults = {
        "project_type": 28.0,
        "district": 22.0,
        "quality_tier": 18.0,
        "structure_type": 12.0,
        "site_condition": 8.0,
        "floors": 6.0,
        "cost_year": 3.0,
        "price_index": 2.0,
        "floor_area_sqft": 1.0,
    }

    raw_map = {feat: 0.0 for feat in FEATURE_DISPLAY_NAMES.keys()}
    if not hasattr(regressor, "feature_importances_") or preprocessor is None:
        raw_map = base_defaults
    else:
        raw_imps = regressor.feature_importances_
        # numeric features come first in ColumnTransformer
        for i, feat in enumerate(NUMERIC_FEATURES):
            if i < len(raw_imps):
                raw_map[feat] = float(raw_imps[i])

        num_offset = len(NUMERIC_FEATURES)
        try:
            cat_encoder = preprocessor.named_transformers_["cat"]
            cat_out = cat_encoder.get_feature_names_out(CATEGORICAL_FEATURES)
            for j, out_name in enumerate(cat_out):
                col_idx = num_offset + j
                if col_idx < len(raw_imps):
                    val = float(raw_imps[col_idx])
                    for cat_f in CATEGORICAL_FEATURES:
                        if out_name.startswith(cat_f + "_"):
                            raw_map[cat_f] += val
                            break
        except Exception:
            pass

    # Normalize so all features sum to exactly 100.0%
    total_val = sum(raw_map.values())
    if total_val <= 0:
        raw_map = base_defaults
        total_val = sum(raw_map.values())

    normalized_map = {}
    for k, v in raw_map.items():
        normalized_map[k] = round((v / total_val) * 100.0, 1)

    # Adjust rounding discrepancy on largest feature so sum == 100.0
    current_sum = round(sum(normalized_map.values()), 1)
    diff = round(100.0 - current_sum, 1)
    if diff != 0.0:
        max_k = max(normalized_map, key=normalized_map.get)
        normalized_map[max_k] = round(normalized_map[max_k] + diff, 1)

    result = []
    for k, display_name in FEATURE_DISPLAY_NAMES.items():
        result.append({
            "key": k,
            "feature": k,
            "name": display_name,
            "value": normalized_map[k],
            "importance_pct": normalized_map[k],
        })

    # Sort descending by value
    result.sort(key=lambda x: x["value"], reverse=True)
    return result


def train_model_pipeline(df: pd.DataFrame) -> Pipeline:
    """Fits and returns a Pipeline for the given training DataFrame."""
    pipe = _build_pipeline()
    train_df = df.copy()
    if "log_cost_per_sqft" not in train_df.columns:
        train_df["log_cost_per_sqft"] = np.log(train_df["actual_total_lkr"] / train_df["floor_area_sqft"])
    pipe.fit(train_df[ALL_FEATURES], train_df["log_cost_per_sqft"])
    return pipe


def train_historical_model(df: pd.DataFrame) -> Tuple[Pipeline, Dict[str, Any], List[Dict[str, Any]]]:
    """Alias for train_model_pipeline returning model and importances."""
    pipe = train_model_pipeline(df)
    importances = extract_normalized_feature_importances(pipe)
    return pipe, {}, importances


def _evaluation_baseline(row):
    return compute_hybrid_bottom_up(
        floor_area_sqft=float(row["floor_area_sqft"]), floors=int(row.get("floors", 1)),
        district=row["district"], project_type=row["project_type"], quality_tier=row["quality_tier"],
        site_condition=row.get("site_condition", "Flat"), cost_year=int(row.get("cost_year", 2024)),
    )["bottom_up_total_lkr"]


def evaluate_model_held_out(real_df: pd.DataFrame) -> Dict[str, Any]:
    """
    STRICT EVALUATION ON HELD-OUT REAL PROJECTS ONLY.
    (Leave-one-out or k-fold by project, NEVER on rows used for fitting)
    """
    real_df = real_df.copy()
    if real_df.empty:
        real_df = pd.DataFrame(columns=ALL_FEATURES + ["actual_total_lkr", "log_cost_per_sqft"])
    if "log_cost_per_sqft" not in real_df.columns:
        real_df["log_cost_per_sqft"] = np.log(
            np.maximum(real_df["actual_total_lkr"] / np.maximum(real_df["floor_area_sqft"], 1.0), 100.0)
        )
    real_count = len(real_df)
    real_mape: Optional[float] = None
    real_mae: Optional[float] = None
    baseline_mape: Optional[float] = None
    evaluation_method: str = "Leave-one-out, n = 0"
    validation_status: str = "Not enough real data yet"
    is_indicative: bool = True
    confidence_interval_note: str = "Indicative (n < 100)"
    confidence_interval_display: str = ""
    margin_95: float = 0.0
    ci_lower: float = 0.0
    ci_upper: float = 0.0

    if real_count >= 2:
        y_real_actual_cost = real_df["actual_total_lkr"].values
        real_floor_areas = real_df["floor_area_sqft"].values
        y_heldout_preds = np.zeros(real_count)
        y_baseline_preds = np.zeros(real_count)

        if real_count < 30:
            # Leave-One-Out Cross Validation by project (strictly held out!)
            evaluation_method = f"Leave-one-out, n = {real_count}"
            for i in range(real_count):
                train_fold_real = real_df.drop(index=real_df.index[i])
                train_fold_df = train_fold_real.copy()

                fold_model = _build_pipeline()
                if "log_cost_per_sqft" not in train_fold_df.columns:
                    train_fold_df["log_cost_per_sqft"] = np.log(train_fold_df["actual_total_lkr"] / train_fold_df["floor_area_sqft"])
                fold_model.fit(train_fold_df[ALL_FEATURES], train_fold_df["log_cost_per_sqft"])

                # Predict on the held-out project i
                test_row = real_df.iloc[[i]]
                pred_log = float(fold_model.predict(test_row[ALL_FEATURES])[0])
                pred_sqft = math.exp(pred_log)
                y_heldout_preds[i] = pred_sqft * real_floor_areas[i]

                # Rate-based baseline prediction on held-out project i
                b_sqft = compute_baseline_cost_per_sqft(
                    test_row["district"].values[0],
                    test_row["project_type"].values[0],
                    test_row["quality_tier"].values[0]
                )
                y_baseline_preds[i] = _evaluation_baseline(test_row.iloc[0])

            real_mape = round(calculate_mape(y_real_actual_cost, y_heldout_preds), 2)
            baseline_mape = round(calculate_mape(y_real_actual_cost, y_baseline_preds), 2)
            real_mae = round(float(mean_absolute_error(y_real_actual_cost, y_heldout_preds)), 2)
            validation_status = f"Evaluated on {real_count} held-out real projects ({evaluation_method}); activation also requires beating the baseline"

        else:
            # 5-Fold Cross Validation by project (when n >= 30)
            evaluation_method = f"5-Fold CV, n = {real_count}"
            kf = KFold(n_splits=5, shuffle=True, random_state=42)
            for train_idx, test_idx in kf.split(real_df):
                train_fold_real = real_df.iloc[train_idx]
                test_fold_real = real_df.iloc[test_idx]

                fold_model = _build_pipeline()
                if "log_cost_per_sqft" not in train_fold_real.columns:
                    train_fold_real = train_fold_real.copy()
                    train_fold_real["log_cost_per_sqft"] = np.log(train_fold_real["actual_total_lkr"] / train_fold_real["floor_area_sqft"])
                fold_model.fit(train_fold_real[ALL_FEATURES], train_fold_real["log_cost_per_sqft"])

                pred_logs = fold_model.predict(test_fold_real[ALL_FEATURES])
                pred_sqfts = np.exp(pred_logs)
                y_heldout_preds[test_idx] = pred_sqfts * real_floor_areas[test_idx]

                for t_i in test_idx:
                    row_t = real_df.iloc[t_i]
                    b_sqft = compute_baseline_cost_per_sqft(
                        row_t["district"], row_t["project_type"], row_t["quality_tier"]
                    )
                    y_baseline_preds[t_i] = _evaluation_baseline(row_t)

            real_mape = round(calculate_mape(y_real_actual_cost, y_heldout_preds), 2)
            baseline_mape = round(calculate_mape(y_real_actual_cost, y_baseline_preds), 2)
            real_mae = round(float(mean_absolute_error(y_real_actual_cost, y_heldout_preds)), 2)
            validation_status = f"Validated on {real_count} held-out real projects ({evaluation_method}, MAPE: {real_mape}%)"

        # Calculate indicative confidence interval
        pct_errors = np.abs((y_real_actual_cost - y_heldout_preds) / y_real_actual_cost) * 100.0
        se = float(np.std(pct_errors, ddof=1) / np.sqrt(real_count)) if real_count > 1 else 5.0
        margin_95 = round(1.96 * se, 1)
        ci_lower = max(0.0, round((real_mape or 0.0) - margin_95, 1))
        ci_upper = round((real_mape or 0.0) + margin_95, 1)

        is_indicative = (real_count < 100)
        confidence_interval_note = "Indicative (n < 100)" if is_indicative else "Cross-validation estimate; coverage is not guaranteed"
        confidence_interval_display = f"±{margin_95}% (95% CI: [{ci_lower}%, {ci_upper}%], {confidence_interval_note})"

    elif real_count == 1:
        evaluation_method = "Leave-one-out, n = 1"
        validation_status = "More independently verified projects are required for held-out evaluation."
        is_indicative = True
        confidence_interval_note = "Indicative (n < 100)"
    else:
        evaluation_method = "Leave-one-out, n = 0"
        validation_status = "No independently verified cost projects are available for training."
        is_indicative = True
        confidence_interval_note = "Indicative (n < 100)"

    return {
        "real_count": real_count,
        "n_evaluated": real_count,
        "method": "leave_one_out" if real_count < 30 else "5_fold_cv",
        "evaluation_method": evaluation_method,
        "validation_status": validation_status,
        "mape": real_mape,
        "mae": real_mae,
        "baseline_mape": baseline_mape,
        "is_indicative": is_indicative,
        "confidence_interval_note": confidence_interval_note,
        "confidence_interval_display": confidence_interval_display,
        "ci_95": f"[{ci_lower}%, {ci_upper}%]",
        "prediction_interval_pct": float(np.quantile(np.abs(y_real_actual_cost - y_heldout_preds) / np.maximum(y_heldout_preds, 1), 0.90, method="higher")) if real_count >= 30 else None,
        "margin_95": margin_95,
        "ci_lower": ci_lower,
        "ci_upper": ci_upper,
    }


def train_and_evaluate_cost_model(force: bool = False) -> Dict[str, Any]:
    """
    Trains Cost Predictor on real completed projects.
    Computes MAPE strictly on held-out real projects (LOOCV when n < 30; K-Fold when n >= 30).
    Never evaluates on rows used for fitting.
    Normalizes all feature importances so they sum to 100%.
    """
    now_iso = datetime.datetime.now(datetime.timezone.utc).isoformat()
    real_projects = get_all_real_projects()
    real_count = len(real_projects)

    logger.info("Found %d verified real historical projects for training.", real_count)

    # Prepare DataFrame with all 9 features
    data_rows = []
    for p in real_projects:
        required = ['district','project_type','quality_tier','floors','structure_type','site_condition','cost_year','floor_area_sqft','actual_total_lkr']
        if any(p.get(key) in (None, '') for key in required):
            continue
        sqft = float(p.get("floor_area_sqft") or 0)
        actual = float(p.get("actual_total_lkr") or 0)
        if not math.isfinite(sqft) or not math.isfinite(actual) or sqft <= 0 or actual <= 0:
            continue
        c_year = int(p['cost_year'])
        p_idx = get_construction_price_index(c_year)

        data_rows.append({
            "project_name": p.get("project_name", "Unknown"),
            "district": p.get("district", "Colombo"),
            "project_type": p.get("project_type", "Residential House"),
            "quality_tier": p.get("quality_tier", "Standard"),
            "floors": int(p.get("floors") or 1),
            "structure_type": p.get("structure_type", "RCC frame"),
            "site_condition": p.get("site_condition", "Flat"),
            "floor_area_sqft": sqft,
            "cost_year": c_year,
            "price_index": p_idx,
            "start_date": p.get("start_date") or "2024-01-01",
            "actual_total_lkr": actual,
            "cost_per_sqft": actual / sqft,
            "log_cost_per_sqft": math.log(actual / sqft),
            "source": p.get("source", "real"),
            "verified": p.get("verified", 1),
        })

    real_df = pd.DataFrame(data_rows)
    real_count = len(real_df)
    if real_count < 2:
        raise ModelNotReady("At least two independently verified projects with actual final costs and complete features are required; no synthetic rows will be substituted")
    eval_res = evaluate_model_held_out(real_df)

    real_mape = eval_res["mape"]
    real_mae = eval_res["mae"]
    baseline_mape = eval_res["baseline_mape"]
    evaluation_method = eval_res["evaluation_method"]
    validation_status = eval_res["validation_status"]
    is_indicative = eval_res["is_indicative"]
    confidence_interval_note = eval_res["confidence_interval_note"]
    confidence_interval_display = eval_res["confidence_interval_display"]

    # ------------------------------------------------------------------
    # PRODUCTION MODEL FIT (For live inference)
    # ------------------------------------------------------------------
    production_df = real_df.copy()
    has_bootstrap = False
    if real_mape is None or baseline_mape is None or real_mape > baseline_mape:
        raise ModelNotReady('Verified cost model did not beat the baseline on held-out projects; previous artifact is preserved')

    production_model = _build_pipeline()
    production_model.fit(production_df[ALL_FEATURES], production_df["log_cost_per_sqft"])

    # Extract normalized 100% feature importances
    feature_importances = extract_normalized_feature_importances(production_model)

    meta = {
        "model_type": "Log-Scale Cost-Per-SqFt RandomForestRegressor",
        "trained_at": now_iso,
        "real_projects_count": real_count,
        "total_training_samples": len(production_df),
        "synthetic_rows_included": False,
        "data_provenance": "verified_real_only",
        "production_ready": True,
        "validation_mape": real_mape,
        "validation_mae": real_mae,
        "prediction_interval_pct": eval_res.get("prediction_interval_pct"),
        "baseline_mape": baseline_mape,
        "evaluation_method": evaluation_method,
        "validation_status": validation_status,
        "is_indicative": is_indicative,
        "confidence_interval_note": confidence_interval_note,
        "confidence_interval_display": confidence_interval_display,
        "target": "ln(actual_total_lkr / floor_area_sqft)",
        "features": ALL_FEATURES,
        "training_support": {
            "categories": {key: sorted(production_df[key].astype(str).unique().tolist()) for key in CATEGORICAL_FEATURES},
            "numeric_ranges": {key: {"min": float(production_df[key].min()), "max": float(production_df[key].max())} for key in NUMERIC_FEATURES},
        },
        "feature_importances": feature_importances,
        "cost_driver_note": "The model predicts log cost per sq ft, so floor area has a small direct importance by design.",
    }

    # Atomic artifacts plus a shared digest reject mixed generations during retraining.
    artifact = io.BytesIO()
    joblib.dump(production_model, artifact, compress=3)
    payload = artifact.getvalue()
    meta["artifact_sha256"] = hashlib.sha256(payload).hexdigest()
    def publish(path, content):
        temporary = None
        try:
            with tempfile.NamedTemporaryFile(dir=path.parent, delete=False) as stream:
                temporary = stream.name
                stream.write(content)
                stream.flush()
                os.fsync(stream.fileno())
            os.replace(temporary, path)
        finally:
            if temporary and os.path.exists(temporary):
                os.unlink(temporary)
    publish(COST_MODEL_PKL, payload)
    publish(COST_META_JSON, json.dumps(meta, indent=2).encode("utf-8"))
    logger.info("Cost model and metadata saved successfully: %s", meta)

    return meta


def predict_cost_hybrid(
    floor_area_sqft: float,
    num_floors: int,
    district: str,
    project_type: str,
    quality_tier: str,
    structure_type: str = "RCC frame",
    site_condition: str = "Flat",
    cost_year: Optional[int] = None,
) -> Dict[str, Any]:
    """
    Predict directly from the verified fitted regressor. No rate estimate or
    weighted formula is substituted when a validated model is unavailable.
    """
    model, meta = load_verified_model('cost_predictor', COST_MODEL_PKL.parent)
    project_type = {'Residential':'Residential House','Commercial':'Commercial Building'}.get(project_type,project_type)
    canonical_district = DISTRICTS_LOWER.get(district.strip().lower())
    if not canonical_district or floor_area_sqft <= 0:
        raise ValueError('A valid district and positive floor area are required')
    target_year = int(cost_year) if cost_year else datetime.date.today().year
    features = pd.DataFrame([{'district':canonical_district,'project_type':project_type,'quality_tier':quality_tier,
        'structure_type':structure_type,'site_condition':site_condition,'floors':num_floors,'floor_area_sqft':floor_area_sqft,
        'cost_year':target_year,'price_index':get_construction_price_index(target_year)}])
    support = meta.get('training_support', {})
    warnings = []
    for key, values in support.get('categories', {}).items():
        if key in features and str(features.iloc[0][key]) not in values:
            warnings.append(f'{key.replace("_", " ")} was not represented in verified training projects')
    for key, bounds in support.get('numeric_ranges', {}).items():
        if key in features and not bounds['min'] <= float(features.iloc[0][key]) <= bounds['max']:
            warnings.append(f'{key.replace("_", " ")} is outside the verified training range ({bounds["min"]:g}–{bounds["max"]:g})')
    estimate = float(math.exp(float(model.predict(features[ALL_FEATURES])[0])) * floor_area_sqft)
    if not math.isfinite(estimate) or estimate <= 0:
        raise ModelNotReady('Verified model returned an invalid prediction')
    interval = meta.get('prediction_interval_pct') if not warnings else None
    lower = round(estimate * max(0,1-interval),2) if interval is not None else None
    upper = round(estimate * (1+interval),2) if interval is not None else None
    return {'estimated_cost_lkr':round(estimate,2),'estimated_range_min_lkr':lower,'estimated_range_max_lkr':upper,
        'estimated_range_display':f'Rs. {lower:,.0f} to Rs. {upper:,.0f}' if lower is not None else 'Prediction interval not established',
        'bottom_up_estimate_lkr':None,'ml_correction_factor':None,'cost_breakdown':{},'quantities_summary':{},
        'district':canonical_district,'real_projects_count':get_real_projects_count(),'model_source':'verified_real_ml',
        'validation_mape':meta.get('validation_mape'),'baseline_mape':meta.get('baseline_mape'),
        'evaluation_method':meta.get('evaluation_method'),'validation_status':meta.get('validation_status'),
        'confidence_interval_display':meta.get('confidence_interval_display'),'trained_at':meta.get('trained_at'),
        'training_samples':meta.get('real_projects_count'),'feature_importances':meta.get('feature_importances',[]),
        'prediction_warnings':warnings,
        'disclaimer':'Prediction from a model trained exclusively on independently verified real project costs. Held-out error is not a guarantee for this project.'}


# Shared implementation for backwards-compatible callers.
from core.delay_risk import compute_rule_based_delay_risk
