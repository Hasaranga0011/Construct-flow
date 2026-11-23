from types import SimpleNamespace as NS
import pytest
from fastapi.testclient import TestClient
from main import app
from api.routes import auth, labour, projects
from core.security import get_current_user
from core.payroll_deductions import apply_deductions

client=TestClient(app)


def test_staff_directory_normalizes_roles_and_limits_project_choices(monkeypatch):
    data={
        'profiles':[{'id':'pm','full_name':'Zed','role':'Project Manager','is_approved':True},
                    {'id':'sm','full_name':'Anna','role':'site_manager','is_approved':True},
                    {'id':'pending','role':'pm','is_approved':False},{'id':'worker','role':'worker','is_approved':True}],
        'staff_compensation':[{'user_id':'pm','monthly_salary':50000}],
        'projects':[{'id':'one','name':'First','pm_id':'pm'},{'id':'two','name':'Second'},{'id':'unrelated','name':'Other'}],
        'site_manager_sites':[{'project_id':'two','site_manager_id':'sm'}],
        'project_role_assignments':[],
    }
    class Table:
        def __init__(self,name): self.name=name
        def select(self,*args):return self
        def execute(self):return NS(data=data[self.name])
    monkeypatch.setattr(labour,'client_for_token',lambda token:NS(table=Table))
    rows=labour.staff_people({'id':'admin','role':'super_admin','token':'fixture'})
    assert [row['id'] for row in rows]==['sm','pm']
    assert rows[0]['projects']==[{'id':'two','name':'Second'}]
    assert rows[1]['projects']==[{'id':'one','name':'First'}]
    assert rows[1]['monthly_salary']==50000


def test_username_registration_keeps_password_auth_and_approval_without_email(monkeypatch):
    writes={}
    class Table:
        def __init__(self,name): self.name=name
        def insert(self,data): writes[self.name]=data;return self
        def upsert(self,data): writes[self.name]=data;return self
        def execute(self): return NS(data=[])
    def create_user(data):
        writes['auth']=data
        return NS(user=NS(id='00000000-0000-0000-0000-000000000001'))
    db=NS(table=lambda name:Table(name),auth=NS(admin=NS(create_user=create_user)))
    monkeypatch.setattr(auth.settings,'SUPABASE_SERVICE_ROLE_KEY','fixture-only')
    monkeypatch.setattr(auth,'create_client',lambda *args:db)
    monkeypatch.setattr(auth,'send_registration_welcome_email',lambda **kwargs:pytest.fail('No email for username identity'))
    response=client.post('/api/auth/register',json={'username':'Field.Worker','password':'SafePassword123!','full_name':'Field Worker','role':'worker','portal':'internal','contact_number':'0771234567'})
    assert response.status_code==200,response.text
    assert writes['auth']['email_confirm'] is True
    assert writes['auth']['user_metadata']['identity_kind']=='username'
    assert writes['auth']['email'].endswith('@accounts.example.com')
    assert writes['profiles']['is_approved'] is False
    assert writes['username_accounts']['username']=='field.worker'
    assert 'email' not in response.json()


def test_username_registration_requires_contact_and_cannot_claim_both_identities():
    base={'username':'worker01','password':'SafePassword123!','full_name':'Field Worker','role':'worker','portal':'internal'}
    assert client.post('/api/auth/register',json=base).status_code==422
    assert client.post('/api/auth/register',json={**base,'email':'worker@example.com'}).status_code==422


def test_username_login_issues_real_auth_session_not_a_custom_bypass(monkeypatch):
    class Query:
        def select(self,*args):return self
        def eq(self,*args):return self
        def execute(self):return NS(data=[{'user_id':'owner'}])
    db=NS(table=lambda name:Query(),auth=NS(admin=NS(get_user_by_id=lambda uid:NS(user=NS(email='private@accounts.example.com')))))
    monkeypatch.setattr('core.database.get_service_client',lambda:db)
    attempts=[]
    def sign_in(data):
        attempts.append(data)
        return NS(session=NS(access_token='fixture-access',refresh_token='fixture-refresh'))
    monkeypatch.setattr(auth,'create_client',lambda *args:NS(auth=NS(sign_in_with_password=sign_in)))
    response=client.post('/api/auth/username-login',json={'username':'worker01','password':'SafePassword123!'})
    assert response.status_code==200
    assert attempts[0]['email']=='private@accounts.example.com'
    assert response.json()=={'access_token':'fixture-access','refresh_token':'fixture-refresh'}


def test_unknown_username_returns_generic_error(monkeypatch):
    class Query:
        def select(self,*args):return self
        def eq(self,*args):return self
        def execute(self):return NS(data=[])
    monkeypatch.setattr('core.database.get_service_client',lambda:NS(table=lambda name:Query()))
    monkeypatch.setattr(auth,'create_client',lambda *args:NS(auth=NS(sign_in_with_password=lambda data:(_ for _ in ()).throw(ValueError('provider details')))))
    response=client.post('/api/auth/username-login',json={'username':'unknown','password':'wrong'})
    assert response.status_code==401
    assert response.json()['detail']=='Invalid username or password'


def test_recovery_validates_redirect_and_sends_only_the_provider_link(monkeypatch):
    sent=[]
    monkeypatch.setattr(auth.settings,'FRONTEND_URL','https://app.example.com')
    db=NS(auth=NS(admin=NS(generate_link=lambda data:NS(properties=NS(action_link='https://auth.example.com/verify?fixture=1')))))
    monkeypatch.setattr('core.database.get_service_client',lambda:db)
    monkeypatch.setattr('services.email_service.send_email',lambda *args:sent.append(args))
    assert client.post('/api/auth/password-recovery',json={'email':'owner@example.com','redirect_to':'https://evil.example/reset-password'}).status_code==422
    response=client.post('/api/auth/password-recovery',json={'email':'owner@example.com','redirect_to':'https://app.example.com/reset-password'})
    assert response.status_code==202
    assert len(sent)==1 and 'https://auth.example.com/verify?fixture=1' in sent[0][2]
    assert 'fixture=1' not in response.text


def test_inboxless_recovery_does_not_send_fake_email(monkeypatch):
    monkeypatch.setattr('services.email_service.send_email',lambda *args:pytest.fail('No email to reserved identity'))
    assert client.post('/api/auth/password-recovery',json={'email':'private@accounts.example.com'}).status_code==202


@pytest.mark.parametrize('role',['pm','site_manager','worker','client','supplier'])
def test_only_admin_can_configure_or_generate_staff_salary(role):
    app.dependency_overrides[get_current_user]=lambda:{'id':'fixture','role':role,'token':'fixture'}
    try:
        assert client.post('/api/labour/staff/compensation',json={'user_id':'employee','monthly_salary':50000}).status_code==403
        assert client.post('/api/labour/staff/salary',json={'user_id':'employee','project_id':'project','month':'2026-11'}).status_code==403
    finally:app.dependency_overrides.clear()


def test_exact_payroll_deductions_and_reasons():
    pay={'basic_pay':1000,'overtime_pay':50,'total_pay':1050}
    result=apply_deductions(pay,[{'amount':10.25,'reason':'Advance'},{'amount':0.10,'reason':'Adjustment'}])
    assert result['total_pay']==1039.65 and result['deductions']==10.35
    for rows in [[{'amount':1051,'reason':'Too much'}],[{'amount':-1,'reason':'Invalid'}],[{'amount':5,'reason':' '}],[{'amount':0.001,'reason':'Fractional cent'}]]:
        with pytest.raises(ValueError):apply_deductions(pay,rows)


def test_assigned_site_manager_can_only_use_expense_scope(monkeypatch):
    called=[]
    class DB:
        def rpc(self,name,payload):called.append((name,payload));return self
        def execute(self):return NS(data={'id':'expense'})
    monkeypatch.setattr(projects,'authorized_project_client',lambda pid,user,write:DB() if write else pytest.fail('Site manager must use operational scope'))
    from api.models import ExpenseCreate
    result=projects.add_project_expense('project',ExpenseCreate(project_id='project',title='Transport',amount=25,expense_date='2026-11-23',category='Other'),{'id':'sm','role':'site_manager','token':'fixture'})
    assert result['id']=='expense' and called[0][0]=='record_project_expense'
