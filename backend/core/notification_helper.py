import logging
from core.database import supabase as admin_supabase
import uuid

ALLOWED_NOTIFICATION_TYPES = {
    'material_low', 
    'delay_risk', 
    'payroll_due', 
    'milestone_missed', 
    'general'
}

def create_notification(type: str, user_id: str, title: str, message: str, **kwargs):
    """
    Shared server-side helper to insert a notification using the service-role client.
    Validates type against ALLOWED_NOTIFICATION_TYPES.
    """
    create_notifications([{"type": type, "user_id": user_id, "title": title, "message": message, **kwargs}])

def create_notifications(notifications: list):
    """
    Insert multiple notifications in one go.
    """
    import os
    is_dev = os.environ.get("ENVIRONMENT", "development") == "development"
    
    valid_notifs = []
    for notif in notifications:
        t = notif.get("type", "general")
        if t not in ALLOWED_NOTIFICATION_TYPES:
            if is_dev:
                raise ValueError(f"Invalid notification_type: {t}. Allowed values: {ALLOWED_NOTIFICATION_TYPES}")
            else:
                logging.error(f"Invalid notification_type: {t}. Defaulting to 'general'.")
                t = 'general'
                
        valid_notifs.append({
            "id": str(uuid.uuid4()),
            **notif,
            "type": t
        })
    
    if not valid_notifs:
        return
        
    try:
        admin_supabase.table("notifications").insert(valid_notifs).execute()
    except Exception as e:
        logging.error(f"Failed to insert notifications: {e}")
        # Never raise an exception for a notification failure
