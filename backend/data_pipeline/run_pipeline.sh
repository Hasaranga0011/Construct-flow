#!/bin/bash
echo "Starting ML Data Pipeline..."
python prepare_dataset.py
if [ $? -eq 0 ]; then
    echo "Data preparation successful. Starting model training..."
    python train_models.py
else
    echo "Data preparation failed."
    exit 1
fi
echo "Pipeline execution completed."
