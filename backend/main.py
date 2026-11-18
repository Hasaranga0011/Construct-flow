import os
from fastapi import FastAPI, APIRouter, Depends, Request, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import JSONResponse
from core.config import settings
from core.database import get_service_client
from core.security import get_current_user, get_authenticated_identity
from api.routes import projects, materials, labour, clients, estimations, notifications, ai, documents, purchase_orders, media, reports, messages, site_reports, admin, auth
from apscheduler.schedulers.background import BackgroundScheduler
from supabase import create_client
import logging

app = FastAPI(
    title=settings.PROJECT_NAME,
    description="Backend API for ConstructFlow",
    version="1.0.0"
)
app.add_middleware(GZipMiddleware, minimum_size=1000)
from core.http_limits import RequestLimits
app.add_middleware(RequestLimits)

# Setup Background Scheduler
scheduler = BackgroundScheduler()

from datetime import datetime, timezone

def _log_job_run(client, job_name: str, func):
    # Insert started record
    try:
        res = client.table("job_runs").insert({
            "job_name": job_name,
            "status": "Running"
        }).execute()
        job_id = res.data[0]["id"]
    except Exception:
        job_id = None

    try:
        func(client)
        # Mark completed
        if job_id:
            client.table("job_runs").update({
                "status": "Success",
                "completed_at": datetime.now(timezone.utc).isoformat()
            }).eq("id", job_id).execute()
    except Exception as e:
        logging.error(f"Cron {job_name} failed: {e}")
        if job_id:
            client.table("job_runs").update({
                "status": "Failed",
                "error_message": str(e),
                "completed_at": datetime.now(timezone.utc).isoformat()
            }).eq("id", job_id).execute()

def check_overdue_pos():
    client = create_client(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_ROLE_KEY)
    _log_job_run(client, "check_overdue_pos", purchase_orders.check_late_orders)

def check_low_stock():
    client = create_client(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_ROLE_KEY)
    _log_job_run(client, "check_low_stock", materials.check_stock)

@app.on_event("startup")
def start_scheduler():
    # Enable in one designated process only; credentials stay on the server.
    if not settings.ENABLE_SCHEDULER:
        return
    if not settings.SUPABASE_SERVICE_ROLE_KEY:
        raise RuntimeError("ENABLE_SCHEDULER requires SUPABASE_SERVICE_ROLE_KEY")
    scheduler.add_job(check_overdue_pos, 'interval', hours=1)
    scheduler.add_job(check_low_stock, 'cron', hour=0, minute=0)
    scheduler.start()

@app.on_event("shutdown")
def stop_scheduler():
    if scheduler.running:
        scheduler.shutdown()

# Request Size Limit Middleware
MAX_REQUEST_SIZE_BYTES = 15 * 1024 * 1024  # 15 MB overall limit

@app.middleware("http")
async def limit_request_size(request: Request, call_next):
    content_length = request.headers.get("content-length")
    try:
        declared_size = int(content_length) if content_length else 0
        if declared_size < 0:
            raise ValueError
    except ValueError:
        return JSONResponse(status_code=400, content={"detail": "Invalid Content-Length"})
    if declared_size > MAX_REQUEST_SIZE_BYTES:
        return JSONResponse(
            status_code=413,
            content={"detail": "Request body too large. Maximum allowed size is 15 MB."}
        )
    return await call_next(request)

# CORS
# In development (ENVIRONMENT=development), allow all origins for convenience.
# In production, restrict to known frontend URLs only.
ENVIRONMENT = settings.ENVIRONMENT

if ENVIRONMENT == "development":
    allowed_origins = ["*"]
else:
    allowed_origins = [origin.strip() for origin in settings.CORS_ORIGINS.split(",") if origin.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Public Auth router (self-registration, login helpers)
app.include_router(auth.router, prefix="/api")

# Public stateless BOQ template, parser, geocoding, and AI comparison endpoints
app.add_api_route("/api/projects/boq-template", projects.get_boq_template, methods=["GET"], tags=["Projects"])
app.add_api_route("/api/projects/parse-boq", projects.parse_boq_endpoint, methods=["POST"], tags=["Projects"])
app.add_api_route("/api/projects/geocode", projects.geocode_location, methods=["GET"], tags=["Projects"])
app.add_api_route("/api/projects/reverse-geocode", projects.reverse_geocode, methods=["GET"], tags=["Projects"])
app.add_api_route("/api/ai/compare-boq", ai.compare_boq_with_ai, methods=["POST"], tags=["AI"])

# Routers
secure_dependency = [Depends(get_current_user)]

# Keep public routes out of the protected include, so the API contract and runtime agree.
public_endpoints = {projects.get_boq_template, projects.parse_boq_endpoint, projects.geocode_location,
                    projects.reverse_geocode, ai.compare_boq_with_ai}
protected_projects = APIRouter()
protected_projects.routes.extend(route for route in projects.router.routes if route.endpoint not in public_endpoints)
protected_ai = APIRouter()
protected_ai.routes.extend(route for route in ai.router.routes if route.endpoint not in public_endpoints)

# Secured routers
app.include_router(protected_projects,     prefix="/api", dependencies=secure_dependency)
app.include_router(materials.router,       prefix="/api", dependencies=secure_dependency)
app.include_router(labour.router,          prefix="/api", dependencies=secure_dependency)
app.include_router(clients.router,         prefix="/api", dependencies=secure_dependency)
app.include_router(estimations.router,     prefix="/api", dependencies=secure_dependency)
app.include_router(notifications.router,   prefix="/api", dependencies=secure_dependency)
app.include_router(purchase_orders.router, prefix="/api", dependencies=secure_dependency)
app.include_router(reports.router,         prefix="/api", dependencies=secure_dependency)
app.include_router(messages.router,        prefix="/api", dependencies=secure_dependency)
app.include_router(site_reports.router,    prefix="/api", dependencies=secure_dependency)
app.include_router(admin.router,           prefix="/api", dependencies=secure_dependency)
from api.routes import workflow, boq, maps
app.include_router(workflow.router, prefix="/api", dependencies=secure_dependency)
app.include_router(boq.router, prefix="/api", dependencies=secure_dependency)
app.include_router(maps.router, prefix="/api")

# Previously unsecured — now protected with auth dependency
app.include_router(protected_ai,     prefix="/api", dependencies=secure_dependency)
app.include_router(documents.router, prefix="/api", dependencies=secure_dependency)
app.include_router(media.router,     prefix="/api", dependencies=secure_dependency)

# Static uploads (Local fallback)
from fastapi.staticfiles import StaticFiles
os.makedirs("uploads", exist_ok=True)
app.mount("/uploads", StaticFiles(directory="uploads"), name="uploads")

# Health
@app.get("/")
def read_root():
    return {"message": f"Welcome to {settings.PROJECT_NAME} API"}

@app.get("/health")
def health_check():
    return {"status": "healthy"}

from pydantic import BaseModel, EmailStr, Field, field_validator
class PublicInquiry(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    email: EmailStr
    project_name: str = Field(default="", max_length=200)
    message: str = Field(min_length=10, max_length=5000)

    @field_validator("name", "message", mode="before")
    @classmethod
    def trim_text(cls, value):
        return value.strip() if isinstance(value, str) else value

@app.post("/api/public-inquiry")
def handle_public_inquiry(inquiry: PublicInquiry):
    if not settings.SUPABASE_SERVICE_ROLE_KEY:
        raise HTTPException(503, "Inquiry service is not configured")
    try:
        get_service_client().rpc("submit_public_inquiry", {"p_data": inquiry.model_dump(mode="json")}).execute()
    except Exception as exc:
        logging.error("Inquiry transaction failed: %s", type(exc).__name__)
        raise HTTPException(503, "Unable to save inquiry. Please try again.") from exc
    return {"success": True}

class GoogleRoleUpdate(BaseModel):
    role: str

@app.post("/api/auth/google-role")
def update_google_role(payload: GoogleRoleUpdate, current_user: dict = Depends(get_authenticated_identity)):
    allowed_roles = ['pm', 'site_manager', 'worker', 'client', 'supplier']
    if payload.role not in allowed_roles:
        raise HTTPException(status_code=422, detail="Invalid role")
        
    client = create_client(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_ROLE_KEY)
    
    # Only assign a role to brand-new accounts that have none yet. Existing
    # accounts (including workers) must never be re-roled by signing in through
    # another portal — the portal gate rejects them instead.
    res = client.table('profiles').select('role').eq('id', current_user['id']).single().execute()
    if res.data and res.data.get('role') in [None, '', 'pending']:
        client.table('profiles').update({'role': payload.role, 'is_approved': payload.role == 'client'}).eq('id', current_user['id']).execute()
        client.auth.admin.update_user_by_id(current_user['id'], {"user_metadata": {'role': payload.role}})
        
    return {"success": True}
