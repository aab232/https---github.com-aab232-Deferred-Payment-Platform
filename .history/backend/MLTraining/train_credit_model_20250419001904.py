import numpy as np
import pandas as pd
from sklearn.model_selection import train_test_split
from sklearn.ensemble import RandomForestClassifier
from sklearn.preprocessing import MinMaxScaler, OneHotEncoder
from sklearn.compose import ColumnTransformer
from sklearn.pipeline import Pipeline
from sklearn.metrics import accuracy_score, classification_report, roc_auc_score
import joblib # Used for saving the model and preprocessing objects

print("--- Credit Assessment Model Training Script ---")

# 1. Load Data
try:
    print("Loading merged_credit_data.csv...")
    # Assuming the user's script successfully created this file
    # Use column names observed in the initially uploaded 'merged_credit_data.csv' sample
    df = pd.read_csv("merged_credit_data.csv")
    print("Dataset loaded successfully.")
    print("Shape of loaded data:", df.shape)
    print("Sample of loaded data:")
    print(df.head())
    print("\nColumn Names:", df.columns.tolist())
    print("\nData Info:")
    df.info()

except FileNotFoundError:
    print("ERROR: merged_credit_data.csv not found.")
    print("Please ensure you run the previous data merging script first.")
    exit()
except Exception as e:
    print(f"ERROR loading data: {e}")
    exit()

# 2. Define Target Variable and Features
# Assuming 'loan_status' is the target. If it's not binary (0/1), you need to map it.
# If you want 'is_high_risk' based on 'loan_percent_income', create it here.
# Let's proceed assuming 'loan_status' is the binary target (0=paid, 1=default)
# Adjust this if your target variable is named differently or needs creation/mapping
target_column = 'loan_status'

if target_column not in df.columns:
    print(f"ERROR: Target column '{target_column}' not found in the dataset.")
    # Suggest alternatives or how to create it if applicable
    print("Available columns:", df.columns.tolist())
    # Example: If using loan_percent_income to create target
    # risk_threshold = 0.5 # Example threshold
    # df[target_column] = (df['loan_percent_income'] > risk_threshold).astype(int)
    # print(f"Target column '{target_column}' created based on 'loan_percent_income' > {risk_threshold}")
    exit() # Exit if target can't be determined

# Check if target is binary 0/1 - crucial for classification
if not df[target_column].isin([0, 1]).all():
     print(f"Warning: Target column '{target_column}' doesn't seem to be binary (0/1). Values found: {df[target_column].unique()}")
     # Add mapping logic here if needed, e.g.:
     # df[target_column] = df[target_column].map({'Fully Paid': 0, 'Charged Off': 1}) # Example mapping
     # Ensure you handle all unique values and potential NaNs introduced by mapping
     if not df[target_column].isin([0, 1]).all():
         print(f"ERROR: Could not convert target column '{target_column}' to binary (0/1). Please check mapping.")
         exit()
     print("Target column mapped to 0/1.")


# Separate features (X) and target (y)
y = df[target_column]
X = df.drop(target_column, axis=1)
print(f"\nTarget variable '{target_column}' separated.")
print("Features (X) shape:", X.shape)
print("Target (y) shape:", y.shape)

# 3. Handle Missing Data (Review)
# Check for NaNs again after loading the potentially pre-cleaned merged file
print(f"\nChecking for missing values in features (X)...")
missing_counts = X.isnull().sum()
print(missing_counts[missing_counts > 0])
if X.isnull().any().any():
    print("Warning: Found missing values in features. Dropping rows with NaNs for simplicity.")
    # More sophisticated imputation could be done, but requires careful handling
    original_rows = X.shape[0]
    X = X.dropna()
    y = y[X.index] # Align target with dropped rows in features
    print(f"Dropped {original_rows - X.shape[0]} rows containing NaNs.")
    print("New shapes - X:", X.shape, "y:", y.shape)
else:
    print("No missing values found in features.")

# Check if target y has NaNs after potential alignment
if y.isnull().any():
    print("Warning: Found missing values in target variable 'y'. Dropping corresponding rows.")
    original_rows_y = y.shape[0]
    y = y.dropna()
    X = X.loc[y.index] # Align features with dropped rows in target
    print(f"Dropped {original_rows_y - y.shape[0]} rows from target and features due to NaNs in target.")
    print("Final shapes - X:", X.shape, "y:", y.shape)


# 4. Identify Feature Types
# Update lists based on the ACTUAL columns in your merged_credit_data.csv
# It looks like 'employment _status' and 'cb_person_default_on_file' are categorical
categorical_features = ['employment _status', 'cb_person_default_on_file']
# Numerical features are the rest (check dtypes to be sure)
# Adjust Loan Term inclusion based on your previous script/decision
numerical_features = [col for col in X.columns if col not in categorical_features]

print("\nIdentified Feature Types:")
print("Categorical:", categorical_features)
print("Numerical:", numerical_features)

# Check if identified features actually exist in the dataframe
missing_cat = [f for f in categorical_features if f not in X.columns]
missing_num = [f for f in numerical_features if f not in X.columns]
if missing_cat:
    print(f"ERROR: Categorical features not found in DataFrame: {missing_cat}")
    exit()
if missing_num:
    print(f"ERROR: Numerical features not found in DataFrame: {missing_num}")
    exit()

# 5. Train-Test Split
print("\nSplitting data into Training and Testing sets (80/20)...")
X_train, X_test, y_train, y_test = train_test_split(
    X, y,
    test_size=0.2, # 20% for testing
    random_state=42, # for reproducibility
    stratify=y      # Ensure distribution of target class is similar in train/test
)
print("Splitting complete.")
print("X_train shape:", X_train.shape, "| y_train shape:", y_train.shape)
print("X_test shape:", X_test.shape, "| y_test shape:", y_test.shape)

# 6. Preprocessing Pipeline
print("\nSetting up preprocessing pipeline...")
# Numerical features: Scale to [0, 1]
numerical_transformer = Pipeline(steps=[
    ('scaler', MinMaxScaler())
])

# Categorical features: One-hot encode
categorical_transformer = Pipeline(steps=[
    ('onehot', OneHotEncoder(handle_unknown='ignore', sparse_output=False)) # ignore ensures new categories in test data don't break it
])

# Bundle preprocessing for numerical and categorical features
# Use ColumnTransformer to apply different transformers to different columns
preprocessor = ColumnTransformer(
    transformers=[
        ('num', numerical_transformer, numerical_features),
        ('cat', categorical_transformer, categorical_features)
    ],
    remainder='passthrough' # Keep other columns (if any) - unlikely here but good practice
)

print("Preprocessor configured.")

# 7. Model Training
print("\nTraining Random Forest Classifier...")
# Define the model
# Add class_weight='balanced' if your target classes (0/1) are imbalanced
rf_model = RandomForestClassifier(n_estimators=100, random_state=42, class_weight='balanced', n_jobs=-1) # n_jobs=-1 uses all processors

# Create the full pipeline: preprocess -> then model
# This ensures preprocessing is fitted ONLY on train data and applied consistently
full_pipeline = Pipeline(steps=[('preprocessor', preprocessor),
                                ('classifier', rf_model)])

# Train the pipeline (fits preprocessor on X_train, transforms X_train, then fits classifier)
full_pipeline.fit(X_train, y_train)
print("Training complete.")

# 8. Model Evaluation
print("\nEvaluating model on the Test set...")
y_pred = full_pipeline.predict(X_test)
y_pred_proba = full_pipeline.predict_proba(X_test)[:, 1] # Probability of class 1 (default)

accuracy = accuracy_score(y_test, y_pred)
report = classification_report(y_test, y_pred)
try:
    # AUC requires probabilities
    auc = roc_auc_score(y_test, y_pred_proba)
    print(f"Test Set AUC: {auc:.4f}")
except ValueError as e:
    # This can happen if only one class is present in y_test - should not occur with stratify
    print(f"Could not calculate AUC: {e}")
    auc = "N/A"


print(f"Test Set Accuracy: {accuracy:.4f}")
print("\nTest Set Classification Report:\n", report)


# 9. Saving Artifacts
print("\nSaving the trained model and preprocessor...")
model_filename = 'credit_model.joblib'
preprocessor_filename = 'preprocessor.joblib'

# Save the entire trained pipeline (preferred) OR just the model + separate preprocessor
# Saving the pipeline ensures consistent application
joblib.dump(full_pipeline, model_filename)
print(f"Trained Pipeline saved to {model_filename}")

# If you needed the preprocessor separately (e.g., for Option C model conversion later)
# You'd typically fit it separately on X_train, THEN save it
# fitted_preprocessor = preprocessor.fit(X_train)
# joblib.dump(fitted_preprocessor, preprocessor_filename)
# print(f"Fitted Preprocessor saved separately to {preprocessor_filename}")
# For Options A/B where Node just calls Python, sending raw data and letting a Python
# prediction script load BOTH the pipeline and do the prediction is simplest.
# If Node.js needs to preprocess FIRST, then save the fitted_preprocessor separately.
# Let's assume for now Node will call Python which loads the pipeline.

print("\n--- Training Script Finished ---")