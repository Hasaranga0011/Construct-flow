import pytest
from fastapi.testclient import TestClient
from main import app

client = TestClient(app)


def test_registration_requires_role():
    response = client.post("/api/auth/register", json={
        "email": "newuser@constructflow.lk",
        "password": "Password123!",
        "full_name": "New User",
        "role": "",
    })
    assert response.status_code == 400
    assert "Please select a role" in response.json()["detail"]


def test_registration_rejects_admin():
    response = client.post("/api/auth/register", json={
        "email": "hacker@constructflow.lk",
        "password": "Password123!",
        "full_name": "Fake Admin",
        "role": "admin",
    })
    assert response.status_code == 403
    assert "administrator is not permitted" in response.json()["detail"]


def test_internal_portal_role_boundaries():
    # Client is not allowed in internal team portal
    response = client.post("/api/auth/register", json={
        "email": "client@constructflow.lk",
        "password": "Password123!",
        "full_name": "Client User",
        "role": "client",
        "portal": "internal",
    })
    assert response.status_code == 400
    assert "not permitted for the Internal Team Portal" in response.json()["detail"]


def test_partner_portal_role_boundaries():
    # PM is not allowed in partner portal
    response = client.post("/api/auth/register", json={
        "email": "pm@constructflow.lk",
        "password": "Password123!",
        "full_name": "PM User",
        "role": "pm",
        "portal": "partner",
    })
    assert response.status_code == 400
    assert "not permitted for the Partner Portal" in response.json()["detail"]


def test_phone_validation_on_registration():
    response = client.post("/api/auth/register", json={
        "email": "worker@constructflow.lk",
        "password": "Password123!",
        "full_name": "Worker User",
        "role": "worker",
        "portal": "internal",
        "contact_number": "invalid_phone_123",
    })
    assert response.status_code == 422
    assert "Enter a valid Sri Lankan phone number" in response.json()["detail"]


def test_successful_registration_sends_welcome_email(monkeypatch):
    from types import SimpleNamespace
    from api.routes import auth

    # Mock admin supabase auth & table
    class MockTable:
        def __init__(self, name):
            self.name = name
        def upsert(self, data):
            return self
        def insert(self, data):
            return self
        def execute(self):
            return SimpleNamespace(data=[])

    class MockAuthAdmin:
        def create_user(self, payload):
            return SimpleNamespace(user=SimpleNamespace(id="reg-user-uuid-999"))

    class MockAdminDb:
        auth = SimpleNamespace(admin=MockAuthAdmin())
        def table(self, name):
            return MockTable(name)

    monkeypatch.setattr(auth.settings, "SUPABASE_SERVICE_ROLE_KEY", "mock-role-key")
    monkeypatch.setattr(auth, "create_client", lambda url, key: MockAdminDb())

    sent_emails = []
    def mock_send_email(to_email, name, role, website_url=None):
        sent_emails.append({
            "to_email": to_email,
            "name": name,
            "role": role,
            "website_url": website_url
        })
        return {"success": True, "sent_to_inbox": True, "provider": "smtp"}

    monkeypatch.setattr(auth, "send_registration_welcome_email", mock_send_email)

    # Mock notification helper
    from core import notification_helper
    monkeypatch.setattr(notification_helper, "create_notification", lambda **kwargs: None)

    response = client.post("/api/auth/register", json={
        "email": "kamal.silva@gmail.com",
        "password": "MySecretPassword123!",
        "full_name": "Kamal Silva",
        "role": "pm",
        "portal": "internal",
    })

    assert response.status_code == 200
    res_data = response.json()
    assert res_data["id"] == "reg-user-uuid-999"
    assert res_data["email"] == "kamal.silva@gmail.com"
    assert res_data["role"] == "pm"
    assert res_data["is_approved"] is True
    assert res_data["email_delivery"]["sent_to_inbox"] is True

    # Crucial security assertion: verify send_registration_welcome_email was invoked
    # and that the user's password was NOT sent to the email sender!
    assert len(sent_emails) == 1
    assert sent_emails[0]["to_email"] == "kamal.silva@gmail.com"
    assert sent_emails[0]["name"] == "Kamal Silva"
    assert sent_emails[0]["role"] == "pm"
    assert "password" not in sent_emails[0]


def test_registration_rejects_typo_domain_gnail():
    response = client.post("/api/auth/register", json={
        "email": "jeenhashi@gnail.com",
        "password": "Password123!",
        "full_name": "Janindi",
        "role": "worker",
        "portal": "internal",
    })
    assert response.status_code == 422
    assert "Did you mean @gmail.com?" in response.json()["detail"]


def test_registration_rejects_non_gmail_domain():
    response = client.post("/api/auth/register", json={
        "email": "janindi@yahoo.com",
        "password": "Password123!",
        "full_name": "Janindi",
        "role": "worker",
        "portal": "internal",
    })
    assert response.status_code == 422
    assert "Only valid Gmail accounts (@gmail.com) are permitted" in response.json()["detail"]


def test_registration_rejects_short_gmail_username():
    response = client.post("/api/auth/register", json={
        "email": "abc@gmail.com",
        "password": "Password123!",
        "full_name": "Short Name",
        "role": "worker",
        "portal": "internal",
    })
    assert response.status_code == 422
    assert "at least 6 characters" in response.json()["detail"]


def test_registration_rejects_consecutive_dots_gmail():
    response = client.post("/api/auth/register", json={
        "email": "user..name@gmail.com",
        "password": "Password123!",
        "full_name": "Dot Name",
        "role": "worker",
        "portal": "internal",
    })
    assert response.status_code == 422
    assert "period" in str(response.json()["detail"]).lower()


