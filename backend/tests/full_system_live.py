"""QA-only live estimate/review, role-boundary and modest concurrency checks.

Creates labelled estimates on the existing QA project. Does not change project
money, orders, payroll or user accounts. Never prints tokens or credentials.
"""
import json
import time
import statistics
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from pathlib import Path
import requests
from dotenv import dotenv_values

API = 'http://127.0.0.1:8000/api'


def main():
    config = dotenv_values('backend/.env')
    state = json.loads(Path('.validation-db/live-ui-state.json').read_text(encoding='utf-8'))
    project = state['project']['id']
    sb = config['SUPABASE_URL'].rstrip('/')
    key = config['SUPABASE_KEY']
    headers = {}
    results = []
    report = {'started': datetime.now(timezone.utc).isoformat(), 'checks': results, 'estimate_ids': []}
    target = Path('.validation-db/full-system-live-results.json')

    def record(name, passed, **details):
        results.append({'name': name, 'passed': bool(passed), **details})
        target.write_text(json.dumps(report, indent=2), encoding='utf-8')
        print(('PASS ' if passed else 'FAIL ') + name, flush=True)
        assert passed, name

    def request(role, method, path, **kwargs):
        return requests.request(method, API + path, headers=headers[role], timeout=90, **kwargs)

    for role, account in state['accounts'].items():
        login = requests.post(sb + '/auth/v1/token?grant_type=password', headers={'apikey': key},
                              json={'email': account['email'], 'password': account['password']}, timeout=30)
        record(role + ' authentication', login.status_code == 200)
        headers[role] = {'Authorization': 'Bearer ' + login.json()['access_token']}

    initial = request('pm', 'GET', '/projects/' + project + '/financials')
    record('QA project financials available before estimate tests', initial.status_code == 200)
    before = initial.json()
    for role in headers:
        response = request(role, 'GET', '/projects/' + project + '/financials')
        record(role + ' financial API boundary', response.status_code == (200 if role in {'super_admin', 'pm', 'client'} else 403), status=response.status_code)

    # Independently scoped estimate creation and review on labelled QA data.
    for creator in ['pm', 'client']:
        payload = {'project_name': 'QA full-system ' + creator + ' ' + datetime.now(timezone.utc).isoformat(),
                   'project_id': project, 'district': 'Colombo', 'estimated_cost': 123456.78,
                   'confidence_score': None, 'status': 'Pending'}
        created = request(creator, 'POST', '/estimations/', json=payload)
        record(creator + ' creates project-linked pending estimate', created.status_code == 200, status=created.status_code)
        estimate = created.json()
        identifier = estimate['id']
        report['estimate_ids'].append(identifier)
        record(creator + ' estimate retains project link', estimate['project_id'] == project)
        for forbidden in ['worker', 'supplier', 'site_manager', 'client']:
            denied = request(forbidden, 'PATCH', '/estimations/' + identifier + '/review', json={'status': 'Approved'})
            record(forbidden + ' cannot approve ' + creator + ' estimate', denied.status_code == 403, status=denied.status_code)
        with ThreadPoolExecutor(max_workers=2) as pool:
            responses = list(pool.map(lambda status: request('pm', 'PATCH', '/estimations/' + identifier + '/review', json={'status': status}), ['Approved', 'Approved']))
        record(creator + ' concurrent reviews commit once', sorted(r.status_code for r in responses) == [200, 409], statuses=[r.status_code for r in responses])
        pdf = request('pm', 'GET', '/documents/estimation/' + identifier + '/pdf')
        record(creator + ' estimate PDF download', pdf.status_code == 200 and pdf.content.startswith(b'%PDF-'), status=pdf.status_code)
        pdf = request('worker', 'GET', '/documents/estimation/' + identifier + '/pdf')
        record('Worker cannot download ' + creator + ' estimate PDF', pdf.status_code in {403, 404}, status=pdf.status_code)
        client_pdf = request('client', 'GET', '/documents/estimation/' + identifier + '/pdf')
        record('Client can download approved own-project ' + creator + ' estimate', client_pdf.status_code == 200 and client_pdf.content.startswith(b'%PDF-'), status=client_pdf.status_code)

    after = request('pm', 'GET', '/projects/' + project + '/financials')
    record('Estimate review preserves project financials', after.status_code == 200 and after.json() == before)
    # Twelve reads, four at once: a bounded concurrency smoke check, not a load benchmark.
    paths = ['/projects/' + project + '/financials', '/workflow/projects/' + project + '/commercial', '/labour/payroll'] * 4
    def timed(path):
        started = time.perf_counter()
        response = request('pm', 'GET', path)
        return {'path': path, 'status': response.status_code, 'seconds': round(time.perf_counter() - started, 3)}
    with ThreadPoolExecutor(max_workers=4) as pool:
        samples = list(pool.map(timed, paths))
    report['read_concurrency'] = {'workers': 4, 'samples': samples, 'median_seconds': round(statistics.median(x['seconds'] for x in samples), 3), 'max_seconds': max(x['seconds'] for x in samples)}
    record('Twelve concurrent read samples succeed', all(x['status'] == 200 for x in samples))
    # Existing unlinked historical estimates require owner review, never guessing.
    admin_headers = {'apikey': key, **headers['super_admin']}
    legacy = requests.get(sb + '/rest/v1/estimations', headers=admin_headers,
                          params={'select': 'id', 'project_id': 'is.null', 'created_by': 'is.null'}, timeout=30)
    record('Historical unassigned-estimate inventory readable by admin', legacy.status_code == 200)
    report['legacy_unassigned_estimates'] = len(legacy.json())
    report['completed'] = datetime.now(timezone.utc).isoformat()
    target.write_text(json.dumps(report, indent=2), encoding='utf-8')
    print(f'PASS {len(results)} live checks; {len(report["estimate_ids"])} labelled QA estimates retained', flush=True)


if __name__ == '__main__':
    main()
