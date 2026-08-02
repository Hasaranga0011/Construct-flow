from fastapi import APIRouter, HTTPException
from core.database import supabase
from pydantic import BaseModel
from typing import Optional

router = APIRouter(
    prefix="/reports",
    tags=["Reports"]
)

@router.get("/projects")
def get_project_reports():
    try:
        # Mock aggregation for now
        res = supabase.table("projects").select("id, status").execute()
        return {"total_projects": len(res.data), "data": res.data}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/materials")
def get_material_reports():
    try:
        res = supabase.table("materials").select("*").execute()
        return {"total_materials": len(res.data), "data": res.data}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/payroll")
def get_payroll_reports():
    try:
        res = supabase.table("salary_slips").select("*").execute()
        return {"total_slips": len(res.data), "data": res.data}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
