"""Read-only ownership candidates; never assigns projects based on names."""
import json
import re
from pathlib import Path
import requests
from dotenv import dotenv_values


def normalized(value):
    return re.sub(r'\s+', ' ', str(value or '').strip()).casefold()


def main():
    config = dotenv_values('backend/.env')
    state = json.loads(Path('.validation-db/live-ui-state.json').read_text(encoding='utf-8'))
    account = state['accounts']['super_admin']
    base = config['SUPABASE_URL'].rstrip('/')
    key = config['SUPABASE_KEY']
    with requests.Session() as session:
        auth = session.post(base+'/auth/v1/token?grant_type=password', headers={'apikey':key}, json={'email':account['email'],'password':account['password']}, timeout=30)
        auth.raise_for_status()
        headers = {'apikey':key,'Authorization':'Bearer '+auth.json()['access_token']}
        estimates = session.get(base+'/rest/v1/estimations', headers=headers, params={'select':'id,project_name,project_id,created_by,status','project_id':'is.null','created_by':'is.null'}, timeout=30)
        estimates.raise_for_status()
        projects = session.get(base+'/rest/v1/projects', headers=headers, params={'select':'id,name,pm_id,client_id','limit':1000}, timeout=30)
        projects.raise_for_status()
    candidates=[]
    for row in estimates.json():
        title=row['project_name'];embedded=None
        try:
            metadata=json.loads(title)
            if isinstance(metadata,dict):
                title=metadata.get('title') or title
                embedded=metadata.get('project_id')
        except (ValueError,TypeError):
            pass
        matches=[p for p in projects.json() if normalized(p['name'])==normalized(title)]
        candidates.append({'estimate_id':row['id'],'title':title,'status':row['status'],
                           'embedded_project_id':embedded,
                           'exact_name_candidates':[{'id':p['id'],'name':p['name'],'has_pm':bool(p.get('pm_id')),'has_client':bool(p.get('client_id'))} for p in matches],
                           'requires_owner_review':True})
    report={'unlinked_count':len(candidates),'unique_name_candidates':sum(len(x['exact_name_candidates'])==1 for x in candidates),
            'ambiguous_name_candidates':sum(len(x['exact_name_candidates'])>1 for x in candidates),
            'no_name_match':sum(not x['exact_name_candidates'] for x in candidates),'estimates':candidates,'business_writes':0}
    Path('.validation-db/legacy-estimate-inventory.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
    print(json.dumps({k:v for k,v in report.items() if k!='estimates'},indent=2))


if __name__=='__main__':
    main()
