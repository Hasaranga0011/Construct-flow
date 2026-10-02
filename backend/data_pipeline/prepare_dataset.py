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
        site_conditions = ['Flat', 'Sloped', 'Requires Excavation/Piling']
        structure_types = ['RCC frame', 'Load-bearing', 'Steel']
        timelines = ['Standard', 'Rushed']

        cost_df['location']     = np.random.choice(locations, size=len(cost_df))
        cost_df['project_type'] = np.random.choice(project_types, size=len(cost_df))
        cost_df['quality_tier'] = np.random.choice(quality_tiers, size=len(cost_df))
        cost_df['num_floors']   = np.random.randint(1, 25, size=len(cost_df))
        cost_df['site_condition'] = np.random.choice(site_conditions, size=len(cost_df))
        cost_df['structure_type'] = np.random.choice(structure_types, size=len(cost_df))
        cost_df['finishing_flooring'] = np.random.choice(quality_tiers, size=len(cost_df))
        cost_df['finishing_sanitary'] = np.random.choice(quality_tiers, size=len(cost_df))
        cost_df['finishing_electrical'] = np.random.choice(quality_tiers, size=len(cost_df))
        cost_df['target_timeline'] = np.random.choice(timelines, p=[0.8, 0.2], size=len(cost_df))

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

        # Base Quality multiplier (overall fallback)
        qual_mul_map = {'Standard': 1.0, 'Premium': 1.5, 'Luxury': 2.2}
        
        # Finishes multipliers
        floor_mul = cost_df['finishing_flooring'].map(qual_mul_map) * 0.3
        sani_mul = cost_df['finishing_sanitary'].map(qual_mul_map) * 0.4
        elec_mul = cost_df['finishing_electrical'].map(qual_mul_map) * 0.3
        
        # Site condition multiplier
        site_mul_map = {'Flat': 1.0, 'Sloped': 1.15, 'Requires Excavation/Piling': 1.35}
        site_mul = cost_df['site_condition'].map(site_mul_map)

        # Structure type multiplier
        struct_mul_map = {'Load-bearing': 0.9, 'RCC frame': 1.0, 'Steel': 1.25}
        struct_mul = cost_df['structure_type'].map(struct_mul_map)

        # Floors multiplier
        floor_count_mul = 1.0 + (cost_df['num_floors'] * 0.02)

        # Timeline multiplier
        time_mul = cost_df['target_timeline'].map({'Standard': 1.0, 'Rushed': 1.2})

        # Core formula + ±15% noise
        noise = np.random.uniform(0.85, 1.15, size=len(cost_df))
        
        # Calculate actual cost considering all new features
        base_building_cost = cost_df['square_footage'] * base_rates * loc_mul * struct_mul * floor_count_mul * site_mul
        finishes_cost = cost_df['square_footage'] * base_rates * (floor_mul + sani_mul + elec_mul)
        
        cost_df['actual_cost'] = (base_building_cost + finishes_cost) * time_mul * noise

        cost_cols = [
            'square_footage', 'location', 'project_type', 'quality_tier',
            'num_floors', 'site_condition', 'structure_type', 
            'finishing_flooring', 'finishing_sanitary', 'finishing_electrical',
            'target_timeline', 'actual_cost',
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
