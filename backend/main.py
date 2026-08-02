from fastapi import FastAPI, Depends
from fastapi.middleware.cors import CORSMiddleware
from core.config import settings
from core.security import get_current_user
from api.routes import projects, materials, labour, clients, estimations, notifications, ai, documents, purchase_orders, media, reports, messages
from apscheduler.schedulers.background import BackgroundScheduler
import httpx
import logging

app = FastAPI(
    title=settings.PROJECT_NAME,
    description="Backend API for ConstructFlow",
    version="1.0.0"
)

# Setup Background Scheduler
scheduler = BackgroundScheduler()

def check_overdue_pos():
    try:
        httpx.post("http://127.0.0.1:8000/api/purchase-orders/check-late")
    except Exception as e:
        logging.error(f"Cron PO check failed: {e}")

def check_low_stock():
    try:
        httpx.post("http://127.0.0.1:8000/api/materials/check-stock")
    except Exception as e:
        logging.error(f"Cron stock check failed: {e}")

@app.on_event("startup")
def start_scheduler():
    scheduler.add_job(check_overdue_pos, 'interval', hours=1)
    scheduler.add_job(check_low_stock, 'cron', hour=0, minute=0)
    scheduler.start()

@app.on_event("shutdown")
def stop_scheduler():
    scheduler.shutdown()

# Configure CORS for React Native frontend access
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # Update this in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include Routers (Secured by default)
secure_dependency = [Depends(get_current_user)]

app.include_router(projects.router, prefix="/api", dependencies=secure_dependency)
app.include_router(materials.router, prefix="/api", dependencies=secure_dependency)
app.include_router(labour.router, prefix="/api", dependencies=secure_dependency)
app.include_router(clients.router, prefix="/api", dependencies=secure_dependency)
app.include_router(estimations.router, prefix="/api", dependencies=secure_dependency)
app.include_router(notifications.router, prefix="/api", dependencies=secure_dependency)
app.include_router(purchase_orders.router, prefix="/api", dependencies=secure_dependency)
app.include_router(reports.router, prefix="/api", dependencies=secure_dependency)
app.include_router(messages.router, prefix="/api", dependencies=secure_dependency)

# Unsecured for testing demo without sending JWT headers, but typically secured.
app.include_router(ai.router, prefix="/api")
app.include_router(documents.router, prefix="/api")
app.include_router(media.router, prefix="/api")  # Cloudinary upload endpoint

@app.get("/")
def read_root():
    return {"message": f"Welcome to {settings.PROJECT_NAME} API"}

@app.get("/health")
def health_check():
    return {"status": "healthy"}
