"""Run after migration with two existing worker test accounts. Never prints credentials.
Required: WORKER_A_EMAIL, WORKER_A_PASSWORD, WORKER_B_ID, WORKER_B_LABOUR_ID,
WORKER_B_SLIP_ID. These must identify existing seeded test rows (not production pay).
"""
import os
from dotenv import load_dotenv
from supabase import create_client
load_dotenv("backend/.env")
required = ["WORKER_A_EMAIL", "WORKER_A_PASSWORD", "WORKER_B_ID", "WORKER_B_LABOUR_ID", "WORKER_B_SLIP_ID"]
missing = [name for name in required if not os.getenv(name)]
if missing:
    raise SystemExit("Missing test configuration: " + ", ".join(missing))
client = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_KEY"])
session = client.auth.sign_in_with_password({"email": os.environ["WORKER_A_EMAIL"], "password": os.environ["WORKER_A_PASSWORD"]})
assert session.user.id != os.environ["WORKER_B_ID"]
try:
    # Validate the fixture first so nonexistent IDs cannot produce a false pass.
    admin = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_ROLE_KEY"])
    other = admin.table("profiles").select("id,role").eq("id", os.environ["WORKER_B_ID"]).single().execute().data
    assert other and other["role"].lower() == "worker"
    for table, key in [("labour", "WORKER_B_LABOUR_ID"), ("salary_slips", "WORKER_B_SLIP_ID")]:
        fixture = admin.table(table).select("worker_id").eq("id", os.environ[key]).single().execute().data
        assert fixture and fixture["worker_id"] == other["id"], "Invalid worker B fixture"
    own = client.table("profiles").select("id,role").eq("id", session.user.id).single().execute().data
    assert own["role"].lower() == "worker"
    for table, identifier, payload in [
        ("profiles",os.environ["WORKER_B_ID"],{"full_name":"RLS must deny this"}),
        ("labour",os.environ["WORKER_B_LABOUR_ID"],{"hours_worked":0}),
        ("salary_slips",os.environ["WORKER_B_SLIP_ID"],{"total_pay":0})]:
        assert client.table(table).select("*").eq("id",identifier).execute().data == [], table + " leaked a row"
        try:
            result=client.table(table).update(payload).eq("id",identifier).execute()
            assert result.data == [], table + " allowed an update"
        except Exception as error:
            if getattr(error,"code",None) != "42501":
                raise
    print("PASS: worker A signed in; worker B profile, attendance and payslip reads/updates denied")
finally:
    client.auth.sign_out()
