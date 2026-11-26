from types import SimpleNamespace as NS
import pytest
import main


@pytest.mark.parametrize('role', ['pm','site_manager','worker','client','supplier'])
def test_google_onboarding_always_requires_approval(monkeypatch, role):
    writes=[]
    class DB:
        auth=NS(admin=NS(update_user_by_id=lambda *args:None))
        def table(self,*args):return self
        def select(self,*args):return self
        def eq(self,*args):return self
        def single(self):return self
        def update(self,data):writes.append(data);return self
        def execute(self):return NS(data={'role':'pending'})
    monkeypatch.setattr(main,'create_client',lambda *args:DB())
    main.update_google_role(main.GoogleRoleUpdate(role=role),{'id':'fixture'})
    assert writes == [{'role':role,'is_approved':False}]


def test_google_login_does_not_revoke_existing_admin_approval_or_change_role(monkeypatch):
    class DB:
        def table(self,*args):return self
        def select(self,*args):return self
        def eq(self,*args):return self
        def single(self):return self
        def execute(self):return NS(data={'role':'client'})
        def update(self,*args):raise AssertionError('Existing approved roles must not be rewritten by login')
    monkeypatch.setattr(main,'create_client',lambda *args:DB())
    assert main.update_google_role(main.GoogleRoleUpdate(role='pm'),{'id':'existing'}) == {'success':True}
