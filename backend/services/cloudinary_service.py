import cloudinary
import cloudinary.uploader
from core.config import settings

if settings.CLOUDINARY_CLOUD_NAME:
    cloudinary.config(
        cloud_name=settings.CLOUDINARY_CLOUD_NAME,
        api_key=settings.CLOUDINARY_API_KEY,
        api_secret=settings.CLOUDINARY_API_SECRET
    )

def upload_file(file_bytes, folder: str, filename: str) -> str:
    if not settings.CLOUDINARY_CLOUD_NAME:
        print("Warning: Cloudinary not configured. Returning mock URL.")
        return f"https://mockurl.com/{folder}/{filename}"
        
    try:
        upload_res = cloudinary.uploader.upload(
            file_bytes, 
            folder=folder,
            public_id=filename
        )
        return upload_res.get("secure_url")
    except Exception as e:
        print(f"Cloudinary upload error: {e}")
        raise e

def upload_from_url(url: str, folder: str) -> str:
    if not settings.CLOUDINARY_CLOUD_NAME:
        return url
        
    try:
        upload_res = cloudinary.uploader.upload(
            url, 
            folder=folder
        )
        return upload_res.get("secure_url")
    except Exception as e:
        print(f"Cloudinary upload from URL error: {e}")
        raise e
