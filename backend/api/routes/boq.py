"""Project BOQ register and optimistic, audited baseline revisions."""
from typing import Any
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from core.security import get_current_user, require_manager_or_admin
from core.database import client_for_token
from core.access import require_project_member
from core.project_boq import normalize_boq
from api.routes.workflow import transition

router = APIRouter(prefix="/boq", tags=["Project BOQ"])


class BoqRevision(BaseModel):
    boq_data: dict[str, Any]
    expected_revision: int = Field(ge=0)
    reason: str = Field(min_length=5, max_length=2000)


class BoqAllocation(BaseModel):
    table: str = Field(pattern='^(material_requests|purchase_orders|project_expenses|client_payment_schedule|variation_orders)$')
    record_id: UUID
    boq_item_id: UUID


@router.post('/{project_id}/allocate')
def allocate_record(project_id: UUID, payload: BoqAllocation, user: dict = Depends(require_manager_or_admin)):
    transition(client_for_token(user['token']), 'allocate_boq_record', {
        'p_project_id': str(project_id), 'p_table': payload.table,
        'p_record_id': str(payload.record_id), 'p_boq_item_id': str(payload.boq_item_id),
    })
    return {'ok': True}


@router.get("/{project_id}")
def project_boq(project_id: UUID, user: dict = Depends(get_current_user)):
    if user["role"] not in {"super_admin", "pm", "client", "site_manager"}:
        raise HTTPException(403, "BOQ planning access required")
    client = client_for_token(user["token"])
    require_project_member(client, str(project_id), user)
    return transition(client, "get_project_boq", {"p_project_id": str(project_id)})


@router.put("/{project_id}")
def revise_boq(project_id: UUID, payload: BoqRevision, user: dict = Depends(require_manager_or_admin)):
    if not payload.reason.strip():
        raise HTTPException(422, "Explain the BOQ revision")
    try:
        boq = normalize_boq(payload.boq_data)
    except (ValueError, KeyError, TypeError) as exc:
        raise HTTPException(422, str(exc)) from exc
    return transition(client_for_token(user["token"]), "revise_project_boq", {
        "p_project_id": str(project_id), "p_boq": boq,
        "p_expected_revision": payload.expected_revision, "p_reason": payload.reason.strip(),
    })
