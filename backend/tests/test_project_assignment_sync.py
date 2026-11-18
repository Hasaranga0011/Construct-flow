from types import SimpleNamespace
from api.models import ProjectCreate, ProjectUpdate
from api.routes import projects
import pytest
from fastapi import HTTPException


@pytest.mark.parametrize('code,message,status,expected', [
    ('P0001', 'Invalid or unapproved worker assignment', 422, 'Invalid or unapproved worker assignment'),
    ('P0001', 'Milestone title required', 422, 'Milestone title required'),
    ('23503', 'private schema constraint', 422, 'no longer available'),
    ('23505', 'private schema constraint', 409, 'duplicate'),
    ('22P02', 'private SQL value', 422, 'invalid format'),
    ('42501', 'private SQL policy', 403, 'permission'),
    ('42703', 'private missing column', 503, 'Reference:'),
    ('P0001', 'private arbitrary exception', 503, 'Reference:'),
])
def test_project_transaction_errors_are_actionable_without_sql_disclosure(code, message, status, expected):
    class Failure(Exception):
        pass
    failure = Failure('secret connection or SQL details')
    failure.code, failure.message = code, message
    class FailedClient:
        def rpc(self, *args):
            raise failure
    with pytest.raises(HTTPException) as caught:
        projects.save_project(FailedClient(), {})
    assert caught.value.status_code == status
    assert expected in caught.value.detail
    assert 'private' not in caught.value.detail
    assert 'secret' not in caught.value.detail

class Client:
    def __init__(self):
        self.calls = []
    def rpc(self, name, data):
        self.calls.append((name, data))
        return SimpleNamespace(execute=lambda: SimpleNamespace(data={"id": "proj-123", "name": "Demo"}))
    def table(self, name):
        class Query:
            def __init__(self, c): self.c = c
            def select(self, *a, **kw): return self
            def eq(self, *a, **kw): return self
            def delete(self, *a, **kw): return self
            def insert(self, *a, **kw): return self
            def execute(self):
                return SimpleNamespace(data=[{"id": "proj-123", "name": "Demo", "pm_id": None, "client_id": None}], count=1)
        return Query(self)

def test_create_project_and_assignments_saved_atomically(monkeypatch):
    client = Client()
    monkeypatch.setattr(projects, "get_auth_client", lambda request: client)
    setup_calls = []
    monkeypatch.setattr(projects, "setup_client", lambda: client)
    monkeypatch.setattr(projects, "ensure_project_attendance", lambda c, p: setup_calls.append(p))
    payload = ProjectCreate(name="Demo", location="Colombo", start_date="2026-01-01", end_date="2026-12-31", total_budget=1000, suppliers=["supplier-1"], admins=["admin-1"])
    assert projects.create_project(payload, object(), {"role":"super_admin","id":"admin"})["id"] == "proj-123"
    assert setup_calls == ["proj-123"]
    assert len(client.calls) == 1
    name, args = client.calls[0]
    assert name == "save_project_with_assignments"
    assert args["p_project_id"] is None
    assert args["p_data"]["suppliers"] == ["supplier-1"]
    assert args["p_data"]["total_budget"] == 1000
    assert args["p_data"]["start_date"] == "2026-01-01"

def test_update_preserves_omitted_assignments_and_explicit_clear(monkeypatch):
    client = Client()
    monkeypatch.setattr(projects, "get_auth_client", lambda request: client)
    setup_calls = []
    monkeypatch.setattr(projects, "setup_client", lambda: client)
    monkeypatch.setattr(projects, "ensure_project_attendance", lambda c, p: setup_calls.append(p))
    projects.update_project("proj-123", ProjectUpdate(name="Renamed", workers=[]), object())
    assert setup_calls == ["proj-123"]
    assert client.calls == [("save_project_with_assignments", {"p_project_id": "proj-123", "p_data": {"name": "Renamed", "workers": []}})]
