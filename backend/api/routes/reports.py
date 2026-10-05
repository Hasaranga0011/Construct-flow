from fastapi import APIRouter, HTTPException, Request, Depends
from core.database import get_auth_client
from core.security import require_manager_or_admin
from pydantic import BaseModel
from typing import Optional
from datetime import datetime, timezone

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
        return {"total": len(res.data), "data": res.data}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/materials")
def get_material_reports(request: Request):
    supabase = get_auth_client(request)
    try:
        res = supabase.table("materials").select("*").execute()
        return {"total": len(res.data), "data": res.data}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/payroll")
def get_payroll_reports(request: Request):
    supabase = get_auth_client(request)
    try:
        res = supabase.table("salary_slips").select("*").execute()
        return {"total": len(res.data), "data": res.data}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


def _report_rows(client, table, columns="*"):
    """Read all visible rows; Supabase's default response limit is not a total."""
    rows = []
    page_size = 500
    while True:
        page = (client.table(table).select(columns).order("id")
                .range(len(rows), len(rows) + page_size - 1).execute()).data or []
        rows.extend(page)
        if len(page) < page_size:
            return rows


@router.get("/management")
def get_management_report(request: Request):
    client = get_auth_client(request)
    try:
        # Each query retains the caller's RLS scope; no service-role reads.
        result = {
            "projects": _report_rows(client, "projects"),
            "materials": _report_rows(client, "materials"),
            "orders": _report_rows(client, "purchase_orders"),
            "payroll": _report_rows(client, "salary_slips"),
            "people": _report_rows(client, "profiles", "id, full_name"),
        }
        result["generated_at"] = datetime.now(timezone.utc).isoformat()
        return result
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail="Unable to load management reports. Please retry.") from exc
