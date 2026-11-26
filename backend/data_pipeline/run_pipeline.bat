@echo off
setlocal
set "CF_TRAIN_PYTHON=%~dp0..\..\.venv\Scripts\python.exe"
if not exist "%CF_TRAIN_PYTHON%" set "CF_TRAIN_PYTHON=python"
"%CF_TRAIN_PYTHON%" "%~dp0train_models.py" %*
exit /b %ERRORLEVEL%
