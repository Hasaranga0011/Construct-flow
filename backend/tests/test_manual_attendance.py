from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo
from types import SimpleNamespace
import pytest
from fastapi import HTTPException, FastAPI
from fastapi.testclient import TestClient
from pydantic import ValidationError
from api.models import LabourCreate
from api.routes import labour
from core.security import get_current_user


class Query:
    def __init__(self, client, table): self.client,self.name,self.filters=client,table,{}
    def select(self, *_): return self
    def eq(self, key, value): self.filters[key]=value; return self
    def in_(self, key, value): self.filters[key]=value; return self
    def insert(self, payload): self.payload=payload; return self
    def execute(self):
        if hasattr(self,'payload'):
            if self.client.duplicate:
                class Duplicate(Exception): code='23505'
                raise Duplicate('duplicate')
            self.client.writes.append(self.payload)
            return SimpleNamespace(data=[{'id':'attendance','created_at':datetime.now(timezone.utc).isoformat(),**self.payload}])
        if self.name=='profiles':
            assert self.filters=={'id':'selected-profile'},'Must use selected identity, never a name lookup'
            rows=[{'id':'selected-profile','full_name':'Same Name','role':'worker','is_approved':True}]
        elif self.name=='workers': rows=[{'id':'worker-record','user_id':'selected-profile','site_id':self.client.worker_site}]
        elif self.name=='sites': rows=[{'id':'physical-site','project_id':'project'}] if self.client.has_site else []
        elif self.name=='site_workers': rows=[{'worker_id':self.client.assignment}]
        else: raise AssertionError(self.name)
        return SimpleNamespace(data=rows)


class Client:
    def __init__(self, assignment='worker-record', has_site=True, worker_site=None, duplicate=False):
        self.assignment,self.has_site,self.worker_site,self.duplicate,self.writes=assignment,has_site,worker_site,duplicate,[]
    def table(self, name): return Query(self,name)


USER={'id':'manager','role':'pm','token':'fixture'}


def payload(**changes):
    check_in = changes.get('check_in_time', datetime.now(timezone.utc)-timedelta(hours=12))
    # Serializing the request makes the date explicit; it must describe the
    # check-in's Sri Lankan day, including when the test runs before noon.
    work_date = (check_in or datetime.now(timezone.utc)).astimezone(ZoneInfo('Asia/Colombo')).date()
    return LabourCreate(**{'project_id':'project','worker_id':'selected-profile','worker_name':'Same Name','role':'Labourer','status':'Present','date':work_date,'check_in_time':check_in,'hours_worked':8,**changes})


@pytest.mark.parametrize('hours, overtime',[(0,0),(6,0),(10,2)])
def test_manual_entry_resolves_physical_site_and_selected_worker(monkeypatch,hours,overtime):
    client=Client()
    monkeypatch.setattr(labour,'client_for_token',lambda _:client)
    monkeypatch.setattr(labour,'managed_project_ids',lambda *_:['project'])
    result=labour.create_labour(payload(hours_worked=hours),USER)
    assert result['project_id']=='project' and result['site_id']=='physical-site' and result['worker_id']=='worker-record'
    assert client.writes[0]['overtime_hours']==overtime
    assert bool(client.writes[0]['check_out_time'])==(hours>0)


@pytest.mark.parametrize('options,code',[({'assignment':'different'},403),({'has_site':False},409),({'worker_site':'foreign-site'},403),({'duplicate':True},409)])
def test_manual_entry_rejects_foreign_assignment_missing_site_or_duplicate(monkeypatch,options,code):
    client=Client(**options)
    monkeypatch.setattr(labour,'client_for_token',lambda _:client)
    monkeypatch.setattr(labour,'managed_project_ids',lambda *_:['project'])
    with pytest.raises(HTTPException) as error: labour.create_labour(payload(),USER)
    assert error.value.status_code==code and client.writes==[]


@pytest.mark.parametrize('hours',[-1,25,float('inf'),float('nan')])
def test_manual_entry_rejects_invalid_work_hours(hours):
    with pytest.raises(ValidationError): payload(hours_worked=hours)


def test_manual_entry_never_records_future_completed_hours(monkeypatch):
    client=Client();monkeypatch.setattr(labour,'client_for_token',lambda _:client);monkeypatch.setattr(labour,'managed_project_ids',lambda *_:['project'])
    with pytest.raises(HTTPException) as error:
        labour.create_labour(payload(check_in_time=datetime.now(timezone.utc),hours_worked=8),USER)
    assert error.value.status_code==422 and client.writes==[]


def test_manual_entry_returns_valid_http_contract(monkeypatch):
    client=Client();monkeypatch.setattr(labour,'client_for_token',lambda _:client);monkeypatch.setattr(labour,'managed_project_ids',lambda *_:['project'])
    app=FastAPI();app.include_router(labour.router);app.dependency_overrides[get_current_user]=lambda:USER
    response=TestClient(app).post('/labour/',json=payload().model_dump(mode='json',by_alias=True))
    assert response.status_code==200, response.text
    assert response.json()['worker_id']=='worker-record' and response.json()['site_id']=='physical-site'
