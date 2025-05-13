import numpy as np # arrays
import pandas as pd # data manipulation

# processing credit_scoring.csv
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

# selecting columns from dataset for processing
print("\nSelecting relevant columns from credit_scoring...")
columns_to_keep_scoring = ['Employment Status', 'Credit Utilization Ratio',
                           'Payment History', 'Loan Term']

columns_present_scoring = [col for col in columns_to_keep_scoring if col in df_scoring.columns]
if len(columns_present_scoring) < len(columns_to_keep_scoring):
     print(f"Warning: Missing expected columns in credit_scoring.csv: {set(columns_to_keep_scoring) - set(columns_present_scoring)}")
df_scoring = df_scoring[columns_present_scoring].copy()
print(f"Selected columns from scoring: {columns_present_scoring}")


# processing credit_risk_dataset.csv
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
columns_to_keep_risk = ['person_income', 'loan_amnt', 'loan_status',
                        'loan_percent_income', 'cb_person_default_on_file',
                        'cb_person_cred_hist_length']


columns_present_risk = [col for col in columns_to_keep_risk if col in df_risk.columns]
if len(columns_present_risk) < len(columns_to_keep_risk):
     print(f"Warning: Missing expected columns in credit_risk_dataset.csv: {set(columns_to_keep_risk) - set(columns_present_risk)}")
df_risk = df_risk[columns_present_risk].copy() # make a copy
print(f"Selected columns from risk: {columns_present_risk}")


# handling missing data using imputation
print("\nHandling missing data...")

# impute df_scoring (using selected present columns)
for col in ['Credit Utilization Ratio', 'Payment History', 'Loan Term']: # iterate through numeric columns
    if col in df_scoring.columns and df_scoring[col].isnull().any(): # check if column exists and has nans
         median_val = df_scoring[col].median() # calculate median
         df_scoring[col] = df_scoring[col].fillna(median_val) # fill nans with median
         print(f"Filled NaNs in df_scoring '{col}' with median ({median_val})")
if 'Employment Status' in df_scoring.columns and df_scoring['Employment Status'].isnull().any(): # for categorical column
     mode_val = df_scoring['Employment Status'].mode()[0] # calculate mode
     df_scoring['Employment Status'] = df_scoring['Employment Status'].fillna(mode_val) # fill nans with mode
     print(f"Filled NaNs in df_scoring 'Employment Status' with mode ({mode_val})")

# impute df_risk (using selected present columns)
if 'loan_status' in df_risk.columns and df_risk['loan_status'].isnull().any(): # check target column for nans
     print(f"WARNING: Found {df_risk['loan_status'].isnull().sum()} NaN values in target 'loan_status'. Dropping these rows from df_risk.")
     df_risk = df_risk.dropna(subset=['loan_status']) # drop rows missing the target

for col in ['person_income', 'loan_amnt', 'loan_percent_income', 'cb_person_cred_hist_length']: # iterate through numeric columns
    if col in df_risk.columns and df_risk[col].isnull().any(): # check if column exists and has nans
         median_val = df_risk[col].median() # calculate median
         df_risk[col] = df_risk[col].fillna(median_val) # fill nans with median
         print(f"Filled NaNs in df_risk '{col}' with median ({median_val})")
if 'cb_person_default_on_file' in df_risk.columns and df_risk['cb_person_default_on_file'].isnull().any(): # for categorical column
     mode_val = df_risk['cb_person_default_on_file'].mode()[0] # calculate mode
     df_risk['cb_person_default_on_file'] = df_risk['cb_person_default_on_file'].fillna(mode_val) # fill nans with mode
     print(f"Filled NaNs in df_risk 'cb_person_default_on_file' with mode ({mode_val})")


# dataset merging
print(f"\nChecking lengths before concat... df_scoring: {len(df_scoring)}, df_risk: {len(df_risk)}")
if len(df_scoring) == 0 or len(df_risk) == 0: # check if dataframes are empty
    print("ERROR: One or both dataframes are empty after NaN handling. Cannot merge.")
    exit() # stop if one is empty

if len(df_scoring) != len(df_risk): # if lengths are different
    min_len = min(len(df_scoring), len(df_risk)) # find the shorter length
    print(f"WARNING: Trimming dataframes to shorter length: {min_len} for concatenation.")
    df_scoring = df_scoring.iloc[:min_len].reset_index(drop=True) # trim df_scoring and reset index
    df_risk = df_risk.iloc[:min_len].reset_index(drop=True) # trim df_risk and reset index
else:
    # ensure index is sequential if lengths already match
    df_scoring = df_scoring.reset_index(drop=True) # reset index for consistency
    df_risk = df_risk.reset_index(drop=True) # reset index for consistency


print("Merging datasets by concatenating columns...")
# concatenate columns side by side
merged_df = pd.concat([df_scoring, df_risk], axis=1) # join dataframes horizontally
print("Datasets merged successfully. Shape after concat:", merged_df.shape)
print("Columns after concat:", merged_df.columns.tolist())


# adjust renaming map
# rename columns from df_scoring to match conventions expected by training script
print("\nRenaming df_scoring columns for consistency...")
column_rename_map = { # dictionary for renaming
    'Employment Status': 'employment_status',
    'Credit Utilization Ratio': 'credit_utilization_ratio',
    'Payment History': 'payment_history',
    'Loan Term': 'loan_term'
}
merged_df = merged_df.rename(columns=column_rename_map) # apply renaming
print("Columns after renaming:", merged_df.columns.tolist())
# -------------------------------------------


# final checks
if 'loan_status' not in merged_df.columns: # check for target column
    print("ERROR: 'loan_status' column missing in final dataframe!")
    exit()
if 'original_loan_amount' not in merged_df.columns: # check for newly created loan amount column
     print("ERROR: 'original_loan_amount' column missing in final dataframe!")
     exit()


# saving merged dataset
output_file = "merged_credit_data_v2.csv"
merged_df.to_csv(output_file, index=False) # save dataframe to csv without index
print(f"\nCorrected merged dataset saved successfully to {output_file}.")