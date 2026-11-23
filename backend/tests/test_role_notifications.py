from types import SimpleNamespace
from api.routes import notifications
from core import notification_helper


def test_feed_uses_current_identity_rpc_without_user_supplied_scope(monkeypatch):
    calls=[]
    class Client:
        def rpc(self,name,args):
            calls.append((name,args))
            return SimpleNamespace(execute=lambda:SimpleNamespace(data={'items':[], 'unread_count':75}))
    monkeypatch.setattr(notifications,'client_for_token',lambda token:Client())
    result=notifications.notification_feed({'id':'current-user','role':'worker','token':'fixture'},offset=0)
    assert result['unread_count']==75
    assert calls==[('get_own_notification_feed',{'p_offset':0})]


def test_database_event_engine_prevents_duplicate_python_workflow_notifications(monkeypatch):
    monkeypatch.setattr(notification_helper,'workflow_notifications_enabled',lambda:True)
    monkeypatch.setattr('core.attendance_setup.setup_client',lambda:(_ for _ in ()).throw(AssertionError('No duplicate insert')))
    assert notification_helper.create_notifications([{'title':'Salary generated'}],workflow=True)==1


def test_manual_notifications_are_preserved_when_workflow_engine_is_enabled(monkeypatch):
    inserted=[]
    class Client:
        def table(self,name):
            assert name=='notifications'
            return SimpleNamespace(insert=lambda rows:SimpleNamespace(execute=lambda:inserted.extend(rows)))
    monkeypatch.setattr(notification_helper,'workflow_notifications_enabled',lambda:True)
    monkeypatch.setattr('core.attendance_setup.setup_client',lambda:Client())
    assert notification_helper.create_notifications([{'title':'Admin announcement'}])==1
    assert inserted[0]['title']=='Admin announcement'


def test_legacy_workflow_dispatch_remains_until_sql_is_installed(monkeypatch):
    inserted=[]
    monkeypatch.setattr(notification_helper,'workflow_notifications_enabled',lambda:False)
    monkeypatch.setattr('core.attendance_setup.setup_client',lambda:SimpleNamespace(table=lambda name:SimpleNamespace(insert=lambda rows:SimpleNamespace(execute=lambda:inserted.extend(rows)))))
    assert notification_helper.create_notifications([{'title':'Workflow update'}],workflow=True)==1
    assert inserted[0]['title']=='Workflow update'


def test_engine_installation_is_detected_without_a_stale_negative_cache(monkeypatch):
    answers=iter([False,True])
    monkeypatch.setattr(notification_helper,'_engine_state',(0,False))
    monkeypatch.setattr(notification_helper.time,'monotonic',lambda:100)
    monkeypatch.setattr('core.attendance_setup.setup_client',lambda:SimpleNamespace(rpc=lambda name:SimpleNamespace(execute=lambda:SimpleNamespace(data=next(answers)))))
    assert notification_helper.workflow_notifications_enabled() is False
    assert notification_helper.workflow_notifications_enabled() is True
