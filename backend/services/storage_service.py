import os
import uuid
import time
from core.config import settings
from supabase import create_client

def _get_client():
    url = settings.SUPABASE_URL
    key = settings.SUPABASE_SERVICE_ROLE_KEY or settings.SUPABASE_KEY
    if not url or not key:
        return None
    try:
        return create_client(url, key)
    except Exception as e:
        print(f"Supabase client initialization error: {e}")
        return None

def upload_file(file_bytes, folder: str = "site_uploads", filename: str = None) -> str:
    """
    Upload file bytes directly to free Supabase Storage (bucket: project-images).
    Falls back to local file storage if Supabase is unavailable.
    """
    if not filename:
        filename = f"{int(time.time())}_{uuid.uuid4().hex[:8]}.jpg"
        
    clean_folder = folder.strip("/")
    path = f"{clean_folder}/{filename}"
    client = _get_client()
    
    if client:
        try:
            client.storage.from_("project-images").upload(
                path,
                file_bytes,
                {"upsert": "true"}
            )
            return client.storage.from_("project-images").get_public_url(path)
        except Exception as e:
            print(f"Supabase Storage upload error: {e}. Falling back to local storage.")

    # Local fallback
    upload_dir = os.path.join("uploads", clean_folder)
    os.makedirs(upload_dir, exist_ok=True)
    file_path = os.path.join(upload_dir, filename)
    with open(file_path, "wb") as f:
        f.write(file_bytes)
    return f"/uploads/{clean_folder}/{filename}"

def upload_from_url(url: str, folder: str = "site_uploads") -> str:
    """Return URL directly or download & store."""
    return url
