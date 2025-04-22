import express from 'express'; // Using ES Module syntax (ensure "type": "module" in package.json or use require)
import mysql from 'mysql2/promise'; // Using promise version of mysql2
import cors from 'cors';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
import { Configuration, PlaidApi, PlaidEnvironments } from 'plaid';
import fetch from 'node-fetch'; // node-fetch v3+ is ESM only

dotenv.config(); // Load .env file variables FIRST
// --- ----------------- ---


// --- Environment Variable Checks & Setup ---
const PORT = process.env.PORT || 5000;
const PYTHON_PREDICTION_URL = process.env.PYTHON_PREDICTION_SERVICE_URL;
const JWT_SECRET = process.env.JWT_SECRET;
const PLAID_CLIENT_ID = process.env.PLAID_CLIENT_ID;
const PLAID_SECRET_SANDBOX = process.env.PLAID_SECRET_SANDBOX;
// Add DEV/PROD secrets later if needed
// const PLAID_SECRET_DEVELOPMENT = process.env.PLAID_SECRET_DEVELOPMENT;
// const PLAID_SECRET_PRODUCTION = process.env.PLAID_SECRET_PRODUCTION;

// Critical startup checks
if (!JWT_SECRET) { console.error("FATAL ERROR: JWT_SECRET not defined in .env file."); process.exit(1); }
if (!PLAID_CLIENT_ID || !PLAID_SECRET_SANDBOX) { console.error("FATAL ERROR: Plaid Client ID or Sandbox Secret not defined in .env."); process.exit(1); }
if (!PYTHON_PREDICTION_URL) { console.error("CRITICAL WARNING: PYTHON_PREDICTION_SERVICE_URL not set. Assessment endpoint WILL FAIL."); }
if (!process.env.DB_PASSWORD) { console.warn("WARNING: DB_PASSWORD not set in .env."); }
// --- ----------------------------------- ---

const app = express();

// Middleware
app.use(cors()); // TODO: Configure specific origins for production
app.use(express.json()); // Parse JSON request bodies

// --- Plaid Client Configuration ---
// Determine Plaid environment (Defaulting to Sandbox for now)
let plaidEnv = PlaidEnvironments.sandbox;
let plaidSecret = PLAID_SECRET_SANDBOX;
// TODO: Logic based on NODE_ENV to switch keys/environments
// Example: if (process.env.NODE_ENV === 'production') { plaidEnv = PlaidEnvironments.production; plaidSecret = PLAID_SECRET_PRODUCTION; }

const plaidConfig = new Configuration({
    basePath: plaidEnv,
    baseOptions: {
        headers: {
            'PLAID-CLIENT-ID': PLAID_CLIENT_ID,
            'PLAID-SECRET': plaidSecret,
            'Plaid-Version': '2020-09-14' // Keep Plaid API version consistent
        },
    },
});
const plaidClient = new PlaidApi(plaidConfig);
// --- ------------------------ ---

// --- MySQL Connection Pool ---
let dbPool;
try {
    dbPool = mysql.createPool({
        connectionLimit: 10, // Max number of connections
        host: process.env.DB_HOST || 'localhost',
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD, // Loaded from .env
        database: process.env.DB_NAME || 'dpp_db',
        waitForConnections: true, // Wait if pool is full
        queueLimit: 0 // No limit on waiting queue
    });
    // Test connection pool during startup
    dbPool.getConnection()
        .then(connection => {
            console.log('✅ MySQL Pool connected successfully!');
            connection.release(); // Release the test connection
        })
        .catch(err => {
            console.error('❌ MySQL Pool initial connection error:', err);
            process.exit(1); // Exit if DB is essential and unavailable
        });
} catch (err) {
     console.error('❌ Failed to create MySQL Pool:', err);
     process.exit(1);
}
// --- --------------------- ---

// --- HELPER FUNCTIONS ---

/**
 * Formats a date string 'YYYY-MM-DD' to match SQL DATE type.
 * Returns null if format is invalid.
 * @param {string} date - Input date string.
 * @returns {string | null} Formatted date string or null.
 */
const formatDate = (date) => {
    if (!date || typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        console.warn(`Invalid date format passed to formatDate: ${date}. Expected YYYY-MM-DD.`);
        return null;
    }
    return date; // Assumes DB column is DATE or DATETIME
};

/**
 * Middleware to verify JWT token from Authorization header.
 * Attaches decoded user info (id, email) to req.user on success.
 * Sends 401/403 response on failure.
 * @param {object} req - Express request object.
 * @param {object} res - Express response object.
 * @param {function} next - Express next middleware function.
 */
const authenticateUser = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader?.startsWith('Bearer ') ? authHeader.split(' ')[1] : null;

    if (!token) {
        console.log("Auth failure: No token provided.");
        return res.status(401).json({ success: false, message: 'Authorization token required.' });
    }

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        if (!decoded.id) throw new Error("Token payload missing user ID."); // Ensure payload has ID
        req.user = { id: decoded.id, email: decoded.email }; // Attach user details
        // console.log(`➡️ Request Authenticated - UserID: ${req.user.id}`); // Uncomment for verbose logging
        next(); // Proceed to the route handler
    } catch (err) {
        console.error("JWT Verification Error:", err.message);
        if (err.name === 'TokenExpiredError') {
            return res.status(401).json({ success: false, message: 'Session expired. Please log in again.' });
        }
        // For other errors (JsonWebTokenError, NotBeforeError)
        return res.status(403).json({ success: false, message: 'Invalid or failed token authentication.' });
    }
};

/**
 * Maps the raw risk score (0-1) from the ML model to a credit tier, limit, and terms.
 * @param {number | null} riskScore - The output score from the prediction model.
 * @returns {object} Object containing tier, limit, terms, and optional error.
 */
function mapScoreToEntitlements(riskScore) {
    if (riskScore === null || typeof riskScore !== 'number' || isNaN(riskScore)) {
        console.error("Mapping failed: Invalid risk score input:", riskScore);
        return { tier: 3, limit: 500.00, terms: [3], error: "Assessment score invalid" }; // Default high-risk/error tier
    }

    const TIER_1_THRESHOLD = 0.2; // Low risk below this score
    const TIER_2_THRESHOLD = 0.5; // Medium risk below this score

    console.log(`   Mapping score ${riskScore.toFixed(4)} to entitlements...`);
    if (riskScore < TIER_1_THRESHOLD) {
        console.log(`   -> Tier 1 (Low Risk)`);
        return { tier: 1, limit: 5000.00, terms: [3, 6, 12] };
    } else if (riskScore < TIER_2_THRESHOLD) {
        console.log(`   -> Tier 2 (Medium Risk)`);
        return { tier: 2, limit: 2500.00, terms: [3, 6] };
    } else {
        console.log(`   -> Tier 3 (High Risk)`);
        return { tier: 3, limit: 1000.00, terms: [3] };
    }
}

// --- Calculation Functions with Example Logic ---

/**
 * Calculates estimated credit utilization ratio.
 * Priority: Plaid Liabilities > Plaid Auth.
 * @returns {number | null} Estimated utilization ratio (0.0 to >1.0), or null if error/no data.
 */
function calculate_util_ratio(plaidAuthData, plaidLiabilitiesData) {
    console.log("  -> Calculating Util Ratio...");
    let totalCurrentBalance = 0; let totalLimit = 0; let foundCredit = false;

    try {
        if (plaidLiabilitiesData?.liabilities?.credit?.length > 0) {
            plaidLiabilitiesData.liabilities.credit.forEach(acc => {
                totalCurrentBalance += (acc.balances?.current ?? 0);
                totalLimit += (acc.balances?.limit ?? 0);
                foundCredit = true;
            });
            console.log(`     Util from Liabilities: Bal=${totalCurrentBalance.toFixed(2)}, Lim=${totalLimit.toFixed(2)}`);
        } else if (plaidAuthData?.accounts?.length > 0) {
            console.log("     Liabilities not found or empty, falling back to Auth data...");
            plaidAuthData.accounts.forEach(acc => {
                if (acc.type === 'credit') {
                    totalCurrentBalance += (acc.balances?.current ?? 0);
                    totalLimit += (acc.balances?.limit ?? 0); // Often null/zero here
                    foundCredit = true;
                }
            });
            if(foundCredit) console.log(`     Util from Auth (Limit maybe inaccurate): Bal=${totalCurrentBalance.toFixed(2)}, Lim=${totalLimit.toFixed(2)}`);
        }

        if (!foundCredit) { console.log("     No credit accounts found via Plaid. Returning 0.0."); return 0.0; }
        if (totalLimit <= 0) { console.warn("     Total credit limit is zero/undet. Using balance only."); return (totalCurrentBalance > 0 ? 1.1 : 0.0); } // Return >1 if balance exists w/o limit

        const ratio = Math.max(0, totalCurrentBalance) / totalLimit;
        console.log(`     Calculated Util Ratio: ${ratio.toFixed(4)}`);
        return ratio;

    } catch (error) {
        console.error("     Error in calculate_util_ratio:", error);
        return null; // Return null on error
    }
}

/**
 * Calculates a heuristic payment history score. Higher = better.
 * Uses DB historical value and adjusts based on recent Plaid flags.
 * @returns {number} Numerical score (e.g., 0-1000).
 */
function calculate_payment_history(plaidTransactions, latestCreditData, userData) {
    console.log("  -> Calculating Payment History Score...");
    try {
        // Start with historical score if available, else use a baseline
        const baselineScore = latestCreditData?.payment_history ? Number(latestCreditData.payment_history) : 500; // Use 500 if no history
        let score = baselineScore;
        const maxScore = 1000; const minScore = 0; // Define score range

        // Adjust based on recent negative Plaid events
        const sixMonthsAgo = new Date(); sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
        const dateThresholdStr = sixMonthsAgo.toISOString().split('T')[0];
        let negativeEvents = 0;
        const negativeKeywords = ['nsf fee', 'overdraft fee', 'late fee', 'returned payment', 'insufficient fund'];
        if(plaidTransactions && Array.isArray(plaidTransactions)){
            plaidTransactions.filter(tx => tx.date >= dateThresholdStr).forEach(tx => {
                const desc = (tx.name || tx.merchant_name || '').toLowerCase();
                if (tx.amount > 0 && negativeKeywords.some(k => desc.includes(k))) negativeEvents++;
            });
        }

        const negEventPenalty = 30; // Smaller penalty per event
        score -= negativeEvents * negEventPenalty;
        if (negativeEvents > 0) console.log(`     Applied penalty for ${negativeEvents} negative events.`);

        // Adjust based on overall default flag from users table
        const defaultFlagPenalty = 100; // Moderate penalty
        if (userData?.cb_person_default_on_file === 'Y') {
            console.log(`     Applying penalty for existing default flag.`);
            score -= defaultFlagPenalty;
        }

        // Ensure score stays within bounds
        score = Math.max(minScore, Math.min(maxScore, score));
        console.log(`     Calculated History Score: ${Math.round(score)} (Base: ${baselineScore})`);
        return Math.round(score); // Return integer score

    } catch (error) {
        console.error("     Error in calculate_payment_history:", error);
        return 500; // Return neutral default on error
    }
}

/**
 * Calculates loan percent income.
 * @returns {number | null} Ratio or null if invalid inputs.
 */
function calculate_lpi(loan_amnt, person_income) {
    const incomeNum = Number(person_income); const loanNum = Number(loan_amnt);
    if (!isNaN(incomeNum) && incomeNum > 0 && !isNaN(loanNum) && loanNum >= 0) {
        const ratio = loanNum / incomeNum;
        return ratio; // Keep precision
    }
    console.warn(`     Could not calculate LPI. Loan: ${loan_amnt}, Income: ${person_income}`);
    return null; // Return null if calculation fails
}

/**
 * Maps database employment status ENUM to the string expected by the ML model.
 * @param {string | null} dbStatus - Status from DB ('EMPLOYED', 'UNEMPLOYED', etc.)
 * @returns {string} Mapped status ('Yes', 'No', 'Self-Employed')
 */
function mapEmploymentStatus(dbStatus) {
    if (dbStatus === 'EMPLOYED') return 'Yes';
    if (dbStatus === 'SELF_EMPLOYED') return 'Self-Employed';
    // Map all others (UNEMPLOYED, STUDENT, RETIRED, OTHER, null) to 'No'
    // !! Double-check if this mapping aligns with your original training data !!
    return 'No';
}
// --- ----------------------------- ---

// === ROUTES ===

// Registration Route
app.post('/register', async (req, res) => { /* ... (No changes from previous version) ... */ });

// Login Route
app.post('/login', async (req, res) => { /* ... (No changes from previous version) ... */ });

// --- Plaid Endpoints ---
app.post('/api/create_link_token', authenticateUser, async (req, res) => { /* ... (No changes from previous version) ... */ });
app.post('/api/exchange_public_token', authenticateUser, async (req, res) => { /* ... (No changes from previous version) ... */ });
// -----------------------

// --- Credit Assessment Endpoint ---
app.post('/api/assess_credit', authenticateUser, async (req, res) => {
    const userId = req.user.id;
    console.log(`\n⚙️ Assessment request for User ID: ${userId}`);
    const requested_loan_amount = req.body.requested_loan_amount || null;
    const requested_loan_term = req.body.requested_loan_term || null;

    // 1. Get Access Token
    let accessToken;
    try { /* ... fetch accessToken ... */ } catch (dbError) { /* ... */ }
    if (!accessToken) return res.status(400).json({ success: false, message: 'Plaid connection required.' });

    // 2. Fetch Plaid Data
    console.log(`⏳ Fetching Plaid data for User ID: ${userId}`);
    let plaidTransactions = [], plaidAuthData = null, plaidLiabilitiesData = null ;
    try { /* ... All Plaid API calls (Sync, Auth, Liabilities, Identity, etc.)... */ }
    catch (plaidError) { /* ... Plaid error handling ... */ return res.status(503).json({success: false, message: 'Failed fetching bank data.'}); }

    // 3. Prepare Features for Python Service
    console.log(`⏳ Preparing features for User ID: ${userId}`);
    let rawFeaturesForModel = {};
    try {
        // Fetch latest credit_data and needed user data fields
        const creditSql = `SELECT * FROM credit_data WHERE user_id = ? ORDER BY recorded_at DESC LIMIT 1`;
        const userSql = `SELECT person_income, employment_status, cb_person_default_on_file, cb_person_cred_hist_length FROM users WHERE user_id = ?`;
        const [[latestCreditData], [userData]] = await Promise.all([
            dbPool.query(creditSql, [userId]),
            dbPool.query(userSql, [userId])
        ]);
        const creditData = latestCreditData || {}; // Use empty object if no history
        if (!userData) return res.status(404).json({ success: false, message: 'User profile data not found.' });

        // --- Map Features - Prioritize sources, use calculation helpers ---
        const person_income_final = /* TODO: Prioritize Plaid Income ? */ creditData.person_income || userData.person_income || 0;
        const loan_amnt_final = requested_loan_amount || creditData.original_loan_amount || 0; // Prioritize requested?
        const loan_term_final = requested_loan_term || creditData.loan_term || 0;       // Prioritize requested?

        rawFeaturesForModel = {
            // Keys MUST match Python script's expected input features
            // Perform mapping for categorical features
            'employment_status': mapEmploymentStatus(userData.employment_status || creditData.employment_status), // Use helper
            'cb_person_default_on_file': userData.cb_person_default_on_file || creditData.cb_person_default_on_file || 'N', // Already 'Y'/'N'?

            // Numerical features
            'person_income': person_income_final,
            'cb_person_cred_hist_length': Number(userData.cb_person_cred_hist_length || creditData.cb_person_cred_hist_length || 0),
            'original_loan_amount': Number(creditData.original_loan_amount || 0), // Historical value
            'loan_term': Number(loan_term_final),   // Current term being assessed
            'loan_amnt': Number(loan_amnt_final),     // Current amount being assessed

            // Calculated features
            'credit_utilization_ratio': calculate_util_ratio(plaidAuthData, plaidLiabilitiesData) ?? creditData.credit_utilization_ratio ?? 0.1, // Pass ONLY needed plaid data
            'payment_history': calculate_payment_history(plaidTransactions, userData) ?? creditData.payment_history ?? 500, // Base 500 if no history
            'loan_percent_income': calculate_lpi(loan_amnt_final, person_income_final) ?? creditData.loan_percent_income ?? null, // Recalculate
        };

        // Final cleanup for nulls and ensure types before sending
        for (const key in rawFeaturesForModel) {
             if (rawFeaturesForModel[key] === null || rawFeaturesForModel[key] === undefined) {
                console.warn(`Feature '${key}' is null/undefined, replacing with default.`);
                 // Assign more specific defaults if needed
                if (key === 'employment_status') rawFeaturesForModel[key] = 'No'; // Use model's expected default format
                else if (key === 'cb_person_default_on_file') rawFeaturesForModel[key] = 'N';
                else rawFeaturesForModel[key] = 0; // Default for numerical
             }
             // Ensure numerical features are numbers
             if (['person_income', 'cb_person_cred_hist_length', 'original_loan_amount', 'loan_term', 'loan_amnt', 'credit_utilization_ratio', 'payment_history', 'loan_percent_income'].includes(key)){
                 rawFeaturesForModel[key] = Number(rawFeaturesForModel[key]);
                 if(isNaN(rawFeaturesForModel[key])) {
                    console.warn(`Feature '${key}' was NaN after conversion, setting to 0.`);
                    rawFeaturesForModel[key] = 0; // Fallback for NaN numericals
                 }
             }
        }
        console.log("✅ Raw features prepared:", rawFeaturesForModel);

    } catch (dataPrepError) {
        console.error(`❌ Error preparing features for User ${userId}:`, dataPrepError);
        return res.status(500).json({ success: false, message: 'Internal error preparing assessment data.' });
    }

    // --- 4. Call Python Service ---
    let riskScore = null;
    if (!PYTHON_PREDICTION_URL) return res.status(503).json({ success: false, message: 'Assessment config error.' });
    try {
        console.log(`⏳ Calling Python prediction service for User ID: ${userId}`);
        const predictionResponse = await fetch(PYTHON_PREDICTION_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ features: rawFeaturesForModel }) });
        // ... (error checking and parsing response as before) ...
        riskScore = (await predictionResponse.json()).risk_score;
    } catch (fetchError) { /* ... error handling ... */ return res.status(503).json({ success: false, message: 'Assessment service unavailable.' });}

    // --- 5. Map Score ---
    const entitlements = mapScoreToEntitlements(riskScore);

    // --- 6. Store Result in 'credit_assessments' ---
    if (entitlements && !entitlements.error && typeof riskScore === 'number' && !isNaN(riskScore)) {
        try { /* ... (INSERT logic from previous example, using dbPool) ... */ }
        catch (dbStoreError) { /* ... log DB error ... */ }
    } else { /* ... log skip reason ... */ }

    // --- 7. Return Result ---
    console.log(`✅ Assessment complete for User ID ${userId}. Entitlements:`, entitlements);
    res.status(200).json({ success: true, entitlements });
});
// --- ------------------------------ ---


// --- NEW Endpoint: Get Current User Entitlements ---
app.get('/api/current_entitlements', authenticateUser, async (req, res) => {
    // (Keep function logic from previous example, using dbPool)
    // ... Ensure parsing of calculated_terms from JSON ...
});
// === ---------------------------------------- ===


// === Basic Test Auth Route ===
app.get('/api/test-auth', authenticateUser, (req, res) => { res.json({ success: true, message: `Auth OK for user ID: ${req.user.id}`}); });
// === --------------------- ===

// Global Error Handler
app.use((err, req, res, next) => {
  console.error("Unhandled Server Error:", err.stack || err);
  res.status(500).send({ success: false, message: 'An unexpected server error occurred.' });
});

// Start Server
app.listen(PORT, () => {
    console.log(`\n🚀 Server running on port ${PORT}`);
    console.log(`🔗 Plaid Env: ${plaidEnv}`); // Check which Plaid env is active
    console.log(`🐍 Python URL: ${PYTHON_PREDICTION_URL || 'NOT SET!'}`);
    console.log(`🔑 JWT Secret Loaded: ${JWT_SECRET ? 'Yes' : 'NO!'}`);
});