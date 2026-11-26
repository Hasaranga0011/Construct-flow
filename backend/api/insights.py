"""Compatibility endpoint: use the authoritative, scoped insights implementation."""
from fastapi import APIRouter, Depends
from core.security import get_current_user
from api.routes.ai import get_insights as project_insights

router = APIRouter()


@router.get('/')
def get_insights(user=Depends(get_current_user)):
    return project_insights(current_user=user)
