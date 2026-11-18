from types import SimpleNamespace
import pytest
from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient
from api.routes import clients, estimations, admin
from core.security import get_current_user
from core.access import project_member


@pytest.mark.parametrize('role', ['pm', 'worker', 'client', 'supplier', 'site_manager'])
def test_only_admin_can_invite_accounts(monkeypatch, role):
    monkeypatch.setattr(clients, 'new_supabase_client', lambda *a: pytest.fail('Privileged access'))
    app = FastAPI()
    app.include_router(clients.router)
    app.dependency_overrides[get_current_user] = lambda: {'id': 'user', 'role': role}
    response = TestClient(app).post('/clients/invite', json={
        'email': 'qa@example.invalid', 'name': 'QA', 'company': 'QA',
        'access_level': 'Full Access', 'project_id': 'foreign-project'})
    assert response.status_code == 403


class Query:
    def __init__(self, tables): self.tables = tables; self.filters = []
    def table(self, name): self.name = name; return self
    def select(self, *a): return self
    def eq(self, *a): self.filters.append(a); return self
    def ilike(self, *a): return self
    def execute(self): return SimpleNamespace(data=self.tables.get(self.name, []))


def test_existing_invitee_is_not_reassigned_or_emailed(monkeypatch):
    monkeypatch.setattr(clients, 'get_auth_client', lambda _: Query({'projects': [{'id': 'project'}], 'profiles': [{'id': 'existing', 'role': 'super_admin'}]}))
    monkeypatch.setattr(clients, 'new_supabase_client', lambda *a: pytest.fail('Existing user must not reach invitation'))
    with pytest.raises(HTTPException) as error:
        clients.invite_client(clients.InviteClientRequest(email='qa@example.com', name='QA', company='', access_level='Full Access', project_id='project'), None)
    assert error.value.status_code == 409


@pytest.mark.parametrize('role,table', [('supplier', 'purchase_orders'), ('worker', 'site_workers')])
def test_operational_assignments_connect_message_participants(role, table):
    query = Query({'projects': [{'pm_id': 'pm', 'client_id': 'client'}], table: [{'id': 'assignment'}]})
    assert project_member(query, 'project', 'user', role)
    assert ('project_id', 'project') in query.filters
    assert ('supplier_id' if role == 'supplier' else 'worker_id', 'user') in query.filters


def test_foreign_unlinked_estimate_cannot_be_reviewed(monkeypatch):
    monkeypatch.setattr(estimations, 'client_for_token', lambda _: Query({'estimations': [{'status': 'Pending', 'created_by': 'other'}]}))
    with pytest.raises(HTTPException) as error:
        estimations.review_estimation('estimate', estimations.EstimationReview(status='Approved'), {'id': 'pm', 'role': 'pm', 'token': 'qa'})
    assert error.value.status_code == 403


def test_previously_reviewed_estimate_cannot_be_reviewed_again(monkeypatch):
    monkeypatch.setattr(estimations, 'client_for_token', lambda _: Query({'estimations': [{'status': 'Approved'}]}))
    with pytest.raises(HTTPException) as error:
        estimations.review_estimation('estimate', estimations.EstimationReview(status='Rejected'), {'id': 'admin', 'role': 'super_admin', 'token': 'qa'})
    assert error.value.status_code == 409


def test_admin_directory_uses_protected_profile_role(monkeypatch):
    class Directory(Query):
        def order(self, *a, **kw): return self
    db = Directory({'profiles': [{'id': 'user', 'role': 'worker'}]})
    db.auth = SimpleNamespace(admin=SimpleNamespace(list_users=lambda: SimpleNamespace(users=[SimpleNamespace(id='user', user_metadata={'role': 'super_admin'})])))
    monkeypatch.setattr(admin, '_admin_supabase', lambda: db)
    assert admin.list_users({'role': 'super_admin'})[0]['role'] == 'worker'


def test_supplier_invitation_creates_pending_supplier_not_client(monkeypatch):
    monkeypatch.setattr(clients, 'get_auth_client', lambda _: Query({}))
    captured = {}
    class Inviter(Query):
        def upsert(self, payload): captured['profile'] = payload; return self
    db = Inviter({})
    def invite(email, options):
        captured['metadata'] = options['data']
        return SimpleNamespace(user=SimpleNamespace(id='supplier'))
    db.auth = SimpleNamespace(admin=SimpleNamespace(invite_user_by_email=invite))
    monkeypatch.setattr(clients, 'new_supabase_client', lambda *a: db)
    monkeypatch.setattr(clients, 'create_notifications', lambda *a: None)
    result = clients.invite_client(clients.InviteClientRequest(email='qa@example.com', name='QA', company='QA', access_level='supplier', project_id=''), None)
    assert result['user_id'] == 'supplier'
    assert captured['metadata']['role'] == 'supplier'
    assert captured['profile']['role'] == 'supplier'
    assert captured['profile']['is_approved'] is False


def test_review_updates_only_pending_estimate_without_creating_project(monkeypatch):
    class Review(Query):
        def update(self, payload):
            assert self.name == 'estimations'
            self.payload = payload
            return self
        def execute(self):
            if hasattr(self, 'payload'):
                assert ('status', 'Pending') in self.filters
                return SimpleNamespace(data=[{'id': 'estimate', **self.payload}])
            return SimpleNamespace(data=[{'status': 'Pending', 'created_by': 'pm'}])
    monkeypatch.setattr(estimations, 'client_for_token', lambda _: Review({}))
    result = estimations.review_estimation('estimate', estimations.EstimationReview(status='Approved'), {'id': 'pm', 'role': 'pm', 'token': 'qa'})
    assert result['status'] == 'Approved'
