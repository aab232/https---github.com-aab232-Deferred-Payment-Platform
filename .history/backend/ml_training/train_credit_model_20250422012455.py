import numpy as np
import pandas as pd
from sklearn.model_selection import train_test_split
from sklearn.ensemble import RandomForestClassifier
from sklearn.preprocessing import MinMaxScaler, OneHotEncoder
from sklearn.compose import ColumnTransformer
from sklearn.pipeline import Pipeline
from sklearn.metrics import accuracy_score, classification_report, roc_auc_score
import joblib # Used for saving the model and preprocessing objects

print("--- Credit Assessment Model Training Script (v2) ---")

# 1. Load Data
try:
    print("Loading merged_credit_data_v2.csv...")
    # --- CHANGE 1: Load the correct CSV file ---
    df = pd.read_csv("merged_credit_data_v2.csv")
    print("Dataset loaded successfully.")
    print("Shape of loaded data:", df.shape)
    print("Sample of loaded data:")
    print(df.head())
    print("\nColumn Names:", df.columns.tolist())
    print("\nData Info:")
    df.info()

except FileNotFoundError:
    print("ERROR: merged_credit_data_v2.csv not found.")
    print("Please ensure merged_credit_data_v2.csv is in the same directory.")
    exit()
except Exception as e:
    print(f"ERROR loading data: {e}")
    exit()

# 2. Define Target Variable and Features
# --- CHANGE 2: Use the existing 'loan_status' column ---
target_column = 'loan_status'

if target_column not in df.columns:
    print(f"ERROR: Target column '{target_column}' not found in the dataset.")
    print("Available columns:", df.columns.tolist())
    exit()

# --- CHANGE 3: REMOVE Artificial Target Creation Block ---
# The block creating 'loan_status' from 'loan_percent_income' is removed entirely.

# Check if target is binary 0/1
if not df[target_column].isin([0, 1]).all():
     print(f"Warning: Target column '{target_column}' doesn't seem to be binary (0/1). Values found: {df[target_column].unique()}")
     # You might need mapping here if it's not 0/1, e.g.
     # df[target_column] = df[target_column].map({'Non-Default': 0, 'Default': 1}) # Example
     # Make sure the mapping covers all possibilities and handles potential NaNs
     if df[target_column].isnull().any() or not df[target_column].isin([0, 1]).all():
            print(f"ERROR: Could not confirm target column '{target_column}' is binary (0/1) after potential mapping attempt. Please check data.")
            exit()
     print("Target column verified/mapped to 0/1.")


# Separate features (X) and target (y)
y = df[target_column]
X = df.drop(target_column, axis=1) # Only drop the target column
print(f"\nTarget variable '{target_column}' separated.")
print("Features (X) shape:", X.shape)
print("Target (y) shape:", y.shape)
print("Columns in features X:", X.columns.tolist()) # Verify loan_percent_income is here

# 3. Handle Missing Data (Review)
# Keep this section as a safety check
print(f"\nChecking for missing values in features (X)...")
missing_counts = X.isnull().sum()
print(missing_counts[missing_counts > 0])
if X.isnull().any().any():
    print("Warning: Found missing values in features. Dropping rows with NaNs.")
    original_rows = X.shape[0]
    rows_to_drop_index = X[X.isnull().any(axis=1)].index
    X = X.dropna()
    y = y.drop(rows_to_drop_index) # Use index to drop corresponding y values
    print(f"Dropped {original_rows - X.shape[0]} rows containing NaNs based on feature columns.")
    print("New shapes - X:", X.shape, "y:", y.shape)
else:
    print("No missing values found in features.")

if y.isnull().any(): # Check target again
     print("Warning: Found missing values in target 'y'. Dropping corresponding rows.")
     original_rows_y = y.shape[0]
     y = y.dropna()
     X = X.loc[y.index]
     print(f"Dropped {original_rows_y - y.shape[0]} rows from target and features due to NaNs in target.")
     print("Final shapes - X:", X.shape, "y:", y.shape)


# 4. Identify Feature Types (UPDATED LISTS)
# --- CHANGE 4: Update feature lists based on merged_credit_data_v2.csv ---
# Based on the merge script output and Kaggle dataset info:
categorical_features = ['employment_status', 'cb_person_default_on_file']
numerical_features = [
    'credit_utilization_ratio',
    'payment_history',
    'original_loan_amount', # Renamed from 'Loan Amount' in merge script
    'loan_term',
    'person_income',
    'loan_amnt',
    'loan_percent_income', # Keep this as a feature now
    'cb_person_cred_hist_length'
]

print("\nIdentified Feature Types (Updated for v2):")
print("Categorical:", categorical_features)
print("Numerical:", numerical_features)

# Re-check if lists match columns in X
all_features = numerical_features + categorical_features
missing_in_X = [f for f in all_features if f not in X.columns]
extra_in_X = [f for f in X.columns if f not in all_features]

if missing_in_X:
    print(f"ERROR: Features defined in lists but not found in DataFrame X: {missing_in_X}")
    exit()
if extra_in_X:
    print(f"ERROR: Features found in DataFrame X but not defined in lists: {extra_in_X}")
    exit()

# 5. Train-Test Split
print("\nSplitting data into Training and Testing sets (80/20)...")
X_train, X_test, y_train, y_test = train_test_split(
    X, y,
    test_size=0.2,
    random_state=42,
    stratify=y # Stratify based on the *actual* loan_status target
)
print("Splitting complete.")
print("X_train shape:", X_train.shape, "| y_train shape:", y_train.shape)
print("X_test shape:", X_test.shape, "| y_test shape:", y_test.shape)

# 6. Preprocessing Pipeline
# --- CHANGE 5: Ensure ColumnTransformer uses the updated lists ---
# (No code change needed if variables were updated correctly above)
print("\nSetting up preprocessing pipeline...")
numerical_transformer = Pipeline(steps=[
    ('scaler', MinMaxScaler())
])
categorical_transformer = Pipeline(steps=[
    ('onehot', OneHotEncoder(handle_unknown='ignore', sparse_output=False))
])
preprocessor = ColumnTransformer(
    transformers=[
        ('num', numerical_transformer, numerical_features), # Uses updated list
        ('cat', categorical_transformer, categorical_features) # Uses updated list
    ],
    remainder='passthrough'
)
print("Preprocessor configured.")

# 7. Model Training
print("\nTraining Random Forest Classifier...")
# Added class_weight='balanced' as target might be imbalanced
rf_model = RandomForestClassifier(n_estimators=100, random_state=42, class_weight='balanced', n_jobs=-1)
full_pipeline = Pipeline(steps=[('preprocessor', preprocessor),
                                ('classifier', rf_model)])
full_pipeline.fit(X_train, y_train)
print("Training complete.")

# 8. Model Evaluation
print("\nEvaluating model on the Test set...")
y_pred = full_pipeline.predict(X_test)
y_pred_proba = full_pipeline.pred3ict_proba(X_test)[:, 1]

accuracy = accuracy_score(y_test, y_pred)
report = classification_report(y_test, y_pred)
try:
    auc = roc_auc_score(y_test, y_pred_proba)
    print(f"Test Set AUC: {auc:.4f}")
except ValueError as e:
    print(f"Could not calculate AUC: {e}")
    auc = "N/A"

print(f"Test Set Accuracy: {accuracy:.4f}")
print("\nTest Set Classification Report:\n", report)


# 9. Saving Artifacts
print("\nSaving the trained model pipeline...")
model_filename = 'credit_model_v2.joblib' # Use a new name for the saved model
joblib.dump(full_pipeline, model_filename)
print(f"Trained Pipeline saved to {model_filename}")

print("\n--- Training Script Finished ---")