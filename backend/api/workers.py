from core.notification_helper import create_notifications
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional
from core.supabase_client import supabase_db
from core.auth import get_current_user
import qrcode
from io import BytesIO
from core.config import settings

router = APIRouter()

class WorkerCreate(BaseModel):
    name: str
    nic: str
    trade: str
    daily_rate: float
    bank_account: Optional[str] = None
    site_id: Optional[str] = None
    assigned_project_id: Optional[str] = None


@router.post("/")
def create_worker(req: WorkerCreate, user=Depends(get_current_user)):
    try:
        data = req.dict(exclude_none=True)
        res = supabase_db.table("labour").insert(data).execute()
        if not res.data:
            raise HTTPException(status_code=400, detail="Failed to create worker")
            
        worker_id = res.data[0]["id"]
        
        # Generate QR internally
        try:
            qr_url = _generate_qr_url(worker_id)
            supabase_db.table("labour").update({"qr_url": qr_url}).eq("id", worker_id).execute()
            res.data[0]["qr_url"] = qr_url
        except Exception as qr_err:
            print(f"Warning: QR generation failed: {qr_err}")
            
        return {"message": "Worker created successfully", "data": res.data[0]}
    except Exception as e:
        print(f"Create worker error: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")

@router.post("/{worker_id}/qr")
def generate_worker_qr(worker_id: str, user=Depends(get_current_user)):
    try:
        qr_url = _generate_qr_url(worker_id)
        supabase_db.table("labour").update({"qr_url": qr_url}).eq("id", worker_id).execute()
        return {"message": "QR generated", "qr_url": qr_url}
    except Exception as e:
        print(f"Generate QR error: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")

@router.get("/")
def get_all_workers(user=Depends(get_current_user)):
    try:
        # Left join with projects
        res = supabase_db.table("labour").select("*, projects(name)").execute()
        return {"data": res.data}
    except Exception as e:
        print(f"Get all workers error: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")

@router.get("/{worker_id}")
def get_worker(worker_id: str, user=Depends(get_current_user)):
    try:
        res = supabase_db.table("labour").select("*").eq("id", worker_id).execute()
        if not res.data:
            raise HTTPException(status_code=404, detail="Worker not found")
        return {"data": res.data[0]}
    except HTTPException:
        raise
    except Exception as e:
        print(f"Get worker error: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")

def _generate_qr_url(worker_id: str) -> str:
    qr = qrcode.QRCode(version=1, box_size=10, border=4)
    qr.add_data(worker_id)
    qr.make(fit=True)
    img = qr.make_image(fill_color="black", back_color="white")
    
    img_byte_arr = BytesIO()
    img.save(img_byte_arr)
    data = img_byte_arr.getvalue()
    
    try:
        path = f"qr_codes/qr_{worker_id}.png"
        supabase_db.storage.from_("project-images").upload(
            path,
            data,
            {"content-type": "image/png", "upsert": "true"}
        )
        return supabase_db.storage.from_("project-images").get_public_url(path)
    except Exception as e:
        print(f"Supabase QR storage fallback: {e}")
        return f"https://api.qrserver.com/v1/create-qr-code/?size=150x150&data={worker_id}"

