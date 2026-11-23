"""Reproduce Vercel's read-only application bundle without remote requests."""
import os
from pathlib import Path
import subprocess
import sys


def test_serverless_import_with_readonly_bundle(tmp_path):
    backend = Path(__file__).resolve().parents[1]
    code = r'''
import errno, os, pathlib, socket, sys
root = pathlib.Path.cwd().resolve()
original_mkdir = os.mkdir
def readonly_mkdir(path, *args, **kwargs):
    resolved = pathlib.Path(path).resolve()
    if resolved == root or root in resolved.parents:
        raise OSError(errno.EROFS, "Read-only file system", str(path))
    return original_mkdir(path, *args, **kwargs)
os.mkdir = readonly_mkdir
def offline(*args, **kwargs):
    raise AssertionError("Startup must not make network requests")
socket.create_connection = offline
socket.socket.connect = offline
import main
from services import email_service, historical_data_service, storage_service
from core.config import settings
assert main.health_check() == {"status": "healthy"}
assert not any(getattr(route, "path", "") == "/uploads" for route in main.app.routes)
assert root not in pathlib.Path(email_service.LOGS_DIR).resolve().parents
assert root not in historical_data_service.LOCAL_DB_PATH.resolve().parents
assert historical_data_service.LOCAL_DB_PATH.exists()
assert historical_data_service.MODELS_DIR == root / "models"
connection = historical_data_service._get_local_conn()
connection.execute("SELECT COUNT(*) FROM historical_projects").fetchone()
connection.close()
storage_service._get_client = lambda: None
settings.ALLOW_LOCAL_UPLOADS = True
settings.ENVIRONMENT = "development"
try:
    storage_service.upload_file(b"fixture", "test", "fixture.txt")
except RuntimeError as error:
    assert "upload was not saved" in str(error)
else:
    raise AssertionError("Vercel uploads must not fall back to ephemeral files")
print("READONLY_STARTUP_OK")
'''
    env = dict(os.environ, VERCEL="1", TMP=str(tmp_path), TEMP=str(tmp_path), TMPDIR=str(tmp_path),
               SUPABASE_URL="http://127.0.0.1:54321", SUPABASE_KEY="fixture-only",
               SUPABASE_SERVICE_ROLE_KEY="", ENABLE_SCHEDULER="false", ALLOW_LOCAL_UPLOADS="false",
               RESEND_API_KEY="", SMTP_HOST="", PYTHONDONTWRITEBYTECODE="1")
    env.pop("CONSTRUCTFLOW_MODEL_DIR", None)
    result = subprocess.run([sys.executable, "-c", code], cwd=backend, env=env,
                            capture_output=True, text=True, timeout=90)
    assert result.returncode == 0, result.stderr[-6000:]
    assert "READONLY_STARTUP_OK" in result.stdout
