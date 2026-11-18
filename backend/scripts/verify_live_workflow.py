"""Authorized live QA: one labelled test project and dedicated synthetic accounts.

Secrets/checkpoints stay in ignored .validation-db. Never deletes business data.
Run from repository root with --execute after the owner activates migrations.
"""
import argparse
import json
import secrets
import io
import uuid
from datetime import datetime, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo
from concurrent.futures import ThreadPoolExecutor

import requests
from dotenv import dotenv_values

ROOT = Path(__file__).resolve().parents[2]
STATE = ROOT / '.validation-db/live-ui-state.json'
CONFIG = dotenv_values(ROOT / 'backend/.env')
BASE = CONFIG['SUPABASE_URL'].rstrip('/')
ANON = CONFIG.get('SUPABASE_ANON_KEY') or CONFIG.get('SUPABASE_KEY')
SERVICE = CONFIG['SUPABASE_SERVICE_ROLE_KEY']
API = 'http://127.0.0.1:8000/api'
state = json.loads(STATE.read_text(encoding='utf-8')) if STATE.exists() else {
    'tag': datetime.now(ZoneInfo('Asia/Colombo')).strftime('%Y%m%d-%H%M%S'),
    'accounts': {}, 'checks': [],
}
tokens = {}


def save():
    STATE.parent.mkdir(exist_ok=True)
    STATE.write_text(json.dumps(state, indent=2), encoding='utf-8')


def check(label, condition=True):
    assert condition, label
    if label not in state['checks']:
        state['checks'].append(label)
    save()
    print('PASS', label, flush=True)


def http(method, url, key, token=None, payload=None, params=None, expected=None, **kwargs):
    headers = {'apikey': key, 'Authorization': 'Bearer ' + (token or key)}
    if '/rest/v1/' in url:
        headers['Prefer'] = 'return=representation' + (',resolution=merge-duplicates' if params and 'on_conflict' in params else '')
    response = requests.request(method, url, headers=headers, json=payload, params=params, timeout=60, **kwargs)
    if expected is not None:
        assert response.status_code in expected, f'{method} {url.split("?")[0]}: {response.status_code} {response.text[:800]}'
    elif not response.ok:
        raise RuntimeError(f'{method} {url.split("?")[0]}: {response.status_code} {response.text[:1000]}')
    return response.json() if response.content else None


def rest(role, table, method='GET', payload=None, **params):
    return http(method, BASE + '/rest/v1/' + table, SERVICE if role == 'service' else ANON,
                None if role == 'service' else tokens[role], payload, params)


def api(role, method, path, payload=None, expected=None, **kwargs):
    return http(method, API + path, ANON, tokens[role], payload, expected=expected, **kwargs)


def step(key, operation):
    if key not in state:
        state[key] = operation()
        save()
    return state[key]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--execute', action='store_true', required=True)
    parser.add_argument('--reports-only', action='store_true')
    options = parser.parse_args()
    schema = http('GET', BASE + '/rest/v1/', SERVICE)
    for function in ['save_project_with_assignments', 'review_material_request', 'receive_purchase_order_quantity',
                     'review_attendance_period', 'update_project_milestone', 'create_project_commercial_record']:
        assert '/rpc/' + function in schema['paths'], 'Migration missing: ' + function
    check('Connected database workflow functions are activated')
    for role in ['super_admin','pm','site_manager','supplier','client','worker']:
        account = state['accounts'].get(role)
        if not account:
            account = {'email': 'cf-ui-qa-' + state['tag'] + '-' + role.replace('_','-') + '@example.invalid',
                       'password': secrets.token_urlsafe(32)}
            state['accounts'][role] = account
            save()
        if 'id' not in account:
            created = http('POST', BASE + '/auth/v1/admin/users', SERVICE, payload={
                'email': account['email'], 'password': account['password'], 'email_confirm': True,
                'user_metadata': {'full_name': 'CF UI QA ' + role, 'role': role}})
            account['id'] = created.get('id') or created['user']['id']
            save()
        profile = {'id': account['id'], 'full_name': 'CF UI QA ' + role, 'email': account['email'],
                   'role': role, 'is_approved': True}
        if role == 'worker':
            profile.update(daily_rate=3500, worker_type='general_labour')
        rest('service','profiles','POST',profile,on_conflict='id')
        session = http('POST', BASE + '/auth/v1/token?grant_type=password', ANON,
                       payload={'email':account['email'],'password':account['password']})
        tokens[role] = session['access_token']
    ids = {role: account['id'] for role, account in state['accounts'].items()}
    check('Six dedicated approved QA roles authenticate without sending invitation emails')
    if options.reports_only:
        verify_reports(state['project']['id'])
        return
    today = datetime.now(ZoneInfo('Asia/Colombo')).date()
    state.setdefault('work_date', (today - timedelta(days=1)).isoformat())
    state.setdefault('material_name', 'CF QA Cement ' + state['tag'])
    save()
    project = step('project', lambda: api('super_admin','POST','/projects/',{
        'name':'CF UI QA - ' + state['tag'], 'location':'Colombo', 'address':'Synthetic QA site, Colombo',
        'status':'In Progress', 'total_budget':1000000, 'start_date':state['work_date'],
        'end_date':(today+timedelta(days=30)).isoformat(), 'latitude':6.9271,'longitude':79.8612,
        'pm_id':ids['pm'],'client_id':ids['client'],'site_managers':[ids['site_manager']],
        'workers':[ids['worker']],'suppliers':[ids['supplier']],'admins':[ids['super_admin']],
        'is_test':True,'milestones':[{'title':'QA Foundation','due_date':today.isoformat()},
                                    {'title':'QA Handover','due_date':(today+timedelta(days=30)).isoformat()}],
        'boq_data':{'total_budget':1000000,'materials':[{'name':state['material_name'],'unit':'bags',
                         'allocated_quantity':12,'unit_price':1500}]}}))
    pid = project['id']
    current = rest('service','projects',id='eq.'+pid)[0]
    assert current['is_test'] and current['name'].startswith('CF UI QA - ')
    sites = rest('service','sites',project_id='eq.'+pid)
    assert sites, 'Project created without an attendance site'
    state['site_id'] = sites[0]['id']; save()
    for role in ['pm','site_manager','client']:
        visible = rest(role,'projects',id='eq.'+pid)
        assert len(visible)==1, role + ' cannot see assigned project'
    check('One test project, BOQ, milestones, assignments and attendance site are linked')
    api('worker','POST',f'/workflow/projects/{pid}/commercial',
        {'kind':'payment','description':'Unauthorized QA attempt','amount':1,'due_date':today.isoformat()},expected={403})
    check('Worker financial-write boundary rejects the request')
    request = step('material_request',lambda: rest('site_manager','material_requests','POST',{
        'project_id':pid,'requested_by':ids['site_manager'],'item_name':state['material_name'],
        'quantity':12,'unit':'bags','status':'Pending Approval','notes':'Synthetic QA materials only'})[0])
    step('request_review',lambda: api('pm','POST',f'/workflow/material-requests/{request["id"]}/review',{
        'approve':True,'supplier_id':ids['supplier'],'unit_price':1500,'expected_date':today.isoformat()}))
    reviewed = rest('service','material_requests',id='eq.'+request['id'])[0]
    order = rest('service','purchase_orders',id='eq.'+reviewed['purchase_order_id'])
    assert len(order)==1
    state['order_id']=order[0]['id']; save()
    check('Material approval produces exactly one linked supplier order')
    oid=state['order_id']
    step('supplier_suggestion',lambda:api('supplier','PATCH',f'/purchase-orders/{oid}/suggest',{
        'suggested_quantity':12,'suggested_date':today.isoformat(),'suggested_price':1600,
        'supplier_notes':'Synthetic QA counter-offer'}))
    step('manager_acceptance',lambda:api('pm','PATCH',f'/purchase-orders/{oid}/approve',{}))
    step('supplier_delivery',lambda:api('supplier','PATCH',f'/purchase-orders/{oid}/deliver'))
    state.setdefault('receipt_id',str(uuid.uuid4()));save()
    receipt={'quantity':5,'receipt_id':state['receipt_id'],'note':'Synthetic QA partial delivery'}
    step('first_receipt',lambda:api('site_manager','PATCH',f'/purchase-orders/{oid}/receive',receipt))
    api('site_manager','PATCH',f'/purchase-orders/{oid}/receive',receipt)
    partial=rest('service','purchase_orders',id='eq.'+oid)[0]
    if 'final_receipt' not in state:
        assert float(partial['quantity_received'])==5
    check('Partial receipt retries do not double stock or accepted quantity')
    step('final_receipt',lambda:api('site_manager','PATCH',f'/purchase-orders/{oid}/receive',{
        'quantity':7,'receipt_id':str(uuid.uuid4()),'note':'Synthetic QA remaining delivery'}))
    material=rest('service','materials',project_id='eq.'+pid,name='eq.'+state['material_name'])
    assert len(material)==1, 'Received stock duplicated the BOQ baseline'
    state['material_id']=material[0]['id'];save()
    if 'expense' not in state:
        assert float(material[0]['current_stock'])==12
    check('Full receipt reuses BOQ stock and completes the purchase order')
    step('expense',lambda:api('pm','POST',f'/projects/{pid}/expenses',{
        'project_id':pid,'title':'QA transport and material usage','amount':500,'expense_date':state['work_date'],
        'description':'Synthetic QA cost; no real payment','category':'Transport',
        'material_id':state['material_id'],'quantity_used':2}))
    stock=rest('service','materials',id='eq.'+state['material_id'])[0]
    check('Stock-backed expense consumes two units exactly once',float(stock['current_stock'])==10)
    attendance=step('attendance',lambda:rest('site_manager','attendance','POST',{
        'worker_id':ids['worker'],'site_id':state['site_id'],'date':state['work_date'],'status':'Present',
        'check_in_time':state['work_date']+'T08:00:00+05:30',
        'check_out_time':state['work_date']+'T17:00:00+05:30','hours_worked':9,'overtime_hours':1})[0])
    if 'attendance_review' not in state:
        api('pm','POST','/labour/salary/generate',{
            'site_id':pid,'start_date':state['work_date'],'end_date':state['work_date']},expected={409})
    check('Payroll refuses unreviewed attendance')
    step('attendance_review',lambda:api('pm','POST','/workflow/attendance/review',{
        'project_id':pid,'start_date':state['work_date'],'end_date':state['work_date']}))
    step('payroll',lambda:api('pm','POST','/labour/salary/generate',{
        'site_id':pid,'start_date':state['work_date'],'end_date':state['work_date']}))
    slips=rest('pm','salary_slips',project_id='eq.'+pid,worker_id='eq.'+ids['worker'])
    assert len(slips)==1
    assert float(slips[0]['total_pay'])==4156.25
    api('pm','POST','/labour/salary/generate',{
        'site_id':pid,'start_date':state['work_date'],'end_date':state['work_date']})
    assert len(rest('service','salary_slips',project_id='eq.'+pid))==1
    check('Reviewed payroll includes nine hours, one overtime hour and no duplicate slip')
    state['salary_id']=slips[0]['id'];save()
    check('Worker reads their own project salary slip',len(rest('worker','salary_slips',id='eq.'+slips[0]['id']))==1)
    step('salary_paid',lambda:api('pm','PATCH',f'/labour/salary/{slips[0]["id"]}/paid',{'amount':4156.25}))
    api('pm','PATCH',f'/labour/salary/{slips[0]["id"]}/paid',{'amount':4156.25})
    check('Salary payment is idempotent and visible to the worker',
          rest('worker','salary_slips',id='eq.'+slips[0]['id'])[0]['status']=='Paid')
    payment=step('payment',lambda:api('pm','POST',f'/workflow/projects/{pid}/commercial',{
        'kind':'payment','description':'QA synthetic foundation payment','amount':50000,'due_date':today.isoformat()}))
    step('payment_verified',lambda:api('pm','POST',f'/workflow/payments/{payment["id"]}/verify',{
        'amount':50000,'evidence':'SIMULATED QA PAYMENT ONLY - no real money transferred - '+state['tag']}))
    variation=step('variation',lambda:api('pm','POST',f'/workflow/projects/{pid}/commercial',{
        'kind':'variation','title':'QA scope extension','description':'Synthetic QA client approval','amount':15000}))
    step('variation_approved',lambda:rest('client','rpc/review_variation','POST',{
        'p_id':variation['id'],'p_approve':True}))
    http('POST',BASE+'/rest/v1/rpc/review_variation',ANON,tokens['client'],
         {'p_id':variation['id'],'p_approve':True},expected={400})
    check('Client variation approval changes the budget exactly once',
          float(rest('service','projects',id='eq.'+pid)[0]['total_budget'])==1015000)
    check('Verified payment and approved variation are visible to the client',
          len(api('client','GET',f'/workflow/projects/{pid}/commercial')['payments'])==1)
    def upload():
        from PIL import Image,ImageDraw
        picture=Image.new('RGB',(640,360),'#f8fafc')
        ImageDraw.Draw(picture).text((30,30),'CONSTRUCTFLOW QA TEST EVIDENCE - NOT A REAL SITE',fill='#9a3412')
        data=io.BytesIO();picture.save(data,format='PNG')
        return api('site_manager','POST','/media/upload',data={'project_id':pid,'site_id':state['site_id'],
            'caption':'Synthetic QA evidence image'},files={'file':('qa-evidence.png',data.getvalue(),'image/png')})
    media=step('media',upload)
    assert media['url'].startswith('https://')
    milestones=rest('pm','milestones',project_id='eq.'+pid,order='title')
    if 'milestone_partial' not in state:
        result=api('site_manager','PATCH',f'/projects/{pid}/milestones/{milestones[0]["id"]}',{
            'status':'In Progress','completion_percentage':50,'description':'Synthetic QA progress',
            'media_urls':[media['url']]})
        state['milestone_partial']=result;save()
        check('Partial milestone updates aggregate progress',
              float(rest('service','projects',id='eq.'+pid)[0]['completion_percentage'])==25)
    step('site_report',lambda:api('site_manager','POST','/site-reports/',{
        'project_id':pid,'site_id':state['site_id'],'date':state['work_date'],
        'work_completed':'Synthetic QA foundation checks completed; no construction performed.',
        'workers_present_count':1,'materials_used':[],'photos':[media['url']],
        'blockers':'None - dedicated automated QA project'}))
    check('Site report and uploaded milestone evidence are available to the client',
          len(api('client','GET','/site-reports/'+pid))==1)
    document=step('document',lambda:api('pm','POST',f'/workflow/projects/{pid}/documents',{
        'name':'Synthetic QA project evidence','category':'QA evidence','url':media['url']}))
    check('Named project document is visible to the client',
          len(api('client','GET',f'/workflow/projects/{pid}/documents'))==1)
    issue=step('issue',lambda:rest('client','issues','POST',{
        'site_id':state['site_id'],'reported_by':ids['client'],'title':'QA issue resolution check',
        'description':'Synthetic QA concern only','severity':'Medium','status':'Open'})[0])
    step('resolved_issue',lambda:rest('pm','issues','PATCH',{'status':'Resolved'},id='eq.'+issue['id']))
    check('Client issue links to the project site and manager resolution is visible',
          rest('client','issues',id='eq.'+issue['id'])[0]['status']=='Resolved')
    for sender,receiver in [('pm','client'),('client','pm')]:
        step('message_'+sender,lambda sender=sender,receiver=receiver:api(sender,'POST','/messages/',{
            'project_id':pid,'sender_id':ids[sender],'receiver_id':ids[receiver],
            'content':'Synthetic QA workflow verification from '+sender}))
    check('Project participants exchange two scoped in-app messages',
          len(api('client','GET','/messages/'+pid))==2)
    financials=api('client','GET',f'/projects/{pid}/financials')
    check('Client financial totals count received goods and expenses exactly once',
          financials['actual_po']==19200 and financials['actual_expenses']==500 and financials['actual_payroll']==4156.25)
    cost_records=api('client','GET','/workflow/cost-records')
    check('Client cost records match accepted goods and expenses',
          len(cost_records)==2 and sum(float(row['amount']) for row in cost_records)==19700)
    for milestone in milestones:
        step('completed_'+milestone['id'],lambda milestone=milestone:api('pm','PATCH',
             f'/projects/{pid}/milestones/{milestone["id"]}',{
                 'status':'Completed','completion_percentage':100,'description':'Synthetic QA stage completed'}))
    step('completed_project',lambda:api('super_admin','PATCH','/projects/'+pid,{'status':'Completed'}))
    final=rest('service','projects',id='eq.'+pid)[0]
    check('All milestones reach 100 percent and the test project completes',
          final['status']=='Completed' and float(final['completion_percentage'])==100)
    check('Stored project ledger agrees with the independently calculated financial totals',
          float(final['spent_cost'])==23856.25 and financials['actual_spend']==23856.25)
    notifications=rest('service','notifications',project_id='eq.'+pid)
    check('Test project notifications target dedicated QA users only',
          all(row.get('target_user_id') in ids.values() for row in notifications))
    own_notice = next(row for row in notifications if row.get('target_user_id')==ids['client'])
    api('client','PATCH','/notifications/mark-read',{'ids':[own_notice['id']]})
    own_notices=api('client','GET','/notifications/')
    check('Recipient notification read receipt is persisted',
          any(row['id']==own_notice['id'] and row['is_read'] for row in own_notices))
    verify_reports(pid)
    state['completed_at']=datetime.now(ZoneInfo('Asia/Colombo')).isoformat();save()
    print('CHECKPOINT project_id=' + pid,flush=True)


def verify_reports(pid):
    management=api('pm','GET','/reports/management?projects='+pid)
    assert management
    for category in ['projects','materials','payroll']:
        api('pm','GET','/reports/'+category)
    check('Project manager management, project, material and payroll reports load live')
    with ThreadPoolExecutor(max_workers=3) as pool:
        for _ in range(3):
            pending=[pool.submit(api,'pm','GET','/reports/'+category) for category in ['projects','materials','payroll']]
            assert all(job.result() for job in pending)
    check('Nine concurrent report reads complete without a pooled-connection failure')
    export=requests.get(API+'/reports/export',headers={'Authorization':'Bearer '+tokens['pm']},
        params={'projects':pid,'format':'csv','report_type':'projects'},timeout=60)
    assert export.ok and export.content, 'Project CSV export failed: '+str(export.status_code)
    check('Project report CSV export downloads successfully')


if __name__=='__main__':
    main()
