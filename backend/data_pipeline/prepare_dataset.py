"""
Dataset preparation for ConstructFlow Machine Learning.

Extracts real completed projects from historical_projects (Supabase & SQLite),
applies time-adjustment inflation factors, and prepares training data.
Legacy random noise CSVs have been moved to data/legacy_synthetic/ and are NOT used.
"""

import os
import pandas as pd
from services.historical_data_service import get_all_real_projects, get_real_projects_count

def prepare_data():
    pipeline_dir = os.path.dirname(__file__)
    real_projects = get_all_real_projects()
    print(f"Loaded {len(real_projects)} real completed and BOQ projects from repository.")

    if not real_projects:
        print("Note: No historical project records found yet. Use Admin CSV Import to bootstrap from BOQs.")
        return

    df = pd.DataFrame(real_projects)
    out_csv = os.path.join(pipeline_dir, "real_historical_dataset.csv")
    df.to_csv(out_csv, index=False)
    print(f"Saved real dataset to {out_csv} ({len(df)} rows)")

if __name__ == "__main__":
    prepare_data()
