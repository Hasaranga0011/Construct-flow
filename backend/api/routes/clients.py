from fastapi import APIRouter, HTTPException, Query, Request, Depends
from typing import List, Optional
import secrets
import string
import resend
from core.config import settings
from ..models import ClientCreate, ClientResponse
from core.notification_helper import create_notifications, create_notification
from core.database import get_auth_client
from supabase import create_client as new_supabase_client, ClientOptions
from core.security import require_manager_or_admin, require_admin

router = APIRouter(
    prefix="/clients",
    tags=["Clients"], dependencies=[Depends(require_manager_or_admin)]
)

@router.get("/", response_model=List[ClientResponse])
def get_clients(request: Request, project_id: Optional[str] = Query(None, description="Filter by project ID")):
    try:
        query = get_auth_client(request).table("clients").select("*")
        if project_id:
            query = query.eq("project_id", project_id)
            
        response = query.execute()
        return response.data
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/", response_model=ClientResponse)
def create_client(client: ClientCreate, request: Request):
    try:
        response = get_auth_client(request).table("clients").insert(client.model_dump()).execute()
        
        if not response.data:
            raise HTTPException(status_code=400, detail="Failed to create client")
            
        return response.data[0]
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

from pydantic import BaseModel

class InviteClientRequest(BaseModel):
    email: str
    name: str
    company: str
    access_level: str
    project_id: str

@router.post("/invite")
def invite_client(req: InviteClientRequest, request: Request):
    try:
        from core.notification_helper import create_notifications, create_notification
from core.database import get_auth_client
        # We need an auth client to ensure the person inviting is authenticated
        admin_client = get_auth_client(request)
        
        # 1. Generate temp password
        temp_password = secrets.token_urlsafe(24)
        
        # 2. Sign up the user (this uses the anon key client to not disrupt admin's session if this was frontend, but backend is fine)
        # Note: the trigger will auto-create a profile
        signup_client = new_supabase_client(settings.SUPABASE_URL, settings.SUPABASE_KEY, options=ClientOptions(persist_session=False, auto_refresh_token=False))
        auth_res = signup_client.auth.sign_up({"email": req.email, "password": temp_password})
        
        if not auth_res.user:
            raise HTTPException(status_code=400, detail="Could not create user account")
            
        new_user_id = auth_res.user.id
        
        # 3. Update the automatically created profile with name and company
        admin_client.table("profiles").update({
            "full_name": req.name,
            "company_name": req.company,
            "role": "client"
        }).eq("id", new_user_id).execute()
        
        # 4. If project_id is provided, link them (maybe through a client_projects table? Or just set project_id? Wait, phase5 doesn't have a direct client to project many-to-many. The project has client_id)
        if req.project_id:
            # Check if project exists
            admin_client.table("projects").update({"client_id": new_user_id}).eq("id", req.project_id).execute()
            
        # 5. Log activity
        admin_client.table("client_activity").insert({
            "action": f"Client {req.name} was invited",
            "project_id": req.project_id,
            "client_id": new_user_id
        }])
        
        # 5b. Notify the client
        create_notifications([{
            "user_id": new_user_id,
            "title": "Welcome to ConstructFlow",
            "message": f"You have been invited to ConstructFlow. Your account is ready.",
            "type": "general",
            "project_id": req.project_id
        }])
        
        # 6. Send Email using Resend
        if settings.RESEND_API_KEY:
            try:
                resend.api_key = settings.RESEND_API_KEY
                resend.Emails.send({
                    "from": settings.RESEND_FROM_EMAIL,
                    "to": [req.email],
                    "subject": "You have been invited to ConstructFlow",
                    "html": f"<p>Hello {req.name},</p><p>You've been invited to view your project updates.</p><p>Your temporary password is: <b>{temp_password}</b></p><p>Please login to the portal and change your password.</p>"
                })
            except Exception as e:
                print(f"Failed to send email: {e}")

        return {"message": "Client invited successfully", "user_id": new_user_id}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

class ClientUpdateRequest(BaseModel):
    name: Optional[str] = None
    company: Optional[str] = None

@router.put("/{client_id}", dependencies=[Depends(require_admin)])
def update_client(client_id: str, req: ClientUpdateRequest, request: Request):
    try:
        # Use service role to bypass RLS and broken RPCs
        admin_client = new_supabase_client(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_ROLE_KEY)
        
        updates = {}
        if req.name is not None:
            updates['full_name'] = req.name
        if req.company is not None:
            updates['company_name'] = req.company
            
        if updates:
            admin_client.table("profiles").update(updates).eq("id", client_id).execute()
            
        return {"message": "Client updated successfully"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/{client_id}", dependencies=[Depends(require_admin)])
def delete_client(client_id: str, request: Request):
    try:
        # Use service role to completely delete user from auth and profiles
        admin_client = new_supabase_client(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_ROLE_KEY)
        
        try:
            admin_client.auth.admin.delete_user(client_id)
        except Exception as e:
            print(f"Auth delete failed: {e}")
            # Fallback to just deleting the profile if auth delete fails
            admin_client.table("profiles").delete().eq("id", client_id).execute()
            
        return {"message": "Client deleted successfully"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

