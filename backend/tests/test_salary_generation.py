import pytest
from types import SimpleNamespace
from fastapi import HTTPException
from api.routes import labour

class MockQuery:
    def __init__(self, client, table_name):
        self.client = client
        self.table_name = table_name
        self.filters = {}
        self.in_filters = {}
        self.inserted = None

    def select(self, cols):
        # Guarantee 'project_id' is never queried directly on attendance
        if self.table_name == 'attendance':
            assert 'project_id' not in self.filters
        return self

    def eq(self, key, val):
        self.filters[key] = val
        return self

    def in_(self, key, vals):
        self.in_filters[key] = vals
        return self

    def gte(self, key, val):
        return self

    def lte(self, key, val):
        return self

    def order(self, key, **kwargs):
        return self

    def insert(self, payload):
        self.inserted = payload
        self.client.inserted_records.extend(payload if isinstance(payload, list) else [payload])
        return self

    def execute(self):
        if self.inserted is not None:
            return SimpleNamespace(data=self.inserted)

        if self.table_name == 'sites':
            if self.filters.get('id') == 'site-1':
                return SimpleNamespace(data=[{'id': 'site-1', 'project_id': 'proj-100'}])
            return SimpleNamespace(data=[{'id': 'site-1', 'project_id': 'proj-100'}])

        if self.table_name == 'attendance':
            # Verifies attendance is queried by site_id, not project_id
            assert 'site_id' in self.in_filters or 'site_id' in self.filters
            return SimpleNamespace(data=[
                {'id': 'att-1', 'site_id': 'site-1', 'worker_id': 'w-rec-1', 'date': '2026-10-01', 'check_in_time': '2026-10-01T08:00:00Z', 'hours_worked': 8, 'overtime_hours': 0},
                {'id': 'att-2', 'site_id': 'site-1', 'worker_id': 'w-rec-1', 'date': '2026-10-02', 'check_in_time': '2026-10-02T08:00:00Z', 'hours_worked': 10, 'overtime_hours': 2},
            ])

        if self.table_name == 'workers':
            return SimpleNamespace(data=[
                {'id': 'w-rec-1', 'user_id': 'profile-uuid-1'}
            ])

        if self.table_name == 'profiles':
            return SimpleNamespace(data=[
                {'id': 'profile-uuid-1', 'full_name': 'Kamal Perera', 'daily_rate': 4000, 'email': 'kamal@example.com', 'notification_preferences': {'email': False, 'in_app': True}}
            ])

        if self.table_name == 'salary_slips':
            return SimpleNamespace(data=[])

        if self.table_name == 'notifications':
            return SimpleNamespace(data=[])

        return SimpleNamespace(data=[])

class MockClient:
    def __init__(self):
        self.inserted_records = []

    def table(self, name):
        return MockQuery(self, name)

def test_generate_salary_resolves_sites_and_worker_profile_ids(monkeypatch):
    client = MockClient()
    monkeypatch.setattr(labour, 'client_for_token', lambda token: client)
    monkeypatch.setattr(labour, 'managed_project_ids', lambda c, u: ['proj-100'])

    req = labour.SalaryGenerateRequest(
        start_date='2026-10-01',
        end_date='2026-10-15',
        site_id='site-1'
    )
    user = {'id': 'admin-1', 'role': 'super_admin', 'token': 'fake'}
    res = labour.generate_salary(req, user)

    assert res['generated'] == 1
    assert len(res['slips']) == 1
    slip = res['slips'][0]
    assert slip['worker_id'] == 'profile-uuid-1'
    assert slip['total_days'] == 2
    assert slip['daily_rate'] == 4000
    assert slip['basic_pay'] == 8000
    assert slip['overtime_hours'] == 2
    # Overtime pay: 2 * (4000/8) * 1.5 = 1500
    assert slip['overtime_pay'] == 1500
    assert slip['total_pay'] == 9500

