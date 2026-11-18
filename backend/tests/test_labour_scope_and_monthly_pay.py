from copy import deepcopy
from types import SimpleNamespace
import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient
from api.routes import labour
from core.security import get_current_user
from core.worker_payroll import summarize_salary_slips
from main import app


class Query:
    def __init__(self,client,table):
        self.client,self.table,self.filters=client,table,[]
    def select(self,fields):
        assert '(' not in fields, 'Do not assume a workers/profile foreign-key relationship'
        return self
    def eq(self,key,value):
        self.filters.append((key,'eq',value));return self
    def in_(self,key,values):
        self.filters.append((key,'in',values));return self
    def gte(self,key,value):
        self.filters.append((key,'gte',value));return self
    def lte(self,key,value):
        self.filters.append((key,'lte',value));return self
    def order(self,*args,**kwargs):return self
    def single(self):self.one=True;return self
    def execute(self):
        self.client.reads.append((self.table,list(self.filters)))
        rows=deepcopy(self.client.tables.get(self.table,[]))
        for key,op,value in self.filters:
            rows=[row for row in rows if row.get(key) is not None and {'eq':lambda:row[key]==value,'in':lambda:row[key] in value,'gte':lambda:row[key]>=value,'lte':lambda:row[key]<=value}[op]()]
        return SimpleNamespace(data=(rows[0] if rows else None) if getattr(self,'one',False) else rows)


class Client:
    def __init__(self):
        self.reads=[]
        self.tables={
            'projects':[{'id':'p1','pm_id':'pm'},{'id':'p2','pm_id':'other'}],
            'sites':[{'id':'s1','project_id':'p1'},{'id':'s2','project_id':'p1'},{'id':'s3','project_id':'p2'}],
            'workers':[{'id':'w1','user_id':'u1'},{'id':'w2','user_id':'u2'}],
            'profiles':[{'id':'u1','full_name':'Same Name','daily_rate':3500,'worker_type':'mason'},
                        {'id':'u2','full_name':'Same Name','daily_rate':0}],
            'attendance':[
                {'id':'a1','site_id':'s1','worker_id':'w1','date':'2026-11-02','status':'Present','hours_worked':8,'created_at':'2026-11-02T00:00:00Z'},
                {'id':'a2','site_id':'s2','worker_id':'w1','date':'2026-11-03','status':'Present','hours_worked':9,'created_at':'2026-11-03T00:00:00Z'},
                {'id':'a3','site_id':'s1','worker_id':'w2','date':'2026-11-02','status':'Present','hours_worked':4,'created_at':'2026-11-02T00:00:00Z'},
                {'id':'a4','site_id':'s3','worker_id':'w1','date':'2026-11-04','status':'Present','hours_worked':8,'created_at':'2026-11-04T00:00:00Z'},
            ],
            'salary_slips':[],
        }
    def table(self,name):return Query(self,name)


@pytest.fixture
def client(monkeypatch):
    client=Client();monkeypatch.setattr(labour,'client_for_token',lambda _:client);return client


PM={'id':'pm','role':'pm','token':'fixture'}
WORKER={'id':'u1','role':'worker','token':'fixture'}


def test_project_attendance_resolves_all_physical_sites_and_preserves_project(client):
    rows=labour.get_labour('p1',PM)
    assert {row['id'] for row in rows}=={'a1','a2','a3'}
    assert {row['project_id'] for row in rows}=={'p1'}
    assert {row['site_id'] for row in rows}=={'s1','s2'}
    assert all(row['worker_name']=='Same Name' for row in rows)
    assert ('attendance',[('site_id','in',['s1','s2'])]) in client.reads


def test_unfiltered_pm_attendance_stays_inside_managed_sites(client):
    assert len(labour.get_labour(None,PM))==3


def test_other_project_is_denied_before_attendance_read(client):
    with pytest.raises(HTTPException) as error:labour.get_labour('p2',PM)
    assert error.value.status_code==403
    assert not any(table=='attendance' for table,_ in client.reads)


def test_manager_without_projects_does_not_query_attendance(client):
    assert labour.get_labour(None,{'id':'none','role':'pm','token':'fixture'})==[]
    assert not any(table=='attendance' for table,_ in client.reads)


def test_admin_can_view_multiple_projects_without_site_project_id_confusion(client):
    rows=labour.get_labour(None,{'id':'admin','role':'super_admin','token':'fixture'})
    assert {row['project_id'] for row in rows}=={'p1','p2'}


def test_attendance_response_validates_against_http_response_model(client):
    app.dependency_overrides[get_current_user]=lambda:PM
    try:
        with TestClient(app) as http:
            response=http.get('/api/labour/?project_id=p1')
        assert response.status_code==200
        assert response.json()[0]['role']=='mason'
    finally:app.dependency_overrides.pop(get_current_user,None)


def test_payroll_keeps_identically_named_workers_separate_and_scopes_before_read(client):
    rows=labour.get_payroll(PM)
    assert len(rows)==2
    by_id={row['worker_id']:row for row in rows}
    assert by_id['u1']['total_hours']==17 and by_id['u1']['days_present']==2
    assert by_id['u2']['total_hours']==4 and by_id['u2']['daily_rate']==0
    assert all(row['project_id']=='p1' for row in rows)
    assert ('attendance',[('site_id','in',['s1','s2'])]) in client.reads


def test_payroll_deduplicates_same_day_and_excludes_leave(client):
    client.tables['attendance'] += [dict(client.tables['attendance'][0],id='duplicate'),
        dict(client.tables['attendance'][0],id='leave',date='2026-11-05',status='On Leave',hours_worked=8)]
    row=next(row for row in labour.get_payroll(PM) if row['worker_id']=='u1')
    assert row['total_hours']==17 and row['days_present']==2


def slip(id,start,end,**changes):
    return {'id':id,'worker_id':'u1','project_id':'p1','period_start':start,'period_end':end,'total_amount':1000,
        'total_days':1,'total_hours':8,'basic_pay':900,'overtime_pay':150,'deductions':50,'daily_rate':900,**changes}


def test_worker_month_includes_partial_periods_and_multiple_projects(client):
    client.tables['salary_slips']=[slip('first','2026-11-01','2026-11-15'),
        slip('second','2026-11-16','2026-11-30',total_amount=2000,project_id='p2',daily_rate=1800),
        slip('older','2026-10-01','2026-10-31'),slip('foreign','2026-11-01','2026-11-30',worker_id='u2')]
    result=labour.worker_payroll('2026-11',WORKER)
    assert result['slip_count']==2 and result['total_pay']==3000
    assert result['deductions']==100 and result['daily_rate'] is None
    assert {row['id'] for row in result['slips']}=={'first','second'}
    assert not any(table=='attendance' for table,_ in client.reads)


def test_cross_month_slip_is_explicitly_labelled_without_invented_proration(client):
    client.tables['salary_slips']=[slip('cross','2026-10-25','2026-11-05',total_amount=1234.56)]
    result=labour.worker_payroll('2026-11',WORKER)
    assert result['includes_cross_month_periods'] and result['total_pay']==1234.56


def test_zero_amount_is_preserved_and_duplicate_ids_are_not_double_counted():
    row=slip('zero','2026-11-01','2026-11-15',total_amount=0,total_pay=1000)
    result=summarize_salary_slips([row,row],'2026-11-01','2026-11-30')
    assert result['total_pay']==0 and result['slip_count']==1


def test_worker_without_slips_gets_an_estimate_only_for_their_own_month(client):
    result=labour.worker_payroll('2026-11',WORKER)
    assert result['final'] is False
    assert result['total_days']==3 and result['total_hours']==25


def test_non_worker_cannot_read_worker_payroll(client):
    with pytest.raises(HTTPException) as error:labour.worker_payroll('2026-11',PM)
    assert error.value.status_code==403 and client.reads==[]
