import pytest
from fastapi.testclient import TestClient
from main import app
from core.security import get_current_user

client = TestClient(app)

@pytest.fixture(autouse=True)
def override_auth():
    app.dependency_overrides[get_current_user] = lambda: {
        "id": "admin-1",
        "role": "admin",
        "token": "dummy-token"
    }
    yield
    app.dependency_overrides.pop(get_current_user, None)

def test_predict_cost_with_valid_districts():
    # Colombo
    res_colombo = client.post(
        "/api/ai/predict-cost",
        json={
            "square_footage": 2500,
            "num_floors": 2,
            "district": "Colombo",
            "town": "Kollupitiya",
            "project_type": "Residential House",
            "quality_tier": "Premium",
            "site_condition": "Flat",
            "structure_type": "RCC frame",
            "finishing_flooring": "Premium",
            "finishing_sanitary": "Premium",
            "finishing_electrical": "Premium",
            "target_timeline": "Standard",
        },
    )
    assert res_colombo.status_code == 200
    data_colombo = res_colombo.json()
    assert data_colombo["district"] == "Colombo"
    assert data_colombo["town"] == "Kollupitiya"
    assert data_colombo["estimated_cost"] > 0
    assert "location_note" in data_colombo

    # Anuradhapura (should have lower regional cost multiplier)
    res_anuradhapura = client.post(
        "/api/ai/predict-cost",
        json={
            "square_footage": 2500,
            "num_floors": 2,
            "district": "Anuradhapura",
            "project_type": "Residential House",
            "quality_tier": "Premium",
            "site_condition": "Flat",
            "structure_type": "RCC frame",
            "finishing_flooring": "Premium",
            "finishing_sanitary": "Premium",
            "finishing_electrical": "Premium",
            "target_timeline": "Standard",
        },
    )
    assert res_anuradhapura.status_code == 200
    data_anuradhapura = res_anuradhapura.json()
    assert data_anuradhapura["district"] == "Anuradhapura"
    assert data_anuradhapura["estimated_cost"] > 0

    # Ensure different districts produce noticeably different estimates for identical inputs
    assert data_colombo["estimated_cost"] != data_anuradhapura["estimated_cost"]
    assert data_colombo["estimated_cost"] > data_anuradhapura["estimated_cost"]

def test_predict_cost_rejects_unknown_district():
    res = client.post(
        "/api/ai/predict-cost",
        json={
            "square_footage": 2000,
            "num_floors": 1,
            "district": "Atlantis",
            "project_type": "Residential House",
            "quality_tier": "Standard",
            "site_condition": "Flat",
            "structure_type": "RCC frame",
            "finishing_flooring": "Standard",
            "finishing_sanitary": "Standard",
            "finishing_electrical": "Standard",
            "target_timeline": "Standard",
        },
    )
    assert res.status_code == 422
    assert "Unknown district" in res.json()["detail"]
