import os
import sys
import numpy as np
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# We must import supabase after loading dotenv if it relies on os.environ directly,
# but the easiest way is to use the existing supabase_client from core
sys.path.append(os.path.dirname(os.path.abspath(__file__)))
from core.supabase_client import supabase_db

def generate_and_seed_data():
    """Generates synthetic historical construction data and inserts it into Supabase."""
    print("Generating synthetic historical data...")
    
    np.random.seed(42)
    n_samples = 1000
    
    # Generate random features
    sq_ft_arr = np.random.randint(1000, 10000, n_samples)
    location_arr = np.random.choice(['Colombo', 'Kandy', 'Galle', 'Other'], n_samples)
    project_type_arr = np.random.choice(['Residential', 'Commercial', 'Industrial'], n_samples)
    quality_arr = np.random.choice(['Standard', 'Premium', 'Luxury'], n_samples)
    
    # Helper to calculate cost similar to the model's logic
    def calculate_cost(sq_ft, loc, ptype, qual):
        base_rate = 8000
        if ptype == 'Commercial':
            base_rate = 12000
        elif ptype == 'Industrial':
            base_rate = 15000
            
        loc_mult = 1.0
        if loc == 'Colombo':
            loc_mult = 1.2
        elif loc == 'Kandy':
            loc_mult = 1.05
            
        qual_mult = 1.0
        if qual == 'Premium':
            qual_mult = 1.5
        elif qual == 'Luxury':
            qual_mult = 2.0
            
        noise = np.random.normal(0, 500000)
        return (sq_ft * base_rate * loc_mult * qual_mult) + noise

    # Build the dataset
    records = []
    for i in range(n_samples):
        cost = calculate_cost(sq_ft_arr[i], location_arr[i], project_type_arr[i], quality_arr[i])
        records.append({
            "square_footage": int(sq_ft_arr[i]),
            "location": location_arr[i],
            "project_type": project_type_arr[i],
            "quality_tier": quality_arr[i],
            "actual_cost": round(float(cost), 2)
        })
    
    print(f"Generated {len(records)} records. Inserting into database in batches...")
    
    # Insert in batches of 100
    batch_size = 100
    for i in range(0, len(records), batch_size):
        batch = records[i:i + batch_size]
        try:
            supabase_db.table("historical_costs").insert(batch).execute()
            print(f"Inserted batch {i//batch_size + 1}/{len(records)//batch_size}")
        except Exception as e:
            print(f"Error inserting batch {i//batch_size + 1}: {e}")
            print("Make sure you have created the historical_costs table using schema_ml.sql!")
            return

    print("Successfully seeded historical_costs table with data.")

if __name__ == "__main__":
    generate_and_seed_data()
