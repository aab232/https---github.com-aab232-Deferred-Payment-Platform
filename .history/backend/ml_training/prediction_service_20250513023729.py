from flask import Flask, request, jsonify # 
import joblib # for loading model
import pandas as pd # data handling
import traceback # used for detailed error logging

print("--- Python Prediction Service ---") # announcement that the script started

# load saved pipeline (trained model and preprocessing steps)
pipeline_filename = 'credit_model_v2.joblib' # filename of saved model
print(f"Loading model pipeline from {pipeline_filename}...")
try:
    # loading the file
    loaded_pipeline = joblib.load(pipeline_filename)
    print(" Model pipeline loaded successfully.")
    try:
        # access the columntransformer within the pipeline
        col_transformer = loaded_pipeline.named_steps['preprocessor']
        # get feature names from the onehotencoder categories
        # gets output features after encoding
        ohe_feature_names = col_transformer.named_transformers_['cat'].get_feature_names_out()
        # get numerical feature names directly
        num_feature_names = col_transformer.transformers_[0][2]
    except Exception as inspect_e:
        # if inspecting fails, print a message
        print(f"Could not automatically inspect feature names from pipeline: {inspect_e}")

except FileNotFoundError:
    # handle error if model file isn't there
    print(f"FATAL ERROR: Model file '{pipeline_filename}' not found.")
    exit() # stop script
except Exception as e:
    # handle any other error during loading
    print(f"FATAL ERROR: Could not load model pipeline: {e}")
    exit() # stop script

# manually define original input columns the pipeline expects
# must match the columns in x dataframe fed to pipeline.fit() in the training script
expected_input_cols = [
    'employment_status', 'credit_utilization_ratio', 'payment_history',
    'original_loan_amount', 'loan_term', 'person_income', 'loan_amnt',
    'loan_percent_income', 'cb_person_default_on_file', 'cb_person_cred_hist_length'
]
print(f"Expecting input features: {expected_input_cols}") # show expected columns

# initialise flask app - sets up the basic web server
app = Flask(__name__)

# define prediction endpoint (url people will send data to for predictions)
@app.route('/predict', methods=['POST']) # runs when someone sends a post request to /predict
def predict():
    print("\nReceived prediction request...") # message in console when called
    try:
        # get the data sent as json
        json_data = request.get_json()
        # check if data is okay (is json and has 'features' key)
        if not json_data or 'features' not in json_data:
             print(" Error: Invalid input format. 'features' key missing.")
             # tell the user format was wrong, send back error code 400 (bad request)
             return jsonify({"error": "Invalid input format. 'features' object required."}), 400

        # get dictionary of features from the json
        input_features = json_data['features']
        print("Raw input features received:", input_features) # show input received

        # create a pandas dataframe from the input dictionary
        # using the 'expected_input_cols' list ensures column order and handles missing/extra keys
        input_df = pd.DataFrame([input_features], columns=expected_input_cols)

        print("DataFrame created for prediction:") # show the dataframe before prediction
        print(input_df.to_string())

        # check for unexpected nans after creating dataframe
        if input_df.isnull().any().any():
            print(f"WARNING: DataFrame contains NaNs even after creation. You might have missing keys in input?: {input_df.isnull().sum()}")

        # make prediction using the loaded pipeline - handles all preprocessing (scaling, one-hot encoding)
        pred_proba = loaded_pipeline.predict_proba(input_df)

        # extract probability for class 1 (default/high-risk)
        risk_score = float(pred_proba[0][1]) # ensure it's a standard float
        print(f" Prediction successful. Risk score: {risk_score:.4f}") # show result

        # return json
        # send calculated risk score back to the user as json
        return jsonify({"risk_score": risk_score})

    except Exception as e:
        # if anything went wrong in the 'try' block
        print(f" Error during prediction: {e}")
        print(traceback.format_exc()) # print detailed error to console for debugging
        # let the user know something failed on our end, return error code 500 (server error)
        return jsonify({"error": "Prediction processing failed", "details": str(e)}), 500

# run the flask app
if __name__ == '__main__':
    print("Starting Flask server on http://localhost:5001")
    # start web server, listening on localhost port 5001
    app.run(host='localhost', port=5001, debug=False) # set debug=false for stability