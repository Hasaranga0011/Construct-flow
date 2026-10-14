from types import SimpleNamespace
import pytest
from fastapi.testclient import TestClient
from main import app
from core.security import get_current_user
from api.routes import reports

class MockQuery:
    def __init__(self, data):
        self._data = data
    def select(self, *args):
        return self
    def eq(self, col, val):
        return MockQuery([d for d in self._data if str(d.get(col)) == str(val)])
    def order(self, *args):
        return self
    def range(self, start, end):
        return MockQuery(self._data[start:end+1])
    def execute(self):
        return SimpleNamespace(data=self._data)

class MockClient:
    def __init__(self):
        self.projects = [
            {"id": "p-1", "name": "Lotus Tower", "status": "In Progress", "total_budget": 5000000.0, "spent_cost": 2100000.0, "pm_id": "pm-1"},
            {"id": "p-2", "name": "Galle Fort Renovation", "status": "Completed", "total_budget": 3000000.0, "spent_cost": 2900000.0, "pm_id": "pm-2"},
        ]
        self.materials = [
            {"id": "m-1", "name": "Portland Cement", "project_id": "p-1", "quantity": "100 bags", "stock_level": 50, "status": "Available"}
        ]
        self.orders = [
            {"id": "o-1", "po_number": "PO-101", "project_id": "p-1", "supplier_name": "Holcim", "status": "Pending", "total_amount": 450000.0}
        ]
        self.payroll = [
            {"id": "s-1", "worker_id": "w-1", "project_id": "p-1", "period_start": "2026-10-01", "period_end": "2026-10-31", "net_pay": 85000.0, "status": "Paid"}
        ]

    def table(self, name):
        if name == "projects":
            return MockQuery(self.projects)
        if name == "materials":
            return MockQuery(self.materials)
        if name == "purchase_orders":
            return MockQuery(self.orders)
        if name == "salary_slips":
            return MockQuery(self.payroll)
        return MockQuery([])

@pytest.fixture(autouse=True)
def mock_supabase_client(monkeypatch):
    c = MockClient()
    monkeypatch.setattr(reports, "get_auth_client", lambda req: c)

def test_admin_export_pdf():
    app.dependency_overrides[get_current_user] = lambda: {"id": "admin-1", "role": "super_admin", "token": "tok"}
    try:
        with TestClient(app) as tc:
            res = tc.get("/api/reports/export?format=pdf&report_type=overview")
            assert res.status_code == 200
            assert res.headers["content-type"] == "application/pdf"
            assert res.content.startswith(b"%PDF")
    finally:
        app.dependency_overrides.clear()

def test_admin_export_excel():
    app.dependency_overrides[get_current_user] = lambda: {"id": "admin-1", "role": "super_admin", "token": "tok"}
    try:
        with TestClient(app) as tc:
            res = tc.get("/api/reports/export?format=xlsx&report_type=projects")
            assert res.status_code == 200
            assert "spreadsheetml" in res.headers["content-type"]
            assert len(res.content) > 100
    finally:
        app.dependency_overrides.clear()

def test_admin_export_csv():
    app.dependency_overrides[get_current_user] = lambda: {"id": "admin-1", "role": "super_admin", "token": "tok"}
    try:
        with TestClient(app) as tc:
            res = tc.get("/api/reports/export?format=csv&report_type=payroll")
            assert res.status_code == 200
            assert "text/csv" in res.headers["content-type"]
            assert b"ConstructFlow Report" in res.content
    finally:
        app.dependency_overrides.clear()

def test_admin_export_zip():
    app.dependency_overrides[get_current_user] = lambda: {"id": "admin-1", "role": "super_admin", "token": "tok"}
    try:
        with TestClient(app) as tc:
            res = tc.get("/api/reports/export?format=zip&report_type=overview&breakdown=per_project")
            assert res.status_code == 200
            assert "application/zip" in res.headers["content-type"]
            assert res.content.startswith(b"PK")
    finally:
        app.dependency_overrides.clear()

def test_pm_cannot_access_unassigned_project():
    app.dependency_overrides[get_current_user] = lambda: {"id": "pm-1", "role": "pm", "token": "tok"}
    try:
        with TestClient(app) as tc:
            # pm-1 is assigned to p-1, attempting to request p-2 (which belongs to pm-2)
            res = tc.get("/api/reports/export?format=pdf&projects=p-2")
            assert res.status_code == 403
            assert "not authorized" in res.json()["detail"].lower()
    finally:
        app.dependency_overrides.clear()
