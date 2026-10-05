import sys
import uuid
from dotenv import load_dotenv
load_dotenv('.env')

sys.path.append('d:/PROJECTS/Construct-flow/backend')
from core.database import client_for_token
from core.config import settings

client = client_for_token(settings.SUPABASE_SERVICE_ROLE_KEY)

# 1. Setup Test Data
print("Fetching test data...")
projects = client.table("projects").select("id, pm_id").limit(1).execute()
project = projects.data[0]
project_id = project["id"]

suppliers = client.table("profiles").select("id, full_name").eq("role", "supplier").limit(1).execute()
supplier = suppliers.data[0]
supplier_id = supplier["id"]
supplier_name = supplier["full_name"]

# 2. Create Order
print("Creating order...")
from api.routes.purchase_orders import PurchaseOrderCreate
# Just hit the DB or use FastAPI test client.
# Let's hit the DB to simulate frontend insert, since the frontend inserts directly via supabase!
po_number = f"PO-{str(uuid.uuid4())[:8].upper()}"

order_data = {
    "project_id": project_id,
    "supplier_id": supplier_id,
    "supplier_name": supplier_name,
    "quantity_ordered": 100,
    "unit_price": 0,
    "total_price": 0,
    "po_number": po_number,
    "items": "100 Units of Test Material",
    "expected_date": "2026-12-31",
    "status": "Pending Delivery"
}
# Simulate frontend: Frontend might send string material name if no material selected
# Wait, frontend creates the material first if it doesn't exist, then sends the material_id!
mat_res = client.table("materials").insert({"name": "Integration Test Material", "project_id": project_id}).execute()
material_id = mat_res.data[0]["id"]
order_data["material_id"] = material_id

po_res = client.table("purchase_orders").insert([order_data]).execute()
po_id = po_res.data[0]["id"]
print(f"Created PO {po_number} with ID {po_id}")

# 3. Simulate backend Approve (Since it uses an endpoint)
import requests
API_URL = "http://localhost:8000/api"

# We need a token for an admin or the supplier to call the endpoint.
# Alternatively, since we are doing an end-to-end test, we can just call the python functions directly!
from fastapi.testclient import TestClient
from main import app
test_client = TestClient(app)

# We need auth override for dependencies
from core.security import get_current_user, require_manager_or_admin
app.dependency_overrides[get_current_user] = lambda: {"id": supplier_id, "role": "supplier", "token": settings.SUPABASE_SERVICE_ROLE_KEY}
app.dependency_overrides[require_manager_or_admin] = lambda: {"id": project["pm_id"], "role": "pm", "token": settings.SUPABASE_SERVICE_ROLE_KEY}

print("Supplier Approving...")
app.dependency_overrides[get_current_user] = lambda: {"id": supplier_id, "role": "supplier", "token": settings.SUPABASE_SERVICE_ROLE_KEY}
resp = test_client.patch(f"/api/purchase-orders/{po_id}/approve", json={"unit_price": 15.5})
if resp.status_code != 200:
    print("Approve Failed:", resp.json())
else:
    print("Approve Succeeded")

print("Supplier Marking Delivered...")
resp = test_client.patch(f"/api/purchase-orders/{po_id}/deliver")
if resp.status_code != 200:
    print("Deliver Failed:", resp.json())
else:
    print("Deliver Succeeded")

print("PM Confirming Received...")
app.dependency_overrides[get_current_user] = lambda: {"id": project["pm_id"], "role": "pm", "token": settings.SUPABASE_SERVICE_ROLE_KEY}
resp = test_client.patch(f"/api/purchase-orders/{po_id}/receive")
if resp.status_code != 200:
    print("Receive Failed:", resp.json())
else:
    print("Receive Succeeded")

# Verify stock
mat_check = client.table("materials").select("current_stock").eq("id", material_id).execute()
print(f"Final stock: {mat_check.data[0]['current_stock']}")

# Verify notifications
notifs = client.table("notifications").select("*").eq("project_id", project_id).execute()
print(f"Notifications generated: {len(notifs.data)}")
