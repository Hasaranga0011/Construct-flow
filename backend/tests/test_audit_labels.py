from copy import deepcopy
from types import SimpleNamespace
from core.audit_labels import enrich_audit_events, business_value

ADMIN = '00000000-0000-0000-0000-000000000001'
PERSON = '00000000-0000-0000-0000-000000000002'
PROJECT = '00000000-0000-0000-0000-000000000003'


class Client:
    def __init__(self, unavailable=False):
        self.calls = []
        self.unavailable = unavailable
    def table(self, table):
        self.calls.append(table)
        client = self
        class Query:
            def select(self, columns):
                assert columns in ('id,full_name','id,name','id,contact_number')
                self.columns = columns.split(',')
                return self
            def in_(self, field, values):
                assert field == 'id'
                self.ids = values
                return self
            def execute(self):
                if client.unavailable:
                    raise RuntimeError('Private database error')
                values = {'profiles': [{'id': ADMIN, 'full_name': 'Admin'}, {'id': PERSON, 'full_name': 'Janindi','contact_number':'+94000000001'}],
                          'projects': [{'id': PROJECT, 'name': 'Galle Building'}]}
                return SimpleNamespace(data=[{k:v for k,v in r.items() if k in self.columns} for r in values.get(table, []) if r['id'] in self.ids])
        return Query()


def event():
    return {'actor_id': ADMIN, 'record_id': PERSON, 'project_id': PROJECT,
            'table_name': 'profiles', 'before_data': {'is_approved':False},
            'after_data': {'is_approved':True}, 'changed_fields':['is_approved']}


def test_names_resolve_in_batches_without_changing_stored_evidence():
    row = event();before = deepcopy(row)
    client = Client()
    results = enrich_audit_events(client, [row, deepcopy(row)])
    assert client.calls == ['profiles','projects']
    assert results[0]['actor_name'] == 'Admin'
    assert results[0]['record_name'] == 'Janindi'
    assert results[0]['project_name'] == 'Galle Building'
    for key, value in before.items():
        assert results[0][key] == value


def test_unknown_or_deleted_names_do_not_hide_event():
    row = event()
    result = enrich_audit_events(Client(unavailable=True), [row])[0]
    assert result['actor_name'] is None
    assert result['record_name'] is None
    assert result['changed_fields'] == ['is_approved']


def test_system_events_do_not_invent_a_human_actor():
    row = {'actor_id':None,'record_id':None,'project_id':None,'table_name':'inventory_logs',
           'before_data':None,'after_data':{'action':'job_run'}}
    client = Client()
    result = enrich_audit_events(client,[row])[0]
    assert client.calls == []
    assert result['actor_name'] is None


def test_legacy_contact_shows_current_context_without_inventing_old_values():
    row = event()
    row['changed_fields'] = ['contact_number']
    result = enrich_audit_events(Client(),[row])[0]
    assert result['record_name'] == 'Janindi'
    assert 'contact_number' not in result['before_data']
    assert 'contact_number' not in result['after_data']
    assert result['current_values']['contact_number'] == '+94000000001'


def test_authentication_values_are_not_added_as_current_context():
    row = event();row['changed_fields'] = ['password','refresh_token']
    client=Client()
    result=enrich_audit_events(client,[row])[0]
    assert result['current_values'] == {}
    assert client.calls == ['profiles','projects']


def test_current_context_sanitizes_nested_credentials_and_signed_urls():
    result=business_value({'notes':'Business note','contact_number':'+94000000001','nested':[{'token':'secret','quantity':1}],'url':'https://user:pass@example.invalid/file?token=secret#x'})
    assert result['contact_number'] == '+94000000001'
    assert result['url'] == 'https://example.invalid/file'
    assert result['nested'] == [{'quantity':1}]
