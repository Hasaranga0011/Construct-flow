from fastapi import APIRouter, HTTPException, Request, Depends
from core.database import get_auth_client
from core.security import require_manager_or_admin
from pydantic import BaseModel
from typing import Optional

router = APIRouter(
    prefix="/reports",
    tags=["Reports"], dependencies=[Depends(require_manager_or_admin)]
)

@router.get("/projects")
def get_project_reports(request: Request):
    supabase = get_auth_client(request)
    try:
        # Mock aggregation for now
        res = supabase.table("projects").select("id, status").execute()
        return {"total_projects": len(res.data), "data": res.data}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/materials")
def get_material_reports(request: Request):
    supabase = get_auth_client(request)
    try:
        res = supabase.table("materials").select("*").execute()
        return {"total_materials": len(res.data), "data": res.data}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/payroll")
def get_payroll_reports(request: Request):
    supabase = get_auth_client(request)
    try:
        res = supabase.table("salary_slips").select("*").execute()
        return {"total_slips": len(res.data), "data": res.data}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
