from types import SimpleNamespace
import pytest
from fastapi import HTTPException, FastAPI
from fastapi.testclient import TestClient
from api.routes import auth, admin
from core import database
from core.http_limits import RequestLimits
from services import email_service


def test_recovery_uses_configured_transport_and_never_exposes_link(monkeypatch):
    calls=[]
    fake=SimpleNamespace(auth=SimpleNamespace(admin=SimpleNamespace(generate_link=lambda payload: calls.append(payload) or SimpleNamespace(properties=SimpleNamespace(action_link='https://auth.example.com/verify?secret=ONE_TIME')))))
    monkeypatch.setattr(database,'get_service_client',lambda:fake)
    sent=[];monkeypatch.setattr(email_service,'send_email',lambda *args:sent.append(args))
    result=auth.request_password_recovery(auth.PasswordRecoveryRequest(email='qa@example.com'))
    assert calls[0]['type']=='recovery'
    assert calls[0]['options']['redirect_to']==auth.settings.FRONTEND_URL.rstrip('/')+'/reset-password'
    assert len(sent)==1 and 'secret=ONE_TIME' in sent[0][2]
    assert 'ONE_TIME' not in str(result)


@pytest.mark.parametrize('redirect',['https://attacker.example/reset-password','javascript:alert(1)','http://localhost:8082/reset-password?next=https://attacker.example'])
def test_recovery_denies_untrusted_redirects_before_privileged_access(monkeypatch,redirect):
    monkeypatch.setattr(database,'get_service_client',lambda:pytest.fail('Untrusted redirect reached service client'))
    with pytest.raises(HTTPException) as error:
        auth.request_password_recovery(auth.PasswordRecoveryRequest(email='qa@example.com',redirect_to=redirect))
    assert error.value.status_code==422


def test_unknown_identity_has_same_public_recovery_response(monkeypatch):
    def unavailable():raise RuntimeError('Unknown user with secret details')
    monkeypatch.setattr(database,'get_service_client',unavailable)
    assert auth.request_password_recovery(auth.PasswordRecoveryRequest(email='qa@example.com'))=={'message':'If an account exists, a password reset link will be sent.'}


def test_recovery_rate_limit_applies_before_dispatch():
    app=FastAPI();app.add_middleware(RequestLimits)
    @app.post('/api/auth/password-recovery')
    def recover():return {'ok':True}
    client=TestClient(app)
    assert all(client.post('/api/auth/password-recovery').status_code==200 for _ in range(5))
    assert client.post('/api/auth/password-recovery').status_code==429


def test_creating_orphan_auth_identity_cannot_reset_password_or_change_role(monkeypatch):
    directory=SimpleNamespace(auth=SimpleNamespace(admin=SimpleNamespace(list_users=lambda **kwargs:[SimpleNamespace(email='qa@example.com')],invite_user_by_email=lambda *args:pytest.fail('Existing identity was invited'))))
    monkeypatch.setattr(admin,'_admin_supabase',lambda:directory)
    with pytest.raises(HTTPException) as error:
        admin.create_user(admin.CreateUserRequest(email='qa@example.com',full_name='QA',role='client'),{'role':'super_admin'})
    assert error.value.status_code==409
