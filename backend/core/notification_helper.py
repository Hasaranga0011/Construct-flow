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
    Shared server-side helper to insert a notification using the service-role Supabase client.
    Validates type against ALLOWED_NOTIFICATION_TYPES, defaulting to 'general' without failing.
    """
    try:
        create_notifications([{"type": type, "user_id": user_id, "title": title, "message": message, **kwargs}])
    except Exception as e:
        logging.error(f"create_notification failed silently: {e}")

def create_notifications(notifications: list):
    """
    Insert multiple notifications in one go using the service-role client.
    Never raises an exception so primary transactions are never interrupted.
    """
    valid_notifs = []
    for notif in notifications:
        t = notif.get("type", "general")
        if t not in ALLOWED_NOTIFICATION_TYPES:
            logging.warning(f"Invalid notification_type '{t}'. Defaulting to 'general'.")
            t = "general"

        channel = notif.get("sent_via", "in_app")
        if channel not in ("in_app", "email"):
            channel = "in_app"

        item = {
            "id": str(uuid.uuid4()),
            **notif,
            "type": t,
            "sent_via": channel
        }
        valid_notifs.append(item)
    
    if not valid_notifs:
        return
        
    try:
        from core.attendance_setup import setup_client
        setup_client().table("notifications").insert(valid_notifs).execute()
    except Exception as e:
        logging.error(f"Failed to insert notifications: {e}")

def notify_project_event(project_id: str, project_name: str, event_type: str, pm_id: str = None, client_id: str = None, extra_message: str = ""):
    """
    Convenience helper to dispatch notifications to PM, Client, and Admins for project events.
    """
    notifs = []
    # 1. Admin notification
    notifs.append({
        "user_id": "11111111-1111-1111-1111-111111111111",
        "project_id": project_id,
        "target_user_id": None,
        "target_role": "super_admin",
        "title": f"Project {event_type.capitalize()}: {project_name}",
        "message": extra_message or f"Project '{project_name}' was {event_type}.",
        "type": "general",
        "is_read": False,
    })
    # 2. PM notification
    if pm_id:
        notifs.append({
            "user_id": "11111111-1111-1111-1111-111111111111",
            "project_id": project_id,
            "target_user_id": pm_id,
            "target_role": "pm",
            "title": f"Project {event_type.capitalize()}: {project_name}",
            "message": extra_message or f"You are assigned to '{project_name}'.",
            "type": "general",
            "is_read": False,
        })
    # 3. Client notification
    if client_id:
        notifs.append({
            "user_id": "11111111-1111-1111-1111-111111111111",
            "project_id": project_id,
            "target_user_id": client_id,
            "target_role": "client",
            "title": f"Project Update: {project_name}",
            "message": extra_message or f"Your project '{project_name}' has been updated.",
            "type": "general",
            "is_read": False,
        })
    try:
        create_notifications(notifs)
    except Exception as e:
        logging.warning(f"notify_project_event failed silently: {e}")
