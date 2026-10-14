import pytest
from services.email_service import (
    generate_welcome_credentials_email,
    send_credentials_welcome_email,
    send_registration_welcome_email,
    get_role_info
)

def test_generate_welcome_credentials_email_content():
    name = "Kasun Bandara"
    email = "kasun.bandara@example.com"
    password = "SuperSecretPassword123!"
    role = "site_manager"
    website_url = "http://localhost:8082"

    html, text, subject = generate_welcome_credentials_email(
        name=name,
        email=email,
        password=password,
        role=role,
        website_url=website_url
    )

    # 1. Subject validation
    assert "Welcome to ConstructFlow" in subject
    assert "Credentials" in subject

    # 2. HTML elements
    assert "Kasun Bandara" in html
    assert "kasun.bandara@example.com" in html
    assert "SuperSecretPassword123!" in html
    assert "Site Manager" in html
    assert "Internal Team Portal" in html
    assert "http://localhost:8082/team-login" in html
    assert "Getting Started in 3 Easy Steps" in html
    assert "Security Notice" in html
    assert "ConstructAi" in html or "ConstructFlow" in html

    # 3. Plain-text elements
    assert "Kasun Bandara" in text
    assert "kasun.bandara@example.com" in text
    assert "SuperSecretPassword123!" in text
    assert "http://localhost:8082/team-login" in text

def test_all_canonical_roles_have_metadata():
    roles = ["super_admin", "pm", "site_manager", "worker", "client", "supplier"]
    for role in roles:
        info = get_role_info(role)
        assert info["title"]
        assert info["portal_name"]
        assert info["portal_path"]
        assert len(info["responsibilities"]) >= 2

def test_send_credentials_welcome_email_audit_fallback():
    res = send_credentials_welcome_email(
        to_email="test.recipient@example.com",
        name="Test Worker",
        password="Pass123!Secure",
        role="worker",
        website_url="http://localhost:8082"
    )

    assert res["to"] == "test.recipient@example.com"
    assert "team-login" in res["portal_url"]
    assert res["provider"] in ("supabase", "resend", "smtp", "local_audit")
    if res["provider"] == "local_audit":
        assert res["sent_to_inbox"] is False
        assert "error" in res

def test_send_credentials_welcome_email_supabase_mock(monkeypatch):
    from types import SimpleNamespace
    from core.config import settings

    monkeypatch.setattr(settings, "SUPABASE_URL", "https://test.supabase.co")
    monkeypatch.setattr(settings, "SUPABASE_SERVICE_ROLE_KEY", "test-service-role-key")

    class MockAuthAdmin:
        def invite_user_by_email(self, email, options=None):
            return SimpleNamespace(user=SimpleNamespace(id="sb-mock-uid-123"))
        def update_user_by_id(self, uid, data):
            return SimpleNamespace(user=SimpleNamespace(id=uid))

    class MockClient:
        auth = SimpleNamespace(admin=MockAuthAdmin())

    from services import email_service
    monkeypatch.setattr(email_service, "create_sb_client", lambda url, key: MockClient())

    res = send_credentials_welcome_email(
        to_email="test.supabase@example.com",
        name="Supabase User",
        password="Pass123!Secure",
        role="site_manager",
        website_url="http://localhost:8082"
    )

    assert res["success"] is True
    assert res["sent_to_inbox"] is True
    assert res["provider"] == "supabase"
    assert res["user_id"] == "sb-mock-uid-123"


def test_send_credentials_welcome_email_smtp_mock(monkeypatch):
    from core.config import settings
    monkeypatch.setattr(settings, "SMTP_HOST", "smtp.test.invalid")
    monkeypatch.setattr(settings, "SMTP_USER", "user@test.invalid")
    monkeypatch.setattr(settings, "SMTP_PASSWORD", "secret")

    class MockSMTP:
        def __init__(self, host, port, timeout=15): pass
        def starttls(self): pass
        def login(self, u, p): pass
        def sendmail(self, from_addr, to_addrs, msg): pass
        def quit(self): pass

    import smtplib
    monkeypatch.setattr(smtplib, "SMTP", MockSMTP)

    res = send_credentials_welcome_email(
        to_email="test.smtp@example.com",
        name="SMTP Recipient",
        password="Pass123!Secure",
        role="pm",
        website_url="http://localhost:8082"
    )

    assert res["success"] is True
    assert res["sent_to_inbox"] is True
    assert res["provider"] == "smtp"


def test_send_credentials_welcome_email_supabase_rate_limit_fallback(monkeypatch):
    from types import SimpleNamespace
    from core.config import settings

    monkeypatch.setattr(settings, "SUPABASE_URL", "https://test.supabase.co")
    monkeypatch.setattr(settings, "SUPABASE_SERVICE_ROLE_KEY", "test-service-role-key")
    monkeypatch.setattr(settings, "SMTP_HOST", "")
    monkeypatch.setattr(settings, "RESEND_API_KEY", "")

    class MockAuthAdmin:
        def invite_user_by_email(self, email, options=None):
            raise Exception("email rate limit exceeded")

        def generate_link(self, params):
            return SimpleNamespace(
                user=SimpleNamespace(id="sb-rate-limited-uid-456"),
                properties=SimpleNamespace(action_link="https://test.supabase.co/auth/v1/verify?token=xyz123&type=invite")
            )

        def update_user_by_id(self, uid, data):
            return SimpleNamespace(user=SimpleNamespace(id=uid))

    class MockClient:
        auth = SimpleNamespace(admin=MockAuthAdmin())

    from services import email_service
    monkeypatch.setattr(email_service, "create_sb_client", lambda url, key: MockClient())

    res = email_service.send_credentials_welcome_email(
        to_email="test.ratelimit@example.com",
        name="Rate Limit User",
        password="Pass123!Secure",
        role="worker",
        website_url="http://localhost:8082"
    )

    assert res["success"] is True
    assert res["sent_to_inbox"] is False
    assert res["provider"] == "supabase_link"
    assert res["action_link"] == "https://test.supabase.co/auth/v1/verify?token=xyz123&type=invite"
    assert res["user_id"] == "sb-rate-limited-uid-456"


def test_generate_welcome_credentials_email_registration_without_password():
    name = "Priyantha Kumara"
    email = "priyantha@example.com"
    role = "supplier"
    website_url = "http://localhost:8082"

    html, text, subject = generate_welcome_credentials_email(
        name=name,
        email=email,
        password=None,
        role=role,
        website_url=website_url
    )

    # 1. Subject validation (no credentials mention)
    assert "Welcome to ConstructFlow" in subject
    assert "Credentials" not in subject
    assert "Portal Access" in subject

    # 2. HTML elements
    assert "Priyantha Kumara" in html
    assert "priyantha@example.com" in html
    assert "Supplier" in html
    assert "Partner & Client Portal" in html
    assert "http://localhost:8082/partner-login" in html
    assert "•••••••• (Set by you during registration)" in html
    assert "Getting Started in 3 Easy Steps" in html
    assert "Security Notice" in html
    # Under NO circumstances should temporary password appear
    assert "Temporary Password" not in html

    # 3. Plain-text elements
    assert "Priyantha Kumara" in text
    assert "priyantha@example.com" in text
    assert "•••••••• (Set by you during registration)" in text
    assert "http://localhost:8082/partner-login" in text
    assert "Temporary Password" not in text


def test_send_registration_welcome_email_smtp_mock(monkeypatch):
    from core.config import settings
    monkeypatch.setattr(settings, "SMTP_HOST", "smtp.test.invalid")
    monkeypatch.setattr(settings, "SMTP_USER", "user@test.invalid")
    monkeypatch.setattr(settings, "SMTP_PASSWORD", "secret")

    sent_messages = []

    class MockSMTP:
        def __init__(self, host, port, timeout=15): pass
        def starttls(self): pass
        def login(self, u, p): pass
        def sendmail(self, from_addr, to_addrs, msg):
            sent_messages.append({"from": from_addr, "to": to_addrs, "msg": msg})
        def quit(self): pass

    import smtplib
    monkeypatch.setattr(smtplib, "SMTP", MockSMTP)

    res = send_registration_welcome_email(
        to_email="supplier.test@example.com",
        name="Lanka Steel Works",
        role="supplier",
        website_url="http://localhost:8082"
    )

    assert res["success"] is True
    assert res["sent_to_inbox"] is True
    assert res["provider"] == "smtp"
    assert len(sent_messages) == 1

    import email
    parsed = email.message_from_string(sent_messages[0]["msg"])
    decoded_body = ""
    for part in parsed.walk():
        if part.get_content_type() in ("text/plain", "text/html"):
            payload_bytes = part.get_payload(decode=True)
            if payload_bytes:
                decoded_body += payload_bytes.decode("utf-8", errors="ignore")

    # Verify password is not in sent email
    assert "Temporary Password" not in decoded_body
    assert "Set by you during registration" in decoded_body


def test_send_registration_welcome_email_audit_fallback(monkeypatch):
    from core.config import settings
    monkeypatch.setattr(settings, "SMTP_HOST", "")
    monkeypatch.setattr(settings, "RESEND_API_KEY", "")

    res = send_registration_welcome_email(
        to_email="worker.registered@example.com",
        name="Sunil Perera",
        role="worker",
        website_url="http://localhost:8082"
    )

    assert res["to"] == "worker.registered@example.com"
    assert "team-login" in res["portal_url"]
    assert res["sent_to_inbox"] is False
    assert res["provider"] == "local_audit"


def test_send_credentials_welcome_email_delegates_when_no_password(monkeypatch):
    from core.config import settings
    monkeypatch.setattr(settings, "SMTP_HOST", "")
    monkeypatch.setattr(settings, "RESEND_API_KEY", "")

    res = send_credentials_welcome_email(
        to_email="client.registered@example.com",
        name="Sunil Silva",
        password=None,
        role="client",
        website_url="http://localhost:8082"
    )

    assert res["to"] == "client.registered@example.com"
    assert "partner-login" in res["portal_url"]
    assert res["sent_to_inbox"] is False


