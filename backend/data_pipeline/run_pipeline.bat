@echo off
echo Starting ML Data Pipeline...
python prepare_dataset.py
if %ERRORLEVEL% neq 0 (
    echo Data preparation failed.
    exit /b %ERRORLEVEL%
)
echo Data preparation successful. Starting model training...
python train_models.py
if %ERRORLEVEL% neq 0 (
    echo Model training failed.
    exit /b %ERRORLEVEL%
)
echo Pipeline execution completed.
