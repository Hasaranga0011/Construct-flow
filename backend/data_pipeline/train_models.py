import os
import pandas as pd
from sklearn.ensemble import RandomForestRegressor, RandomForestClassifier
from sklearn.model_selection import train_test_split
from sklearn.metrics import r2_score, accuracy_score, classification_report
import joblib

def train_and_save_models():
    try:
        pipeline_dir = os.path.dirname(__file__)
        models_dir = os.path.join(pipeline_dir, '..', 'models')
        os.makedirs(models_dir, exist_ok=True)
        
        cost_data_path = os.path.join(pipeline_dir, 'cost_data.csv')
        delay_data_path = os.path.join(pipeline_dir, 'delay_data.csv')
        
        print("Loading transformed datasets...")
        cost_df = pd.read_csv(cost_data_path)
        delay_df = pd.read_csv(delay_data_path)
        
        # Train Model 1: Cost Prediction
        print("Training Cost Predictor (RandomForestRegressor)...")
        cost_features = ['square_footage', 'num_workers', 'materials_cost', 'labour_cost', 'completion_percentage']
        X_cost = cost_df[cost_features]
        y_cost = cost_df['actual_cost']
        
        X_train_c, X_test_c, y_train_c, y_test_c = train_test_split(X_cost, y_cost, test_size=0.2, random_state=42)
        
        cost_model = RandomForestRegressor(n_estimators=100, random_state=42)
        cost_model.fit(X_train_c, y_train_c)
        
        cost_preds = cost_model.predict(X_test_c)
        r2 = r2_score(y_test_c, cost_preds)
        print(f"Cost Predictor R-squared score: {r2:.4f}")
        
        cost_model_path = os.path.join(models_dir, 'cost_predictor.pkl')
        joblib.dump(cost_model, cost_model_path)
        
        # Train Model 2: Delay Risk Classification
        print("\nTraining Delay Classifier (RandomForestClassifier)...")
        delay_features = ['worker_count', 'material_usage', 'task_progress', 'safety_incidents', 'equipment_utilization_rate', 'material_shortage_alert']
        X_delay = delay_df[delay_features]
        y_delay = delay_df['delayed']
        
        X_train_d, X_test_d, y_train_d, y_test_d = train_test_split(X_delay, y_delay, test_size=0.2, random_state=42)
        
        delay_model = RandomForestClassifier(n_estimators=100, random_state=42)
        delay_model.fit(X_train_d, y_train_d)
        
        delay_preds = delay_model.predict(X_test_d)
        acc = accuracy_score(y_test_d, delay_preds)
        print(f"Delay Classifier Accuracy score: {acc:.4f}")
        print("\nClassification Report:")
        print(classification_report(y_test_d, delay_preds))
        
        delay_model_path = os.path.join(models_dir, 'delay_classifier.pkl')
        joblib.dump(delay_model, delay_model_path)
        
        print("\nModels saved successfully")
        
    except Exception as e:
        print(f"Error during model training: {e}")

if __name__ == "__main__":
    train_and_save_models()
