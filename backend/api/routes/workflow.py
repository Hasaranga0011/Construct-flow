"""Reviewed workflow transitions. All mutations execute in database transactions."""
from datetime import date
from uuid import UUID
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field, HttpUrl
from core.database import client_for_token
from core.security import get_current_user, require_manager_or_admin

router = APIRouter(prefix="/workflow", tags=["Workflow approvals"])


@router.get("/cost-records")
def client_cost_records(current_user: dict = Depends(get_current_user)):
    if current_user["role"] != "client":
        raise HTTPException(403, "Client project access required")
    client = client_for_token(current_user["token"])
    projects = client.table("projects").select("id,name").eq("client_id",current_user["id"]).execute().data or []
    names = {row["id"]:row["name"] for row in projects}
    if not names:
        return []
    from core.database import get_service_client
    from api.routes.reports import _report_rows
    service = get_service_client()
    scope = {"project_id":list(names)}
    orders = _report_rows(service,"purchase_orders","id,project_id,po_number,total_price,status,quantity_ordered,quantity_received,received_at,delivered_at",scope)
    expenses = _report_rows(service,"project_expenses","id,project_id,title,amount,expense_date",scope)
    rows=[]
    for row in orders:
        if row.get("status") not in {"Delivered","Received"}:
            continue
        accepted = float(row.get("quantity_received") or 0)
        ordered = float(row.get("quantity_ordered") or 0)
        fraction = 1 if row.get("status")=="Received" else min(1,accepted/ordered) if ordered>0 else 0
        if fraction<=0:
            continue
        rows.append({"id":row["id"],"title":row.get("po_number") or "Goods received","projectName":names[row["project_id"]],"amount":round(float(row.get("total_price") or 0)*fraction,2),"date":row.get("received_at") or row.get("delivered_at"),"source":"Purchase order"})
    rows.extend({"id":row["id"],"title":row.get("title") or "Project expense","projectName":names[row["project_id"]],"amount":row["amount"],"date":row.get("expense_date"),"source":"Expense"} for row in expenses)
    return sorted(rows,key=lambda row:row.get("date") or "",reverse=True)


class CommercialCreate(BaseModel):
    boq_item_id: Optional[UUID] = None
    kind: str = Field(pattern="^(payment|variation)$")
    description: str = Field(min_length=3, max_length=2000)
    title: Optional[str] = Field(default=None, min_length=3, max_length=200)
    amount: float = Field(gt=0, allow_inf_nan=False)
    due_date: Optional[date] = None


@router.get("/projects/{project_id}/commercial")
def commercial_records(project_id: str, current_user: dict = Depends(get_current_user)):
    from core.access import require_project_member
    client = client_for_token(current_user["token"])
    require_project_member(client, project_id, current_user)
    if current_user["role"] not in {"super_admin", "pm", "client"}:
        raise HTTPException(403, "Project financial access required")
    try:
        return {
            "payments": client.table("client_payment_schedule").select("*").eq("project_id", project_id).order("due_date").limit(500).execute().data or [],
            "variations": client.table("variation_orders").select("*").eq("project_id", project_id).order("created_at", desc=True).limit(500).execute().data or [],
        }
    except Exception as exc:
        raise HTTPException(503, "Unable to load project payments and variations") from exc


@router.post("/projects/{project_id}/commercial")
def create_commercial_record(project_id: str, payload: CommercialCreate, current_user: dict = Depends(require_manager_or_admin)):
    if not payload.description.strip() or (payload.kind == "payment" and not payload.due_date) or (payload.kind == "variation" and not (payload.title or "").strip()):
        raise HTTPException(422, "Complete the description, amount and required date or title")
    return transition(client_for_token(current_user["token"]), "create_project_commercial_record", {
        "p_project_id": project_id, "p_kind": payload.kind, "p_data": payload.model_dump(mode="json", exclude_none=True),
    })


class ProjectDocument(BaseModel):
    name: str = Field(min_length=2, max_length=200)
    category: str = Field(default="General", min_length=1, max_length=80)
    url: HttpUrl


@router.get("/projects/{project_id}/documents")
def project_documents(project_id: str, current_user: dict = Depends(get_current_user)):
    from core.access import require_project_member
    client = client_for_token(current_user["token"])
    require_project_member(client, project_id, current_user)
    return client.table("shared_documents").select("*").eq("project_id", project_id).order("created_at", desc=True).limit(500).execute().data or []


@router.post("/projects/{project_id}/documents")
def attach_document(project_id: str, payload: ProjectDocument, current_user: dict = Depends(require_manager_or_admin)):
    if payload.url.scheme != "https":
        raise HTTPException(422, "Use a secure HTTPS document URL")
    return transition(client_for_token(current_user["token"]), "attach_project_document", {
        "p_project_id": project_id, "p_data": payload.model_dump(mode="json"),
    })


def transition(client, name, arguments):
    try:
        return client.rpc(name, arguments).execute().data
    except Exception as exc:
        code = str(getattr(exc, "code", ""))
        status = {"42501": 403, "P0002": 404, "P0001": 409, "23505": 409, "23514": 422}.get(code, 503)
        detail = str(getattr(exc, "message", None) or exc) if code in {"P0001", "23514"} else "Workflow transition failed; verify permissions and database migrations"
        raise HTTPException(status_code=status, detail=detail) from exc


@router.get("/material-requests")
def material_requests(current_user: dict = Depends(require_manager_or_admin), offset: int = Query(0, ge=0), project_id: Optional[str] = None):
    client = client_for_token(current_user["token"])
    projects = client.table("projects").select("id,name")
    if current_user["role"] == "pm":
        projects = projects.eq("pm_id", current_user["id"])
    if project_id:
        projects = projects.eq("id", project_id)
    rows = projects.execute().data or []
    ids = [row["id"] for row in rows]
    if not ids:
        return {"requests": [], "suppliers": [], "projects": []}
    requests = client.table("material_requests").select("*").in_("project_id", ids).order("created_at", desc=True).range(offset, offset + 99).execute().data or []
    boq_ids = list({row['boq_item_id'] for row in requests if row.get('boq_item_id')})
    if boq_ids:
        rates = client.table('project_boq_lines').select('id,project_id,rate').in_('project_id',ids).in_('id',boq_ids).execute().data or []
        price_by_item = {(row['project_id'],row['id']):row['rate'] for row in rates}
        requests = [{**row,'boq_rate':price_by_item.get((row['project_id'],row.get('boq_item_id')))} for row in requests]
    assignments = client.table("project_role_assignments").select("project_id,user_id").in_("project_id", ids).eq("role", "supplier").execute().data or []
    supplier_ids = list({row["user_id"] for row in assignments})
    suppliers = client.table("profiles").select("id,full_name").in_("id", supplier_ids).eq("is_approved", True).execute().data if supplier_ids else []
    choices = [{**supplier, "project_id": row["project_id"]} for row in assignments for supplier in suppliers or [] if row["user_id"] == supplier["id"]]
    return {"requests": requests, "suppliers": choices, "projects": rows}


class RequestReview(BaseModel):
    approve: bool
    supplier_id: Optional[str] = None
    unit_price: float = Field(default=0, ge=0, allow_inf_nan=False)
    expected_date: Optional[date] = None


@router.post("/material-requests/{request_id}/review")
def review_request(request_id: str, payload: RequestReview, current_user: dict = Depends(require_manager_or_admin)):
    if payload.approve and (not payload.supplier_id or not payload.expected_date):
        raise HTTPException(status_code=422, detail="Supplier and expected date are required")
    return transition(client_for_token(current_user["token"]), "review_material_request", {
        "p_request_id": request_id, "p_approve": payload.approve,
        "p_supplier_id": payload.supplier_id, "p_unit_price": payload.unit_price,
        "p_expected_date": payload.expected_date.isoformat() if payload.expected_date else None,
    })


class AttendanceReview(BaseModel):
    project_id: str
    start_date: date
    end_date: date


@router.get("/attendance")
def attendance_for_review(project_id: str, start_date: date, end_date: date, current_user: dict = Depends(require_manager_or_admin)):
    from core.access import require_project_member
    client = client_for_token(current_user["token"])
    require_project_member(client, project_id, current_user)
    if end_date < start_date:
        raise HTTPException(status_code=422, detail="Invalid date range")
    sites = client.table("sites").select("id").eq("project_id", project_id).execute().data or []
    ids = [row["id"] for row in sites]
    if not ids:
        return []
    rows = client.table("attendance").select("*").in_("site_id", ids).gte("date", start_date.isoformat()).lte("date", end_date.isoformat()).order("date").limit(1001).execute().data or []
    if len(rows) > 1000:
        raise HTTPException(status_code=422, detail="Choose a shorter review period (up to 1000 records)")
    worker_ids = list({row["worker_id"] for row in rows})
    workers = client.table("workers").select("id,user_id").in_("id", worker_ids).execute().data or [] if worker_ids else []
    profile_ids = [row["user_id"] for row in workers if row.get("user_id")]
    profiles = client.table("profiles").select("id,full_name").in_("id", profile_ids).execute().data or [] if profile_ids else []
    names = {row["id"]: row["full_name"] for row in profiles}
    mapping = {row["id"]: names.get(row.get("user_id"), row["id"]) for row in workers}
    return [{**row, "worker_name": mapping.get(row["worker_id"], row["worker_id"])} for row in rows]


@router.post("/attendance/review")
def review_attendance(payload: AttendanceReview, current_user: dict = Depends(require_manager_or_admin)):
    if payload.end_date < payload.start_date or payload.end_date > date.today():
        raise HTTPException(status_code=422, detail="Choose a completed attendance period")
    return transition(client_for_token(current_user["token"]), "review_attendance_period", {
        "p_project_id": payload.project_id, "p_start": payload.start_date.isoformat(), "p_end": payload.end_date.isoformat(),
    })


class PaymentReview(BaseModel):
    amount: float = Field(gt=0, allow_inf_nan=False)
    evidence: str = Field(min_length=10, max_length=2000)


@router.get("/payments")
def payments(project_id: str, current_user: dict = Depends(require_manager_or_admin)):
    from core.access import require_project_member
    client = client_for_token(current_user["token"])
    require_project_member(client, project_id, current_user)
    return client.table("client_payment_schedule").select("*").eq("project_id", project_id).order("due_date").limit(200).execute().data or []


@router.post("/payments/{payment_id}/verify")
def verify_payment(payment_id: str, payload: PaymentReview, current_user: dict = Depends(require_manager_or_admin)):
    return transition(client_for_token(current_user["token"]), "verify_project_payment", {
        "p_id": payment_id, "p_amount": payload.amount, "p_evidence": payload.evidence,
    })
