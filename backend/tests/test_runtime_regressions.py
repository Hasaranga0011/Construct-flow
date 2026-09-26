from datetime import datetime, timezone, timedelta
from types import SimpleNamespace
import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient
from api.routes import labour, messages, ai
from core.security import get_current_user
from main import app

class Query:
    def __init__(self, client, table): self.client, self.name = client, table
    def select(self, *args): return self
    def eq(self, *args): return self
    def gte(self, *args): return self
    def single(self): return self
    def update(self, data): self.client.updated = data; return self
    def execute(self):
        if self.name == "profiles": return SimpleNamespace(data={"id": "worker-1", "full_name": "Worker", "role": "worker"})
        if self.name == "workers": return SimpleNamespace(data={"id": "worker-record-1", "user_id": "worker-1"})
        if self.name == "site_workers": return SimpleNamespace(data=[{"id": "assignment-1"}])
        return SimpleNamespace(data=[{"id": "attendance-1", "check_in_time": self.client.check_in}])

class Client:
    def __init__(self, check_in): self.check_in, self.updated = check_in, None
    def table(self, name): return Query(self, name)

@pytest.mark.parametrize("aware", [True, False])
def test_checkout_handles_timezone_and_legacy_timestamps(monkeypatch, aware):
    start = datetime.now(timezone.utc) - timedelta(hours=2)
    if not aware: start = start.replace(tzinfo=None)
    client = Client(start.isoformat())
    monkeypatch.setattr(labour, "client_for_token", lambda token: client)
    result = labour.scan_qr_code(labour.ScanRequest(qr_code="qr", site_id="site"), {"id":"manager", "role":"site_manager", "token":"token"})
    assert result["action"] == "check_out"
    assert 1.99 <= result["hours_worked"] <= 2.01
    assert client.updated["check_out_time"].endswith("+00:00")

def test_cannot_send_message_as_someone_else():
    with pytest.raises(HTTPException) as error:
        messages.send_message(messages.MessageCreate(project_id="p", sender_id="other", receiver_id="r", content="hello"), {"id":"me", "token":"unused"})
    assert error.value.status_code == 403

def test_synthetic_estimate_does_not_claim_validated_confidence():
    result = ai.predict_cost(ai.PredictRequest(square_footage=1500, location="Colombo", project_type="Residential", quality_tier="Standard"), {})
    assert result.estimated_cost > 0
    assert result.confidence_score is None
    assert result.model_source == "synthetic_demo"

@pytest.mark.parametrize("length", ["bad", "-1"])
def test_invalid_content_length_returns_400(length):
    with TestClient(app) as client:
        assert client.post("/api/projects/", headers={"Content-Length":length}).status_code == 400

def test_oversized_request_returns_413():
    with TestClient(app) as client:
        assert client.post("/api/projects/", headers={"Content-Length":str(16*1024*1024)}).status_code == 413

def test_health_and_protected_route():
    with TestClient(app) as client:
        assert client.get("/health").status_code == 200
        assert client.get("/api/projects/").status_code == 401

def test_worker_cannot_access_manager_reports():
    app.dependency_overrides[get_current_user] = lambda: {"id":"worker", "role":"worker", "token":"unused"}
    try:
        with TestClient(app) as client:
            assert client.get("/api/reports/payroll").status_code == 403
    finally:
        app.dependency_overrides.clear()

def test_worker_cannot_create_legacy_labour_record():
    with pytest.raises(HTTPException) as error:
        labour.create_labour(None, {"id": "worker", "role": "worker", "token": "unused"})
    assert error.value.status_code == 403
