from pydantic import BaseModel, Field
from typing import Optional
from datetime import date, datetime

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

class ProjectCreate(ProjectBase):
    site_managers: Optional[list[str]] = None
    workers: Optional[list[str]] = None
    suppliers: Optional[list[str]] = None
    admins: Optional[list[str]] = None

class ProjectUpdate(BaseModel):
    name: Optional[str] = None
    location: Optional[str] = None
    status: Optional[str] = None
    completion_percentage: Optional[int] = Field(default=None, ge=0, le=100)
    total_budget: Optional[float] = Field(default=None, ge=0, allow_inf_nan=False)
    spent_cost: Optional[float] = None
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    client_id: Optional[str] = None
    pm_id: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    address: Optional[str] = None
    site_managers: Optional[list[str]] = None
    workers: Optional[list[str]] = None
    suppliers: Optional[list[str]] = None
    admins: Optional[list[str]] = None

class ProjectResponse(ProjectBase):
    id: str
    created_at: datetime

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
