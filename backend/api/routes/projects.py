from fastapi import APIRouter, HTTPException, Request, Depends
from typing import List, Optional
from ..models import ProjectCreate, ProjectUpdate, ProjectResponse
from core.database import client_for_token, get_auth_client
from core.security import get_current_user
import os
import requests

router = APIRouter(
    prefix="/projects",
    tags=["Projects"]
)

@router.get("/", response_model=List[ProjectResponse])
def get_projects(request: Request):
    try:
        client = get_auth_client(request)
        response = client.table("projects").select("*").execute()
        return response.data
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

def send_client_assignment_email(email: str, project_name: str):
    RESEND_API_KEY = os.getenv("RESEND_API_KEY", "")
    FROM_EMAIL = os.getenv("RESEND_FROM_EMAIL", "ConstructFlow <noreply@constructflow.lk>")
    if not RESEND_API_KEY:
        return

    html = f"""
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background: #F97316; padding: 24px; border-radius: 12px 12px 0 0;">
        <h1 style="color: white; margin: 0;">ConstructFlow</h1>
      </div>
      <div style="padding: 32px; background: white; border: 1px solid #e5e7eb;">
        <h2 style="color: #1F2937;">Welcome to your new project</h2>
        <p style="color: #6B7280;">You have been assigned as the client for:</p>
        <div style="background: #F9FAFB; padding: 16px; border-radius: 8px; margin: 16px 0;">
          <p style="margin: 4px 0;"><strong>Project:</strong> {project_name}</p>
        </div>
        <p style="color: #6B7280;">Please log in to your ConstructFlow Client Portal to track milestones, view estimates, and communicate with your Project Manager.</p>
      </div>
    </div>
    """
    try:
        requests.post(
            "https://api.resend.com/emails",
            headers={
                "Authorization": f"Bearer {RESEND_API_KEY}",
                "Content-Type": "application/json",
            },
            json={
                "from": FROM_EMAIL,
                "to": [email],
                "subject": f"Welcome to {project_name}",
                "html": html,
            },
            timeout=10.0
        )
    except Exception as e:
        print("Failed to send email:", e)


def save_project(client, data, project_id=None):
    # Defined in migrations/20260925_workflow_integrity.sql. A failed assignment
    # rolls back the project change as part of the same database transaction.
    result = client.rpc("save_project_with_assignments", {
        "p_project_id": project_id, "p_data": data,
    }).execute()
    if not result.data:
        raise HTTPException(status_code=400, detail="Failed to save project")
    return result.data


def notify_assigned_client(client, project):
    if not project.get("client_id"):
        return
    try:
        profile = client.table("profiles").select("email").eq("id", project["client_id"]).execute()
        if profile.data and profile.data[0].get("email"):
            send_client_assignment_email(profile.data[0]["email"], project["name"])
    except Exception:
        import logging
        logging.exception("Project saved, but client notification failed")


@router.post("/", response_model=ProjectResponse)
def create_project(project: ProjectCreate, request: Request):
    client = get_auth_client(request)
    saved = save_project(client, project.model_dump(mode="json", exclude_none=True))
    # Notify both PM and client about the new project.
    notifications = []
    if saved.get("pm_id"):
        notifications.append({
            "project_id": saved["id"],
            "target_user_id": saved["pm_id"],
            "target_role": "pm",
            "title": "New Project Assigned",
            "message": f"You have been assigned as Project Manager for: {saved['name']}",
            "type": "info",
            "is_read": False,
        })
    if notifications:
        try:
            client.table("notifications").insert(notifications).execute()
        except Exception:
            import logging
            logging.exception("Project created but PM notification failed")
    notify_assigned_client(client, saved)
    return saved


@router.patch("/{project_id}", response_model=ProjectResponse)
def update_project(project_id: str, project: ProjectUpdate, request: Request):
    client = get_auth_client(request)
    data = project.model_dump(mode="json", exclude_unset=True)
    saved = save_project(client, data, project_id)
    if data.get("client_id"):
        notify_assigned_client(client, saved)
    return saved


from pydantic import BaseModel

def authorized_project_client(project_id, user, *, write):
    if not write and user["role"] not in {"super_admin", "pm", "client"}:
        raise HTTPException(status_code=403, detail="Not enough privileges")
    if write and user["role"] not in {"super_admin", "pm", "site_manager"}:
        raise HTTPException(status_code=403, detail="Not enough privileges")
    client = client_for_token(user["token"])
    response = client.table("projects").select("id, pm_id, client_id").eq("id", project_id).execute()
    if not response.data:
        raise HTTPException(status_code=404, detail="Project not found")
    project = response.data[0]
    if user["role"] == "super_admin":
        return client
    if user["role"] == "pm" and project.get("pm_id") == user["id"]:
        return client
    if not write and user["role"] == "client" and project.get("client_id") == user["id"]:
        return client
    result = client.table("project_role_assignments").select("user_id").eq("project_id", project_id).eq("user_id", user["id"]).eq("role", user["role"]).execute()
    if not result.data:
        raise HTTPException(status_code=403, detail="Access denied: not your project")
    return client


class MilestoneCreate(BaseModel):
    title: str
    description: str
    due_date: str

@router.post("/{project_id}/milestones")
def create_milestone(project_id: str, payload: MilestoneCreate, current_user: dict = Depends(get_current_user)):
    supabase = authorized_project_client(project_id, current_user, write=True)
    try:
        res = supabase.table("milestones").insert({
            "project_id": project_id,
            "title": payload.title,
            "description": payload.description,
            "due_date": payload.due_date,
            "planned_date": payload.due_date,  # Added to satisfy legacy table constraint
            "status": "Pending"
        }).execute()
        return res.data[0]
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

class MilestoneUpdate(BaseModel):
    status: str
    media_urls: Optional[List[str]] = None

@router.patch("/{project_id}/milestones/{milestone_id}")
def update_milestone(project_id: str, milestone_id: str, payload: MilestoneUpdate, current_user: dict = Depends(get_current_user)):
    supabase = authorized_project_client(project_id, current_user, write=True)
    try:
        # Update milestone status
        res = supabase.table("milestones").update({"status": payload.status}).eq("id", milestone_id).eq("project_id", project_id).execute()

        if not res.data:
            raise HTTPException(status_code=404, detail="Milestone not found")

        # Insert any new media
        if payload.media_urls:
            media_inserts = [{"milestone_id": milestone_id, "url": url} for url in payload.media_urls]
            supabase.table("milestone_media").insert(media_inserts).execute()

        # Recalculate project completion percentage
        all_ms = supabase.table("milestones").select("status").eq("project_id", project_id).execute()
        if all_ms.data:
            total = len(all_ms.data)
            completed = sum(1 for ms in all_ms.data if ms.get("status") == "Completed")
            percentage = int((completed / total) * 100)
            supabase.table("projects").update({"completion_percentage": percentage}).eq("id", project_id).execute()

        # Notify the client about the milestone update.
        try:
            proj = supabase.table("projects").select("client_id, name").eq("id", project_id).execute()
            if proj.data and proj.data[0].get("client_id"):
                supabase.table("notifications").insert({
                    "project_id": project_id,
                    "target_user_id": proj.data[0]["client_id"],
                    "target_role": "client",
                    "title": "Milestone Updated",
                    "message": f"A milestone has been updated to '{payload.status}' on your project '{proj.data[0].get('name', '')}'.",
                    "type": "info",
                    "is_read": False,
                }).execute()
        except Exception:
            import logging
            logging.exception("Milestone updated but client notification failed")

        return res.data[0]
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/{project_id}/milestones/{milestone_id}")
def delete_milestone(project_id: str, milestone_id: str, current_user: dict = Depends(get_current_user)):
    supabase = authorized_project_client(project_id, current_user, write=True)
    try:
        res = supabase.table("milestones").delete().eq("id", milestone_id).eq("project_id", project_id).execute()

        # Recalculate project completion percentage
        all_ms = supabase.table("milestones").select("status").eq("project_id", project_id).execute()
        if all_ms.data:
            total = len(all_ms.data)
            completed = sum(1 for ms in all_ms.data if ms.get("status") == "Completed")
            percentage = int((completed / total) * 100)
            supabase.table("projects").update({"completion_percentage": percentage}).eq("id", project_id).execute()
        else:
            supabase.table("projects").update({"completion_percentage": 0}).eq("id", project_id).execute()

        return {"success": True}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

from ..models import ExpenseCreate, ExpenseResponse

@router.get("/{project_id}/financials")
def get_project_financials(project_id: str, current_user: dict = Depends(get_current_user)):
    """Returns committed cost, actual spend, remaining budget, and total budget for a project.
    Committed = POs in Pending Delivery / Confirmed.
    Actual = POs in Delivered / Received + salary slips paid out.
    Fires budget-overrun notifications at 90% and 100% thresholds.
    """
    supabase = authorized_project_client(project_id, current_user, write=False)
    try:
        # Fetch project budget
        proj = supabase.table("projects").select("total_budget, name, pm_id, client_id").eq("id", project_id).execute()
        if not proj.data:
            raise HTTPException(status_code=404, detail="Project not found")
        total_budget = float(proj.data[0].get("total_budget") or 0)
        pm_id = proj.data[0].get("pm_id")
        project_name = proj.data[0].get("name", "")

        # Committed: POs not yet delivered
        committed_res = supabase.table("purchase_orders") \
            .select("total_price") \
            .eq("project_id", project_id) \
            .in_("status", ["Pending Delivery", "Confirmed"]) \
            .execute()
        committed_cost = sum(float(r.get("total_price") or 0) for r in (committed_res.data or []))

        # Actual: delivered/received POs
        actual_po_res = supabase.table("purchase_orders") \
            .select("total_price") \
            .eq("project_id", project_id) \
            .in_("status", ["Delivered", "Received"]) \
            .execute()
        actual_po = sum(float(r.get("total_price") or 0) for r in (actual_po_res.data or []))

        # Actual: salary slips (via workers on this project's sites)
        salary_res = supabase.table("salary_slips") \
            .select("total_amount, site_id") \
            .execute()
        # Filter salary slips to project's sites
        site_res = supabase.table("site_manager_sites").select("id").eq("project_id", project_id).execute()
        project_site_ids = {r["id"] for r in (site_res.data or [])}
        actual_payroll = sum(
            float(r.get("total_amount") or 0)
            for r in (salary_res.data or [])
            if r.get("site_id") in project_site_ids
        )

        actual_spend = actual_po + actual_payroll
        remaining_budget = total_budget - committed_cost - actual_spend

        result = {
            "project_id": project_id,
            "total_budget": total_budget,
            "committed_cost": committed_cost,
            "actual_spend": actual_spend,
            "actual_po": actual_po,
            "actual_payroll": actual_payroll,
            "remaining_budget": remaining_budget,
        }

        # Budget overrun notifications (90% and 100% thresholds)
        if total_budget > 0:
            utilisation = (committed_cost + actual_spend) / total_budget
            if utilisation >= 1.0:
                _fire_overrun_notification(supabase, project_id, project_name, pm_id, 100)
            elif utilisation >= 0.9:
                _fire_overrun_notification(supabase, project_id, project_name, pm_id, 90)

        return result
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


def _fire_overrun_notification(supabase, project_id: str, project_name: str, pm_id, threshold_pct: int):
    """Insert a budget-overrun warning notification for PM and admin."""
    import logging
    try:
        notifications = [
            {
                "project_id": project_id,
                "target_role": "super_admin",
                "title": f"Budget {threshold_pct}% Exceeded",
                "message": f"Project '{project_name}' has used {threshold_pct}% or more of its budget.",
                "type": "error" if threshold_pct >= 100 else "warning",
                "is_read": False,
            }
        ]
        if pm_id:
            notifications.append({
                "project_id": project_id,
                "target_user_id": pm_id,
                "target_role": "pm",
                "title": f"Budget {threshold_pct}% Exceeded",
                "message": f"Project '{project_name}' has used {threshold_pct}% or more of its budget.",
                "type": "error" if threshold_pct >= 100 else "warning",
                "is_read": False,
            })
        supabase.table("notifications").insert(notifications).execute()
    except Exception:
        logging.exception("Failed to insert budget overrun notifications")


@router.get("/{project_id}/expenses", response_model=List[ExpenseResponse])
def get_project_expenses(project_id: str, current_user: dict = Depends(get_current_user)):
    supabase = authorized_project_client(project_id, current_user, write=False)
    try:
        res = supabase.table("project_expenses").select("*").eq("project_id", project_id).order("expense_date", desc=True).execute()
        return res.data
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/{project_id}/expenses", response_model=ExpenseResponse)
def add_project_expense(project_id: str, expense: ExpenseCreate, current_user: dict = Depends(get_current_user)):
    if current_user["role"] not in {"super_admin", "pm"}:
        raise HTTPException(status_code=403, detail="Not enough privileges")
    supabase = authorized_project_client(project_id, current_user, write=True)
    try:
        if expense.project_id != project_id:
            raise HTTPException(status_code=400, detail="Expense project does not match URL")
        expense_data = expense.model_dump()
        if expense_data.get('expense_date'):
            expense_data['expense_date'] = expense_data['expense_date'].isoformat()
        else:
            del expense_data['expense_date']

        res = supabase.table("project_expenses").insert(expense_data).execute()
        if not res.data:
            raise HTTPException(status_code=400, detail="Failed to create expense")

        # Recalculate spent_cost
        all_exp = supabase.table("project_expenses").select("amount").eq("project_id", project_id).execute()
        total_spent = sum(float(e.get("amount", 0)) for e in all_exp.data) if all_exp.data else 0.0

        supabase.table("projects").update({"spent_cost": total_spent}).eq("id", project_id).execute()

        return res.data[0]
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
