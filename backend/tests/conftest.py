import os
import sys

# Ensure backend root is on sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

# Isolate tests from real Supabase credentials and remote side effects.
os.environ["SUPABASE_URL"] = "http://127.0.0.1:54321"
os.environ["SUPABASE_KEY"] = "test-anon-key"
os.environ["ENABLE_SCHEDULER"] = "false"
os.environ["RESEND_API_KEY"] = ""
os.environ["SUPABASE_SERVICE_ROLE_KEY"] = ""
os.environ["GEOAPIFY_API_KEY"] = ""
os.environ["GOOGLE_MAPS_BROWSER_KEY"] = ""


# Test imports must not alter deployed model artifacts or the historical database.
import tempfile
_test_models = tempfile.TemporaryDirectory(prefix="constructflow-tests-")
os.environ["CONSTRUCTFLOW_MODEL_DIR"] = _test_models.name

import pytest

@pytest.fixture(autouse=True)
def reset_rate_limits():
    from core.http_limits import RequestLimits
    for instance in RequestLimits.instances:
        instance.requests.clear()
