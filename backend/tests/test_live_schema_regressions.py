from types import SimpleNamespace
import pytest
from fastapi import HTTPException
from api.routes import labour, messages


class Query:
    def __init__(self, client, table):
        self.client, self.table, self.filters, self.payload = client, table, {}, None
    def select(self, fields):
        assert '!sender_id' not in fields
        return self
    def eq(self, field, value):
        self.filters[field] = value
        return self
    def in_(self, field, values):
        assert field == 'id'
        self.ids = values
        return self
    def or_(self, value):
        self.client.or_filters.append(value)
        return self
    def order(self, *args, **kwargs):
        return self
    def update(self, payload):
        self.payload = payload
        return self
    def execute(self):
        rows = [row for row in self.client.tables.get(self.table, []) if all(row.get(k)==v for k,v in self.filters.items())]
        if hasattr(self,'ids'):
            rows = [row for row in rows if row['id'] in self.ids]
        if self.payload is not None:
            self.client.updates += 1
            for row in rows:
                row.update(self.payload)
        return SimpleNamespace(data=rows)


class Client:
    def __init__(self):
        self.updates = 0
        self.or_filters = []
        self.tables = {
            'projects':[{'id':'p','pm_id':'pm','client_id':'client'}],
            'salary_slips':[{'id':'slip','project_id':'p','total_amount':4156.25,'status':'Draft'}],
            'client_messages':[{'id':'m','project_id':'p','sender_id':'pm','receiver_id':'client','content':'QA'}],
            'profiles':[{'id':'pm','full_name':'QA PM','role':'pm'}, {'id':'unrelated','full_name':'Unrelated','role':'pm'}],
        }
    def table(self,name):
        return Query(self,name)


def test_messages_resolve_sender_without_a_profiles_foreign_key(monkeypatch):
    client = Client()
    monkeypatch.setattr(messages,'client_for_token',lambda _:client)
    rows = messages.get_messages('p',None,None,{'id':'client','role':'client','token':'fixture'})
    assert rows[0]['sender'] == {'full_name':'QA PM','role':'pm'}
    assert any('sender_id.eq.client,receiver_id.eq.client' in value for value in client.or_filters)


def test_salary_payment_requires_exact_amount_and_retries_once(monkeypatch):
    client = Client()
    monkeypatch.setattr(labour,'client_for_token',lambda _:client)
    user = {'id':'pm','role':'pm','token':'fixture'}
    with pytest.raises(HTTPException) as error:
        labour.record_salary_payment('slip',labour.SalaryPayment(amount=1),user)
    assert error.value.status_code == 422 and client.updates == 0
    for _ in range(2):
        assert labour.record_salary_payment('slip',labour.SalaryPayment(amount=4156.25),user)['status']=='Paid'
    assert client.updates == 1


def test_salary_payment_rejects_other_project_manager(monkeypatch):
    client = Client()
    monkeypatch.setattr(labour,'client_for_token',lambda _:client)
    with pytest.raises(HTTPException) as error:
        labour.record_salary_payment('slip',labour.SalaryPayment(amount=4156.25),{'id':'other','role':'pm','token':'fixture'})
    assert error.value.status_code == 403 and client.updates == 0
