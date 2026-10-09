from core.notification_helper import create_notifications, create_notification
import os
import time
import uuid
import pathlib
from fastapi import APIRouter, HTTPException, UploadFile, File, Form, Depends
from core.security import get_current_user
from core.config import settings
from supabase import create_client

router = APIRouter(
    prefix="/media",
    tags=["Media Upload"]
)

ALLOWED_CONTENT_TYPES = {"image/jpeg", "image/png", "image/webp", "image/jpg"}
MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024  # 10 MB
STORAGE_BUCKET = "project-images"


def _get_storage_client():
    """Initialize Supabase client with service role key or fallback key."""
    url = settings.SUPABASE_URL
    key = settings.SUPABASE_SERVICE_ROLE_KEY or settings.SUPABASE_KEY
    if not url or not key:
        return None
    try:
        return create_client(url, key)
    except Exception as e:
        print(f"Error creating Supabase storage client: {e}")
        return None


def generate_cloudinary_signature(params: dict, api_secret: str) -> str:
    """Deprecated: Retained for backward compatibility with legacy tests."""
    import hashlib
    sorted_params = "&".join([f"{k}={v}" for k, v in sorted(params.items())])
    return hashlib.sha256((sorted_params + api_secret).encode()).hexdigest()


@router.post("/upload")
async def upload_site_photo(
    file: UploadFile = File(...),
    project_id: str = Form(...),
    site_id: str = Form(None),
    caption: str = Form(""),
    current_user: dict = Depends(get_current_user)
):
    """
    Upload a site photo directly to free Supabase Storage (with local disk fallback).
    Supports direct device uploads and live camera captures.
    """

    # ── File type validation ────────────────────────────────────────────────
    content_type = file.content_type or "image/jpeg"
    if content_type not in ALLOWED_CONTENT_TYPES:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Unsupported file type '{content_type}'. "
                "Only image/jpeg, image/png, and image/webp are allowed."
            )
        )

    # ── Read file and enforce size limit ────────────────────────────────────
    file_bytes = await file.read()
    if len(file_bytes) > MAX_FILE_SIZE_BYTES:
        raise HTTPException(
            status_code=400,
            detail=f"File too large. Maximum allowed size is 10 MB (received {len(file_bytes) // (1024*1024)} MB)."
        )

    # Determine file extension
    ext = "jpg"
    if "png" in content_type:
        ext = "png"
    elif "webp" in content_type:
        ext = "webp"
    elif file.filename and "." in file.filename:
        ext = file.filename.rsplit(".", 1)[-1].lower()

    timestamp = int(time.time())
    unique_suffix = uuid.uuid4().hex[:8]
    storage_path = f"site_uploads/{project_id}/{timestamp}_{unique_suffix}.{ext}"

    # ── 1. Upload to Supabase Storage (Free cloud tier) ─────────────────────
    supabase = _get_storage_client()
    if supabase:
        try:
            supabase.storage.from_(STORAGE_BUCKET).upload(
                path=storage_path,
                file=file_bytes,
                file_options={"content-type": content_type, "upsert": "true"}
            )
            public_url = supabase.storage.from_(STORAGE_BUCKET).get_public_url(storage_path)

            return {
                "url": public_url,
                "public_id": storage_path,
                "project_id": project_id,
                "site_id": site_id,
                "caption": caption,
                "storage_provider": "supabase"
            }
        except Exception as sb_err:
            print(f"Supabase storage upload error: {sb_err}. Falling back to local storage.")

    # ── 2. Local Storage Fallback (100% Free, Offline-ready) ─────────────────
    upload_dir = pathlib.Path("uploads") / "site_uploads" / str(project_id)
    upload_dir.mkdir(parents=True, exist_ok=True)
    local_filename = f"{timestamp}_{unique_suffix}.{ext}"
    local_file_path = upload_dir / local_filename
    with open(local_file_path, "wb") as f:
        f.write(file_bytes)

    local_url = f"/uploads/site_uploads/{project_id}/{local_filename}"
    return {
        "url": local_url,
        "public_id": f"local_{storage_path}",
        "project_id": project_id,
        "site_id": site_id,
        "caption": caption,
        "storage_provider": "local"
    }


@router.get("/health")
def media_health(current_user: dict = Depends(get_current_user)):
    """Check storage provider configuration status."""
    supabase = _get_storage_client()
    supabase_ok = False
    if supabase:
        try:
            buckets = supabase.storage.list_buckets()
            supabase_ok = any(b.name == STORAGE_BUCKET for b in buckets)
        except Exception:
            supabase_ok = False

    return {
        "storage_provider": "supabase",
        "bucket": STORAGE_BUCKET,
        "supabase_configured": bool(settings.SUPABASE_URL and (settings.SUPABASE_SERVICE_ROLE_KEY or settings.SUPABASE_KEY)),
        "bucket_accessible": supabase_ok,
        "status": "healthy"
    }
