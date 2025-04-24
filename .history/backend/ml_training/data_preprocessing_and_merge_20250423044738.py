# REVISED base.py (Merging Script v2 - Fixing Loan Amount)
import numpy as np
import pandas as pd
# No other imports like MinMaxScaler needed here

# --- Processing credit_scoring.csv ---
print("Loading the credit_scoring.csv dataset...")
try:
    df_scoring = pd.read_csv("credit_scoring.csv")
    print("Scoring dataset loaded successfully.")
except FileNotFoundError:
    print("ERROR: credit_scoring.csv not found. Make sure it's in the same directory.")
    exit()
except Exception as e:
    print(f"ERROR loading credit_scoring.csv: {e}")
    exit()


print("\nSelecting relevant columns from credit_scoring...")
# --- !!! CHANGE 1: REMOVE 'Loan Amount' from this list to avoid the high values !!! ---
columns_to_keep_scoring = ['Employment Status', 'Credit Utilization Ratio',
                           'Payment History', 'Loan Term']
# ------------------------------------------------------------------------------------
# Select only the columns that reliably exist and don't cause issues
columns_present_scoring = [col for col in columns_to_keep_scoring if col in df_scoring.columns]
if len(columns_present_scoring) < len(columns_to_keep_scoring):
     print(f"Warning: Missing expected columns in credit_scoring.csv: {set(columns_to_keep_scoring) - set(columns_present_scoring)}")
df_scoring = df_scoring[columns_present_scoring].copy()
print(f"Selected columns from scoring: {columns_present_scoring}")


# --- Processing credit_risk_dataset.csv ---
print("\nLoading and processing the credit_risk_dataset...")
try:
    df_risk = pd.read_csv("credit_risk_dataset.csv")
    print("Risk dataset loaded successfully.")
except FileNotFoundError:
     print("ERROR: credit_risk_dataset.csv not found. Make sure it's in the same directory.")
     exit()
except Exception as e:
     print(f"ERROR loading credit_risk_dataset.csv: {e}")
     exit()


print("\nSelecting required columns from credit_risk...")
# --- Ensure 'loan_amnt' and 'loan_status' are included here ---
columns_to_keep_risk = ['person_income', 'loan_amnt', 'loan_status', # TARGET is here!
                        'loan_percent_income', 'cb_person_default_on_file',
                        'cb_person_cred_hist_length']
# ---------------------------------------------------------
# Select only the columns that reliably exist
columns_present_risk = [col for col in columns_to_keep_risk if col in df_risk.columns]
if len(columns_present_risk) < len(columns_to_keep_risk):
     print(f"Warning: Missing expected columns in credit_risk_dataset.csv: {set(columns_to_keep_risk) - set(columns_present_risk)}")
df_risk = df_risk[columns_present_risk].copy()
print(f"Selected columns from risk: {columns_present_risk}")


# --- Handling Missing Data (Using Imputation - Review Strategy) ---
print("\nHandling missing data (Using Imputation)...")

# Impute df_scoring (using selected present columns)
for col in ['Credit Utilization Ratio', 'Payment History', 'Loan Term']:
    if col in df_scoring.columns and df_scoring[col].isnull().any():
         median_val = df_scoring[col].median()
         df_scoring[col] = df_scoring[col].fillna(median_val)
         print(f"Filled NaNs in df_scoring '{col}' with median ({median_val})")
if 'Employment Status' in df_scoring.columns and df_scoring['Employment Status'].isnull().any():
     mode_val = df_scoring['Employment Status'].mode()[0]
     df_scoring['Employment Status'] = df_scoring['Employment Status'].fillna(mode_val)
     print(f"Filled NaNs in df_scoring 'Employment Status' with mode ({mode_val})")

# Impute df_risk (using selected present columns)
if 'loan_status' in df_risk.columns and df_risk['loan_status'].isnull().any():
     print(f"WARNING: Found {df_risk['loan_status'].isnull().sum()} NaN values in target 'loan_status'. Dropping these rows from df_risk.")
     df_risk = df_risk.dropna(subset=['loan_status']) # Drop rows missing the target

for col in ['person_income', 'loan_amnt', 'loan_percent_income', 'cb_person_cred_hist_length']:
    if col in df_risk.columns and df_risk[col].isnull().any():
         median_val = df_risk[col].median()
         df_risk[col] = df_risk[col].fillna(median_val)
         print(f"Filled NaNs in df_risk '{col}' with median ({median_val})")
if 'cb_person_default_on_file' in df_risk.columns and df_risk['cb_person_default_on_file'].isnull().any():
     mode_val = df_risk['cb_person_default_on_file'].mode()[0]
     df_risk['cb_person_default_on_file'] = df_risk['cb_person_default_on_file'].fillna(mode_val)
     print(f"Filled NaNs in df_risk 'cb_person_default_on_file' with mode ({mode_val})")
# --- End Missing Data Handling ---


# --- DATASET MERGING ---
print(f"\nChecking lengths before concat... df_scoring: {len(df_scoring)}, df_risk: {len(df_risk)}")
if len(df_scoring) == 0 or len(df_risk) == 0:
    print("ERROR: One or both dataframes are empty after NaN handling. Cannot merge.")
    exit()

if len(df_scoring) != len(df_risk):
    min_len = min(len(df_scoring), len(df_risk))
    print(f"WARNING: Trimming dataframes to shorter length: {min_len} for concatenation.")
    df_scoring = df_scoring.iloc[:min_len].reset_index(drop=True) # Reset index after slicing
    df_risk = df_risk.iloc[:min_len].reset_index(drop=True) # Reset index after slicing
else:
    # Ensure index is sequential if lengths already match
    df_scoring = df_scoring.reset_index(drop=True)
    df_risk = df_risk.reset_index(drop=True)


print("Merging datasets by concatenating columns...")
# Concatenate columns side-by-side
merged_df = pd.concat([df_scoring, df_risk], axis=1)
print("Datasets merged successfully. Shape after concat:", merged_df.shape)
print("Columns after concat:", merged_df.columns.tolist())


# --- !!! CHANGE 2: CREATE 'original_loan_amount' as copy of 'loan_amnt' !!! ---
# If your training script expects BOTH features, create the second one here.
# It uses the desired data from credit_risk_dataset's 'loan_amnt'.
if 'loan_amnt' in merged_df.columns:
    print("Copying 'loan_amnt' data to 'original_loan_amount' feature...")
    merged_df['original_loan_amount'] = merged_df['loan_amnt']
    print("'original_loan_amount' column created.")
else:
    print("ERROR: 'loan_amnt' column not found after concatenation. Cannot create 'original_loan_amount'. Check column selections.")
    # If 'loan_amnt' itself is missing, something is wrong with the 'columns_to_keep_risk' list or the source CSV
    exit()
# ------------------------------------------------------------------------------------


# --- !!! CHANGE 3: ADJUST Renaming Map !!! ---
# Remove 'Loan Amount' mapping. We now handle loan amount feature naming explicitly above.
# Rename columns from df_scoring to match conventions expected by training script.
print("\nRenaming df_scoring columns for consistency...")
column_rename_map = {
    'Employment Status': 'employment_status',          # Check exact capitalization if needed
    'Credit Utilization Ratio': 'credit_utilization_ratio',
    'Payment History': 'payment_history',
    'Loan Term': 'loan_term'
    # DO NOT rename 'loan_amnt' or 'original_loan_amount' here as they were
    # either selected directly with that name or created with that name.
}
merged_df = merged_df.rename(columns=column_rename_map)
print("Columns after renaming:", merged_df.columns.tolist())
# -------------------------------------------


# Final checks
if 'loan_status' not in merged_df.columns:
    print("ERROR: 'loan_status' column missing in final dataframe!")
    exit()
if 'original_loan_amount' not in merged_df.columns:
     print("ERROR: 'original_loan_amount' column missing in final dataframe!")
     exit()


# Saving the merged dataset
output_file = "merged_credit_data_v2.csv" # Overwrite previous version or use v3
merged_df.to_csv(output_file, index=False)
print(f"\nCorrected merged dataset saved successfully to {output_file}.")