from fastapi import APIRouter, HTTPException, Query, Request, Depends
from typing import List, Optional
import secrets
import string
import resend
from core.config import settings
from services.email_service import send_credentials_welcome_email
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
        
        # 1. Invite client natively via Supabase Auth
        admin_db = new_supabase_client(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_ROLE_KEY)
        new_user_id = None
        email_result = None

        try:
            invite_res = admin_db.auth.admin.invite_user_by_email(
                req.email,
                options={
                    "data": {"full_name": req.name, "company": req.company, "role": "client"},
                    "redirect_to": f"{getattr(settings, 'FRONTEND_URL', 'http://localhost:8082')}/reset-password"
                }
            )
            new_user_id = invite_res.user.id
            email_result = {
                "success": True,
                "sent_to_inbox": True,
                "provider": "supabase",
                "message": f"Client invitation delivered to {req.email} via Supabase Auth"
            }
        except Exception as invite_err:
            err_msg = str(invite_err)
            if "already" in err_msg.lower() or "registered" in err_msg.lower():
                try:
                    users_list = admin_db.auth.admin.list_users()
                    matching = next((u for u in users_list if getattr(u, 'email', None) == req.email), None)
                    if matching:
                        new_user_id = matching.id
                    admin_db.auth.reset_password_for_email(
                        req.email,
                        {"redirect_to": f"{getattr(settings, 'FRONTEND_URL', 'http://localhost:8082')}/reset-password"}
                    )
                    email_result = {
                        "success": True,
                        "sent_to_inbox": True,
                        "provider": "supabase",
                        "message": f"Client access link delivered to {req.email} via Supabase"
                    }
                except Exception:
                    pass

            if not new_user_id:
                temp_password = secrets.token_urlsafe(24)
                auth_res = admin_db.auth.admin.create_user({
                    "email": req.email,
                    "password": temp_password,
                    "email_confirm": True,
                    "app_metadata": {"role": "client"},
                    "user_metadata": {"full_name": req.name, "company": req.company, "role": "client"}
                })
                new_user_id = auth_res.user.id
                email_result = {
                    "success": False,
                    "sent_to_inbox": False,
                    "provider": "local_audit",
                    "error": err_msg
                }
        
        # 2. Upsert profile with name, company, and role
        admin_db.table("profiles").upsert({
            "id": new_user_id,
            "email": req.email,
            "full_name": req.name,
            "company_name": req.company,
            "role": "client",
            "is_approved": True
        }).execute()
        
        # 3. If project_id is provided, link them
        if req.project_id:
            admin_db.table("projects").update({"client_id": new_user_id}).eq("id", req.project_id).execute()
            
        # 4. Log activity
        admin_db.table("client_activity").insert({
            "action": f"Client {req.name} was invited",
            "project_id": req.project_id,
            "client_id": new_user_id
        }).execute()
        
        # 5. Notify the client via Supabase
        create_notifications([{
            "user_id": new_user_id,
            "title": "Welcome to ConstructFlow",
            "message": f"Welcome {req.name}! You have been invited to ConstructFlow. Your client account is ready.",
            "type": "general",
            "project_id": req.project_id,
            "sent_via": "in_app"
        }])

        return {
            "message": "Client invited successfully",
            "user_id": new_user_id,
            "email_delivery": email_result
        }
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

