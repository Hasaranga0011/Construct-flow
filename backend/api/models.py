from core.notification_helper import create_notifications
from pydantic import BaseModel, Field, field_validator
from typing import Optional, Union, List, Dict
from datetime import date, datetime
import uuid

# --- Projects ---

class ProjectBase(BaseModel):
    name: str
    location: str
    status: str = "Planning"
    completion_percentage: int = Field(default=0, ge=0, le=100)
    total_budget: float = Field(default=0, ge=0, allow_inf_nan=False)
    spent_cost: float = 0.0
    start_date: date
    end_date: date
    client_id: Optional[str] = None
    pm_id: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    address: Optional[str] = None
    image_url: Optional[str] = None
    images: Optional[List[str]] = Field(default_factory=list)
    is_test: bool = False

class ProjectCreate(ProjectBase):
    site_managers: Optional[list[str]] = None
    workers: Optional[list[str]] = None
    suppliers: Optional[list[str]] = None
    admins: Optional[list[str]] = None
    milestones: Optional[list[dict]] = None

class ProjectUpdate(BaseModel):
    name: Optional[str] = None
    location: Optional[str] = None
    status: Optional[str] = None
    completion_percentage: Optional[int] = Field(default=None, ge=0, le=100)
    total_budget: Optional[float] = Field(default=None, ge=0, allow_inf_nan=False)
    budget: Optional[float] = Field(default=None, ge=0, allow_inf_nan=False)
    spent_cost: Optional[float] = None
    start_date: Optional[Union[date, str]] = None
    end_date: Optional[Union[date, str]] = None
    client_id: Optional[str] = None
    pm_id: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    address: Optional[str] = None
    description: Optional[str] = None
    image_url: Optional[str] = None
    images: Optional[List[str]] = None
    is_test: Optional[bool] = None
    site_managers: Optional[list[str]] = None
    workers: Optional[list[str]] = None
    suppliers: Optional[list[str]] = None
    admins: Optional[list[str]] = None

    model_config = {"extra": "ignore"}

    @field_validator("client_id", "pm_id", mode="before")
    @classmethod
    def clean_uuid(cls, v):
        if v is None:
            return None
        if isinstance(v, str):
            v_str = v.strip()
            if not v_str or v_str.lower() in ("null", "undefined", "none"):
                return None
            try:
                uuid.UUID(v_str)
            except (ValueError, AttributeError):
                raise ValueError(f"Invalid UUID: '{v_str}'")
            return v_str
        return v

    @field_validator("start_date", "end_date", mode="before")
    @classmethod
    def clean_date(cls, v):
        if v is None:
            return None
        if isinstance(v, str):
            v_str = v.strip()
            if not v_str or v_str.lower() in ("null", "undefined", "none"):
                return None
            # If formatted like DD/MM/YYYY, convert to YYYY-MM-DD
            parts = v_str.split('/')
            if len(parts) == 3 and len(parts[2]) == 4:
                return f"{parts[2]}-{parts[1].zfill(2)}-{parts[0].zfill(2)}"
            # If formatted like DD-MM-YYYY, convert to YYYY-MM-DD
            dash_parts = v_str.split('-')
            if len(dash_parts) == 3 and len(dash_parts[0]) <= 2 and len(dash_parts[2]) == 4:
                return f"{dash_parts[2]}-{dash_parts[1].zfill(2)}-{dash_parts[0].zfill(2)}"
            return v_str
        return v

class ProjectResponse(ProjectBase):
    id: str
    created_at: datetime
    # Stored rows may have nulls; don't fail the response after a successful save.
    location: Optional[str] = None
    status: Optional[str] = None
    completion_percentage: Optional[float] = None
    total_budget: Optional[float] = None
    spent_cost: Optional[float] = None
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    images: Optional[List[str]] = Field(default_factory=list)
    notifications_failed: Optional[bool] = False

    model_config = {"from_attributes": True}

# --- Materials ---

class MaterialBase(BaseModel):
    project_id: str
    name: str
    quantity: str
    stock_level: int = Field(ge=0, le=100)
    status: str

class MaterialCreate(MaterialBase):
    pass

class MaterialResponse(MaterialBase):
    id: str
    last_updated: datetime

    model_config = {"from_attributes": True}

# --- Labour ---

class LabourBase(BaseModel):
    project_id: str
    worker_name: str
    role: str
    status: str
    hours_worked: float = 0.0

class LabourCreate(LabourBase):
    pass

class LabourResponse(LabourBase):
    id: str
    check_in_time: Optional[datetime] = None
    date: date
    created_at: datetime

    model_config = {"from_attributes": True}

# --- Clients ---

class ClientBase(BaseModel):
    project_id: str
    name: str
    company_name: str
    access_level: str

class ClientCreate(ClientBase):
    pass

class ClientResponse(ClientBase):
    id: str
    created_at: datetime

    model_config = {"from_attributes": True}

# --- Estimations ---

class EstimationBase(BaseModel):
    project_name: str
    estimated_cost: float
    status: str
    confidence_score: Optional[int] = Field(None, ge=0, le=100)
    district: Optional[str] = None
    town: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    project_id: Optional[str] = None

class EstimationCreate(EstimationBase):
    pass

class EstimationResponse(EstimationBase):
    id: str
    created_at: datetime

    model_config = {"from_attributes": True}

# --- Notifications ---

class NotificationBase(BaseModel):
    project_id: Optional[str] = None
    title: str
    message: str
    type: str
    is_unread: bool = True

class NotificationCreate(NotificationBase):
    pass

class NotificationResponse(NotificationBase):
    id: str
    created_at: datetime

    model_config = {"from_attributes": True}

# --- Expenses ---

class ExpenseBase(BaseModel):
    project_id: str
    title: str
    description: Optional[str] = None
    amount: float = Field(..., ge=0)
    expense_date: Optional[date] = None

class ExpenseCreate(ExpenseBase):
    pass

class ExpenseResponse(ExpenseBase):
    id: str
    created_at: datetime

    model_config = {"from_attributes": True}
