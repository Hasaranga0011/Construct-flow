"""Batched, caller-scoped evidence for the shared delay-risk engine."""
import logging
import math
import pandas as pd
from concurrent.futures import ThreadPoolExecutor
from datetime import timedelta
from core.delay_risk import compute_rule_based_delay_risk, sri_lanka_today, status
from core.verified_ml import load_verified_model, ModelNotReady, model_status

logger = logging.getLogger(__name__)


def read_all(factory):
    rows = []
    while True:
        page = factory().range(len(rows), len(rows) + 999).execute().data or []
        rows.extend(page)
        if len(page) < 1000:
            return rows


def project_delay_risks(db, projects, as_of=None, *, mode='ml'):
    today = as_of or sri_lanka_today()
    projects = [p for p in projects if status(p) not in {'completed', 'done', 'cancelled', 'canceled', 'archived'}]
    ids = [p['id'] for p in projects]
    if not ids:
        return [], 0

    def safe(name, factory):
        try:
            return read_all(factory)
        except Exception:
            logger.warning('Delay-risk evidence unavailable source=%s', name)
            return None

    factories = {
        'milestones': lambda: db.table('milestones').select('project_id,status,due_date,completion_percentage').in_('project_id', ids),
        'orders': lambda: db.table('purchase_orders').select('project_id,status,expected_date').in_('project_id', ids),
        'assignments': lambda: db.table('site_workers').select('project_id,worker_id').in_('project_id', ids),
        'sites': lambda: db.table('sites').select('id,project_id').in_('project_id', ids),
    }
    with ThreadPoolExecutor(max_workers=4) as pool:
        futures = {name: pool.submit(safe, name, factory) for name, factory in factories.items()}
        evidence = {name: future.result() for name, future in futures.items()}
    sites = {s['id']: s['project_id'] for s in evidence['sites'] or []}
    raw_workers = sorted({r['worker_id'] for r in evidence['assignments'] or [] if r.get('worker_id')})
    aliases = {}
    alias_ok = True
    if raw_workers:
        for field in ('id', 'user_id'):
            workers = safe('worker_aliases', lambda field=field: db.table('workers').select('id,user_id').in_(field, raw_workers))
            if workers is None:
                alias_ok = False
            for worker in workers or []:
                canonical = worker.get('user_id') or worker['id']
                aliases[worker['id']] = canonical
                if worker.get('user_id'):
                    aliases[worker['user_id']] = canonical
    attendance = None
    if sites:
        attendance = safe('attendance', lambda: db.table('attendance').select('worker_id,site_id,date,status,check_in_time,hours_worked')
                          .in_('site_id', list(sites)).gte('date', (today-timedelta(days=7)).isoformat()).lte('date', (today-timedelta(days=1)).isoformat()))
    all_workers, risks = set(), []
    model, meta = None, {}
    if mode == 'ml':
        try:
            model, meta = load_verified_model('delay_classifier')
        except ModelNotReady:
            pass
    for project in projects:
        pid = project['id']
        roster = None if evidence['assignments'] is None or not alias_ok else sorted({aliases.get(r['worker_id'], r['worker_id']) for r in evidence['assignments'] if r.get('project_id') == pid and r.get('worker_id')})
        all_workers.update(roster or [])
        rows = None if attendance is None else [{**r, 'worker_id': aliases.get(r.get('worker_id'), r.get('worker_id'))} for r in attendance if sites.get(r.get('site_id')) == pid]
        def scoped(name):
            return None if evidence[name] is None else [r for r in evidence[name] if r.get('project_id') == pid]
        result = compute_rule_based_delay_risk(pid, project.get('name') or 'Unnamed project', scoped('milestones'), scoped('orders'),
            total_budget=project.get('total_budget'), spent_cost=project.get('spent_cost'), start_date=project.get('start_date'),
            end_date=project.get('end_date'), completion_percentage=project.get('completion_percentage'),
            attendance=rows, assigned_worker_ids=roster, as_of=today)
        if mode == 'ml':
            inputs = {part['key']:part['score'] for part in result['components']}
            importance = {part['key']:part['value'] for part in meta.get('feature_importances',[])}
            result['components'] = [{'key':part['key'],'label':part['label'],'score':part['score'], 'reason':part['reason'],
                                     'model_importance':importance.get(part['key'])} for part in result['components']]
            result.update(method='verified_ml', data_coverage=sum(value is not None for value in inputs.values())/len(inputs)*100, model_type=meta.get('model_type'), training_projects=meta.get('real_projects_count',0),
                          validation_metrics=meta.get('metrics',{}), delay_risk=None, risk_level='Insufficient data')
            if model is None:
                result.update(assessment_status='model_not_ready',recommendation=model_status('delay_classifier')['reason'])
            elif any(inputs.get(key) is None for key in meta['features']):
                result.update(assessment_status='insufficient_data',recommendation='The verified model requires all recorded predictor features; no values are invented for missing data')
            else:
                try:
                    predicted = float(model.predict_proba(pd.DataFrame([inputs])[meta['features']])[0,list(model.classes_).index(1)])
                    if not math.isfinite(predicted) or not 0<=predicted<=1:
                        raise ValueError('Invalid model output')
                    score = round(predicted*100,1)
                    result.update(delay_risk=score,risk_level='High' if score>=60 else 'Moderate' if score>=30 else 'Low',assessment_status='assessed')
                except Exception:
                    logger.warning('Verified delay inference failed; no rule fallback was substituted')
                    result.update(assessment_status='model_not_ready',recommendation='Verified model could not evaluate these inputs; review model compatibility')
            result['limitations'] = ['Prediction uses only a verified trained model; no weighted rule score is substituted',
                'Model scores are not guaranteed or calibrated probabilities', 'All predictor inputs must be recorded; current-roster and attendance coverage limitations still apply']
        risks.append(result)
    risks.sort(key=lambda r: (r['delay_risk'] is not None, r['delay_risk'] if r['delay_risk'] is not None else -1), reverse=True)
    return risks, len(all_workers)
