from pathlib import Path
import sys, json
from datetime import date, timedelta
root=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(root/'backend'))
from core.delay_risk import compute_rule_based_delay_risk as risk
today=date(2026,3,2)
days=[today-timedelta(days=i) for i in range(1,8) if (today-timedelta(days=i)).weekday()!=6]
attendance=[{'worker_id':str(w),'date':d.isoformat(),'status':'Present'} for w in range(5) for d in days][:24]
rows=[risk('p1','Survey example',as_of=today,start_date=today-timedelta(days=60),end_date=today+timedelta(days=40),completion_percentage=40,
 milestones=[{'due_date':today-timedelta(days=d),'status':'Pending'} for d in (15,45,-1,-2,-3)],purchase_orders=[{'expected_date':today-timedelta(days=d),'status':'Confirmed'} for d in (7,-1,-2)],
 total_budget=100,spent_cost=44,assigned_worker_ids=[str(i) for i in range(5)],attendance=attendance),
 risk('p2','High overdue example',milestones=[{'due_date':'2025-01-01'}],as_of=today),
 risk('p3','Moderate cost example',total_budget=100,spent_cost=57.5,completion_percentage=50,as_of=today),
 risk('p4','Missing evidence example',as_of=today)]
out={'projects':rows,'feature_importance':[],'market_trends':[],'historical_projects':[],'pending_market_trends':[], 'project_health':{'total':4,'active':4,'completed':0},'model_info':{'delay_model':{'type':'Survey-weighted rule-based index'}}}
(root/'.validation-ui/current/delay-fixture.json').write_text(json.dumps(out),encoding='utf-8')
