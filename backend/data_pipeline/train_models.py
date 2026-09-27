"""
Training pipeline for ConstructFlow ML models.

Run:
    cd backend/data_pipeline
    python train_models.py

What it does:
  1. Loads prepared CSVs from this directory.
  2. Trains Cost Predictor (RandomForestRegressor) and Delay Classifier
     (RandomForestClassifier).
  3. Saves .pkl artifacts + _meta.json sidecar files to backend/models/.
  4. Validation gate: a newly trained model replaces the live one ONLY when
     its validation metric (R² for cost, accuracy for delay) is not worse
     than the currently deployed model's recorded metric.  If it is worse,
     the old model is kept and a warning is printed.

Optional: pass --skip-validation-gate to force replacement regardless.
"""

import argparse
import datetime
import json
import os
import shutil
from pathlib import Path

import joblib
import pandas as pd
from sklearn.ensemble import RandomForestClassifier, RandomForestRegressor
from sklearn.metrics import (accuracy_score, classification_report,
                              mean_absolute_error, r2_score)
from sklearn.model_selection import train_test_split

PIPELINE_DIR = Path(__file__).resolve().parent
MODELS_DIR   = PIPELINE_DIR.parent / "models"

COST_CSV  = PIPELINE_DIR / "cost_data.csv"
DELAY_CSV = PIPELINE_DIR / "delay_data.csv"

COST_PKL   = MODELS_DIR / "cost_predictor.pkl"
DELAY_PKL  = MODELS_DIR / "delay_classifier.pkl"
COST_META  = MODELS_DIR / "cost_predictor_meta.json"
DELAY_META = MODELS_DIR / "delay_classifier_meta.json"

COST_FEATURES  = ["square_footage", "num_workers", "materials_cost",
                   "labour_cost", "completion_percentage"]
DELAY_FEATURES = ["worker_count", "material_usage", "task_progress",
                  "safety_incidents", "equipment_utilization_rate",
                  "material_shortage_alert"]


def _load_existing_metric(meta_path: Path, key: str) -> float | None:
    if meta_path.exists():
        try:
            meta = json.loads(meta_path.read_text())
            return float(meta.get(key, -1))
        except Exception:
            pass
    return None


def train_and_save_models(skip_gate: bool = False) -> None:
    MODELS_DIR.mkdir(parents=True, exist_ok=True)
    now = datetime.datetime.utcnow().isoformat(timespec="seconds") + "Z"

    # ------------------------------------------------------------------
    # 1. Cost Predictor
    # ------------------------------------------------------------------
    print("=" * 60)
    print("Loading cost dataset …")
    cost_df = pd.read_csv(COST_CSV)
    print(f"  {len(cost_df):,} rows loaded")

    X_cost = cost_df[COST_FEATURES]
    y_cost = cost_df["actual_cost"]

    X_tr_c, X_te_c, y_tr_c, y_te_c = train_test_split(
        X_cost, y_cost, test_size=0.20, random_state=42
    )

    print("Training Cost Predictor (RandomForestRegressor, 150 trees) …")
    cost_model = RandomForestRegressor(n_estimators=150, random_state=42, n_jobs=-1)
    cost_model.fit(X_tr_c, y_tr_c)

    preds_c = cost_model.predict(X_te_c)
    r2  = float(r2_score(y_te_c, preds_c))
    mae = float(mean_absolute_error(y_te_c, preds_c))
    print(f"  R²  = {r2:.4f}")
    print(f"  MAE = {mae:,.0f}")

    new_cost_meta = {
        "model_type": "RandomForestRegressor",
        "trained_at": now,
        "dataset_size": len(cost_df),
        "features": COST_FEATURES,
        "validation_r2": round(r2, 4),
        "validation_mae": round(mae, 2),
        "n_estimators": 150,
    }

    # Validation gate
    old_r2 = _load_existing_metric(COST_META, "validation_r2")
    if old_r2 is not None and not skip_gate and r2 < old_r2:
        print(
            f"\n⚠  WARNING: New cost model R² ({r2:.4f}) is worse than deployed "
            f"({old_r2:.4f}). Keeping the existing model. "
            "Pass --skip-validation-gate to force replacement."
        )
    else:
        tmp = MODELS_DIR / "_cost_predictor_tmp.pkl"
        joblib.dump(cost_model, tmp)
        shutil.move(str(tmp), COST_PKL)
        COST_META.write_text(json.dumps(new_cost_meta, indent=2))
        print("  ✓ Cost predictor saved.")

    # ------------------------------------------------------------------
    # 2. Delay Classifier
    # ------------------------------------------------------------------
    print("\n" + "=" * 60)
    print("Loading delay dataset …")
    delay_df = pd.read_csv(DELAY_CSV)
    print(f"  {len(delay_df):,} rows loaded")

    X_delay = delay_df[DELAY_FEATURES]
    y_delay = delay_df["delayed"]

    X_tr_d, X_te_d, y_tr_d, y_te_d = train_test_split(
        X_delay, y_delay, test_size=0.20, random_state=42
    )

    print("Training Delay Classifier (RandomForestClassifier, 150 trees) …")
    delay_model = RandomForestClassifier(
        n_estimators=150, random_state=42, n_jobs=-1, class_weight="balanced"
    )
    delay_model.fit(X_tr_d, y_tr_d)

    preds_d = delay_model.predict(X_te_d)
    acc = float(accuracy_score(y_te_d, preds_d))
    print(f"  Accuracy = {acc:.4f}")
    print(classification_report(y_te_d, preds_d))

    new_delay_meta = {
        "model_type": "RandomForestClassifier",
        "trained_at": now,
        "dataset_size": len(delay_df),
        "features": DELAY_FEATURES,
        "validation_accuracy": round(acc, 4),
        "n_estimators": 150,
    }

    old_acc = _load_existing_metric(DELAY_META, "validation_accuracy")
    if old_acc is not None and not skip_gate and acc < old_acc:
        print(
            f"\n⚠  WARNING: New delay model accuracy ({acc:.4f}) is worse than deployed "
            f"({old_acc:.4f}). Keeping the existing model."
        )
    else:
        tmp = MODELS_DIR / "_delay_classifier_tmp.pkl"
        joblib.dump(delay_model, tmp)
        shutil.move(str(tmp), DELAY_PKL)
        DELAY_META.write_text(json.dumps(new_delay_meta, indent=2))
        print("  ✓ Delay classifier saved.")

    print("\n" + "=" * 60)
    print("Training pipeline complete.")
    print(f"  Models in: {MODELS_DIR}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="ConstructFlow ML training pipeline"
    )
    parser.add_argument(
        "--skip-validation-gate",
        action="store_true",
        help="Force model replacement even if the new model performs worse.",
    )
    args = parser.parse_args()
    train_and_save_models(skip_gate=args.skip_validation_gate)
