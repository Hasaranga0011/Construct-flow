import pytest
import pandas as pd
import numpy as np
from fastapi.testclient import TestClient
from main import app
from core.security import get_current_user
from data_pipeline.model_engine import (
    evaluate_model_held_out,
    extract_normalized_feature_importances,
    train_historical_model,
    FEATURES,
    NUMERICAL_FEATURES,
    CATEGORICAL_FEATURES
)
from services.historical_data_service import (
    get_all_real_projects,
    get_real_projects_count,
    get_all_historical_projects_for_display,
    import_historical_projects_from_csv
)

client = TestClient(app)

@pytest.fixture(autouse=True)
def override_auth():
    app.dependency_overrides[get_current_user] = lambda: {
        "id": "admin-test-id",
        "role": "admin",
        "token": "dummy-token"
    }
    yield
    app.dependency_overrides.pop(get_current_user, None)


def _make_dummy_dataset(n: int) -> pd.DataFrame:
    """Generate minimal valid historical project rows for unit testing."""
    records = []
    districts = ["Colombo", "Kandy", "Gampaha", "Galle", "Kalutara"]
    types = ["Residential House", "Commercial Building", "Apartment Complex"]
    
    for i in range(n):
        sqft = 1500 + (i * 200)
        rate = 14000 + (i * 150)
        actual = sqft * rate
        est = actual * (0.95 if i % 2 == 0 else 1.05)
        records.append({
            "project_name": f"Valid Historical Project {i+1}",
            "project_type": types[i % len(types)],
            "district": districts[i % len(districts)],
            "town": "Town Center",
            "floor_area_sqft": sqft,
            "floors": 1 + (i % 3),
            "structure_type": "RCC frame",
            "quality_tier": "Standard",
            "site_condition": "Flat",
            "cost_year": 2024,
            "price_index": 125.0,
            "estimate_total_lkr": est,
            "actual_total_lkr": actual,
            "actual_materials_lkr": actual * 0.5,
            "actual_labour_lkr": actual * 0.3,
            "actual_equipment_lkr": actual * 0.1,
            "actual_overhead_lkr": actual * 0.1,
            "source": "imported_boq",
            "verified": 1,
            "evidence_note": "Audited QS final account #1234"
        })
    return pd.DataFrame(records)


# ============================================================================
# 1. Held-Out Evaluation (LOOCV & 5-Fold CV)
# ============================================================================

def test_evaluate_loocv_for_small_n():
    """When n < 30, evaluate_model_held_out must use Leave-One-Out CV on held-out projects."""
    df = _make_dummy_dataset(5)
    metrics = evaluate_model_held_out(df)
    
    assert metrics["method"] == "leave_one_out"
    assert metrics["n_evaluated"] == 5
    assert "mape" in metrics
    assert metrics["mape"] >= 0.0
    assert "baseline_mape" in metrics
    assert "ci_95" in metrics
    assert metrics["is_indicative"] is True  # n < 100 is indicative


def test_evaluate_kfold_for_large_n():
    """When n >= 30, evaluate_model_held_out must use 5-Fold CV."""
    df = _make_dummy_dataset(32)
    metrics = evaluate_model_held_out(df)
    
    assert metrics["method"] == "5_fold_cv"
    assert metrics["n_evaluated"] == 32
    assert "mape" in metrics
    assert metrics["mape"] >= 0.0
    assert "baseline_mape" in metrics
    assert metrics["is_indicative"] is True  # n < 100 still indicative


def test_held_out_never_evaluates_on_fitting_data():
    """In LOOCV, predictions are strictly evaluated on held-out project i, never on fitting data."""
    df = _make_dummy_dataset(4)
    # Give project 0 an extreme actual value so we can verify out-of-sample behavior
    df.loc[0, "actual_total_lkr"] = df.loc[0, "floor_area_sqft"] * 50000
    metrics = evaluate_model_held_out(df)
    assert metrics["method"] == "leave_one_out"
    assert metrics["n_evaluated"] == 4
    # The extreme row should not cause fitting overfit to reduce its own held-out error to 0
    assert metrics["mape"] > 0


# ============================================================================
# 2. Cost Driver Analysis & 100% Normalization
# ============================================================================

def test_feature_importances_sum_to_100_percent():
    """Cost Driver features must normalize to exactly 100.0% and include all features."""
    df = _make_dummy_dataset(6)
    model, _, _ = train_historical_model(df)
    importances = extract_normalized_feature_importances(model)
    
    assert len(importances) == len(FEATURES)
    total_pct = sum(item["importance_pct"] for item in importances)
    assert round(total_pct, 1) == 100.0
    
    # Verify all expected feature keys are present
    feature_names = {item["feature"] for item in importances}
    for f in ["project_type", "district", "quality_tier", "structure_type", "site_condition", "floors", "cost_year", "price_index", "floor_area_sqft"]:
        assert f in feature_names


# ============================================================================
# 3. Provenance & Verification
# ============================================================================

def test_provenance_filtering():
    """Only verified projects with source in ('real', 'imported_boq', 'real_completed') count."""
    real_projects = get_all_real_projects()
    for p in real_projects:
        assert p.get("source") in ("real", "imported_boq", "real_completed")
        assert p.get("verified") in (1, True, "1")

    # Display function should include sample records labeled
    all_projects = get_all_historical_projects_for_display(limit=100)
    assert len(all_projects) >= len(real_projects)


def test_import_requires_evidence_note():
    """Importing historical CSV without an evidence note must fail with 400."""
    res_no_note = client.post(
        "/api/ai/import-historical-projects",
        json={
            "csv_content": "project_name,project_type,district,town,floor_area_sqft,floors,structure_type,quality_tier,site_condition,start_date,end_date,estimate_total_lkr,actual_total_lkr,actual_materials_lkr,actual_labour_lkr,actual_equipment_lkr,actual_overhead_lkr,cost_year,notes\nTest,Residential House,Colombo,Colombo 03,2000,2,RCC frame,Standard,Flat,2024-01-01,2024-12-01,20000000,22000000,11000000,6600000,2200000,2200000,2024,Note",
            "evidence_note": ""
        }
    )
    assert res_no_note.status_code == 400
    detail_str = res_no_note.json()["detail"].lower()
    assert "evidence note" in detail_str or "source note" in detail_str

    res_whitespace_note = client.post(
        "/api/ai/import-historical-projects",
        json={
            "csv_content": "some,csv,data",
            "evidence_note": "   \n\t  "
        }
    )
    assert res_whitespace_note.status_code == 400


# ============================================================================
# 4. Market Trends Gating & Accuracy Status in Insights API
# ============================================================================

def test_insights_accuracy_status_and_gating():
    """Validate /api/ai/insights outputs honest accuracy when n < 30 and market trend gating."""
    res = client.get("/api/ai/insights")
    assert res.status_code == 200
    data = res.json()
    
    assert "accuracy_score" in data
    assert "accuracy_status" in data
    assert "evaluation_method" in data
    assert "feature_importance" in data
    assert "cost_driver_note" in data
    assert "market_trends" in data
    assert "pending_market_trends" in data
    assert "historical_summary_metrics" in data
    
    # If real_projects_count < 30, accuracy tile must explicitly state rate-based baseline
    real_n = data.get("real_projects_count", 0)
    if real_n < 30:
        assert f"Not enough real projects yet ({real_n} of 30)" in data["accuracy_status"]
        assert "Estimates use the rate-based baseline." in data["accuracy_status"]
        assert "Leave-one-out" in data["evaluation_method"] or "No held-out" in data["evaluation_method"]
        # Must report baseline_mape separately
        assert "baseline_mape" in data
    
    # Verify Cost Driver normalization (sums to 100%)
    drivers = data["feature_importance"]
    if drivers:
        total_driver_pct = sum(d["value"] for d in drivers)
        assert round(total_driver_pct, 1) == 100.0
    
    # Verify pending market trends format: never "need at least 1, have 3"
    for pending in data["pending_market_trends"]:
        assert "needed" in pending["message"]
        assert "of 3 needed" in pending["message"]
    
    # Summary row metrics
    summary = data["historical_summary_metrics"]
    assert "count" in summary
    assert "mean_variance_pct" in summary
    assert "mean_abs_variance_pct" in summary
    if summary["count"] < 10:
        assert summary["warning"] is not None
