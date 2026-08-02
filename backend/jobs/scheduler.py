from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from core.supabase_client import supabase_db
from datetime import datetime

async def stock_alert_job():
    try:
        print(f"[{datetime.now()}] Running stock_alert_job")
        res = supabase_db.table("materials").select("*").execute()
        low_stock = [m for m in res.data if m.get("global_stock_quantity", 0) < m.get("low_stock_threshold", 0)]
        
        for item in low_stock:
            title = f"⚠ Low Stock: {item.get('item_name')}"
            message = f"Only {item.get('global_stock_quantity')} {item.get('unit')} remaining. Reorder immediately."
            
            supabase_db.table("notifications").insert([
                {"title": title, "message": message, "type": "alert", "target_role": "super_admin", "is_read": False},
                {"title": title, "message": message, "type": "alert", "target_role": "pm", "is_read": False}
            ]).execute()
    except Exception as e:
        print(f"Stock alert job error: {e}")

async def delay_check_job():
    try:
        print(f"[{datetime.now()}] Running delay_check_job")
        # Reuse insights logic or simplified check here
        res = supabase_db.table("ml_predictions").select("*, projects(name)").gte("delay_risk_score", 70).execute()
        high_risk_projects = res.data
        
        for p in high_risk_projects:
            proj_name = p.get("projects", {}).get("name", "Project")
            title = f"🚨 High Delay Risk: {proj_name}"
            message = f"{p.get('delay_risk_score')}% delay probability. Immediate review needed."
            
            supabase_db.table("notifications").insert([
                {"title": title, "message": message, "type": "alert", "target_role": "super_admin"},
                {"title": title, "message": message, "type": "alert", "target_role": "pm"}
            ]).execute()
    except Exception as e:
        print(f"Delay check job error: {e}")

async def payroll_job():
    try:
        print(f"[{datetime.now()}] Running payroll_job")
        now = datetime.now()
        month_str = f"{now.year}-{now.month:02d}"
        
        # Simplified generation logic - calls internal logic
        # For full implementation, we would extract the generate_payroll logic to a service
        # and call it from both the API and here.
        # Just sending the notification for now as placeholder for the job.
        
        supabase_db.table("notifications").insert({
            "title": "💰 Payroll Generation Time",
            "message": f"Please generate payroll records for {month_str}",
            "type": "info",
            "target_role": "super_admin"
        }).execute()
    except Exception as e:
        print(f"Payroll job error: {e}")

async def weekly_report_job():
    try:
        print(f"[{datetime.now()}] Running weekly_report_job")
        # Logic to fetch projects and email clients
        pass
    except Exception as e:
        print(f"Weekly report job error: {e}")

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
