from types import SimpleNamespace
import pytest
from fastapi import HTTPException
from api.routes import labour

class Query:
    def __init__(self, client, name): self.client, self.name, self.filters, self.payload = client, name, {}, None
    def select(self, columns):
        if self.name == 'attendance': assert 'status' not in columns
        return self
    def eq(self, key, value): self.filters[key] = value; return self
    def single(self): return self
    def order(self, key): return self
    def insert(self, payload): self.payload = payload; return self
    def execute(self):
        if self.payload is not None:
            assert self.name == 'attendance'
            assert self.payload['site_id'] == 'physical-site'
            assert self.payload['worker_id'] == 'worker-record'
            assert 'status' not in self.payload
            self.client.writes.append(self.payload)
            return SimpleNamespace(data=[{'id': 'attendance', **self.payload}])
        rows = {
            'profiles': {'id': 'profile', 'full_name': 'Worker'},
            'workers': {'id': 'worker-record', 'user_id': 'profile'},
            'site_manager_sites': [{'project_id': self.client.allowed}],
            'sites': [{'id': 'physical-site'}] if self.client.has_site else [],
            'site_workers': [{'worker_id': self.client.assigned}],
            'attendance': [],
        }
        if self.name == 'attendance': assert self.filters['site_id'] == 'physical-site'
        return SimpleNamespace(data=rows[self.name])

class Client:
    def __init__(self, assigned='worker-record', allowed='project', has_site=True):
        self.assigned, self.allowed, self.has_site, self.writes = assigned, allowed, has_site, []
    def table(self, name): return Query(self, name)

USER = {'id': 'manager', 'role': 'site_manager', 'token': 'fixture'}

@pytest.mark.parametrize('assigned', ['worker-record', 'profile'])
def test_scan_resolves_site_and_both_assignment_id_formats(monkeypatch, assigned):
    client = Client(assigned=assigned)
    monkeypatch.setattr(labour, 'client_for_token', lambda token: client)
    result = labour.scan_qr_code(labour.ScanRequest(qr_code='qr', site_id='project'), USER)
    assert result['action'] == 'check_in'
    assert len(client.writes) == 1

@pytest.mark.parametrize('options,status', [({'allowed': 'other'}, 403), ({'assigned': 'other'}, 403), ({'has_site': False}, 409)])
def test_invalid_project_or_worker_cannot_write_attendance(monkeypatch, options, status):
    client = Client(**options)
    monkeypatch.setattr(labour, 'client_for_token', lambda token: client)
    with pytest.raises(HTTPException) as error:
        labour.scan_qr_code(labour.ScanRequest(qr_code='qr', site_id='project'), USER)
    assert error.value.status_code == status
    assert client.writes == []
