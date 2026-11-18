from fastapi import APIRouter, HTTPException, Request, Depends
from typing import List, Optional
from pydantic import BaseModel, Field
from ..models import EstimationCreate, EstimationResponse
from core.notification_helper import create_notifications, create_notification
from core.database import get_auth_client
from core.security import get_current_user, require_manager_or_admin
from core.database import client_for_token
from typing import Literal

router = APIRouter(
    prefix="/estimations",
    tags=["Estimations"]
)

from data_pipeline.model_engine import predict_cost_hybrid
from services.historical_data_service import DISTRICTS_LOWER

class PredictRequest(BaseModel):
    project_name: str
    square_footage: float = Field(gt=0, le=500000, allow_inf_nan=False)
    num_floors: int = Field(gt=0, le=200)
    material_quality: str
    location_index: float = Field(gt=0, allow_inf_nan=False)
    district: Optional[str] = None
    project_type: Optional[str] = "Residential House"

import json


class EstimationReview(BaseModel):
    status: Literal['Approved', 'Rejected']


@router.patch('/{estimation_id}/review')
def review_estimation(estimation_id: str, payload: EstimationReview,
                      current_user: dict = Depends(require_manager_or_admin)):
    client = client_for_token(current_user['token'])
    rows = client.table('estimations').select('*').eq('id', estimation_id).execute().data or []
    if not rows:
        raise HTTPException(404, 'Estimate not found')
    estimate = rows[0]
    if current_user['role'] != 'super_admin':
        if estimate.get('project_id'):
            from .projects import authorized_project_client
            authorized_project_client(estimate['project_id'], current_user, write=True)
        elif estimate.get('created_by') != current_user['id']:
            raise HTTPException(403, 'This estimate is not assigned to you')
    if estimate.get('status') != 'Pending':
        raise HTTPException(409, 'This estimate has already been reviewed. Refresh the list.')
    updated = client.table('estimations').update({'status': payload.status}).eq('id', estimation_id).eq('status', 'Pending').execute().data
    if not updated:
        raise HTTPException(409, 'The estimate changed during review. Refresh the list.')
    return updated[0]

@router.get("/", response_model=List[EstimationResponse])
def get_estimations(request: Request, district: Optional[str] = None, current_user: dict = Depends(get_current_user)):
    if current_user['role'] not in {'super_admin', 'pm', 'client'}:
        raise HTTPException(403, 'Not enough privileges')
    supabase = get_auth_client(request)
    try:
        response = supabase.table("estimations").select("*").order("created_at", desc=True).execute()
        rows = response.data or []
        parsed_results = []
        for r in rows:
            # Extract district/town if stored in columns or inside project_name JSON
            row_district = r.get("district")
            row_town = r.get("town")
            row_lat = r.get("latitude")
            row_lng = r.get("longitude")
            row_proj_id = r.get("project_id")

            pname = r.get("project_name", "")
            if (not row_district or not row_town) and pname.startswith("{"):
                try:
                    payload = json.loads(pname)
                    if not row_district:
                        row_district = payload.get("district") or payload.get("inputs", {}).get("district") or payload.get("inputs", {}).get("location")
                    if not row_town:
                        row_town = payload.get("town") or payload.get("inputs", {}).get("town")
                    if row_lat is None:
                        row_lat = payload.get("latitude")
                    if row_lng is None:
                        row_lng = payload.get("longitude")
                    if not row_proj_id:
                        row_proj_id = payload.get("project_id")
                except Exception:
                    pass

            r["district"] = row_district
            r["town"] = row_town
            r["latitude"] = row_lat
            r["longitude"] = row_lng
            r["project_id"] = row_proj_id

            if district:
                if (row_district or "").strip().lower() != district.strip().lower():
                    continue

            parsed_results.append(r)

        return parsed_results
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/", response_model=EstimationResponse)
def create_estimation(estimation: EstimationCreate, request: Request, current_user: dict = Depends(get_current_user)):
    if current_user['role'] not in {'super_admin', 'pm', 'client'}:
        raise HTTPException(403, 'Not enough privileges')
    if estimation.status != 'Pending':
        raise HTTPException(422, 'New estimates must be pending review')
    if estimation.project_id:
        from .projects import authorized_project_client
        authorized_project_client(estimation.project_id, current_user, write=False)
    elif current_user['role'] == 'client':
        raise HTTPException(422, 'Select one of your assigned projects')
    supabase = get_auth_client(request)
    try:
        dumped = estimation.model_dump()
        dumped['created_by'] = current_user['id']
        response = supabase.table("estimations").insert(dumped).execute()

        if not response.data:
            raise HTTPException(status_code=400, detail="Failed to create estimation")

        created = response.data[0]
        created["district"] = estimation.district
        created["town"] = estimation.town
        created["latitude"] = estimation.latitude
        created["longitude"] = estimation.longitude
        created["project_id"] = estimation.project_id
        return created
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/predict", dependencies=[Depends(require_manager_or_admin)])
def predict_cost(req: PredictRequest, request: Request):
    try:
        # Use the real hybrid ML model engine instead of hardcoded dummy arrays
        target_district = "Colombo"
        if req.district:
            target_district = DISTRICTS_LOWER.get(req.district.strip().lower(), "Colombo")

        hybrid_result = predict_cost_hybrid(
            floor_area_sqft=req.square_footage,
            num_floors=req.num_floors,
            district=target_district,
            project_type=req.project_type or "Residential House",
            quality_tier=req.material_quality,
        )

        final_cost = float(hybrid_result["estimated_cost_lkr"])

        # Save to DB
        estimation_data = {
            "project_name": req.project_name,
            "estimated_cost": final_cost,
            "status": "Pending",
            "confidence_score": None
        }

        from core.notification_helper import create_notifications, create_notification
        from core.database import get_auth_client
        auth_client = get_auth_client(request)
        db_response = auth_client.table("estimations").insert(estimation_data).execute()

        if not db_response.data:
            raise HTTPException(status_code=400, detail="Failed to save prediction to DB")

        return db_response.data[0]

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
