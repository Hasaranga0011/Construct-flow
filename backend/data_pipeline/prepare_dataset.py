"""
Prepare construction datasets for ConstructFlow ML training.

Reads: data_pipeline/construction_project_dataset.csv
Writes:
  data_pipeline/cost_data.csv   — for RandomForestRegressor
  data_pipeline/delay_data.csv  — for RandomForestClassifier

Cost label is derived from a realistic Sri Lanka construction cost formula
based on square footage, project type, quality tier, and location multipliers,
with controlled random noise (+/-15%) so the model learns real relationships.
"""

import os

import numpy as np
import pandas as pd

def prepare_data():
    try:
        pipeline_dir = os.path.dirname(__file__)
        dataset_path = os.path.join(pipeline_dir, 'construction_project_dataset.csv')

        if not os.path.exists(dataset_path):
            raise FileNotFoundError(f"Dataset not found at {dataset_path}")

        print("Reading dataset...")
        df = pd.read_csv(dataset_path)
        print(f"Loaded dataset: {len(df):,} rows")

        # ----------------------------------------------------------------
        # Cost Prediction Dataset
        # ----------------------------------------------------------------
        print("Transforming data for Cost Prediction...")
        cost_df = df.copy()

        cost_df['num_workers'] = cost_df['worker_count']
        cost_df['completion_percentage'] = cost_df['task_progress'] * 100

        # Derived area: workers × 450 sq ft + noise
        np.random.seed(42)
        cost_df['square_footage'] = (
            cost_df['num_workers'] * 450
            + np.random.randint(500, 3000, size=len(cost_df))
        )

        # Derived cost proxies (LKR per unit)
        # materials_cost: material_usage × LKR 4,500 (realistic per-unit cost)
        cost_df['materials_cost'] = cost_df['material_usage'] * 4_500
        # labour_cost: workers × 3,500/day × ~20 working days
        cost_df['labour_cost'] = cost_df['num_workers'] * 3_500 * 20

        locations = [
            'Colombo', 'Gampaha', 'Kandy', 'Galle',
            'Matara', 'Kurunegala', 'Ratnapura', 'Anuradhapura',
            'Jaffna', 'Trincomalee',
        ]
        project_types = [
            'Residential House', 'Commercial Building', 'Apartment Complex',
            'Warehouse', 'Road Construction', 'Renovation',
        ]
        quality_tiers = ['Standard', 'Premium', 'Luxury']

        cost_df['location']     = np.random.choice(locations, size=len(cost_df))
        cost_df['project_type'] = np.random.choice(project_types, size=len(cost_df))
        cost_df['quality_tier'] = np.random.choice(quality_tiers, size=len(cost_df))

        # ---- Realistic Cost Label (LKR) --------------------------------
        # Base rate per sq ft by project type
        base_rate_map = {
            'Residential House':   8_000,
            'Commercial Building': 14_000,
            'Apartment Complex':   12_000,
            'Warehouse':            7_000,
            'Road Construction':    5_000,
            'Renovation':           6_000,
        }
        base_rates = cost_df['project_type'].map(base_rate_map)

        # Location multiplier
        loc_mul_map = {
            'Colombo': 1.30, 'Gampaha': 1.15, 'Kandy': 1.10,
            'Galle': 1.08,  'Matara': 1.05,  'Kurunegala': 1.00,
            'Ratnapura': 0.98, 'Anuradhapura': 0.95,
            'Jaffna': 0.97,  'Trincomalee': 0.95,
        }
        loc_mul = cost_df['location'].map(loc_mul_map)

        # Quality multiplier
        qual_mul_map = {'Standard': 1.0, 'Premium': 1.5, 'Luxury': 2.2}
        qual_mul = cost_df['quality_tier'].map(qual_mul_map)

        # Core formula + ±15% noise
        noise = np.random.uniform(0.85, 1.15, size=len(cost_df))
        cost_df['actual_cost'] = (
            cost_df['square_footage'] * base_rates * loc_mul * qual_mul
            * noise
            + cost_df['materials_cost'] * 0.3
            + cost_df['labour_cost'] * 0.2
        )

        cost_cols = [
            'square_footage', 'num_workers', 'materials_cost',
            'labour_cost', 'completion_percentage',
            'location', 'project_type', 'quality_tier',
            'actual_cost',
        ]
        cost_out = os.path.join(pipeline_dir, 'cost_data.csv')
        cost_df[cost_cols].to_csv(cost_out, index=False)
        print(f"  Saved cost_data.csv: {len(cost_df):,} rows")

        # ----------------------------------------------------------------
        # Delay Risk Dataset
        # ----------------------------------------------------------------
        print("Transforming data for Delay Risk...")
        delay_df = df.copy()
        # Delayed = risk_score > 60 (from original dataset signal)
        delay_df['delayed'] = (delay_df['risk_score'] > 60).astype(int)
        delay_cols = [
            'worker_count', 'material_usage', 'task_progress',
            'safety_incidents', 'equipment_utilization_rate',
            'material_shortage_alert', 'delayed',
        ]
        delay_out = os.path.join(pipeline_dir, 'delay_data.csv')
        delay_df[delay_cols].to_csv(delay_out, index=False)
        print(f"  Saved delay_data.csv: {len(delay_df):,} rows")

        print("Data preparation complete.")

    except Exception as e:
        print(f"Error during data preparation: {e}")
        raise


if __name__ == "__main__":
    prepare_data()
