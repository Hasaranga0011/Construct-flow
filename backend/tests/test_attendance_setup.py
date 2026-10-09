from copy import deepcopy
from types import SimpleNamespace
import pytest
from fastapi import HTTPException
from core.attendance_setup import ensure_project_attendance
from api.routes import projects

class Query:
    def __init__(self, client, table):
        self.client, self.name, self.filters, self.payload = client, table, {}, None
    def select(self, *_): return self
    def eq(self, key, value): self.filters[key] = value; return self
    def order(self, *_): return self
    def upsert(self, payload, **options):
        assert options == {"on_conflict": "id", "ignore_duplicates": True}
        self.payload = payload; return self
    def execute(self):
        rows = self.client.tables[self.name]
        if self.payload is not None:
            if not any(row['id'] == self.payload['id'] for row in rows):
                rows.append(deepcopy(self.payload))
                self.client.writes.append((self.name, deepcopy(self.payload)))
            return SimpleNamespace(data=[])
        return SimpleNamespace(data=[r for r in rows if all(r.get(k) == v for k,v in self.filters.items())])

class Client:
    def __init__(self):
        self.writes = []
        self.tables = {
            'projects': [{'id':'project', 'location':'Colombo'}],
            'sites': [], 'workers': [],
            'site_manager_sites': [{'project_id':'project','site_manager_id':'manager'}],
            'site_workers': [{'id':'assignment','project_id':'project','worker_id':'profile'}],
            'profiles': [{'id':'profile','daily_rate':2500,'worker_type':'mason'}],
        }
    def table(self, name): return Query(self, name)

def test_missing_records_repaired_once_without_fake_nic():
    client=Client()
    first=ensure_project_attendance(client,'project')
    second=ensure_project_attendance(client,'project')
    assert first == second
    assert len(client.writes) == 2
    assert first[0]['site_manager_id'] == 'manager'
    worker=client.tables['workers'][0]
    assert worker['id'] == worker['user_id'] == 'profile'
    assert worker['nic_number'] is None
    assert worker['daily_rate'] == 2500
    assert worker['skill_type'] == 'mason'

@pytest.mark.parametrize('worker_id', ['profile','existing-worker'])
def test_existing_worker_and_nic_never_overwritten(worker_id):
    client=Client()
    client.tables['workers']=[{'id':worker_id,'user_id':'profile','nic_number':'recorded-nic','daily_rate':4000}]
    original=deepcopy(client.tables['workers'])
    ensure_project_attendance(client,'project')
    assert client.tables['workers'] == original
    assert all(table != 'workers' for table,_ in client.writes)

def test_project_without_worker_assignments_does_not_invent_workers():
    client=Client();client.tables['site_workers']=[]
    ensure_project_attendance(client,'project')
    assert len(client.tables['sites']) == 1
    assert client.tables['workers'] == []

def test_existing_site_and_history_are_reused():
    client=Client()
    client.tables['sites']=[{'id':'existing','project_id':'project','site_manager_id':'manager','address':'Existing'}]
    ensure_project_attendance(client,'project')
    assert client.tables['sites'][0]['id'] == 'existing'
    assert all(table != 'sites' for table,_ in client.writes)

def test_foreign_project_rejected_before_service_credential(monkeypatch):
    def denied(*args, **kwargs): raise HTTPException(status_code=403, detail='Not assigned')
    monkeypatch.setattr(projects,'authorized_project_client',denied)
    monkeypatch.setattr(projects,'setup_client',lambda: pytest.fail('Privileged client created before authorization'))
    with pytest.raises(HTTPException) as error:
        projects.prepare_attendance('other',{'id':'manager','role':'site_manager'})
    assert error.value.status_code == 403
