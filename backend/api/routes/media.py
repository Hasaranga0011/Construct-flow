import os
import hashlib
import time
from fastapi import APIRouter, HTTPException, UploadFile, File, Form, Depends
from core.security import get_current_user
import httpx
from dotenv import load_dotenv

load_dotenv()

router = APIRouter(
    prefix="/media",
    tags=["Media Upload"]
)

CLOUDINARY_CLOUD_NAME = os.getenv("CLOUDINARY_CLOUD_NAME", "")
CLOUDINARY_API_KEY = os.getenv("CLOUDINARY_API_KEY", "")
CLOUDINARY_API_SECRET = os.getenv("CLOUDINARY_API_SECRET", "")

# Allowed MIME types and maximum file size
ALLOWED_CONTENT_TYPES = {"image/jpeg", "image/png", "image/webp"}
MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024  # 10 MB


def generate_cloudinary_signature(params: dict, api_secret: str) -> str:
    """Generate Cloudinary upload signature."""
    sorted_params = "&".join([f"{k}={v}" for k, v in sorted(params.items())])
    signature_str = sorted_params + api_secret
    return hashlib.sha256(signature_str.encode()).hexdigest()


@router.post("/upload")
async def upload_site_photo(
    file: UploadFile = File(...),
    project_id: str = Form(...),
    site_id: str = Form(None),
    caption: str = Form(""),
    current_user: dict = Depends(get_current_user)
):
    """Upload a site photo to Cloudinary and return the secure URL."""

    # ── File type validation ────────────────────────────────────────────────
    if file.content_type not in ALLOWED_CONTENT_TYPES:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Unsupported file type '{file.content_type}'. "
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

    # ── Cloudinary credentials check ────────────────────────────────────────
    if not CLOUDINARY_CLOUD_NAME or not CLOUDINARY_API_KEY:
        raise HTTPException(
            status_code=503,
            detail=(
                "Cloudinary credentials not configured. "
                "Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET in backend .env"
            )
        )

    try:
        timestamp = int(time.time())
        folder = f"constructflow/projects/{project_id}"

        params = {
            "folder": folder,
            "timestamp": timestamp,
        }
        signature = generate_cloudinary_signature(params, CLOUDINARY_API_SECRET)

        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"https://api.cloudinary.com/v1_1/{CLOUDINARY_CLOUD_NAME}/image/upload",
                data={
                    "api_key": CLOUDINARY_API_KEY,
                    "timestamp": timestamp,
                    "folder": folder,
                    "signature": signature,
                    "context": f"caption={caption}|project_id={project_id}",
                },
                files={"file": (file.filename, file_bytes, file.content_type)},
                timeout=30.0
            )

        if response.status_code != 200:
            raise HTTPException(
                status_code=500,
                detail=f"Cloudinary upload failed: {response.text}"
            )

        result = response.json()

        return {
            "url": result.get("secure_url"),
            "public_id": result.get("public_id"),
            "project_id": project_id,
            "site_id": site_id,
            "caption": caption,
            "width": result.get("width"),
            "height": result.get("height"),
        }

    except HTTPException:
        raise
    except httpx.TimeoutException:
        raise HTTPException(status_code=504, detail="Cloudinary upload timed out.")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/health")
def media_health(current_user: dict = Depends(get_current_user)):
    """Check if Cloudinary credentials are configured."""
    configured = bool(CLOUDINARY_CLOUD_NAME and CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET)
    return {
        "cloudinary_configured": configured,
        "cloud_name": CLOUDINARY_CLOUD_NAME if configured else "NOT SET"
    }
