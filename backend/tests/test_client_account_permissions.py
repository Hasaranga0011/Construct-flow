from fastapi import FastAPI
from fastapi.testclient import TestClient
import pytest
from api.routes.clients import router
from core.security import get_current_user

@pytest.mark.parametrize("method", ["put", "delete"])
def test_pm_cannot_mutate_client_accounts(method):
    app = FastAPI()
    app.include_router(router)
    app.dependency_overrides[get_current_user] = lambda: {"id": "pm-1", "role": "pm"}
    response = getattr(TestClient(app), method)("/clients/client-1", **({"json": {"name": "Changed"}} if method == "put" else {}))
    assert response.status_code == 403
