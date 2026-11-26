"""Explainable operational risk index; not a calibrated probability of delay."""
from datetime import date, datetime, timedelta
from math import isfinite
from zoneinfo import ZoneInfo

WEIGHTS = {'schedule_slip': 10.5, 'overdue_milestones': 10.5, 'procurement': 25.0, 'cost': 21.0, 'labour': 33.0}
LABELS = {'schedule_slip': 'Schedule slip', 'overdue_milestones': 'Overdue milestones', 'procurement': 'Procurement', 'cost': 'Forecast cost', 'labour': 'Recorded attendance'}
CLOSED = {'completed', 'done', 'cancelled', 'canceled', 'archived'}


def sri_lanka_today():
    return datetime.now(ZoneInfo('Asia/Colombo')).date()


def number(value):
    try:
        if value is None or isinstance(value, bool):
            return None
        result = float(value)
        return result if isfinite(result) else None
    except (TypeError, ValueError):
        return None


def day(value):
    try:
        return date.fromisoformat(str(value)[:10]) if value else None
    except ValueError:
        return None


def status(row):
    return str(row.get('status') or '').strip().lower().replace('_', ' ')


def compute_rule_based_delay_risk(project_id, project_name, milestones=None, purchase_orders=None,
                                attendance_count=None, total_budget=None, spent_cost=None, *,
                                start_date=None, end_date=None, completion_percentage=None,
                                attendance=None, assigned_worker_ids=None, as_of=None):
    """Missing inputs have no weight. Current roster is an attendance coverage proxy.

    `attendance_count` is accepted for old callers but is never used: a global
    attendance count cannot describe the workforce of an individual project.
    """
    today = as_of or sri_lanka_today()
    components = {}
    reasons = []
    def component(key, score, reason):
        components[key] = {'key': key, 'label': LABELS[key], 'score': None if score is None else round(max(0, min(100, score)), 4),
                           'base_weight': WEIGHTS[key], 'reason': reason}
        if score is not None:
            reasons.append(reason)

    start, end = day(start_date), day(end_date)
    completion, budget, spent = number(completion_percentage), number(total_budget), number(spent_cost)
    if completion is not None and not 0 <= completion <= 100:
        completion = None
    if start and end and end > start and completion is not None:
        expected = max(0, min(100, (today - start).days / (end - start).days * 100))
        gap = max(0, expected - completion)
        component('schedule_slip', gap * 2.5, f'Behind plan by {gap:.1f} percentage points (expected {expected:.1f}%, recorded {completion:g}%)')
    else:
        component('schedule_slip', None, 'Valid start/end dates and recorded completion are required')

    milestone_rows = [r for r in (milestones or []) if status(r) not in {'cancelled', 'canceled', 'archived'}]
    overdue, slip_sum, unknown_due = 0, 0.0, 0
    for row in milestone_rows:
        if status(row) in CLOSED or (number(row.get('completion_percentage')) or 0) >= 100:
            continue
        due = day(row.get('due_date'))
        if not due:
            unknown_due += 1
        elif due < today:
            overdue += 1
            slip_sum += min((today - due).days / 30, 1)
    if milestones is not None and milestone_rows and not unknown_due:
        component('overdue_milestones', slip_sum / len(milestone_rows) * 100, f'{overdue} of {len(milestone_rows)} milestones overdue; lateness weighted over 30 days')
    else:
        component('overdue_milestones', None, 'Milestone due dates are missing or no milestones are recorded')

    orders = purchase_orders or []
    open_orders = [r for r in orders if status(r) not in CLOSED | {'delivered', 'received', 'rejected'}]
    late, counteroffers, po_sum, unknown_expected = 0, 0, 0.0, 0
    for row in open_orders:
        expected_date = day(row.get('expected_date'))
        suggested = status(row) == 'suggested'
        counteroffers += int(suggested)
        if not expected_date and not suggested:
            unknown_expected += 1
        lateness = max(0, (today - expected_date).days) if expected_date else 0
        late += int(lateness > 0)
        # Use the stronger signal per order, not two penalties for one order.
        po_sum += max(min(lateness / 14, 1), .25 if suggested else 0)
    if purchase_orders is not None and orders and not unknown_expected:
        component('procurement', po_sum / len(open_orders) * 100 if open_orders else 0,
                  f'{late} late order(s) of {len(open_orders)} open; {counteroffers} pending counter-offer(s)')
    else:
        component('procurement', None, 'No order evidence or expected delivery dates are missing')

    forecast, overrun = None, None
    if budget is not None and budget > 0 and spent is not None and spent >= 0 and completion is not None and completion > 0:
        forecast = spent / (completion / 100)
        overrun = max(0, (forecast - budget) / budget * 100)
        component('cost', overrun * 3, f'Trending {overrun:.1f}% over budget (spend divided by recorded completion)')
    else:
        component('cost', None, 'Positive budget/completion and recorded spend are required for a forecast')

    # Seven completed local calendar days; avoid penalizing an unfinished today.
    window_start, window_end = today - timedelta(days=7), today - timedelta(days=1)
    eligible_days = {window_start + timedelta(days=i) for i in range(7)
                     if (window_start + timedelta(days=i)).weekday() != 6
                     and (not start or window_start + timedelta(days=i) >= start)
                     and (not end or window_start + timedelta(days=i) <= end)}
    roster = set(assigned_worker_ids or [])
    recorded, present = set(), set()
    for row in attendance or []:
        work_date, worker = day(row.get('date')), row.get('worker_id')
        if work_date not in eligible_days or worker not in roster:
            continue
        key = (worker, work_date)
        recorded.add(key)
        row_status = status(row)
        if row_status not in {'absent', 'on leave', 'leave'} and (row_status in {'present', 'checked in', 'checked out'} or row.get('check_in_time') or (number(row.get('hours_worked')) or 0) > 0):
            present.add(key)
    capacity = len(roster) * len(eligible_days)
    attendance_pct = None
    if attendance is not None and assigned_worker_ids is not None and capacity and recorded:
        attendance_pct = min(100, len(present) / capacity * 100)
        component('labour', 100 - attendance_pct, f'Recorded attendance {attendance_pct:.1f}% ({len(present)}/{capacity} worker-days; current roster proxy)')
    else:
        component('labour', None, 'Assigned workers and attendance evidence in the last seven completed days are required')

    available_weight = sum(r['base_weight'] for r in components.values() if r['score'] is not None)
    for row in components.values():
        effective = row['base_weight'] / available_weight if available_weight and row['score'] is not None else 0
        row['effective_weight'] = round(effective * 100, 4)
        row['contribution'] = round(row['score'] * effective, 4) if row['score'] is not None else None
    raw_score = sum(r['contribution'] or 0 for r in components.values()) if available_weight else None
    score = round(raw_score, 1) if raw_score is not None else None
    level = 'Insufficient data' if score is None else 'High' if score >= 60 else 'Moderate' if score >= 30 else 'Low'
    missing = [r['label'] for r in components.values() if r['score'] is None]
    return {'project_id': project_id, 'project_name': project_name, 'delay_risk': score, 'risk_level': level,
            'assessment_status': 'insufficient_data' if score is None else 'partial_data' if missing else 'assessed',
            'recommendation': '; '.join(reasons) if reasons else 'Insufficient data to assess delay risk',
            'components': list(components.values()), 'data_coverage': available_weight, 'missing_components': missing,
            'milestone_overdue_count': overdue, 'milestone_count': len(milestone_rows), 'late_po_count': late,
            'counteroffer_count': counteroffers, 'attendance_gap': None if attendance_pct is None else round(100-attendance_pct, 1),
            'is_over_budget': overrun is not None and overrun > 0, 'forecasted_cost': forecast, 'total_budget': budget,
            'as_of': today.isoformat(), 'attendance_window': {'start': window_start.isoformat(), 'end': window_end.isoformat(), 'workdays': len(eligible_days)},
            'method': 'survey_weighted_rules_v1', 'limitations': ['Risk index, not a calibrated delay probability',
            'Weights supplied from practitioner survey Q16; rounded votes 8/6/5/5, not statistically calibrated',
            'Attendance uses current assignments and Monday–Saturday; holidays and historical roster changes are not modeled',
            'Unrecorded worker-days may reflect incomplete logging; attendance shortfall is a coverage proxy',
            'Weather is not measured; missing component weights are redistributed']}
