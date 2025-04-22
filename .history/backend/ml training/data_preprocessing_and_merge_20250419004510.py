# REVISED base.py (Merging Script)
import numpy as np
import pandas as pd
# Note: MinMaxScaler is NOT needed here, only in the training script
# from sklearn.preprocessing import MinMaxScaler # Remove this if not used elsewhere

# --- Processing credit_scoring.csv ---
print("Loading the credit_scoring.csv dataset...")
df_scoring = pd.read_csv("credit_scoring.csv") # Use a distinct name
print("Scoring dataset loaded successfully.")

print("\nSelecting relevant columns from credit_scoring...")
# KEEP ALL potentially useful columns initially, handle missing later if needed AFTER merge
# Or select carefully, but be aware dropping NaNs here might mismatch rows later
columns_to_keep_scoring = ['Employment Status', 'Credit Utilization Ratio',
                           'Payment History', 'Loan Amount', 'Loan Term']
# Let's be less aggressive with dropping NaNs here initially
df_scoring = df_scoring[columns_to_keep_scoring].copy() # Use .copy() to avoid SettingWithCopyWarning

# --- Processing credit_risk_dataset.csv ---
print("\nLoading and processing the credit_risk_dataset...")
df_risk = pd.read_csv("credit_risk_dataset.csv") # Use a distinct name
print("Risk dataset loaded successfully.")

print("\nSelecting required columns from credit_risk...")
columns_to_keep_risk = ['person_income', 'loan_amnt', 'loan_status', # TARGET is here!
                        'loan_percent_income', 'cb_person_default_on_file',
                        'cb_person_cred_hist_length']
df_risk = df_risk[columns_to_keep_risk].copy() # Use .copy()

# --- Handling Missing Data (More Carefully) ---
# Handle NaNs separately for each dataframe *before* concat if necessary,
# but be mindful that dropping rows will prevent merging if lengths mismatch.
# Option 1: Fill NaNs instead of dropping (Example: fill numerical with median, categorical with mode/unknown)
print("\nHandling missing data (Imputation Example - Adjust as needed)...")

# Impute df_scoring (Example - adjust strategy based on data understanding)
for col in ['Credit Utilization Ratio', 'Payment History', 'Loan Amount', 'Loan Term']:
     if df_scoring[col].isnull().any():
         median_val = df_scoring[col].median()
         df_scoring[col] = df_scoring[col].fillna(median_val)
         print(f"Filled NaNs in df_scoring '{col}' with median ({median_val})")
if df_scoring['Employment Status'].isnull().any():
     mode_val = df_scoring['Employment Status'].mode()[0] # Use mode for categorical
     df_scoring['Employment Status'] = df_scoring['Employment Status'].fillna(mode_val)
     print(f"Filled NaNs in df_scoring 'Employment Status' with mode ({mode_val})")

# Impute df_risk (Example - adjust strategy)
# Crucially, DON'T drop rows with NaN in 'loan_status' if that's the target!
# If 'loan_status' HAS NaNs, you must decide how to handle those records (e.g., remove them)
if df_risk['loan_status'].isnull().any():
     print(f"WARNING: Found {df_risk['loan_status'].isnull().sum()} NaN values in target 'loan_status'. Dropping these rows.")
     df_risk = df_risk.dropna(subset=['loan_status'])

for col in ['person_income', 'loan_amnt', 'loan_percent_income', 'cb_person_cred_hist_length']:
     if df_risk[col].isnull().any():
         median_val = df_risk[col].median()
         df_risk[col] = df_risk[col].fillna(median_val)
         print(f"Filled NaNs in df_risk '{col}' with median ({median_val})")
if df_risk['cb_person_default_on_file'].isnull().any():
     mode_val = df_risk['cb_person_default_on_file'].mode()[0] # Categorical
     df_risk['cb_person_default_on_file'] = df_risk['cb_person_default_on_file'].fillna(mode_val)
     print(f"Filled NaNs in df_risk 'cb_person_default_on_file' with mode ({mode_val})")


# --- DATASET MERGING ---
# Assuming simple concatenation by index is the goal (row 0 from scoring joins row 0 from risk)
# Make sure lengths match if this is the intent! If lengths don't match after handling NaNs,
# this concat method will introduce NaNs where rows are missing in the shorter dataframe.
print(f"\nAttempting to merge datasets... df_scoring length: {len(df_scoring)}, df_risk length: {len(df_risk)}")
if len(df_scoring) != len(df_risk):
    print("WARNING: Lengths of dataframes differ. Concatenation might introduce NaNs or be misaligned.")
    # Consider merging based on a common ID column if available, or trim to the shorter length.
    # Example: Trim to shorter length
    min_len = min(len(df_scoring), len(df_risk))
    print(f"Trimming both dataframes to length {min_len} for concatenation.")
    df_scoring = df_scoring.iloc[:min_len]
    df_risk = df_risk.iloc[:min_len]


print("Merging datasets by concatenating columns...")
merged_df = pd.concat([df_scoring.reset_index(drop=True), df_risk.reset_index(drop=True)], axis=1)
print("Datasets merged successfully. Final shape:", merged_df.shape)
print("Checking for 'loan_status' column in merged data...")
if 'loan_status' in merged_df.columns:
    print("'loan_status' column found!")
    print("Preview of merged data:")
    print(merged_df.head())
else:
    print("ERROR: 'loan_status' column STILL missing after merge. Check merging logic and NaN handling.")
    exit()

# --- Final Steps from original script ---
# Rename columns for consistency (optional, but recommended)
# Example: Rename df_scoring columns to match df_risk where appropriate if needed,
# or rename df_risk columns to be more descriptive.
# Let's rename the original df_scoring columns used in the training script
column_rename_map = {
    'Employment Status': 'employment_status', # Note the space difference in your original sample
    'Credit Utilization Ratio': 'credit_utilization_ratio',
    'Payment History': 'payment_history',
    'Loan Amount': 'original_loan_amount', # Rename to avoid clash with 'loan_amnt'
    'Loan Term': 'loan_term'
}
merged_df = merged_df.rename(columns=column_rename_map)
print("\nRenamed columns for consistency:")
print(merged_df.columns.tolist())


# Optional: Map employment status here instead of training script
# employment_status_mapping = {'Unemployed': 'No', 'Employed': 'Yes', 'Self-Employed': 'Self-Employed'}
# merged_df['employment_status'] = merged_df['employment_status'].map(employment_status_mapping)

# Saving the merged dataset
output_file = "merged_credit_data_v2.csv" # Use a new name to avoid overwriting
merged_df.to_csv(output_file, index=False)
print(f"\nMerged dataset saved successfully to {output_file}.")