from types import SimpleNamespace
from api.models import ProjectCreate, ProjectUpdate
from api.routes import projects

class Client:
    def __init__(self): self.calls = []
    def rpc(self, name, data):
        self.calls.append((name, data))
        return SimpleNamespace(execute=lambda: SimpleNamespace(data={"id": "proj-123", "name": "Demo"}))

def test_create_project_and_assignments_saved_atomically(monkeypatch):
    client = Client()
    monkeypatch.setattr(projects, "get_auth_client", lambda request: client)
    payload = ProjectCreate(name="Demo", location="Colombo", start_date="2026-01-01", end_date="2026-12-31", total_budget=1000, suppliers=["supplier-1"], admins=["admin-1"])
    assert projects.create_project(payload, object())["id"] == "proj-123"
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
    projects.update_project("proj-123", ProjectUpdate(name="Renamed", workers=[]), object())
    assert client.calls == [("save_project_with_assignments", {"p_project_id": "proj-123", "p_data": {"name": "Renamed", "workers": []}})]
