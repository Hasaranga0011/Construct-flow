from fastapi.testclient import TestClient
from main import app
from core.security import get_current_user
from api.routes import workflow
import pytest
from fastapi import HTTPException


def test_cost_records_reject_staff_before_database_access(monkeypatch):
    monkeypatch.setattr(workflow, "client_for_token", lambda *_: pytest.fail("Unauthorized database read"))
    with pytest.raises(HTTPException) as error:
        workflow.client_cost_records({"id": "worker", "role": "worker", "token": "fixture"})
    assert error.value.status_code == 403


def test_client_cost_records_scope_sources_and_exclude_private_fields(monkeypatch):
    from types import SimpleNamespace
    from api.routes import reports
    from core import database

    class Projects:
        def table(self, name):
            assert name == "projects"
            return self
        def select(self, columns):
            assert columns == "id,name"
            return self
        def eq(self, column, value):
            assert (column, value) == ("client_id", "client1")
            return self
        def execute(self):
            return SimpleNamespace(data=[{"id": "project1", "name": "Owned project"}])

    monkeypatch.setattr(workflow, "client_for_token", lambda _: Projects())
    monkeypatch.setattr(database, "get_service_client", lambda: object())
    def read(service, table, columns, filters):
        assert filters == {"project_id": ["project1"]}
        assert not any(field in columns for field in ["worker_id", "supplier_id", "bank", "daily_rate"])
        if table == "purchase_orders":
            return [{"id": "po1", "project_id": "project1", "total_price": 1000, "status": "Delivered", "quantity_ordered": 10, "quantity_received": 3}]
        assert table == "project_expenses"
        return []
    monkeypatch.setattr(reports, "_report_rows", read)
    rows = workflow.client_cost_records({"id": "client1", "role": "client", "token": "fixture"})
    assert len(rows) == 1
    assert rows[0]["amount"] == 300
    assert set(rows[0]) == {"id", "title", "projectName", "amount", "date", "source"}


def test_quantity_receipt_body_is_part_of_the_generated_api_contract():
    schema = app.openapi()
    operation = schema["paths"]["/api/purchase-orders/{po_id}/receive"]["patch"]
    operations = [operation for path in schema["paths"].values() for operation in path.values() if isinstance(operation, dict) and "operationId" in operation]
    ids = [operation["operationId"] for operation in operations]
    assert len(ids) == len(set(ids))
    assert not schema["paths"]["/api/projects/parse-boq"]["post"].get("security")
    assert "requestBody" in operation
    receipt = schema["components"]["schemas"]["ReceiptQuantity"]
    assert {"quantity", "receipt_id"}.issubset(receipt["required"])
    assert receipt["properties"]["receipt_id"]["format"] == "uuid"


def test_worker_cannot_invoke_manager_review_before_database_access(monkeypatch):
    def unexpected_client(*args):
        raise AssertionError("Unauthorized review reached the database")
    monkeypatch.setattr(workflow, "client_for_token", unexpected_client)
    app.dependency_overrides[get_current_user] = lambda: {"id":"worker","role":"worker","token":"fixture"}
    try:
        with TestClient(app) as client:
            response = client.post("/api/workflow/material-requests/record/review", json={"approve":False})
        assert response.status_code == 403
    finally:
        app.dependency_overrides.pop(get_current_user, None)
