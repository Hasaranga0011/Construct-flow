"""
ConstructFlow Model Training Pipeline.

Trains the Cost Predictor on real historical projects (and calibrated bootstrap if N < 15),
evaluates MAPE and MAE exclusively on real projects, and saves artifacts to backend/models/.
Delay risk is 100% rule-based from live project operational signals.
"""

import argparse
import sys
from pathlib import Path

# Add backend directory to sys.path so imports work
BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from data_pipeline.model_engine import train_and_evaluate_cost_model

def main():
    parser = argparse.ArgumentParser(description="ConstructFlow Real Cost Model Training Pipeline")
    parser.add_argument("--skip-validation-gate", action="store_true", help="Force model deployment")
    args = parser.parse_args()

    print("=" * 60)
    print("ConstructFlow Real Machine Learning Pipeline")
    print("=" * 60)
    meta = train_and_evaluate_cost_model(force=args.skip_validation_gate)
    print("Training finished successfully.")
    print(f"Model Type: {meta.get('model_type')}")
    print(f"Real Projects Count: {meta.get('real_projects_count')}")
    print(f"Validation Status: {meta.get('validation_status')}")
    if meta.get("validation_mape") is not None:
        print(f"Validation MAPE: {meta.get('validation_mape')}%")
        print(f"Validation MAE: LKR {meta.get('validation_mae'):,}")
        print(f"Baseline MAPE: {meta.get('baseline_mape')}%")
    else:
        print("Note: Need at least 5 real completed projects for held-out test evaluation.")
    print("=" * 60)

if __name__ == "__main__":
    main()