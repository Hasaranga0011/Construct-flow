"""
Deprecated: Cloudinary has been replaced with free Supabase Storage (bucket: project-images)
Forwarding calls to storage_service.py.
"""
from services.storage_service import upload_file, upload_from_url
