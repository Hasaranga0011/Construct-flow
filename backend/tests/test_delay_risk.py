from datetime import date, timedelta
from types import SimpleNamespace as NS
import pytest
from core.delay_risk import compute_rule_based_delay_risk as risk
from services.delay_risk_service import project_delay_risks
from services.delay_risk_service import read_all

TODAY = date(2026, 3, 2)


def assessment(**overrides):
    return risk('p', 'House', as_of=TODAY, **overrides)


def test_survey_example_uses_all_five_components_and_matches_approximately_26():
    days = [TODAY-timedelta(days=i) for i in range(1,8) if (TODAY-timedelta(days=i)).weekday()!=6]
    attendance = [{'worker_id':str(w),'date':d.isoformat(),'status':'Present'} for w in range(5) for d in days][:24]
    result=assessment(start_date=TODAY-timedelta(days=60),end_date=TODAY+timedelta(days=40),completion_percentage=40,
        milestones=[{'due_date':TODAY-timedelta(days=d),'status':'Pending'} for d in (15,45,-1,-2,-3)],
        purchase_orders=[{'expected_date':TODAY-timedelta(days=d),'status':'Confirmed'} for d in (7,-1,-2)],
        total_budget=100,spent_cost=44,assigned_worker_ids=[str(i) for i in range(5)],attendance=attendance)
    scores={c['key']:c['score'] for c in result['components']}
    assert scores == pytest.approx({'schedule_slip':50,'overdue_milestones':30,'procurement':100/6,'cost':30,'labour':20},abs=.0001)
    assert result['delay_risk']==25.5 and result['risk_level']=='Low'
    assert result['data_coverage']==100
    assert sum(c['contribution'] for c in result['components'])==pytest.approx(25.4667,abs=.001)


def test_no_evidence_is_insufficient_not_a_fabricated_baseline():
    result=assessment(attendance_count=99999)
    assert result['delay_risk'] is None
    assert result['assessment_status']=='insufficient_data'
    assert result['data_coverage']==0


@pytest.mark.parametrize('overdue_days,total,expected', [(1,4,100/120),(15,4,12.5),(30,4,25),(90,4,25),(30,1,100)])
def test_milestones_use_lateness_and_denominator(overdue_days,total,expected):
    rows=[{'due_date':TODAY-timedelta(days=overdue_days)}]+[{'due_date':TODAY+timedelta(days=1)}]*(total-1)
    result=assessment(milestones=rows)
    assert result['delay_risk']==round(expected,1)
    assert result['components'][1]['effective_weight']==100


def test_completed_cancelled_and_due_today_do_not_add_overdue_risk():
    result=assessment(milestones=[{'due_date':TODAY-timedelta(days=90),'status':'Completed'},
        {'due_date':TODAY-timedelta(days=90),'completion_percentage':100},{'status':'Cancelled'}, {'due_date':TODAY}])
    assert result['delay_risk']==0 and result['milestone_overdue_count']==0


def test_missing_open_milestone_dates_are_not_assumed_on_time():
    result=assessment(milestones=[{'due_date':TODAY-timedelta(days=45)},{}])
    assert result['delay_risk'] is None
    assert result['milestone_overdue_count']==1


@pytest.mark.parametrize('days,expected',[(1,100/14),(7,50),(14,100),(60,100)])
def test_procurement_normalizes_lateness(days,expected):
    result=assessment(purchase_orders=[{'status':'Confirmed','expected_date':TODAY-timedelta(days=days)}])
    assert result['delay_risk']==round(expected,1)


def test_counteroffers_have_25_percent_signal_without_double_counting():
    assert assessment(purchase_orders=[{'status':'Suggested'}])['delay_risk']==25
    assert assessment(purchase_orders=[{'status':'Suggested','expected_date':TODAY-timedelta(days=7)}])['delay_risk']==50


def test_closed_orders_excluded_and_missing_expected_dates_not_zero_risk():
    assert assessment(purchase_orders=[{'status':'Rejected'},{'status':'Delivered'},{'status':'Cancelled'}])['delay_risk']==0
    assert assessment(purchase_orders=[{'status':'Confirmed'}])['delay_risk'] is None


@pytest.mark.parametrize('overrun,level',[(0,'Low'),(9,'Low'),(10,'Moderate'),(19,'Moderate'),(20,'High'),(100,'High')])
def test_levels_and_cost_forecast(overrun,level):
    result=assessment(total_budget=100,spent_cost=(100+overrun)*.5,completion_percentage=50)
    assert result['delay_risk']==min(100,overrun*3)
    assert result['risk_level']==level


@pytest.mark.parametrize('data',[{'total_budget':0,'spent_cost':100,'completion_percentage':50},
    {'total_budget':100,'spent_cost':None,'completion_percentage':50},
    {'total_budget':100,'spent_cost':100,'completion_percentage':0},
    {'total_budget':100,'spent_cost':float('nan'),'completion_percentage':50}])
def test_invalid_financial_inputs_do_not_create_a_score(data):
    assert assessment(**data)['delay_risk'] is None


def test_labour_is_project_roster_distinct_days_and_excludes_sunday_and_today():
    saturday=TODAY-timedelta(days=2)
    rows=[{'worker_id':'one','date':saturday,'status':'Present'}]*4+[
        {'worker_id':'one','date':TODAY-timedelta(days=1),'status':'Present'},
        {'worker_id':'one','date':TODAY,'status':'Present'},
        {'worker_id':'outsider','date':saturday,'status':'Present'}]
    result=assessment(assigned_worker_ids=['one'],attendance=rows)
    assert result['delay_risk']==83.3
    assert result['attendance_window']['workdays']==6
    assert assessment(assigned_worker_ids=['one'],attendance=[])['delay_risk'] is None


def test_missing_weight_is_redistributed_not_scored_as_zero():
    result=assessment(total_budget=100,spent_cost=55,completion_percentage=50,purchase_orders=[{'status':'Delivered'}])
    parts={r['key']:r for r in result['components']}
    assert parts['cost']['effective_weight']==pytest.approx(21/46*100,abs=.0001)
    assert result['delay_risk']==13.7
    assert sum(p['effective_weight'] for p in parts.values())==pytest.approx(100)


def test_service_scopes_roster_aliases_attendance_and_missing_fetches():
    tables={'milestones':[], 'purchase_orders':[], 'sites':[{'id':'site1','project_id':'p1'},{'id':'site2','project_id':'p2'}],
        'site_workers':[{'project_id':'p1','worker_id':'profile1'},{'project_id':'p1','worker_id':'worker1'},{'project_id':'p2','worker_id':'profile2'}],
        'workers':[{'id':'worker1','user_id':'profile1'},{'id':'worker2','user_id':'profile2'}],
        'attendance':[{'worker_id':'worker1','site_id':'site1','date':'2026-02-28','status':'Present'}]}
    class Query:
        def __init__(self,name):self.name=name
        def select(self,*a):return self
        def in_(self,*a):return self
        def gte(self,*a):return self
        def lte(self,*a):return self
        def range(self,*a):return self
        def execute(self):return NS(data=tables[self.name])
    db=NS(table=Query)
    result,count=project_delay_risks(db,[{'id':'p1','name':'First'},{'id':'p2','name':'Second'},{'id':'done','status':'Completed'}],TODAY,mode='rules')
    assert count==2 and len(result)==2
    assert result[0]['project_id']=='p1' and result[0]['delay_risk']==83.3
    assert result[1]['project_id']=='p2' and result[1]['delay_risk'] is None


def test_evidence_read_failure_is_missing_not_zero():
    class Query:
        def select(self,*a):return self
        def in_(self,*a):return self
        def range(self,*a):return self
        def execute(self):raise OSError('Fixture backend failure')
    result,_=project_delay_risks(NS(table=lambda name:Query()),[{'id':'p','name':'Unavailable'}],TODAY)
    assert result[0]['delay_risk'] is None and result[0]['data_coverage']==0


def test_evidence_reads_are_paginated_past_provider_default_limit():
    records=list(range(2001))
    class Query:
        def range(self,start,end):self.start=start;self.end=end;return self
        def execute(self):return NS(data=records[self.start:self.end+1])
    assert read_all(Query)==records


def test_legacy_insights_delegates_without_another_scoring_formula(monkeypatch):
    from api import insights
    caller={'id':'pm','role':'pm','token':'caller-token'}
    monkeypatch.setattr(insights,'project_insights',lambda **kwargs: kwargs)
    assert insights.get_insights(caller)=={'current_user':caller}


def test_scheduled_alert_uses_high_threshold_and_targets_only_assigned_pm(monkeypatch):
    import asyncio
    from jobs import scheduler
    from core import database
    from services import delay_risk_service
    async def start(*args):return 'fixture-job'
    async def end(*args):return None
    monkeypatch.setattr(scheduler,'_log_job_start',start)
    monkeypatch.setattr(scheduler,'_log_job_end',end)
    db=NS(table=lambda name:NS(select=lambda fields:None))
    monkeypatch.setattr(database,'get_service_client',lambda:db)
    monkeypatch.setattr(delay_risk_service,'read_all',lambda factory:[{'id':'p','name':'House','pm_id':'assigned-pm'}])
    monkeypatch.setattr(delay_risk_service,'project_delay_risks',lambda *args:([
        {'project_id':'p','project_name':'House','delay_risk':60,'recommendation':'Behind plan'},
        {'project_id':'missing','delay_risk':None},{'project_id':'low','delay_risk':59.9}],1))
    notices=[]
    monkeypatch.setattr(scheduler,'create_notifications',lambda rows:notices.extend(rows))
    asyncio.run(scheduler.delay_check_job())
    assert len(notices)==2
    pm=next(row for row in notices if row['target_role']=='pm')
    assert pm['target_user_id']=='assigned-pm' and pm['project_id']=='p'
    assert 'probability' not in pm['message'] and '60/100' in pm['message']
