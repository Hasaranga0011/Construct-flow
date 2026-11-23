@echo off
setlocal
set "CF_BACKEND_ROOT=%~dp0backend"
set "CF_BACKEND_PYTHON=%~dp0.venv\Scripts\python.exe"
if not exist "%CF_BACKEND_PYTHON%" set "CF_BACKEND_PYTHON=python"
pushd "%CF_BACKEND_ROOT%"
if errorlevel 1 exit /b 1
echo Starting ConstructFlow backend from %CF_BACKEND_ROOT%
"%CF_BACKEND_PYTHON%" -m uvicorn main:app --app-dir "%CF_BACKEND_ROOT%" --reload --reload-dir "%CF_BACKEND_ROOT%" --host 0.0.0.0 --port 8000 %*
set "CF_BACKEND_EXIT_CODE=%ERRORLEVEL%"
popd
exit /b %CF_BACKEND_EXIT_CODE%
