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
        self.ranges = {}

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
        self.ranges[key] = ('gte',val)
        return self

    def lte(self, key, val):
        self.ranges[key] = ('lte',val)
        return self

    def order(self, key, **kwargs):
        return self

    def insert(self, payload):
        if self.table_name == 'salary_slips' and self.client.insert_error:
            raise self.client.insert_error
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
                {'id': 'att-1', 'site_id': 'site-1', 'worker_id': 'w-rec-1', 'date': '2026-10-01', 'check_in_time': '2026-10-01T08:00:00Z', 'reviewed_at':'2026-10-03T00:00:00Z', 'hours_worked': 8, 'overtime_hours': 0},
                {'id': 'att-2', 'site_id': 'site-1', 'worker_id': 'w-rec-1', 'date': '2026-10-02', 'check_in_time': '2026-10-02T08:00:00Z', 'reviewed_at':'2026-10-03T00:00:00Z', 'hours_worked': 10, 'overtime_hours': 2},
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
            rows = [r for r in self.client.existing_slips if all(r.get(k)==v for k,v in self.filters.items()) and all(r.get(k) in v for k,v in self.in_filters.items())]
            for key,(op,value) in self.ranges.items():
                rows = [r for r in rows if r.get(key) is not None and (r[key] >= value if op=='gte' else r[key] <= value)]
            return SimpleNamespace(data=rows)

        if self.table_name == 'notifications':
            return SimpleNamespace(data=[])

        return SimpleNamespace(data=[])

class MockClient:
    def __init__(self, existing_slips=None, insert_error=None):
        self.inserted_records = []
        self.existing_slips = existing_slips or []
        self.insert_error = insert_error

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
    assert slip['month'] == '2026-10-01'
    assert slip['status'] == 'Draft'


def test_deductions_are_applied_before_slip_insert(monkeypatch):
    client=MockClient()
    monkeypatch.setattr(labour,'client_for_token',lambda token:client)
    monkeypatch.setattr(labour,'managed_project_ids',lambda c,u:['proj-100'])
    request=labour.SalaryGenerateRequest(start_date='2026-10-01',end_date='2026-10-15',site_id='site-1',deductions=[{'worker_id':'profile-uuid-1','amount':500.25,'reason':'Advance repayment'}])
    result=labour.generate_salary(request,{'id':'admin-1','role':'super_admin','token':'fixture'})
    assert result['slips'][0]['deductions']==500.25
    assert result['slips'][0]['total_amount']==8999.75
    assert result['slips'][0]['deduction_details'][0]['reason']=='Advance repayment'


def run_generation(monkeypatch, existing=None, insert_error=None):
    client = MockClient(existing,insert_error)
    monkeypatch.setattr(labour,'client_for_token',lambda _:client)
    monkeypatch.setattr(labour,'managed_project_ids',lambda *_:['proj-100'])
    request = labour.SalaryGenerateRequest(start_date='2026-10-01',end_date='2026-10-15',site_id='site-1')
    return client, lambda: labour.generate_salary(request,{'id':'pm','role':'pm','token':'fixture'})


def saved_slip(start,end,**changes):
    return {'id':'saved','worker_id':'profile-uuid-1','project_id':'proj-100','period_start':start,'period_end':end,'status':'Paid',**changes}


@pytest.mark.parametrize('start,end',[('2026-09-20','2026-10-01'),('2026-10-04','2026-10-09'),('2026-10-15','2026-10-31'),('2026-09-01','2026-11-01')])
def test_overlapping_payroll_returns_conflicts_without_inserting(monkeypatch,start,end):
    client,generate = run_generation(monkeypatch,[saved_slip(start,end)])
    with pytest.raises(HTTPException) as error:
        generate()
    assert error.value.status_code == 409
    assert error.value.detail['code'] == 'payroll_overlap'
    assert error.value.detail['conflicts'][0]['period_start'] == start
    assert error.value.detail['conflicts'][0]['worker_name'] == 'Kamal Perera'
    assert client.inserted_records == []


def test_same_period_is_an_idempotent_no_op(monkeypatch):
    client,generate = run_generation(monkeypatch,[saved_slip('2026-10-01','2026-10-15')])
    result=generate()
    assert result['generated']==0 and result['already_generated']==1
    assert client.inserted_records == []


@pytest.mark.parametrize('existing',[
    saved_slip('2026-09-01','2026-09-30'),
    saved_slip('2026-10-16','2026-10-31'),
    saved_slip('2026-10-01','2026-10-10',project_id='another-project'),
    saved_slip('2026-10-01','2026-10-10',worker_id='another-worker'),
])
def test_adjacent_periods_and_other_project_workers_do_not_block(monkeypatch,existing):
    _,generate=run_generation(monkeypatch,[existing])
    assert generate()['generated']==1


def test_concurrent_database_overlap_is_a_safe_conflict(monkeypatch):
    class Conflict(Exception):
        code='23505'
    _,generate=run_generation(monkeypatch,insert_error=Conflict('internal database details'))
    with pytest.raises(HTTPException) as error:
        generate()
    assert error.value.status_code==409
    assert error.value.detail['code']=='payroll_changed'
    assert 'internal database details' not in str(error.value.detail)

