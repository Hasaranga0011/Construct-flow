from fastapi import APIRouter, HTTPException, Request
from typing import List, Optional
from ..models import ProjectCreate, ProjectUpdate, ProjectResponse
from core.database import supabase
from supabase import create_client
from core.config import settings
import os
import requests

router = APIRouter(
    prefix="/projects",
    tags=["Projects"]
)

@router.get("/", response_model=List[ProjectResponse])
def get_projects():
    try:
        response = supabase.table("projects").select("*").execute()
        return response.data
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

from supabase import create_client, ClientOptions

def get_auth_client(request: Request):
    token = request.headers.get("Authorization", "").replace("Bearer ", "")
    options = ClientOptions(headers={"Authorization": f"Bearer {token}"}) if token else ClientOptions()
    client = create_client(settings.SUPABASE_URL, settings.SUPABASE_KEY, options=options)
    return client

@router.post("/", response_model=ProjectResponse)
def create_project(project: ProjectCreate, request: Request):
    try:
        client = get_auth_client(request)
        # Convert dates to ISO format strings for Supabase
        project_data = project.model_dump()
        project_data['start_date'] = project_data['start_date'].isoformat()
        project_data['end_date'] = project_data['end_date'].isoformat()
        
        site_managers = project_data.pop('site_managers', []) or []
        workers = project_data.pop('workers', []) or []
        
        response = client.table("projects").insert(project_data).execute()
        
        if not response.data:
            raise HTTPException(status_code=400, detail="Failed to create project")
            
        new_project = response.data[0]
        project_id = new_project['id']
        
        # Link PM if assigned
        if new_project.get('pm_id'):
            client.table("pm_projects").insert({
                "pm_id": new_project['pm_id'],
                "project_id": project_id
            }).execute()
            
        # Link Site Managers
        if site_managers:
            sm_inserts = [{"site_manager_id": sm_id, "project_id": project_id} for sm_id in site_managers]
            client.table("site_manager_sites").insert(sm_inserts).execute()
            
        # Link Workers
        if workers:
            worker_inserts = [{"worker_id": w_id, "project_id": project_id} for w_id in workers]
            client.table("site_workers").insert(worker_inserts).execute()

        # Send email to Client if assigned
        if new_project.get('client_id'):
            client_res = client.table("profiles").select("email").eq("id", new_project['client_id']).execute()
            if client_res.data and client_res.data[0].get('email'):
                send_client_assignment_email(client_res.data[0]['email'], new_project['name'])
            
        return new_project
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.patch("/{project_id}", response_model=ProjectResponse)
def update_project(project_id: str, project: ProjectUpdate, request: Request):
    try:
        client = get_auth_client(request)
        project_data = project.model_dump(exclude_unset=True)
        if 'start_date' in project_data and project_data['start_date']:
            project_data['start_date'] = project_data['start_date'].isoformat()
        if 'end_date' in project_data and project_data['end_date']:
            project_data['end_date'] = project_data['end_date'].isoformat()
            
        site_managers = project_data.pop('site_managers', None)
        workers = project_data.pop('workers', None)
        
        # Determine if PM/Client is changed
        current_project_res = client.table("projects").select("pm_id, client_id, name").eq("id", project_id).execute()
        current_project = current_project_res.data[0] if current_project_res.data else None
        
        response = client.table("projects").update(project_data).eq("id", project_id).execute()
        if not response.data:
            raise HTTPException(status_code=400, detail="Failed to update project")
            
        updated_project = response.data[0]
        
        # Handle PM Update
        if 'pm_id' in project_data and (not current_project or project_data['pm_id'] != current_project.get('pm_id')):
            client.table("pm_projects").delete().eq("project_id", project_id).execute()
            if project_data['pm_id']:
                client.table("pm_projects").insert({
                    "pm_id": project_data['pm_id'],
                    "project_id": project_id
                }).execute()
                
        # Handle Client Update (send email if it's a new client)
        if 'client_id' in project_data and project_data['client_id']:
            if not current_project or project_data['client_id'] != current_project.get('client_id'):
                client_res = client.table("profiles").select("email").eq("id", project_data['client_id']).execute()
                if client_res.data and client_res.data[0].get('email'):
                    send_client_assignment_email(client_res.data[0]['email'], updated_project['name'])
                    
        # Link Site Managers
        if site_managers is not None:
            client.table("site_manager_sites").delete().eq("project_id", project_id).execute()
            if site_managers:
                sm_inserts = [{"site_manager_id": sm_id, "project_id": project_id} for sm_id in site_managers]
                client.table("site_manager_sites").insert(sm_inserts).execute()
                
        # Replace Workers
        if workers is not None:
            client.table("site_workers").delete().eq("project_id", project_id).execute()
            if workers:
                worker_inserts = [{"worker_id": w_id, "project_id": project_id} for w_id in workers]
                client.table("site_workers").insert(worker_inserts).execute()

        return updated_project
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


from pydantic import BaseModel

class MilestoneCreate(BaseModel):
    title: str
    description: str
    due_date: str

@router.post("/{project_id}/milestones")
def create_milestone(project_id: str, payload: MilestoneCreate):
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
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

class MilestoneUpdate(BaseModel):
    status: str
    media_urls: Optional[List[str]] = None

@router.patch("/{project_id}/milestones/{milestone_id}")
def update_milestone(project_id: str, milestone_id: str, payload: MilestoneUpdate):
    try:
        # Update milestone status
        res = supabase.table("milestones").update({"status": payload.status}).eq("id", milestone_id).execute()
        
        # Insert any new media
        if payload.media_urls:
            media_inserts = [{"milestone_id": milestone_id, "url": url} for url in payload.media_urls]
            supabase.table("milestone_media").insert(media_inserts).execute()
            
        return res.data[0]
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
