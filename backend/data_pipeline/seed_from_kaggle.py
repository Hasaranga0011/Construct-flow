import os
import sys
import pandas as pd

sys.path.append(os.path.join(os.path.dirname(__file__), '..'))
from core.supabase_client import supabase_db

def seed_database():
    try:
        pipeline_dir = os.path.dirname(__file__)
        cost_data_path = os.path.join(pipeline_dir, 'cost_prediction_dataset.csv')
        
        print("Loading transformed cost dataset for seeding...")
        df = pd.read_csv(cost_data_path)
        
        # We need: square_footage, location, project_type, quality_tier, actual_cost
        records = df[['square_footage', 'location', 'project_type', 'quality_tier', 'actual_cost']].to_dict(orient='records')
        
        total = len(records)
        print(f"Prepared {total} records. Seeding database in batches of 100...")
        
        batch_size = 100
        for i in range(0, total, batch_size):
            batch = records[i:i + batch_size]
            try:
                supabase_db.table("historical_costs").insert(batch).execute()
                print(f"Inserted batch {i//batch_size + 1}/{total//batch_size + (1 if total % batch_size != 0 else 0)}")
            except Exception as e:
                print(f"Error inserting batch {i//batch_size + 1}: {e}")
                
        print("Database seeding from Kaggle dataset complete.")
        
    except Exception as e:
        print(f"Error during database seeding: {e}")

if __name__ == "__main__":
    seed_database()
