from datetime import datetime, timezone
from types import SimpleNamespace
import pytest
from fastapi import HTTPException
from api.routes import audit
from core.security import require_admin


class Query:
    def __init__(self, rows):
        self.rows, self.calls = rows, []
    def __getattr__(self, name):
        def method(*args, **kwargs):
            self.calls.append((name, args, kwargs))
            return SimpleNamespace(data=self.rows) if name == 'execute' else self
        return method


def test_cursor_pagination_is_stable_and_does_not_round_bigint(monkeypatch):
    rows = [{'id': 9007199254740999-i, 'transaction_id': 9007199254740999} for i in range(3)]
    query = Query(rows)
    monkeypatch.setattr(audit, 'get_auth_client', lambda request: query)
    result = audit.list_audit_events(object(), limit=2, before_id=9007199254741000,
                                    action='UPDATE', table='projects', actor_id=None,
                                    project_id=None, since=None, until=None)
    assert len(result['events']) == 2
    assert result['next_cursor'] == '9007199254740998'
    assert result['events'][0]['transaction_id'] == '9007199254740999'
    assert ('lt', ('id', 9007199254741000), {}) in query.calls
    assert ('limit', (3,), {}) in query.calls
    assert ('eq', ('table_name', 'projects'), {}) in query.calls


@pytest.mark.parametrize('role', ['worker', 'client', 'supplier', 'pm', 'site_manager'])
def test_audit_requires_administrator(role):
    with pytest.raises(HTTPException) as caught:
        require_admin({'role': role})
    assert caught.value.status_code == 403


def test_unknown_database_errors_do_not_expose_sql(monkeypatch):
    def fail(request):
        raise RuntimeError('private SQL connection password')
    monkeypatch.setattr(audit, 'get_auth_client', fail)
    with pytest.raises(HTTPException) as caught:
        audit.list_audit_events(object(), limit=25, before_id=None, action=None,
                                table=None, actor_id=None, project_id=None, since=None, until=None)
    assert caught.value.status_code == 503
    assert 'private' not in caught.value.detail


def test_invalid_date_range_does_not_query_database():
    with pytest.raises(HTTPException) as caught:
        audit.list_audit_events(object(), since=datetime(2026, 12, 1, tzinfo=timezone.utc),
                               until=datetime(2026, 11, 1, tzinfo=timezone.utc))
    assert caught.value.status_code == 422
