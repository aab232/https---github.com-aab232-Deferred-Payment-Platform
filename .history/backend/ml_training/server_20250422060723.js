// ========================================================
// server.js - COMPLETE BACKEND CODE v4 (SIMULATED ASSESSMENT)
// Includes original features + Plaid Setup + ML Assessment (DB ONLY) + BNPL Order
// ========================================================

// --- Core Dependencies ---
const express = require('express');
const mysql = require('mysql2'); // Using mysql2
const cors = require('cors');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

// --- Added Dependencies ---
require('dotenv').config(); // Load .env file variables FIRST
const { Configuration, PlaidApi, PlaidEnvironments } = require('plaid');
const fetch = require('node-fetch'); // Using require for fetch
// --- -------------------- ---


// --- Environment Variable Checks & Setup ---
const PORT = process.env.PORT || 5000;
const PYTHON_PREDICTION_URL = process.env.PYTHON_PREDICTION_SERVICE_URL;
const JWT_SECRET = process.env.JWT_SECRET;
const PLAID_CLIENT_ID = process.env.PLAID_CLIENT_ID;
const PLAID_SECRET_SANDBOX = process.env.PLAID_SECRET_SANDBOX; // Use this for Sandbox env

// Critical startup checks
if (!JWT_SECRET) { console.error("FATAL ERROR: JWT_SECRET not defined in .env file."); process.exit(1); }
if (!PLAID_CLIENT_ID || !PLAID_SECRET_SANDBOX) { console.error("FATAL ERROR: Plaid Client ID or Sandbox Secret not defined in .env."); process.exit(1); }
if (!PYTHON_PREDICTION_URL) { console.error("CRITICAL WARNING: PYTHON_PREDICTION_SERVICE_URL not set. Assessment endpoint WILL FAIL."); }
if (!process.env.DB_PASSWORD) { console.warn("WARNING: DB_PASSWORD not set in .env.");}
// --- ----------------------------------- ---

const app = express();

// Middleware
app.use(cors()); // TODO: Configure specific origins for production
app.use(express.json()); // Parse JSON request bodies

// --- Plaid Client Configuration ---
let plaidEnv = PlaidEnvironments.sandbox; // Default to Sandbox
let plaidSecret = PLAID_SECRET_SANDBOX;
// TODO: Logic based on NODE_ENV to switch keys/environments
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
    }).promise(); // Use promise wrapper for async/await

    // Check DB Pool on startup
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

// Password Validator (Original - keep if validation is desired)
const isValidPassword = (password) => {
    if (!password) return false;
    const passwordRegex = /^(?=.*\d.*\d)(?=.*[!@#$%^&*]).{8,}$/;
    return passwordRegex.test(password);
};

// Updated Date Formatter (Handles YYYY-MM-DD and DD-MM-YYYY)
const formatDate = (date) => {
    // Expects 'YYYY-MM-DD' (from HTML date input) or potentially 'DD-MM-YYYY'
    if (!date || typeof date !== 'string') return null;

    if (/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        return date; // Already in SQL standard DATE format
    } else if (/^\d{2}-\d{2}-\d{4}$/.test(date)) {
        // Convert DD-MM-YYYY to YYYY-MM-DD
        const [day, month, year] = date.split('-');
        return `${year}-${month}-${day}`;
    } else {
        console.warn(`Invalid or unexpected date format passed to formatDate: ${date}.`);
        return null; // Return null if format is unusable
    }
};


// Updated JWT Auth Middleware
const authenticateUser = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    // Expect 'Bearer YOUR_TOKEN' format
    const token = authHeader?.startsWith('Bearer ') ? authHeader.split(' ')[1] : null;

    if (!token) {
        console.log("Auth failure: No token provided.");
        // 401 Unauthorized is appropriate here
        return res.status(401).json({ success: false, message: 'Authorization token required.' });
    }

    try {
        // Verify token using the secret from .env
        const decoded = jwt.verify(token, JWT_SECRET);
        // Check if the decoded payload contains the user ID
        if (!decoded || !decoded.id) {
            // This indicates a problem with the token generation or the token itself
            console.error("JWT decoded payload missing 'id'. Payload:", decoded);
            throw new Error("Invalid token payload."); // Treat as verification failure
        }
        // Attach user info (id and email) to the request object for later use
        req.user = { id: decoded.id, email: decoded.email };
        // console.log(`➡️ Req Auth UserID: ${req.user.id}`); // Uncomment for verbose logging
        next(); // Token is valid, proceed to the route handler
    } catch (err) {
        console.error("JWT Verification Error:", err.message);
        // Handle specific JWT errors
        if (err.name === 'TokenExpiredError') {
            return res.status(401).json({ success: false, message: 'Session expired. Please log in again.' });
        }
        // For other errors like JsonWebTokenError (malformed), NotBeforeError etc.
        // 403 Forbidden is often used for invalid tokens
        return res.status(403).json({ success: false, message: 'Invalid or failed token authentication.' });
    }
};

// Helper: Map Score to Entitlements
function mapScoreToEntitlements(riskScore) {
    // Ensure score is valid before mapping
    if (riskScore === null || typeof riskScore !== 'number' || isNaN(riskScore)) {
        console.error("Mapping failed: Invalid risk score input:", riskScore);
        // Return a default high-risk/error tier consistently
        return { tier: 3, limit: 500.00, terms: [3], error: "Assessment score invalid" };
    }
    // Define clear thresholds for different tiers (Adjust these based on your model/risk appetite)
    const TIER_1_THRESHOLD = 0.2; // Example: Score < 0.2 is Low Risk
    const TIER_2_THRESHOLD = 0.5; // Example: Score < 0.5 is Medium Risk

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

// Helper: Map DB Employment Status Enum to Model String
function mapEmploymentStatus(dbStatus) {
    if (!dbStatus) return 'No'; // Default if null
    const statusUpper = dbStatus.toUpperCase(); // Standardize case
    if (statusUpper === 'EMPLOYED') return 'Yes';
    if (statusUpper === 'SELF_EMPLOYED') return 'Self-Employed';
    // Map all others ('UNEMPLOYED', 'STUDENT', 'RETIRED', 'OTHER') to 'No'
    // !!! This mapping is critical - ensure it matches your ML model's training data !!!
    return 'No';
}
// --- ------------------------------------------------------------------------- ---


// --- Calculation Functions (Implement with REAL logic) ---
// TODO: Replace these placeholders with robust calculations using available data
function calculate_util_ratio(plaidAuthData, plaidLiabilitiesData, historicalRatio) {
    // In SIMULATION, plaidAuthData and plaidLiabilitiesData will be null.
    console.log("  -> Calculating Util Ratio (SIMULATED - Using Fallback)...");
    // Use historical data if available, otherwise a default
    // Ensure the fallback is a number
    const fallbackRatio = (historicalRatio !== null && !isNaN(Number(historicalRatio))) ? Number(historicalRatio) : 0.1;
    console.log(`     Util Ratio (DB based): ${fallbackRatio.toFixed(4)}`);
    return fallbackRatio; // Example: return 10% if no history or error
}

function calculate_payment_history(plaidTransactions, userData, historicalScore) {
    // In SIMULATION, plaidTransactions will be empty array.
    console.log("  -> Calculating Payment History Score (SIMULATED - Using DB)...");
    try {
        // Start with historical score from DB or baseline
        const baseScore = (historicalScore !== null && !isNaN(Number(historicalScore))) ? Number(historicalScore) : 500; // Use 500 if no history
        let score = baseScore;
        const maxScore = 1000, minScore = 0; // Define score range
        // Apply penalty only based on static user data (since no Plaid Txns)
        const defaultPenalty = 100;
        if (userData?.cb_person_default_on_file === 'Y') {
            score -= defaultPenalty;
            console.log(`     Penalty applied for default flag.`);
        }
        // Ensure score stays within bounds
        score = Math.max(minScore, Math.min(maxScore, score));
        console.log(`     History Score (DB based): ${Math.round(score)}`);
        return Math.round(score); // Return integer score
    } catch (e) {
        console.error(" Error calculating payment history (DB):", e);
        return 500; // Return neutral default on error
    }
}

function calculate_lpi(loan_amnt, person_income) {
    const incomeNum = Number(person_income); const loanNum = Number(loan_amnt);
    // Check for valid positive income and non-negative loan amount
    if (!isNaN(incomeNum) && incomeNum > 0 && !isNaN(loanNum) && loanNum >= 0) {
        const ratio = loanNum / incomeNum; return ratio;
    }
    console.warn(`     Could not calculate LPI. Loan: ${loan_amnt}, Income: ${person_income}`);
    return null; // Indicate calculation failed
}
// --- ----------------------------------------- ---


// === ROUTES ===

// Registration Route
app.post('/register', async (req, res) => {
    const { first_name, surname, email, password, phone_number, ni_number, date_of_birth } = req.body;
    // --- Input Validation ---
    if (!first_name || !surname || !email || !password || !date_of_birth) return res.status(400).json({ success: false, message: 'Missing required fields.' });
    if (!/\S+@\S+\.\S+/.test(email)) return res.status(400).json({ success: false, message: 'Invalid email format.' });
    const formattedDOB = formatDate(date_of_birth); // Expects YYYY-MM-DD input
    if (!formattedDOB && date_of_birth) return res.status(400).json({ success: false, message: 'Invalid date format (YYYY-MM-DD required).' });
    // Optional: Add password check using isValidPassword(password)
    // if (!isValidPassword(password)) return res.status(400).json({ success: false, message: 'Password does not meet complexity requirements.' });
    // --- --------------- ---
    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        const newUser = { first_name, surname, email, password: hashedPassword, phone_number: phone_number || null, ni_number: ni_number || null, date_of_birth: formattedDOB };
        const sql = 'INSERT INTO users (first_name, surname, email, password, phone_number, ni_number, date_of_birth) VALUES (?, ?, ?, ?, ?, ?, ?)'; // Be explicit
        const [result] = await dbPool.query(sql, [newUser.first_name, newUser.surname, newUser.email, newUser.password, newUser.phone_number, newUser.ni_number, newUser.date_of_birth]);
        console.log(`✅ User Registered: ${email} (ID: ${result.insertId})`);
        res.status(201).json({ success: true, message: 'Registration successful!' });
    } catch (error) {
        console.error('❌ Registration Server Error:', error);
        if (error.code === 'ER_DUP_ENTRY') return res.status(409).json({ success: false, message: 'Email already registered.' });
        res.status(500).json({ success: false, message: 'Registration failed.' });
    }
});

// Login Route
app.post('/login', async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ success: false, message: 'Email/Password required.' });
    try {
        const sql = 'SELECT user_id, email, password FROM users WHERE email = ? LIMIT 1';
        const [results] = await dbPool.query(sql, [email]);
        if (results.length === 0) { console.log(`Login fail: Email not found - ${email}`); return res.status(401).json({ success: false, message: 'Invalid credentials.' }); }
        const user = results[0];
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) { console.log(`Login fail: Pwd mismatch - User ID ${user.user_id}`); return res.status(401).json({ success: false, message: 'Invalid credentials.' }); }
        const payload = { id: user.user_id, email: user.email };
        const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '8h' });
        console.log(`✅ User Logged In: ${user.email} (ID: ${user.user_id})`);
        res.status(200).json({ success: true, message: 'Login successful!', token });
    } catch (error) {
        console.error('❌ Login Server Error:', error);
        res.status(500).json({ success: false, message: 'Login failed.' });
    }
});


// --- Plaid Endpoints (Setup for Demonstration) ---
// Create Plaid Link Token
app.post('/api/create_link_token', authenticateUser, async (req, res) => {
    const userId = req.user.id;
    console.log(`⚙️ Creating link token request for User ID: ${userId}`);
    const request = {
        user: { client_user_id: userId.toString() },
        client_name: 'Deferred Payment Platform (Demo)', // Your App Name
        language: 'en',
        products: ['auth', 'transactions', 'identity', 'liabilities'], // Products for real flow
        country_codes: ['GB'], // Target countries
    };
    try {
        const response = await plaidClient.linkTokenCreate(request);
        console.log("✅ Link token created.");
        res.json({ link_token: response.data.link_token });
    } catch (error) {
        console.error('❌ Plaid link token error:', error.response?.data || error.message);
        res.status(500).json({ success: false, message: 'Could not initiate bank link simulation setup.' });
    }
});

// Exchange Public Token for Access Token (Stores Token - good for showing complete flow intent)
app.post('/api/exchange_public_token', authenticateUser, async (req, res) => {
    // In the simulation, the frontend might just show a success message instead of calling this,
    // OR you can call this with a FAKE public token if Plaid Sandbox allows exchange without full Link flow (unlikely).
    // Let's assume frontend calls this after showing a simulated success message, perhaps without a real token.
    const userId = req.user.id;
    const { public_token: publicToken } = req.body; // May be null/fake in simulation
    console.log(`⚙️ SIMULATED Exchange public token request for User ID: ${userId}`);

    if (!publicToken && plaidEnv === PlaidEnvironments.sandbox) {
        // For simulation: We didn't get a real public token. Store a placeholder/flag.
        // NOTE: You cannot get a *real* access token without a *real* public token from Link.
        console.warn("   No public token provided (Simulation Mode). Storing placeholder token info.");
         const fakeAccessToken = `simulated-access-${userId}-${Date.now()}`;
         const fakeItemId = `simulated-item-${userId}`;
         try {
             const sql = 'UPDATE users SET plaid_access_token = ?, plaid_item_id = ? WHERE user_id = ?';
             const [result] = await dbPool.query(sql, [fakeAccessToken, fakeItemId, userId]);
             if (result.affectedRows === 0) return res.status(404).json({ success: false, message: 'User not found.' });
             console.log(`✅ SIMULATED Plaid tokens stored for User ID: ${userId}`);
             res.json({ success: true, message: 'Bank account linked (Simulated).' });
         } catch (dbError) {
              console.error("   DB Error storing simulated Plaid info:", dbError);
              res.status(500).json({ success: false, message: 'Failed to save simulated bank link.' });
         }
         return; // Stop here for simulation
    }

    // If a REAL public token was somehow provided (e.g., testing Plaid Link itself separately)
    if (!publicToken) return res.status(400).json({ success: false, message: 'Public token required.' });
    try {
        console.log("   Attempting real token exchange (should not happen in normal simulation flow)...");
        const response = await plaidClient.itemPublicTokenExchange({ public_token: publicToken });
        const { access_token: accessToken, item_id: itemId } = response.data;
        console.log(`   REAL Access token obtained for Item ID: ${itemId}`);
        const sql = 'UPDATE users SET plaid_access_token = ?, plaid_item_id = ? WHERE user_id = ?';
        const [result] = await dbPool.query(sql, [accessToken, itemId, userId]);
        if (result.affectedRows === 0) return res.status(404).json({ success: false, message: 'User not found.' });
        console.log(`✅ REAL Plaid tokens stored for User ID: ${userId}`);
        res.json({ success: true, message: 'Bank account linked successfully.' });
    } catch (error) {
        console.error('❌ Plaid token exchange error:', error.response?.data || error.message);
        res.status(500).json({ success: false, message: 'Could not finalize bank link.' });
    }
});
// --- ----------------- ---

// --- Credit Assessment Endpoint (MODIFIED FOR SIMULATION) ---
app.post('/api/assess_credit', authenticateUser, async (req, res) => {
    const userId = req.user.id;
    console.log(`\n⚙️ Assessment request for User ID: ${userId} (SIMULATED - DB Data Only)`);
    const { requested_loan_amount = null, requested_loan_term = null } = req.body;
    let assessmentIdForOrder = null; let riskScore = null; let entitlements = {};

    try {
        // 1. Informational Check for Plaid Token (Doesn't block/use token)
        console.log(`   1. Checking for Plaid token (informational)...`);
        try {
            const [userCheck] = await dbPool.query('SELECT plaid_access_token FROM users WHERE user_id = ?', [userId]);
            if (userCheck[0]?.plaid_access_token) console.log(`      -> Plaid token placeholder exists.`);
            else console.log(`      -> No Plaid token placeholder found.`);
        } catch (dbError) { console.error(`   ⚠️ DB Error checking token (User ${userId}):`, dbError); }

        // 2. SKIP Plaid Data Fetching
        console.log(`   2. Skipping Plaid API calls (SIMULATION MODE).`);

        // 3. Prepare Features using ONLY DB Data
        console.log(`   3. Preparing model features from DB...`);
        rawFeaturesForModel = {};
        try {
            // Fetch required data from DB tables
            const creditSql = `SELECT * FROM credit_data WHERE user_id = ? ORDER BY recorded_at DESC LIMIT 1`;
            const userSql = `SELECT person_income, employment_status, cb_person_default_on_file, cb_person_cred_hist_length FROM users WHERE user_id = ?`;
            const [[latestCreditData], [dbUserData]] = await Promise.all([ dbPool.query(creditSql, [userId]), dbPool.query(userSql, [userId]) ]);
            const creditData = latestCreditData || {};
            if (!dbUserData) throw new Error("User profile data not found for assessment.");

            // Determine final values for features based on DB and request
            const final_person_income = Number(creditData.person_income || dbUserData.person_income || 0);
            const final_loan_amnt = Number(requested_loan_amount || creditData.original_loan_amount || 0);
            const final_loan_term = Number(requested_loan_term || creditData.loan_term || 0);

            // Call calculation helpers - they now use DB fallbacks since Plaid args will be null/empty
            const calculated_util_ratio_db = calculate_util_ratio(null, null, creditData.credit_utilization_ratio) ?? 0.1;
            const calculated_payment_history_db = calculate_payment_history([], dbUserData, creditData.payment_history) ?? 500;

            // Build feature object
            rawFeaturesForModel = {
                'employment_status': mapEmploymentStatus(dbUserData.employment_status || creditData.employment_status),
                'person_income': final_person_income,
                'cb_person_default_on_file': dbUserData.cb_person_default_on_file || creditData.cb_person_default_on_file || 'N',
                'cb_person_cred_hist_length': Number(dbUserData.cb_person_cred_hist_length || creditData.cb_person_cred_hist_length || 0),
                'original_loan_amount': Number(creditData.original_loan_amount || 0),
                'loan_term': final_loan_term,
                'loan_amnt': final_loan_amnt,
                'credit_utilization_ratio': calculated_util_ratio_db,
                'payment_history': calculated_payment_history_db,
                'loan_percent_income': calculate_lpi(final_loan_amnt, final_person_income) ?? 1.0, // Default high if calculation fails
            };

            // Final cleanup for nulls/NaNs in numerical fields
            Object.keys(rawFeaturesForModel).forEach(key => {
                if(typeof rawFeaturesForModel[key] === 'number' && isNaN(rawFeaturesForModel[key])) {
                     console.warn(`Feature '${key}' was NaN, setting to 0.`);
                     rawFeaturesForModel[key] = 0;
                } else if (rawFeaturesForModel[key] === null && typeof rawFeaturesForModel[key] !== 'string') {
                     // Assign default for numerical nulls, but keep strings/mapped categories as they are (or map null string?)
                     if (key !== 'employment_status' && key !== 'cb_person_default_on_file') {
                          console.warn(`Feature '${key}' is null, replacing with 0.`);
                          rawFeaturesForModel[key] = 0;
                     } else if (key === 'employment_status') rawFeaturesForModel[key] = 'No'; // Default for emp status
                     else if (key === 'cb_person_default_on_file') rawFeaturesForModel[key] = 'N'; // Default for default flag
                }
            });
            console.log(`✅ Raw features prepared (DB ONLY):`, rawFeaturesForModel);

        } catch (dataPrepError) {
            console.error(`❌ Error preparing features (DB) for User ${userId}:`, dataPrepError);
            return res.status(500).json({ success: false, message: 'Internal error preparing assessment data.' });
        }

        // 4. Call Python Service
        if (!PYTHON_PREDICTION_URL) return res.status(503).json({ success: false, message: 'Assessment config error.' });
        console.log(`   4. Calling Python prediction service...`);
        try {
            const predictionResponse = await fetch(PYTHON_PREDICTION_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ features: rawFeaturesForModel }) });
            if (!predictionResponse.ok) throw new Error(`Prediction service error: ${predictionResponse.status} ${await predictionResponse.text()}`);
            const predictionResult = await predictionResponse.json();
            if (predictionResult.error) throw new Error(`Prediction service failed: ${predictionResult.error}`);
            riskScore = predictionResult.risk_score; // Get the score
            console.log(`     Risk score received: ${riskScore}`);
        } catch (fetchError) {
             console.error(`❌ Error calling prediction service:`, fetchError);
             return res.status(503).json({ success: false, message: 'Assessment service unavailable.' });
        }

        // 5. Map Score
        console.log(`   5. Mapping score ${riskScore}...`);
        entitlements = mapScoreToEntitlements(riskScore); // Map score to get tier/limit/terms

        // 6. Store Assessment Result
        console.log(`   6. Storing assessment result...`);
        if (entitlements && !entitlements.error && typeof riskScore === 'number' && !isNaN(riskScore)) {
            try {
                const sql = `INSERT INTO credit_assessments (user_id, risk_score, credit_tier, credit_limit, calculated_terms, assessment_timestamp) VALUES (?, ?, ?, ?, ?, NOW())`;
                const termsJson = JSON.stringify(entitlements.terms || []);
                const [insertResult] = await dbPool.query(sql, [userId, riskScore, entitlements.tier, entitlements.limit, termsJson]);
                assessmentIdForOrder = insertResult.insertId; // Capture ID
                console.log(`      -> Assessment record (ID: ${assessmentIdForOrder}) stored.`);
            } catch (dbStoreError) { console.error(`   ❌ DB Error storing assessment:`, dbStoreError); }
        } else { console.warn(`   ⚠️ Skipping storage: Invalid score or error.`); }

        // 7. Return Result
        console.log(`✅ Assessment complete (SIMULATED) for User ID ${userId}.`);
        res.status(200).json({ success: true, entitlements, assessmentId: assessmentIdForOrder });

    } catch (error) { // Catch unexpected errors
        console.error(`❌ Overall Assessment Error (SIMULATED) for User ${userId}:`, error);
        res.status(500).json({ success: false, message: error.message || 'Assessment failed.' });
    }
});
// --- --------------------------------------- ---

// --- Confirm BNPL Order Endpoint ---
app.post('/api/confirm_bnpl_order', authenticateUser, async (req, res) => { /* ... (Keep route logic as before) ... */ });
// --- --------------------------- ---

// --- Get Current Entitlements Endpoint ---
app.get('/api/current_entitlements', authenticateUser, async (req, res) => { /* ... (Keep route logic as before) ... */ });
// --- --------------------------------- ---

// --- Test Auth Route ---
app.get('/api/test-auth', authenticateUser, (req, res) => res.json({ success: true, message: `Auth OK for user ID: ${req.user.id}`}));
// --- --------------- ---

// Global Error Handler
app.use((err, req, res, next) => {
  console.error("Unhandled Server Error:", err.stack || err);
  res.status(500).send({ success: false, message: 'An internal server error occurred.' });
});

// Start Server
app.listen(PORT, () => {
    console.log(`\n🚀 Server running on port ${PORT}`);
    console.log(`🔗 Plaid Env: ${plaidEnv}`);
    console.log(`🐍 Python URL: ${PYTHON_PREDICTION_URL || 'NOT SET!'}`);
    console.log(`🔑 JWT Secret Loaded: ${JWT_SECRET ? 'Yes' : 'NO!'}`);
});