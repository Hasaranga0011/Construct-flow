"""Writable scratch directories for serverless runtimes; never durable storage."""
import os
import tempfile
from pathlib import Path


def runtime_directory(name: str, local_path: Path) -> Path:
    if os.environ.get("VERCEL"):
        return Path(tempfile.gettempdir()) / "constructflow" / name
    return local_path
