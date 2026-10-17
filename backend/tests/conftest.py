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
