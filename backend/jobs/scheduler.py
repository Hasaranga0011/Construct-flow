from core.notification_helper import create_notifications
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from core.supabase_client import supabase_db
from datetime import datetime

async def _log_job_start(job_name: str) -> str:
    try:
        res = supabase_db.table("job_runs").insert({"job_name": job_name, "status": "Running"}).execute()
        return res.data[0]["id"] if res.data else None
    except:
        return None

async def _log_job_end(job_id: str, status: str, error_message: str = None):
    if not job_id: return
    try:
        supabase_db.table("job_runs").update({
            "status": status,
            "error_message": error_message,
            "completed_at": datetime.now().isoformat()
        }).eq("id", job_id).execute()
    except:
        pass

async def stock_alert_job():
    job_id = await _log_job_start("stock_alert_job")
    try:
        print(f"[{datetime.now()}] Running stock_alert_job")
        res = supabase_db.table("materials").select("*").execute()
        low_stock = [m for m in res.data if m.get("global_stock_quantity", 0) < m.get("low_stock_threshold", 0)]
        
        for item in low_stock:
            title = f"⚠ Low Stock: {item.get('item_name')}"
            message = f"Only {item.get('global_stock_quantity')} {item.get('unit')} remaining. Reorder immediately."
            
            create_notifications([
                {"title": title, "message": message, "type": "general", "target_role": "super_admin", "is_read": False},
                {"title": title, "message": message, "type": "general", "target_role": "pm", "is_read": False}
            ])
        await _log_job_end(job_id, "Success")
    except Exception as e:
        print(f"Stock alert job error: {e}")
        await _log_job_end(job_id, "Failed", str(e))

async def delay_check_job():
    job_id = await _log_job_start("delay_check_job")
    try:
        print(f"[{datetime.now()}] Running delay_check_job")
        from core.database import get_service_client
        from services.delay_risk_service import project_delay_risks, read_all
        db = get_service_client()
        projects = read_all(lambda: db.table('projects').select('id,name,status,pm_id,is_test,start_date,end_date,completion_percentage,total_budget,spent_cost'))
        projects = [p for p in projects if not p.get('is_test') and not any(word in (p.get('name') or '').lower() for word in ('test', 'demo', 'sample'))]
        assessments, _ = project_delay_risks(db, projects)
        high_risk_projects = [p for p in assessments if p['delay_risk'] is not None and p['delay_risk'] >= 60]
        
        for p in high_risk_projects:
            proj_name = p.get('project_name', 'Project')
            title = f"🚨 High Delay Risk: {proj_name}"
            message = f"Delay risk index {p['delay_risk']}/100 (High). {p['recommendation']}"
            
            notices = [{"title": title, "message": message, "type": "general", "target_role": "super_admin", "project_id": p['project_id']}]
            pm = next((row.get('pm_id') for row in projects if row['id'] == p['project_id']), None)
            if pm:
                notices.append({"title": title, "message": message, "type": "general", "target_role": "pm", "target_user_id": pm, "project_id": p['project_id']})
            create_notifications(notices)
        await _log_job_end(job_id, "Success")
    except Exception as e:
        print(f"Delay check job error: {e}")
        await _log_job_end(job_id, "Failed", str(e))

async def payroll_job():
    job_id = await _log_job_start("payroll_job")
    try:
        print(f"[{datetime.now()}] Running payroll_job")
        now = datetime.now()
        month_str = f"{now.year}-{now.month:02d}"
        
        create_notifications([{
            "title": "💰 Payroll Generation Time",
            "message": f"Please generate payroll records for {month_str}",
            "type": "general",
            "target_role": "super_admin"
        }])
        await _log_job_end(job_id, "Success")
    except Exception as e:
        print(f"Payroll job error: {e}")
        await _log_job_end(job_id, "Failed", str(e))

async def weekly_report_job():
    job_id = await _log_job_start("weekly_report_job")
    try:
        print(f"[{datetime.now()}] Running weekly_report_job")
        # Logic to fetch projects and email clients
        await _log_job_end(job_id, "Success")
    except Exception as e:
        print(f"Weekly report job error: {e}")
        await _log_job_end(job_id, "Failed", str(e))

def start_scheduler() -> AsyncIOScheduler:
    scheduler = AsyncIOScheduler()
    
    # 1. stock_alert_cron: daily at 6 AM
    scheduler.add_job(stock_alert_job, CronTrigger(hour=6, minute=0))
    
    # 2. delay_check_cron: weekly Monday at 8 AM
    scheduler.add_job(delay_check_job, CronTrigger(day_of_week='mon', hour=8))
    
    # 3. payroll_cron: last day of month at 11 PM
    scheduler.add_job(payroll_job, CronTrigger(day='last', hour=23))
    
    # 4. weekly_report_cron: every Friday 5 PM
    scheduler.add_job(weekly_report_job, CronTrigger(day_of_week='fri', hour=17))
    
    scheduler.start()
    return scheduler
