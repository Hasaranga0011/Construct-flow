import os
import pandas as pd
import numpy as np

def prepare_data():
    try:
        print("Reading dataset...")
        # Paths relative to the data_pipeline directory
        pipeline_dir = os.path.dirname(__file__)
        dataset_path = os.path.join(pipeline_dir, 'construction_project_dataset.csv')
        
        if not os.path.exists(dataset_path):
            raise FileNotFoundError(f"Dataset not found at {dataset_path}")
            
        df = pd.read_csv(dataset_path)
        print(f"Loaded dataset: {len(df)} rows")
        
        print("Transforming data for Cost Prediction...")
        cost_df = df.copy()
        
        # Cost prediction mapping
        cost_df['num_workers'] = cost_df['worker_count']
        cost_df['materials_cost'] = cost_df['material_usage'] * 150
        cost_df['labour_cost'] = cost_df['energy_consumption'] * 45
        cost_df['actual_cost'] = cost_df['cost_deviation'].abs() * 1000
        cost_df['completion_percentage'] = cost_df['task_progress'] * 100
        
        # Add generated columns
        np.random.seed(42) # For reproducibility
        cost_df['square_footage'] = (cost_df['num_workers'] * 450) + np.random.randint(500, 3000, size=len(cost_df))
        
        locations = ['Colombo', 'Gampaha', 'Kandy', 'Galle', 'Matara', 'Kurunegala', 'Ratnapura', 'Anuradhapura', 'Jaffna', 'Trincomalee']
        project_types = ['Residential House', 'Commercial Building', 'Apartment Complex', 'Warehouse', 'Road Construction', 'Renovation']
        quality_tiers = ['Standard', 'Premium', 'Luxury']
        
        cost_df['location'] = np.random.choice(locations, size=len(cost_df))
        cost_df['project_type'] = np.random.choice(project_types, size=len(cost_df))
        cost_df['quality_tier'] = np.random.choice(quality_tiers, size=len(cost_df))
        
        cost_prediction_data = cost_df[['square_footage', 'num_workers', 'materials_cost', 'labour_cost', 'completion_percentage', 'location', 'project_type', 'quality_tier', 'actual_cost']]
        
        print("Transforming data for Delay Risk...")
        delay_df = df.copy()
        
        # Delay risk mapping
        delay_df['delayed'] = (delay_df['risk_score'] > 60).astype(int)
        delay_risk_data = delay_df[['worker_count', 'material_usage', 'task_progress', 'safety_incidents', 'equipment_utilization_rate', 'material_shortage_alert', 'delayed']]
        
        # Save output datasets
        cost_out = os.path.join(pipeline_dir, 'cost_data.csv')
        delay_out = os.path.join(pipeline_dir, 'delay_data.csv')
        
        cost_prediction_data.to_csv(cost_out, index=False)
        delay_risk_data.to_csv(delay_out, index=False)
        
        print(f"Data preparation complete.")
        print(f"Saved cost_data.csv: {len(cost_prediction_data)} rows")
        print(f"Saved delay_data.csv: {len(delay_risk_data)} rows")
        
    except Exception as e:
        print(f"Error during data preparation: {e}")

if __name__ == "__main__":
    prepare_data()
