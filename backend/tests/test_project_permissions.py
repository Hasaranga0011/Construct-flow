from types import SimpleNamespace
import pytest
from fastapi import HTTPException
from api.routes import projects

class Client:
    def __init__(self, assigned=False):
        self.assigned, self.filters, self.mutations = assigned, [], []
    def table(self, name): self.name = name; return self
    def select(self, *args): return self
    def eq(self, key, value): self.filters.append((self.name, key, value)); return self
    def update(self, value): self.mutations.append((self.name, value)); return self
    def execute(self):
        data = {
            "projects": [{"id": "project", "pm_id": "pm", "client_id": "client"}],
            "project_role_assignments": [{"user_id": "site-manager"}] if self.assigned else [],
            "milestones": [],
        }
        return SimpleNamespace(data=data[self.name])

@pytest.mark.parametrize("role", ["worker", "supplier", "client"])
def test_non_staff_cannot_modify_milestones(role):
    with pytest.raises(HTTPException) as error:
        projects.authorized_project_client("project", {"id": role, "role": role}, write=True)
    assert error.value.status_code == 403

@pytest.mark.parametrize("role", ["worker", "supplier", "site_manager"])
def test_operational_roles_cannot_read_project_finances(role):
    with pytest.raises(HTTPException) as error:
        projects.authorized_project_client("project", {"id": role, "role": role}, write=False)
    assert error.value.status_code == 403

def test_unassigned_manager_cannot_modify_project(monkeypatch):
    monkeypatch.setattr(projects, "client_for_token", lambda token: Client())
    with pytest.raises(HTTPException) as error:
        projects.authorized_project_client("project", {"id": "other-pm", "role": "pm", "token": "jwt"}, write=True)
    assert error.value.status_code == 403

def test_assigned_site_manager_uses_caller_token(monkeypatch):
    client, tokens = Client(assigned=True), []
    monkeypatch.setattr(projects, "client_for_token", lambda token: tokens.append(token) or client)
    assert projects.authorized_project_client("project", {"id": "site-manager", "role": "site_manager", "token": "jwt"}, write=True) is client
    assert tokens == ["jwt"]

def test_milestone_from_another_project_cannot_be_updated(monkeypatch):
    client = Client()
    monkeypatch.setattr(projects, "client_for_token", lambda token: client)
    with pytest.raises(HTTPException) as error:
        projects.update_milestone("project", "foreign-milestone", projects.MilestoneUpdate(status="Completed"), {"id": "pm", "role": "pm", "token": "jwt"})
    assert error.value.status_code == 404
    assert ("milestones", "id", "foreign-milestone") in client.filters
    assert ("milestones", "project_id", "project") in client.filters
    assert len(client.mutations) == 1

@pytest.mark.parametrize("role", ["worker", "supplier", "site_manager", "client"])
def test_non_management_cannot_create_expenses(role):
    with pytest.raises(HTTPException) as error:
        projects.add_project_expense("project", None, {"id": role, "role": role})
    assert error.value.status_code == 403
