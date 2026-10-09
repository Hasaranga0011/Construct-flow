from types import SimpleNamespace
import pytest
from fastapi import HTTPException
from fastapi.security import HTTPAuthorizationCredentials
from core import security

class ProfileClient:
    def __init__(self, role): self.role = role
    def table(self, name): return self
    def select(self, *args): return self
    def eq(self, *args): return self
    def single(self): return self
    def execute(self): return SimpleNamespace(data={"role": self.role})

@pytest.mark.parametrize("stored, expected", [("Admin", "super_admin"), ("super_admin", "super_admin"), ("Project Manager", "pm"), ("worker", "worker")])
def test_roles_use_caller_authenticated_profile(monkeypatch, stored, expected):
    monkeypatch.setattr(security.supabase.auth, "get_user", lambda token: SimpleNamespace(user=SimpleNamespace(id="user-1", email="test@example.com")))
    tokens = []
    def client(token):
        tokens.append(token)
        return ProfileClient(stored)
    monkeypatch.setattr(security, "client_for_token", client)
    user = security.get_current_user(HTTPAuthorizationCredentials(scheme="Bearer", credentials="caller-token"))
    assert user["role"] == expected
    assert tokens == ["caller-token"]

@pytest.mark.parametrize("role", [None, "", "unknown"])
def test_missing_role_never_defaults_to_manager(monkeypatch, role):
    monkeypatch.setattr(security.supabase.auth, "get_user", lambda token: SimpleNamespace(user=SimpleNamespace(id="user-1", email="test@example.com")))
    monkeypatch.setattr(security, "client_for_token", lambda token: ProfileClient(role))
    with pytest.raises(HTTPException) as error:
        security.get_current_user(HTTPAuthorizationCredentials(scheme="Bearer", credentials="token"))
    assert error.value.status_code == 403

def test_worker_cannot_use_manager_endpoint():
    with pytest.raises(HTTPException) as error:
        security.require_manager_or_admin({"role": "worker"})
    assert error.value.status_code == 403


def test_editable_metadata_cannot_elevate_profile_role(monkeypatch):
    monkeypatch.setattr(security.supabase.auth, "get_user", lambda token: SimpleNamespace(
        user=SimpleNamespace(id="worker-1", email="worker@example.invalid", user_metadata={"role": "super_admin"})))
    monkeypatch.setattr(security, "client_for_token", lambda token: ProfileClient("worker"))
    user = security.get_current_user(HTTPAuthorizationCredentials(scheme="Bearer", credentials="caller-token"))
    assert user["role"] == "worker"
    with pytest.raises(HTTPException) as error:
        security.require_admin(user)
    assert error.value.status_code == 403
