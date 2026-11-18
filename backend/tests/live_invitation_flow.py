"""Explicitly authorized QA invitation/recovery. Never prints secrets or links."""
import argparse
import json
from pathlib import Path
import requests
from dotenv import dotenv_values

STATE = Path('.validation-db/live-invitation-state.json')


def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('action',choices=['invite','repair-profile','status','recovery'])
    parser.add_argument('--recipient',required=True)
    args=parser.parse_args()
    config=dotenv_values('backend/.env')
    base=config['SUPABASE_URL'].rstrip('/')
    key=config['SUPABASE_KEY']
    service=config['SUPABASE_SERVICE_ROLE_KEY']
    privileged={'apikey':service,'Authorization':'Bearer '+service}
    state=json.loads(STATE.read_text(encoding='utf-8')) if STATE.exists() else {}
    if args.action=='repair-profile':
        directory=requests.get(base+'/auth/v1/admin/users',headers=privileged,params={'page':1,'per_page':1000},timeout=30)
        directory.raise_for_status()
        matches=[u for u in directory.json().get('users',[]) if u.get('email','').casefold()==args.recipient.casefold()]
        assert len(matches)==1,'Expected one existing identity'
        identity=matches[0];identifier=identity['id']
        profile=requests.get(base+'/rest/v1/profiles',headers=privileged,params={'select':'id','id':'eq.'+identifier},timeout=30)
        profile.raise_for_status();assert profile.json()==[],'Existing profiles must not be overwritten'
        for table,filters in [('projects',{'or':f'(client_id.eq.{identifier},pm_id.eq.{identifier})'}),('project_role_assignments',{'user_id':'eq.'+identifier}),('workers',{'user_id':'eq.'+identifier}),('site_manager_sites',{'site_manager_id':'eq.'+identifier})]:
            assignments=requests.get(base+'/rest/v1/'+table,headers=privileged,params={'select':'*',**filters},timeout=30)
            assignments.raise_for_status();assert assignments.json()==[],'Existing business assignments need explicit owner review'
        restored=requests.post(base+'/rest/v1/profiles',headers={**privileged,'Prefer':'return=representation'},json={'id':identifier,'email':args.recipient,'full_name':'QA Client Invitation Test','role':'client','is_approved':True},timeout=30)
        restored.raise_for_status()
        state={'user_id':identifier,'existing_auth_identity_preserved':True,'qa_profile_restored':True,'invitation_not_sent_existing_identity':True,'baseline_last_sign_in':identity.get('last_sign_in_at')}
        STATE.write_text(json.dumps(state,indent=2),encoding='utf-8')
    if args.action=='invite':
        existing=requests.get(base+'/rest/v1/profiles',headers=privileged,params={'select':'id','email':'eq.'+args.recipient},timeout=30)
        existing.raise_for_status()
        assert not existing.json(),'An existing identity must not be recreated or reclassified'
        users=requests.get(base+'/auth/v1/admin/users',headers=privileged,params={'page':1,'per_page':1000},timeout=30)
        users.raise_for_status()
        assert not any(u.get('email','').casefold()==args.recipient.casefold() for u in users.json().get('users',[])),'An existing auth identity must not be overwritten'
        qa=json.loads(Path('.validation-db/live-ui-state.json').read_text(encoding='utf-8'))['accounts']['super_admin']
        auth=requests.post(base+'/auth/v1/token?grant_type=password',headers={'apikey':key},json={'email':qa['email'],'password':qa['password']},timeout=30)
        auth.raise_for_status()
        response=requests.post('http://127.0.0.1:8000/api/admin/users',headers={'Authorization':'Bearer '+auth.json()['access_token']},json={'email':args.recipient,'full_name':'QA Client Invitation Test','role':'client','send_email':True},timeout=120)
        assert response.status_code==200,f'Invitation endpoint returned {response.status_code}'
        result=response.json()
        state={'user_id':result['id'],'invitation_email_accepted':bool((result.get('email_delivery') or {}).get('sent_to_inbox')),'provider':(result.get('email_delivery') or {}).get('provider')}
        STATE.write_text(json.dumps(state,indent=2),encoding='utf-8')
    assert state.get('user_id'),'Invite first'
    identifier=state['user_id']
    profile=requests.get(base+'/rest/v1/profiles',headers=privileged,params={'select':'id,role,is_approved','id':'eq.'+identifier},timeout=30)
    profile.raise_for_status()
    row=profile.json()[0]
    assert row['role']=='client' and row['is_approved'] is True,'Unexpected QA account permissions'
    projects=requests.get(base+'/rest/v1/projects',headers=privileged,params={'select':'id','client_id':'eq.'+identifier},timeout=30)
    projects.raise_for_status()
    assert projects.json()==[],'Invitation QA account must not receive business project access'
    identity=requests.get(base+'/auth/v1/admin/users/'+identifier,headers=privileged,timeout=30)
    identity.raise_for_status()
    user=identity.json()
    state.update({'role':'client','approved':True,'assigned_projects':0,'email_confirmed':bool(user.get('email_confirmed_at')),'has_signed_in':bool(user.get('last_sign_in_at')),'signed_in_since_test_started':bool(user.get('last_sign_in_at') and user.get('last_sign_in_at')!=state.get('baseline_last_sign_in'))})
    if args.action=='recovery':
        redirect=(config.get('FRONTEND_URL') or 'http://localhost:8082').rstrip('/')+'/reset-password'
        recovered=requests.post('http://127.0.0.1:8000/api/auth/password-recovery',json={'email':args.recipient,'redirect_to':redirect},timeout=45)
        state['recovery_request_status']=recovered.status_code
        state['recovery_request_accepted']=recovered.status_code==202
    STATE.write_text(json.dumps(state,indent=2),encoding='utf-8')
    print(json.dumps(state,indent=2))


if __name__=='__main__':
    main()
