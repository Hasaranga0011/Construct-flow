"""Security regressions at user and workflow boundaries; no external services."""
import asyncio
from io import BytesIO
from types import SimpleNamespace
import pytest
from fastapi import FastAPI, HTTPException
from fastapi.security import HTTPAuthorizationCredentials
from fastapi.testclient import TestClient
from starlette.datastructures import UploadFile, Headers
from core import security
from core.http_limits import RequestLimits
from api.routes import projects, media, reports, purchase_orders, messages


def test_cached_authorization_cannot_bypass_revocation(monkeypatch):
    security._TOKEN_CACHE['revoked'] = {'cached_at': 9999999999, 'user': {'role': 'super_admin'}}
    monkeypatch.setattr(security, '_fetch_auth_user', lambda token: (_ for _ in ()).throw(ValueError('revoked')))
    with pytest.raises(HTTPException) as error:
        security.get_current_user(HTTPAuthorizationCredentials(scheme='Bearer', credentials='revoked'))
    assert error.value.status_code == 401


@pytest.mark.parametrize('approved', [False, None])
def test_unapproved_profiles_are_rejected(monkeypatch, approved):
    monkeypatch.setattr(security, '_fetch_auth_user', lambda token: SimpleNamespace(user=SimpleNamespace(id='user',email='user@example.invalid')))
    class Client:
        def table(self,*a): return self
        def select(self,*a): return self
        def eq(self,*a): return self
        def single(self): return self
        def execute(self): return SimpleNamespace(data={'role':'pm','is_approved':approved})
    monkeypatch.setattr(security,'client_for_token',lambda token:Client())
    with pytest.raises(HTTPException) as error:
        security.get_current_user(HTTPAuthorizationCredentials(scheme='Bearer',credentials='test'))
    assert error.value.status_code == 403


def test_project_rpc_denial_never_uses_service_client(monkeypatch):
    class Failure(Exception): code='42501'
    class Client:
        def rpc(self,*a): raise Failure('denied')
    monkeypatch.setattr(projects,'setup_client',lambda:pytest.fail('Privileged fallback'))
    with pytest.raises(HTTPException) as error:
        projects.save_project(Client(),{'name':'Attack'})
    assert error.value.status_code == 403


def test_financial_cache_never_bypasses_authorization(monkeypatch):
    projects._FINANCIALS_CACHE['private']=(9999999999,{'secret':True})
    def deny(*args,**kwargs): raise HTTPException(403,'Not your project')
    monkeypatch.setattr(projects,'authorized_project_client',deny)
    with pytest.raises(HTTPException) as error:
        projects.get_project_financials('private',{'id':'outsider','role':'worker'})
    assert error.value.status_code == 403


@pytest.mark.parametrize('project_id',['../outside','C:\\outside','general',''])
def test_upload_path_rejected_before_storage_access(project_id):
    upload=UploadFile(BytesIO(b'bad'),filename='bad.jpg',headers=Headers({'content-type':'image/jpeg'}))
    with pytest.raises(HTTPException) as error:
        asyncio.run(media.upload_site_photo(upload,project_id=project_id,current_user={'id':'attacker','role':'pm'}))
    assert error.value.status_code == 422


def test_fake_image_rejected_before_storage(monkeypatch):
    monkeypatch.setattr(media,'client_for_token',lambda token:object())
    monkeypatch.setattr(media,'require_project_member',lambda *args:None)
    monkeypatch.setattr(media,'_get_storage_client',lambda:pytest.fail('Invalid image reached storage'))
    upload=UploadFile(BytesIO(b'<script>alert(1)</script>'),filename='bad.jpg',headers=Headers({'content-type':'image/jpeg'}))
    with pytest.raises(HTTPException) as error:
        asyncio.run(media.upload_site_photo(upload,project_id='00000000-0000-0000-0000-000000000001',current_user={'id':'pm','role':'pm','token':'jwt'}))
    assert error.value.status_code == 422


def test_reports_never_return_partial_data_on_query_failure():
    class Client:
        def table(self,*args): raise OSError('database unavailable')
    with pytest.raises(HTTPException) as error:
        reports._report_rows(Client(),'projects')
    assert error.value.status_code == 503


def test_streamed_body_size_is_enforced_without_content_length():
    app=FastAPI()
    app.add_middleware(RequestLimits,max_bytes=3)
    @app.post('/echo')
    def echo(): return {'ok':True}
    with TestClient(app) as client:
        response=client.post('/echo',content=iter([b'ab',b'cd']))
    assert response.status_code == 413


def test_public_rate_limit_is_enforced():
    app=FastAPI()
    app.add_middleware(RequestLimits)
    @app.post('/api/auth/register')
    def register(): return {'ok':True}
    with TestClient(app) as client:
        assert all(client.post('/api/auth/register').status_code==200 for _ in range(5))
        assert client.post('/api/auth/register').status_code==429


@pytest.mark.parametrize('value',[-1,float('inf'),float('nan')])
def test_invalid_supplier_prices_are_rejected(value):
    from pydantic import ValidationError
    with pytest.raises(ValidationError): purchase_orders.PurchaseOrderApprove(unit_price=value)
    with pytest.raises(ValidationError): purchase_orders.PurchaseOrderSuggest(suggested_quantity=1,suggested_date='2030-01-01',suggested_price=value)


def test_chat_membership_checked_before_privileged_insert(monkeypatch):
    monkeypatch.setattr(messages,'get_service_client',lambda:object())
    def deny(*args): raise HTTPException(403,'Not a member')
    monkeypatch.setattr(messages,'require_project_member',deny)
    with pytest.raises(HTTPException) as error:
        messages.send_message(messages.MessageCreate(project_id='other',sender_id='outsider',content='Hello'),{'id':'outsider','role':'worker'})
    assert error.value.status_code==403


def test_spreadsheet_zip_expansion_is_bounded():
    import zipfile
    from core.spreadsheet_limits import validate_spreadsheet
    data=BytesIO()
    with zipfile.ZipFile(data,'w',zipfile.ZIP_DEFLATED) as archive:
        archive.writestr('xl/worksheets/sheet1.xml', b'0' * (41 * 1024 * 1024))
    with pytest.raises(ValueError,match='expands beyond'):
        validate_spreadsheet(data.getvalue(),'bomb.xlsx')


def test_registration_profile_failure_rolls_back_auth_user(monkeypatch):
    from api.routes import auth
    removed=[]
    class Admin:
        def create_user(self,payload):
            assert payload['email_confirm'] is False
            return SimpleNamespace(user=SimpleNamespace(id='new-user'))
        def delete_user(self,uid): removed.append(uid)
    class Client:
        auth=SimpleNamespace(admin=Admin())
        def table(self,*a): return self
        def upsert(self,*a): return self
        def execute(self): raise OSError('profile save failed')
    monkeypatch.setattr(auth.settings,'SUPABASE_SERVICE_ROLE_KEY','test-key')
    monkeypatch.setattr(auth,'create_client',lambda *args:Client())
    with pytest.raises(HTTPException) as error:
        auth.register_user(auth.RegisterRequest(email='test.user@gmail.com',password='ValidPassword123!',full_name='Test User',role='pm'))
    assert error.value.status_code==503
    assert removed==['new-user']


@pytest.mark.parametrize("fields", [
    {"latitude": 91}, {"longitude": -181}, {"latitude": float("nan")},
    {"start_date": "2026-02-30"},
])
def test_invalid_project_updates_fail_before_database(fields):
    from api.models import ProjectUpdate
    from pydantic import ValidationError
    with pytest.raises(ValidationError):
        ProjectUpdate(**fields)


def test_public_inquiry_validates_email_and_nonempty_message():
    from main import PublicInquiry
    from pydantic import ValidationError
    with pytest.raises(ValidationError):
        PublicInquiry(name="Test",email="invalid",message="Enough text here")
    with pytest.raises(ValidationError):
        PublicInquiry(name="Test",email="test@example.com",message="             ")


def test_public_inquiry_uses_atomic_persistence_rpc(monkeypatch):
    import main
    calls=[]
    class Client:
        def rpc(self,name,payload):
            calls.append((name,payload))
            return SimpleNamespace(execute=lambda: SimpleNamespace(data="inquiry-id"))
    monkeypatch.setattr(main.settings,"SUPABASE_SERVICE_ROLE_KEY","fixture-key")
    monkeypatch.setattr(main,"get_service_client",lambda:Client())
    assert main.handle_public_inquiry(main.PublicInquiry(name="Test User",email="test@example.com",message="Please contact me about a project.")) == {"success":True}
    assert calls[0][0] == "submit_public_inquiry"


def test_welcome_email_escapes_untrusted_profile_text():
    from services.email_service import generate_welcome_credentials_email
    html, text, subject = generate_welcome_credentials_email(
        name='<img src=x onerror=alert(1)>',email='test@example.com',role='worker',
        website_url='https://fixture.invalid')
    assert '<img src=x' not in html
    assert '&lt;img src=x' in html


def test_mismatched_model_artifact_refuses_prediction_without_unpickling(monkeypatch, tmp_path):
    import json
    from data_pipeline import model_engine as engine
    model = tmp_path / "cost.pkl"
    meta = tmp_path / "meta.json"
    model.write_bytes(b"untrusted or partially replaced artifact")
    meta.write_text(json.dumps({"real_projects_count":30,"validation_mape":10,"baseline_mape":20,"artifact_sha256":"wrong"}))
    monkeypatch.setattr(engine,"COST_MODEL_PKL",model)
    monkeypatch.setattr(engine,"COST_META_JSON",meta)
    monkeypatch.setattr(engine,"get_real_projects_count",lambda:30)
    monkeypatch.setattr(engine.joblib,"load",lambda *a,**kw:pytest.fail("Mismatched artifact was deserialized"))
    from core.verified_ml import ModelNotReady
    with pytest.raises(ModelNotReady):
        engine.predict_cost_hybrid(1000,1,"Colombo","Residential House","Standard")
