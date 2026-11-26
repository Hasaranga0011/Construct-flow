from types import SimpleNamespace as NS
import logging

import pytest
from fastapi import HTTPException
from api.routes import auth
from services import email_service


@pytest.mark.parametrize('detail,reason', [
    (None, 'not_configured'),
    ('Resend error (401): invalid API key', 'invalid_credentials'),
    ('Resend error (403): You can only send testing emails to your own email address', 'sandbox_recipient_restricted'),
    ('Resend error (403): The domain is not verified', 'sender_domain_unverified'),
    ('Resend error (429): limit', 'rate_limited'),
    ('Connection timeout', 'provider_rejected_or_unreachable'),
])
def test_mail_failures_have_safe_categories(monkeypatch, caplog, detail, reason):
    monkeypatch.setattr(email_service, '_send_email_via_smtp_or_resend', lambda **kwargs: (False, 'none', '', detail))
    with caplog.at_level(logging.WARNING), pytest.raises(email_service.EmailDeliveryError) as caught:
        email_service.send_email('person@example.com', 'Verify', '<a href="https://auth.invalid?token=SECRET">Verify</a>')
    assert caught.value.reason == reason
    assert 'SECRET' not in caplog.text
    assert 'person@example.com' not in caplog.text


def fake_registration(monkeypatch, *, delivery_error=None, link_error=False, cleanup_error=False, as_dict=False):
    events = []
    class Admin:
        def create_user(self, payload):
            assert payload['email_confirm'] is False
            events.append('create')
            return NS(user=NS(id='new-registration'))
        def generate_link(self, payload):
            if link_error:
                raise RuntimeError('PRIVATE PROVIDER RESPONSE token=SECRET')
            assert payload['options']['redirect_to'].endswith('/team-login')
            if as_dict:
                return {'properties': {'action_link': 'https://auth.invalid/verify?token=SECRET'}}
            return NS(properties=NS(action_link='https://auth.invalid/verify?token=SECRET'))
        def delete_user(self, user_id):
            assert user_id == 'new-registration'
            events.append('delete')
            if cleanup_error:
                raise RuntimeError('PRIVATE cleanup response')
    class DB:
        auth = NS(admin=Admin())
        def table(self, name): return self
        def upsert(self, data):
            assert data['is_approved'] is False
            return self
        def execute(self): return NS(data=[])
    def send(*args):
        events.append('email')
        if delivery_error:
            raise delivery_error
        return 'resend_sent'
    monkeypatch.setattr(auth.settings, 'SUPABASE_SERVICE_ROLE_KEY', 'fixture')
    monkeypatch.setattr(auth, 'create_client', lambda *args: DB())
    monkeypatch.setattr(email_service, 'send_email', send)
    monkeypatch.setattr(auth, 'send_registration_welcome_email', lambda **kwargs: {'provider': 'fixture'})
    monkeypatch.setattr('core.notification_helper.create_notification', lambda **kwargs: None)
    return events


def payload():
    return auth.RegisterRequest(email='fixture@example.com', password='FixturePassword123!', full_name='Fixture Worker', role='worker', portal='internal')


@pytest.mark.parametrize('cleanup_error', [False, True])
def test_delivery_failure_removes_only_new_account_and_never_bypasses_verification(monkeypatch, caplog, cleanup_error):
    events = fake_registration(monkeypatch, delivery_error=email_service.EmailDeliveryError('sandbox_recipient_restricted'), cleanup_error=cleanup_error)
    with caplog.at_level(logging.WARNING), pytest.raises(HTTPException) as caught:
        auth.register_user(payload())
    assert caught.value.status_code == 503
    assert 'administrator' in caught.value.detail
    assert events == ['create', 'email', 'delete']
    assert 'stage=email_delivery reason=sandbox_recipient_restricted' in caplog.text
    assert 'SECRET' not in caplog.text and 'PRIVATE' not in caplog.text


def test_link_failure_is_distinguished_without_dispatching_email(monkeypatch, caplog):
    events = fake_registration(monkeypatch, link_error=True)
    with caplog.at_level(logging.WARNING), pytest.raises(HTTPException) as caught:
        auth.register_user(payload())
    assert caught.value.status_code == 503
    assert events == ['create', 'delete']
    assert 'stage=link_generation' in caplog.text
    assert 'SECRET' not in caplog.text and 'PRIVATE' not in caplog.text


@pytest.mark.parametrize('as_dict', [False, True])
def test_success_keeps_email_unconfirmed_and_staff_pending_approval(monkeypatch, as_dict):
    events = fake_registration(monkeypatch, as_dict=as_dict)
    result = auth.register_user(payload())
    assert result['is_approved'] is False
    assert events == ['create', 'email']


@pytest.mark.parametrize('role', ['pm', 'site_manager', 'worker', 'client', 'supplier'])
def test_all_email_registration_roles_require_administrator_approval(monkeypatch, role):
    events = fake_registration(monkeypatch)
    request = payload().model_copy(update={'role': role, 'portal': 'partner' if role in {'client', 'supplier'} else 'internal'})
    # The verification redirect is checked separately for both portal families.
    if role in {'client', 'supplier'}:
        original = auth.create_client
        def client(*args):
            db = original(*args)
            db.auth.admin.generate_link = lambda data: NS(properties=NS(action_link='https://auth.invalid/verify'))
            return db
        monkeypatch.setattr(auth, 'create_client', client)
    result = auth.register_user(request)
    assert result['is_approved'] is False
    assert 'All new accounts require administrator approval' in result['message']
    assert events == ['create', 'email']
