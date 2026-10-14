import pytest
from types import SimpleNamespace
from fastapi import HTTPException
from api.models import ProjectUpdate
from api.routes import projects
from core import notification_helper


def test_notification_helper_invalid_type_falls_back_safely(monkeypatch):
    captured_inserts = []
    
    class FakeClient:
        def table(self, name):
            class Query:
                def insert(self, items):
                    captured_inserts.extend(items)
                    return SimpleNamespace(execute=lambda: SimpleNamespace(data=items))
            return Query()

    monkeypatch.setattr("core.attendance_setup.setup_client", lambda: FakeClient())

    # Invalid notification type should not raise ValueError and should fallback to 'general'
    notification_helper.create_notification(
        type="invalid_custom_type_123",
        user_id="user-1",
        title="Test Title",
        message="Test Message"
    )

    assert len(captured_inserts) == 1
    assert captured_inserts[0]["type"] == "general"
    assert captured_inserts[0]["title"] == "Test Title"


def test_project_update_whitelist(monkeypatch):
    saved_payloads = []

    class MockClient:
        def table(self, name):
            class Query:
                def select(self, *args, **kwargs): return self
                def eq(self, *args, **kwargs): return self
                def execute(self):
                    return SimpleNamespace(data=[{"id": "proj-1", "name": "Initial Name", "pm_id": None, "client_id": None}])
            return Query()

    def mock_save_project(client, data, project_id=None):
        saved_payloads.append((project_id, data))
        return {"id": project_id, "name": data.get("name"), "created_at": "2026-01-01T00:00:00Z"}

    monkeypatch.setattr(projects, "get_auth_client", lambda req: MockClient())
    monkeypatch.setattr(projects, "setup_client", lambda: MockClient())
    monkeypatch.setattr(projects, "save_project", mock_save_project)
    monkeypatch.setattr(projects, "ensure_project_attendance", lambda c, p: None)

    # Payload with extra computed fields
    update_data = ProjectUpdate(
        name="Updated Name",
        budget=500000.0,
        spent_cost=12000.0, # Computed - should not be in filtered whitelist
        completion_percentage=75 # Computed - not in project column whitelist
    )

    req = SimpleNamespace(headers={"Authorization": "Bearer token"}, state=SimpleNamespace(user={"id": "admin-1", "role": "super_admin"}))
    projects.update_project("proj-1", update_data, req, {"id": "admin-1", "role": "super_admin"})

    assert len(saved_payloads) == 1
    pid, payload = saved_payloads[0]
    assert pid == "proj-1"
    assert payload["name"] == "Updated Name"
    assert payload["total_budget"] == 500000.0
    assert "spent_cost" not in payload
    assert "completion_percentage" not in payload


def test_project_delete_409_with_dependencies(monkeypatch):
    class MockServiceClient:
        def table(self, name):
            class Query:
                def select(self, *args, count=None): return self
                def eq(self, *args): return self
                def in_(self, *args): return self
                def execute(self):
                    # Mock project existence
                    if name == "projects":
                        return SimpleNamespace(data=[{"id": "proj-1", "name": "Active Project", "status": "active"}], count=1)
                    # Mock financial history
                    if name == "purchase_orders":
                        return SimpleNamespace(data=[{"id": "po-1"}], count=3)
                    if name == "project_expenses":
                        return SimpleNamespace(data=[{"id": "exp-1"}], count=12)
                    return SimpleNamespace(data=[], count=0)
            return Query()

    monkeypatch.setattr(projects, "setup_client", lambda: MockServiceClient())

    with pytest.raises(HTTPException) as exc_info:
        projects.delete_project("proj-1", archive_only=False, current_user={"id": "admin-1", "email": "admin@test.com", "role": "super_admin"})

    assert exc_info.value.status_code == 409
    assert "purchase orders" in exc_info.value.detail
    assert "expenses" in exc_info.value.detail
    assert "Archive it instead" in exc_info.value.detail


def test_project_delete_archive_only(monkeypatch):
    updates = []
    audit_logs = []

    class MockServiceClient:
        def table(self, name):
            class Query:
                def select(self, *args, **kwargs): return self
                def eq(self, *args): return self
                def update(self, data):
                    updates.append((name, data))
                    return self
                def insert(self, data):
                    audit_logs.append((name, data))
                    return self
                def execute(self):
                    if name == "projects":
                        return SimpleNamespace(data=[{"id": "proj-1", "name": "Active Project", "status": "active"}])
                    return SimpleNamespace(data=[], count=0)
            return Query()

    monkeypatch.setattr(projects, "setup_client", lambda: MockServiceClient())

    res = projects.delete_project("proj-1", archive_only=True, current_user={"id": "admin-1", "email": "admin@test.com", "role": "super_admin"})

    assert res["status"] == "archived"
    assert ("projects", {"status": "archived"}) in updates


def test_project_permanent_delete_empty_project(monkeypatch):
    deletes = []
    audit_logs = []

    class MockServiceClient:
        def table(self, name):
            class Query:
                def select(self, *args, **kwargs): return self
                def eq(self, *args): return self
                def in_(self, *args): return self
                def delete(self):
                    deletes.append(name)
                    return self
                def insert(self, data):
                    audit_logs.append((name, data))
                    return self
                def execute(self):
                    if name == "projects":
                        return SimpleNamespace(data=[{"id": "proj-empty", "name": "Empty Project", "status": "planning"}], count=1)
                    return SimpleNamespace(data=[], count=0)
            return Query()

    monkeypatch.setattr(projects, "setup_client", lambda: MockServiceClient())

    res = projects.delete_project("proj-empty", archive_only=False, current_user={"id": "admin-1", "email": "admin@test.com", "role": "super_admin"})

    assert res["status"] == "deleted"
    assert "projects" in deletes
    assert any("project_permanent_delete" in str(log) for log in audit_logs)


def test_project_restore(monkeypatch):
    updates = []
    audit_logs = []

    class MockServiceClient:
        def table(self, name):
            class Query:
                def select(self, *args, **kwargs): return self
                def eq(self, *args): return self
                def update(self, data):
                    updates.append((name, data))
                    return self
                def insert(self, data):
                    audit_logs.append((name, data))
                    return self
                def execute(self):
                    if name == "projects":
                        return SimpleNamespace(data=[{"id": "proj-archived", "name": "Archived Villa", "status": "archived"}])
                    return SimpleNamespace(data=[], count=0)
            return Query()

    monkeypatch.setattr(projects, "setup_client", lambda: MockServiceClient())

    res = projects.restore_project("proj-archived", current_user={"id": "admin-1", "email": "admin@test.com", "role": "super_admin"})

    assert res["status"] == "active"
    assert ("projects", {"status": "active"}) in updates
    assert any("project_restore" in str(log) for log in audit_logs)

