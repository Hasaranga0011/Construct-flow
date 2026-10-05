from types import SimpleNamespace
from datetime import datetime
from fastapi.testclient import TestClient
from api.routes import reports
from core.security import get_current_user
from main import app


class Query:
    def __init__(self, rows, calls, table):
        self.rows, self.calls, self.table = rows, calls, table
    def select(self, columns):
        self.columns = columns
        return self
    def order(self, column):
        assert column == 'id'
        return self
    def range(self, start, end):
        self.start, self.end = start, end
        return self
    def execute(self):
        self.calls.append((self.table, self.columns, self.start, self.end))
        return SimpleNamespace(data=self.rows[self.start:self.end + 1])


class Client:
    def __init__(self, count=1001):
        self.calls = []
        self.rows = [{'id': str(i)} for i in range(count)]
    def table(self, table):
        return Query(self.rows if table == 'projects' else [], self.calls, table)


def test_report_reads_beyond_default_database_limit():
    client = Client()
    assert len(reports._report_rows(client, 'projects')) == 1001
    assert [call[2] for call in client.calls] == [0, 500, 1000]


def test_management_report_uses_request_client_and_minimal_people_fields(monkeypatch):
    client = Client(2)
    request = object()
    def auth_client(actual):
        assert actual is request
        return client
    monkeypatch.setattr(reports, 'get_auth_client', auth_client)
    result = reports.get_management_report(request)
    assert len(result['projects']) == 2
    assert result['payroll'] == []
    assert datetime.fromisoformat(result['generated_at']).tzinfo is not None
    assert any(call[0:2] == ('profiles', 'id, full_name') for call in client.calls)


def test_management_report_denies_worker():
    app.dependency_overrides[get_current_user] = lambda: {'id': 'worker', 'role': 'worker', 'token': 'unused'}
    try:
        with TestClient(app) as client:
            assert client.get('/api/reports/management').status_code == 403
    finally:
        app.dependency_overrides.clear()


def test_management_report_requires_authentication():
    with TestClient(app) as client:
        assert client.get('/api/reports/management').status_code == 401
