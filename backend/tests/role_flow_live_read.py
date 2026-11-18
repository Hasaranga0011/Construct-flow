"""Read-only connected-role audit using the existing labelled QA accounts.

Run from the repository root. Does not print credentials or business records.
Authentication creates sessions; all business-data requests use GET only.
"""
import json
from pathlib import Path
import requests
from dotenv import dotenv_values


def main():
    config = dotenv_values('backend/.env')
    state = json.loads(Path('.validation-db/live-ui-state.json').read_text(encoding='utf-8'))
    base = config['SUPABASE_URL'].rstrip('/')
    key = config['SUPABASE_KEY']
    project = state['project']['id']
    results = []
    tables = ['projects', 'purchase_orders', 'materials', 'material_requests',
              'salary_slips', 'attendance', 'client_messages', 'estimations',
              'project_expenses', 'client_payment_schedule', 'variation_orders']
    for role, account in state['accounts'].items():
        with requests.Session() as session:
            login = session.post(base + '/auth/v1/token?grant_type=password',
                                 headers={'apikey': key},
                                 json={'email': account['email'], 'password': account['password']}, timeout=30)
            if login.status_code != 200:
                results.append({'role': role, 'login_status': login.status_code})
                continue
            headers = {'apikey': key, 'Authorization': 'Bearer ' + login.json()['access_token']}
            for table in tables:
                response = session.get(base + '/rest/v1/' + table, headers=headers,
                                       params={'select': 'id', 'limit': 1000}, timeout=30)
                rows = response.json() if response.status_code == 200 else []
                params = {'select': 'id', 'id' if table == 'projects' else 'project_id': 'eq.' + project}
                if table == 'attendance':
                    params = {'select': 'id', 'site_id': 'eq.' + state['site_id']}
                scoped = session.get(base + '/rest/v1/' + table, headers=headers, params=params, timeout=30)
                scoped_rows = scoped.json() if scoped.status_code == 200 else []
                results.append({'role': role, 'table': table, 'status': response.status_code,
                                'visible_rows': len(rows), 'qa_project_status': scoped.status_code,
                                'qa_project_rows': len(scoped_rows)})
    target = Path('.validation-db/role-flow-live-read-results.json')
    target.write_text(json.dumps(results, indent=2), encoding='utf-8')
    for result in results:
        print(json.dumps(result))
    verify(results, state['accounts'])


def verify(results, accounts):
    tables = ['projects', 'purchase_orders', 'materials', 'material_requests',
              'salary_slips', 'attendance', 'client_messages', 'estimations',
              'project_expenses', 'client_payment_schedule', 'variation_orders']
    by_key = {(row['role'], row['table']): row for row in results if 'table' in row}
    checks = 0
    for role in accounts:
        for table in tables:
            row = by_key.get((role, table))
            assert row and row['status'] == 200 and row['qa_project_status'] == 200, f'{role}/{table}: read failed'
            checks += 1
        assert by_key[(role, 'projects')]['qa_project_rows'] == 1, f'{role}: assigned project missing'
        checks += 1
    for role in ['site_manager', 'supplier', 'worker']:
        for table in ['estimations', 'project_expenses', 'client_payment_schedule', 'variation_orders']:
            assert by_key[(role, table)]['visible_rows'] == 0, f'{role}/{table}: private data visible'
            checks += 1
    assert by_key[('client', 'project_expenses')]['visible_rows'] == 0, 'Client can read private expenses'
    checks += 1
    for role, table in [('super_admin', 'estimations'), ('pm', 'purchase_orders'), ('supplier', 'purchase_orders'),
                        ('site_manager', 'attendance'), ('worker', 'salary_slips'), ('worker', 'attendance'),
                        ('pm', 'project_expenses'), ('client', 'client_payment_schedule'), ('client', 'variation_orders')]:
        assert by_key[(role, table)]['visible_rows'] > 0, f'{role}/{table}: authorized records missing'
        checks += 1
    print(f'PASS {checks} connected read and role-scope assertions; no business writes')


if __name__ == '__main__':
    import sys
    if '--verify-saved' in sys.argv:
        state = json.loads(Path('.validation-db/live-ui-state.json').read_text(encoding='utf-8'))
        verify(json.loads(Path('.validation-db/role-flow-live-read-results.json').read_text(encoding='utf-8')), state['accounts'])
    else:
        main()
