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

from pydantic import BaseModel, EmailStr, Field

class InviteClientRequest(BaseModel):
    email: EmailStr
    name: str = Field(min_length=1, max_length=200)
    company: str
    access_level: str
    project_id: str

@router.post("/invite", dependencies=[Depends(require_admin)])
def invite_client(req: InviteClientRequest, request: Request):
    try:
        # We need an auth client to ensure the person inviting is authenticated
        admin_client = get_auth_client(request)

        target_role = "supplier" if req.access_level.strip().lower() == "supplier" else "client"
        if target_role == "client" and not req.project_id:
            raise HTTPException(status_code=422, detail="A project is required for client invitations")
        if req.project_id:
            project = admin_client.table("projects").select("id").eq("id", req.project_id).execute()
            if not project.data:
                raise HTTPException(status_code=404, detail="Project not found")
        existing = admin_client.table("profiles").select("id,role").ilike("email", req.email.strip()).execute()
        if existing.data:
            raise HTTPException(status_code=409, detail="This account already exists. Use user management and project assignments instead.")

        # 1. Invite client natively via Supabase Auth
        admin_db = new_supabase_client(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_ROLE_KEY)
        new_user_id = None
        email_result = None

        try:
            invite_res = admin_db.auth.admin.invite_user_by_email(
                req.email,
                options={
                    "data": {"full_name": req.name, "company": req.company, "role": target_role},
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
                raise HTTPException(status_code=409, detail="This account already exists. Use user management instead.") from invite_err

            if not new_user_id:
                temp_password = secrets.token_urlsafe(24)
                auth_res = admin_db.auth.admin.create_user({
                    "email": req.email,
                    "password": temp_password,
                    "email_confirm": True,
                    "app_metadata": {"role": target_role},
                    "user_metadata": {"full_name": req.name, "company": req.company, "role": target_role}
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
            "role": target_role,
            "is_approved": target_role != "supplier"
        }).execute()

        # 3. If project_id is provided, link them
        if req.project_id and target_role == "client":
            admin_client.rpc("save_project_with_assignments", {
                "p_project_id": req.project_id,
                "p_data": {"client_id": new_user_id}
            }).execute()

        # 4. Log activity
        if target_role == "client":
            admin_db.table("client_activity").insert({
                "action": f"Client {req.name} was invited",
                "project_id": req.project_id,
                "client_id": new_user_id
            }).execute()

        # 5. Notify the client via Supabase
        create_notifications([{
            "user_id": new_user_id,
            "title": "Welcome to ConstructFlow",
            "message": f"Welcome {req.name}! Your {target_role} account has been created." + (" Administrator approval is required before access." if target_role == "supplier" else ""),
            "type": "general",
            "project_id": req.project_id,
            "sent_via": "in_app"
        }], workflow=True)

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

