from flask import Flask, request, jsonify
import joblib
import pandas as pd
import traceback # For detailed error logging

print("--- Python Prediction Service ---")

# 1. Load the saved pipeline
pipeline_filename = 'credit_model_v2.joblib' # Ensure this path is correct
print(f"Loading model pipeline from {pipeline_filename}...")
try:
    loaded_pipeline = joblib.load(pipeline_filename)
    print("✅ Model pipeline loaded successfully.")
    # --- Extract expected feature names from the pipeline ---
    # This helps ensure consistency between training and prediction
    try:
        # Access the ColumnTransformer within the pipeline
        col_transformer = loaded_pipeline.named_steps['preprocessor']
        # Get feature names from the OneHotEncoder categories if possible
        # Note: This gets the *output* features after encoding. Getting original input is trickier.
        # For OneHotEncoder:
        ohe_feature_names = col_transformer.named_transformers_['cat'].get_feature_names_out()
        num_feature_names = col_transformer.transformers_[0][2] # Get numerical feature names directly
        # expected_input_cols are harder to get directly after fitting the transformer this way
        # So, manually defining based on training script is safer.
        print("Note: Manually defined 'expected_cols' based on training script should be used for creating input DataFrame.")
    except Exception as inspect_e:
        print(f"Could not automatically inspect feature names from pipeline: {inspect_e}")

except FileNotFoundError:
    print(f"FATAL ERROR: Model file '{pipeline_filename}' not found.")
    exit()
except Exception as e:
    print(f"FATAL ERROR: Could not load model pipeline: {e}")
    exit()

# --- Manually define the ORIGINAL input columns the pipeline expects ---
# Must match the columns in X DataFrame fed to pipeline.fit() in the training script
expected_input_cols = [
    'employment_status', 'credit_utilization_ratio', 'payment_history',
    'original_loan_amount', 'loan_term', 'person_income', 'loan_amnt',
    'loan_percent_income', 'cb_person_default_on_file', 'cb_person_cred_hist_length'
]
print(f"Expecting input features: {expected_input_cols}")

# 2. Initialize Flask App
app = Flask(__name__)

# 3. Define Prediction Endpoint
@app.route('/predict', methods=['POST'])
def predict():
    print("\nReceived prediction request...")
    try:
        json_data = request.get_json()
        if not json_data or 'features' not in json_data:
             print("❌ Error: Invalid input format. 'features' key missing.")
             return jsonify({"error": "Invalid input format. 'features' object required."}), 400

        input_features = json_data['features'] # This is a dictionary
        print("Raw input features received:", input_features)

        # Create a DataFrame from the input dictionary using the expected columns
        # This ensures column order and handles any missing/extra keys gracefully
        input_df = pd.DataFrame([input_features], columns=expected_input_cols)

        print("DataFrame created for prediction:")
        print(input_df.to_string())

        # Check for unexpected NaNs *after* creating DataFrame (might indicate missing keys in input_features)
        if input_df.isnull().any().any():
            print(f"WARNING: DataFrame contains NaNs after creation. Missing keys in input?: {input_df.isnull().sum()}")
            # Depending on the pipeline's robustness (imputers?), this might still work or fail.
            # Consider returning an error if certain key features are missing.

        # 4. Make Prediction
        # The loaded pipeline handles all preprocessing (scaling, one-hot encoding)
        pred_proba = loaded_pipeline.predict_proba(input_df)

        # Extract probability for class 1 (default/high-risk)
        risk_score = float(pred_proba[0][1]) # Ensure it's a standard float
        print(f"✅ Prediction successful. Risk score: {risk_score:.4f}")

        # 5. Return JSON
        return jsonify({"risk_score": risk_score})

    except Exception as e:
        print(f"❌ Error during prediction: {e}")
        print(traceback.format_exc())
        return jsonify({"error": "Prediction processing failed", "details": str(e)}), 500

# 4. Run the Flask App
if __name__ == '__main__':
    print("Starting Flask server on http://localhost:5001")
    # Use 0.0.0.0 if running in Docker, else localhost
    app.run(host='localhost', port=5001, debug=False) # Set debug=False for stability