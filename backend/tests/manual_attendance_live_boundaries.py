"""Live QA validation failures only: no accepted attendance writes."""
import json
from datetime import datetime,timedelta,timezone
from pathlib import Path
import requests
from dotenv import dotenv_values


def main():
    config=dotenv_values('backend/.env');state=json.loads(Path('.validation-db/live-ui-state.json').read_text(encoding='utf-8'))
    headers={}
    for role in ['pm','worker']:
        account=state['accounts'][role]
        login=requests.post(config['SUPABASE_URL']+'/auth/v1/token?grant_type=password',headers={'apikey':config['SUPABASE_KEY']},json={'email':account['email'],'password':account['password']},timeout=30)
        login.raise_for_status();headers[role]={'Authorization':'Bearer '+login.json()['access_token']}
    base={'project_id':state['project']['id'],'worker_id':state['accounts']['worker']['id'],'worker_name':'Display label is not an identity','role':'worker','status':'Present','hours_worked':0,'check_in_time':(datetime.now(timezone.utc)+timedelta(days=2)).isoformat()}
    cases=[('future attendance','pm',{},422),('foreign project','pm',{'project_id':'00000000-0000-0000-0000-000000000099'},403),('unknown worker','pm',{'worker_id':'00000000-0000-0000-0000-000000000099'},403),('negative hours','pm',{'hours_worked':-1},422),('worker cannot enter attendance','worker',{},403),('completed hours require check-in','pm',{'hours_worked':8,'check_in_time':None},422)]
    results=[]
    for name,role,changes,expected in cases:
        response=requests.post('http://127.0.0.1:8000/api/labour/',headers=headers[role],json={**base,**changes},timeout=45)
        result={'name':name,'status':response.status_code,'passed':response.status_code==expected}
        results.append(result);print(json.dumps(result),flush=True)
        assert result['passed'],name
    Path('.validation-db/manual-attendance-live-results.json').write_text(json.dumps(results,indent=2),encoding='utf-8')


if __name__=='__main__':main()
