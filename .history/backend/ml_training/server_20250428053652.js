// --- Core Dependencies ---
const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
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
app.use(cors()); 
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

// Original Password Validator (Keep if used)
const isValidPassword = (password) => {
    if (!password) return false;
    const passwordRegex = /^(?=.*\d.*\d)(?=.*[!@#$%^&*]).{8,}$/;
    return passwordRegex.test(password);
};

// Updated Date Formatter (Handles YYYY-MM-DD and DD-MM-YYYY)
const formatDate = (date) => {
    if (!date || typeof date !== 'string') return null;
    if (/^\d{4}-\d{2}-\d{2}$/.test(date)) { return date; } // Expect & Use YYYY-MM-DD for SQL DATE
    else if (/^\d{2}-\d{2}-\d{4}$/.test(date)) { const [day, month, year] = date.split('-'); return `${year}-${month}-${day}`; } // Convert incoming DD-MM-YYYY
    else { console.warn(`Invalid date format passed to formatDate: ${date}.`); return null; }
};


// Updated JWT Auth Middleware
const authenticateUser = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader?.startsWith('Bearer ') ? authHeader.split(' ')[1] : null;
    if (!token) return res.status(401).json({ success: false, message: 'Authorization token required.' });
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        if (!decoded.id) throw new Error("Token payload missing 'id'.");
        req.user = { id: decoded.id, email: decoded.email };
        next();
    } catch (err) {
        console.error("JWT Error:", err.message);
        const status = err.name === 'TokenExpiredError' ? 401 : 403;
        const message = err.name === 'TokenExpiredError' ? 'Session expired.' : 'Invalid token.';
        return res.status(status).json({ success: false, message });
    }
};

// Helper: Map Score to Entitlements
// Helper: Map Score to Tiers/Base Limit/Terms AND Apply Business Rule Adjustments v2
function mapScoreAndApplyAdjustments(riskScore, defaultFlag, employmentStatusDB, utilizationRatioRaw) {
    console.log(`   Inputs - Score: ${riskScore?.toFixed(4)}, Default: ${defaultFlag}, EmpStatus: ${employmentStatusDB}, UtilRatio: ${utilizationRatioRaw}`);

    let baseTier, baseLimit, baseTerms;
    let finalLimit;
    const adjustments = []; // Track applied adjustments for logging
    const defaultFlagIsY = (defaultFlag === 'Y'); // Convert flag to boolean

    // --- Step 1: Determine Base Tier/Limit/Terms from Risk Score ---
    if (riskScore === null || typeof riskScore !== 'number' || isNaN(riskScore)) {
        console.error("Mapping failed: Invalid risk score input:", riskScore);
        baseTier = 7; baseLimit = 150.00; baseTerms = [3]; // Highest risk defaults
        return { tier: baseTier, limit: baseLimit, terms: baseTerms, error: "Invalid score" };
    }

    // Define Tiers (Same 7 tiers as before)
    const TIER1_MAX = 0.14; const TIER2_MAX = 0.28; const TIER3_MAX = 0.42;
    const TIER4_MAX = 0.56; const TIER5_MAX = 0.70; const TIER6_MAX = 0.84;

    if (riskScore < TIER1_MAX)       { baseTier = 1; baseLimit = 2500.00; baseTerms = [3, 6, 12]; }
    else if (riskScore < TIER2_MAX) { baseTier = 2; baseLimit = 1750.00; baseTerms = [3, 6, 12]; }
    else if (riskScore < TIER3_MAX) { baseTier = 3; baseLimit = 1250.00; baseTerms = [3, 6]; }
    else if (riskScore < TIER4_MAX) { baseTier = 4; baseLimit = 800.00;  baseTerms = [3, 6]; }
    else if (riskScore < TIER5_MAX) { baseTier = 5; baseLimit = 500.00;  baseTerms = [3]; }
    else if (riskScore < TIER6_MAX) { baseTier = 6; baseLimit = 300.00;  baseTerms = [3]; }
    else                              { baseTier = 7; baseLimit = 150.00;  baseTerms = [3]; }

    console.log(`   -> Base Entitlements: Tier ${baseTier}, Limit ${baseLimit.toFixed(2)}, Terms [${baseTerms.join(',')}]`);
    finalLimit = baseLimit; // Start with base

    // --- Step 2: Apply Adjustments based on Business Rules ---

    // Adjustment 1: Previous Default Penalty (-25%)
    if (defaultFlagIsY) {
        const reduction = finalLimit * 0.25; finalLimit -= reduction;
        adjustments.push(`Default Flag (-${reduction.toFixed(2)})`);
    }

    // Adjustment 2: Employment Status Penalty (Based on DB Enum Value directly)
    const empStatusUpper = String(employmentStatusDB || '').toUpperCase(); // Handle null/undefined safely
    const isUnemployedOrOther = !['EMPLOYED', 'SELF_EMPLOYED'].includes(empStatusUpper);
    if (isUnemployedOrOther) {
        let reductionPercent = 0.20; // Base 20% reduction
        if (baseTier >= 6) { // Additional penalty if also high risk tier
            reductionPercent += 0.10;
            adjustments.push(`Employment (${empStatusUpper}) & High Risk Penalty (-${(reductionPercent * 100).toFixed(0)}%)`);
        } else {
             adjustments.push(`Employment (${empStatusUpper}) Penalty (-${(reductionPercent * 100).toFixed(0)}%)`);
        }
        const reduction = finalLimit * reductionPercent; finalLimit -= reduction;
    }

    // Adjustment 3: High Utilization (+20% if no default, -15% if default)
    const HIGH_UTIL_THRESHOLD = 0.70;
    const utilization = isNaN(Number(utilizationRatioRaw)) ? 0 : Number(utilizationRatioRaw);
    if (utilization > HIGH_UTIL_THRESHOLD) {
        if (defaultFlagIsY) { // Penalty if default + high util
            const reduction = finalLimit * 0.15; finalLimit -= reduction;
            adjustments.push(`High Util & Default (-${reduction.toFixed(2)})`);
        } else { // Bonus if no default + high util
            const MAX_LIMIT_CAP = 3000.00; // Example overall cap
            const bonus = finalLimit * 0.20; const potentialLimit = finalLimit + bonus;
            const actualBonus = Math.max(0, Math.min(bonus, MAX_LIMIT_CAP - finalLimit)); // Prevent negative bonus, respect cap
            finalLimit = Math.min(potentialLimit, MAX_LIMIT_CAP);
            if (actualBonus > 0) adjustments.push(`High Util Bonus (+${actualBonus.toFixed(2)})`);
            else adjustments.push(`High Util Bonus (Hit Cap)`);
        }
    }

    // Ensure final limit meets minimum
    const MINIMUM_LIMIT = 50.00;
    if (finalLimit < MINIMUM_LIMIT) {
        adjustments.push(`Limit adjusted up to Min (${MINIMUM_LIMIT.toFixed(2)})`);
        finalLimit = MINIMUM_LIMIT;
    }

    console.log(`   Adjustments Applied: ${adjustments.length > 0 ? adjustments.join('; ') : 'None'}`);
    console.log(`   -> Final Entitlements: Tier ${baseTier}, Limit ${finalLimit.toFixed(2)}, Terms [${baseTerms.join(',')}]`);

    // Return adjusted limit with original base tier and terms
    return {
        tier: baseTier,
        limit: parseFloat(finalLimit.toFixed(2)),
        terms: baseTerms,
        error: null
    };
}

// Helper: Map DB Employment Status Enum to Model String
function mapEmploymentStatus(dbStatus) {
    if (!dbStatus) return 'No'; const statusUpper = String(dbStatus).toUpperCase();
    if (statusUpper === 'EMPLOYED') return 'Yes'; if (statusUpper === 'SELF_EMPLOYED') return 'Self-Employed'; return 'No';
}
// --- ------------------------------------------------------------------------- ---


// --- Calculation Functions (SIMULATED - Rely on DB/Defaults passed as args) ---
function calculate_util_ratio(plaidAuthData, plaidLiabilitiesData, historicalRatio) {
    // In SIMULATION, first two args are null.
    console.log("  -> Calculating Util Ratio (SIMULATED - Using Fallback)...");
    const fallbackRatio = (historicalRatio !== null && !isNaN(Number(historicalRatio))) ? Number(historicalRatio) : 0.1; // Default 10%
    console.log(`     Util Ratio (DB based): ${fallbackRatio.toFixed(4)}`);
    return fallbackRatio;
}

function calculate_payment_history(plaidTransactions, userData, historicalScore) {
    // In SIMULATION, plaidTransactions will be empty array. Base score on DB data.
    console.log("  -> Calculating Payment History Score (SIMULATED - Using DB)...");
    try {
        const baseScore = (historicalScore !== null && !isNaN(Number(historicalScore))) ? Number(historicalScore) : 500; // Neutral baseline
        let score = baseScore; const maxScore = 1000, minScore = 0;
        const defaultPenalty = 100; // Moderate penalty
        if (userData?.cb_person_default_on_file === 'Y') { // Check flag fetched from users table
            score -= defaultPenalty; console.log(`     Penalty applied for default flag.`);
        }
        score = Math.max(minScore, Math.min(maxScore, score)); // Ensure score is within bounds
        console.log(`     History Score (DB based): ${Math.round(score)}`); return Math.round(score);
    } catch (e) { console.error(" Error calculating payment history (DB):", e); return 500; }
}

function calculate_lpi(loan_amnt, person_income) {
    const incomeNum = Number(person_income); const loanNum = Number(loan_amnt);
    if (!isNaN(incomeNum) && incomeNum > 0 && !isNaN(loanNum) && loanNum >= 0) return loanNum / incomeNum;
    console.warn(`     Could not calculate LPI. Loan: ${loan_amnt}, Income: ${person_income}`); return null;
}
// --- ----------------------------------------- ---


// === ROUTES ===

// Registration Route
app.post('/register', async (req, res) => {
    const { first_name, surname, email, password, phone_number, ni_number, date_of_birth } = req.body;
    // Validation
    if (!first_name || !surname || !email || !password || !date_of_birth) return res.status(400).json({ success: false, message: 'Missing required fields.' });
    if (!/\S+@\S+\.\S+/.test(email)) return res.status(400).json({ success: false, message: 'Invalid email format.' });
    const formattedDOB = formatDate(date_of_birth);
    if (!formattedDOB && date_of_birth) return res.status(400).json({ success: false, message: 'Invalid date format (YYYY-MM-DD required).' });
    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        // Include default 'N' and 0 for new flags/columns on registration
        const newUser = { first_name, surname, email, password: hashedPassword, phone_number: phone_number || null, ni_number: ni_number || null, date_of_birth: formattedDOB, cb_person_default_on_file: 'N', cb_person_cred_hist_length: 0 };
        const sql = 'INSERT INTO users (first_name, surname, email, password, phone_number, ni_number, date_of_birth, cb_person_default_on_file, cb_person_cred_hist_length) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)';
        const [result] = await dbPool.query(sql, [newUser.first_name, newUser.surname, newUser.email, newUser.password, newUser.phone_number, newUser.ni_number, newUser.date_of_birth, newUser.cb_person_default_on_file, newUser.cb_person_cred_hist_length]);
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


// --- Plaid Setup Endpoints (For Setup/Demonstration - Exchange stores simulated token) ---
app.post('/api/create_link_token', authenticateUser, async (req, res) => {
    const userId = req.user.id; console.log(`⚙️ Creating link token User: ${userId}`);
    const request = { user: { client_user_id: userId.toString() }, client_name: 'DPP (Demo)', language: 'en', products: ['auth', 'transactions', 'identity', 'liabilities'], country_codes: ['GB'] };
    try { const response = await plaidClient.linkTokenCreate(request); res.json({ link_token: response.data.link_token }); }
    catch (error) { console.error('❌ Plaid link token error:', error.response?.data || error.message); res.status(500).json({ success: false, message: 'Could not initiate bank link.' }); }
});

app.post('/api/exchange_public_token', authenticateUser, async (req, res) => {
    const userId = req.user.id; const { public_token: publicToken } = req.body; console.log(`⚙️ Exchange token request (Simulated storage) User: ${userId}`);
    // SIMULATION HANDLING: Store placeholder
    const fakeAccessToken = `simulated-access-${userId}-${Date.now()}`; const fakeItemId = `simulated-item-${userId}`;
    try { const sql = 'UPDATE users SET plaid_access_token = ?, plaid_item_id = ? WHERE user_id = ?'; const [result] = await dbPool.query(sql, [fakeAccessToken, fakeItemId, userId]); if (result.affectedRows === 0) return res.status(404).json({ success: false, message: 'User not found.' }); console.log(`✅ SIMULATED Plaid tokens stored.`); res.json({ success: true, message: 'Bank account linked (Simulated).' }); }
    catch (dbError) { console.error("   DB Error storing simulated:", dbError); res.status(500).json({ success: false, message: 'Failed simulation link.' }); }
});
// --- ------------------------------------------------------------------- ---


// --- MAIN Credit Assessment Endpoint (SIMULATION PATH) ---
// Called from Product Modal BNPL button
app.post('/api/assess_credit', authenticateUser, async (req, res) => {
    const userId = req.user.id;
    console.log(`\n⚙️ Assessment request for User ID: ${userId} (ALWAYS USING DB-ONLY SIMULATION PATH)`);
    const { requested_loan_amount = null, requested_loan_term = null } = req.body;
    let assessmentIdForOrder = null; // Will hold ID from credit_assessments table
    let riskScore = null;
    let entitlements = {}; // Will hold { tier, limit, terms, error? }

    try {
        // Step 1 & 2: Informational Check & Skip Plaid Fetch (No changes needed)
        console.log(`   1. Skipping token check & Plaid API calls (SIMULATION MODE).`);

        // Step 3: Prepare Features using ONLY DB Data
        console.log(`   2. Preparing model features from DB...`); // Log step adjusted
        let rawFeaturesForModel = {};
        try {
            // Fetch required DB data concurrently
            // Fetch latest credit_data record
            const creditSql = `
                SELECT employment_status, person_income, credit_utilization_ratio, payment_history,
                       loan_term, loan_amnt AS original_loan_amount, loan_percent_income
                FROM credit_data WHERE user_id = ? ORDER BY recorded_at DESC LIMIT 1`;
            // Fetch needed user data fields from users table - ENSURE employment_status is fetched here if using fallback
            const userSql = `
                SELECT cb_person_default_on_file, cb_person_cred_hist_length
                FROM users WHERE user_id = ?`;
            const [[latestCreditData], [dbUserData]] = await Promise.all([
                 dbPool.query(creditSql, [userId]),
                 dbPool.query(userSql, [userId])
            ]);
            const creditData = latestCreditData || {}; // Use empty object if no history
            if (!dbUserData) throw new Error("User profile data missing."); // User must exist if authenticated

            // Determine final values for features
            // Prioritize income from latest credit snapshot if available
            const final_person_income = Number(creditData.person_income || 0);
            const final_loan_amnt = Number(requested_loan_amount || creditData.original_loan_amount || 0);
            const final_loan_term = Number(requested_loan_term || creditData.loan_term || 0);

            // Call calculation helpers (pass null for Plaid data, rely on DB fallbacks)
            const calculated_util_ratio_db = calculate_util_ratio(null, null, creditData.credit_utilization_ratio) ?? 0.1;
            const calculated_payment_history_db = calculate_payment_history([], dbUserData, creditData.payment_history) ?? 500;

            // Assemble the features object matching Python script's expected keys
            rawFeaturesForModel = {
                'employment_status': mapEmploymentStatus(creditData.employment_status || dbUserData.user_employment_status), // Map using latest snapshot or user profile
                'person_income': final_person_income,
                'cb_person_default_on_file': dbUserData.cb_person_default_on_file || 'N',
                'cb_person_cred_hist_length': Number(dbUserData.cb_person_cred_hist_length || 0),
                'original_loan_amount': Number(creditData.original_loan_amount || 0), // Use value from creditData (aliased from loan_amnt)
                'loan_term': final_loan_term,
                'loan_amnt': final_loan_amnt,
                'credit_utilization_ratio': calculated_util_ratio_db,
                'payment_history': calculated_payment_history_db,
                'loan_percent_income': calculate_lpi(final_loan_amnt, final_person_income) ?? 1.0, // Recalculate, default high if needed
            };

            // Final cleanup loop for nulls/NaNs/types
            Object.keys(rawFeaturesForModel).forEach(key => {
                if (key !== 'employment_status' && key !== 'cb_person_default_on_file') {
                    if (rawFeaturesForModel[key] === null || rawFeaturesForModel[key] === undefined || isNaN(Number(rawFeaturesForModel[key]))) {
                        console.warn(`      -> Feature '${key}' is null/NaN/undefined, setting to 0.`); rawFeaturesForModel[key] = 0;
                    } else { rawFeaturesForModel[key] = Number(rawFeaturesForModel[key]); }
                } else if (rawFeaturesForModel[key] === null || rawFeaturesForModel[key] === undefined) {
                     if (key === 'employment_status') rawFeaturesForModel[key] = 'No';
                     if (key === 'cb_person_default_on_file') rawFeaturesForModel[key] = 'N';
                }
            });
            console.log(`✅ Raw features prepared (DB ONLY):`, JSON.stringify(rawFeaturesForModel));

        } catch (dataPrepError) {
             console.error(`❌ Error preparing features (DB) for User ${userId}:`, dataPrepError);
             // Ensure response for this specific error
             return res.status(500).json({ success: false, message: `Internal error preparing assessment data: ${dataPrepError.message}` });
        }

        // 3. Call Python Service (Renumbered Step)
        if (!PYTHON_PREDICTION_URL) return res.status(503).json({ success: false, message: 'Assessment service configuration error.' });
        console.log(`   3. Calling Python prediction service...`);
        try {
             const predictionResponse = await fetch(PYTHON_PREDICTION_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ features: rawFeaturesForModel }) });
             if (!predictionResponse.ok) { const errTxt = await predictionResponse.text(); throw new Error(`Prediction service HTTP error: ${predictionResponse.status} - ${errTxt}`); }
             const predictionResult = await predictionResponse.json(); if (predictionResult.error) throw new Error(`Prediction service failed: ${predictionResult.error}`); riskScore = predictionResult.risk_score;
             console.log(`     Score: ${riskScore}`);
        } catch (fetchError) { console.error("Python Fetch Error:", fetchError); return res.status(503).json({ success: false, message: 'Assessment service unavailable.' }); }
        if (riskScore === null || isNaN(Number(riskScore))) { console.error("Invalid score received from Python:", riskScore); return res.status(500).json({success: false, message: 'Invalid score received from assessment service.'});}

        // 4. Map Score (Renumbered Step)
        console.log(`   4. Mapping score ${riskScore}...`);
        entitlements = mapScoreAndApplyAdjustments(riskScore);

        // 5. Store Assessment Result & Update User Limit (Renumbered Step)
        console.log(`   5. Storing assessment result & updating user limit...`);
        if (!entitlements.error) {
             // Use a transaction potentially if both must succeed? For now, separate queries.
             try {
                 // Insert into history table
                 const assessmentSql = `INSERT INTO credit_assessments (user_id, risk_score, credit_tier, credit_limit, calculated_terms, assessment_timestamp) VALUES (?, ?, ?, ?, ?, NOW())`;
                 const termsJson = JSON.stringify(entitlements.terms||[]);
                 const [insResult] = await dbPool.query(assessmentSql, [userId, riskScore, entitlements.tier, entitlements.limit, termsJson]);
                 assessmentIdForOrder = insResult.insertId; // Capture ID
                 console.log(`      -> Assessment record (ID: ${assessmentIdForOrder}) stored.`);

                 // ---> ADDED: Update users table with the new limit <---
                 const updateUserLimitSql = `UPDATE users SET current_credit_limit = ? WHERE user_id = ?`;
                 // Use the limit determined by the assessment
                 const newLimit = entitlements.limit;
                 const [updateUserResult] = await dbPool.query(updateUserLimitSql, [newLimit, userId]);
                 if (updateUserResult.affectedRows > 0) {
                     console.log(`      -> User ${userId} current_credit_limit updated to ${newLimit}.`);
                 } else {
                      // This might happen if user was deleted between auth and here - log warning
                      console.warn(`      -> Failed to update current_credit_limit for User ${userId} (User not found?).`);
                 }
                 // --->--------------------------------------------- <---

             } catch (e) {
                 console.error("   ❌ DB Error storing assessment or updating user limit:", e);
                 // Log the error but maybe don't fail the entire request if user got entitlements?
                 // Reset assessmentId if storage failed, as it won't be valid for the order
                 assessmentIdForOrder = null;
             }
        } else { console.warn(`   ⚠️ Skipping storage/update: Invalid score/entitlement error.`); }

        // 6. Return Result (Renumbered Step)
        console.log(`✅ Assessment complete (DB ONLY) User: ${userId}.`);
        // Return the entitlements from THIS assessment, and the assessmentId if it was successfully stored
        res.status(200).json({ success: true, entitlements, assessmentId: assessmentIdForOrder });

    } catch (error) {
         // Catch errors from steps 1, 2 (DB errors), 4 (mapping errors?), 7 (unexpected)
         console.error(`❌ Overall Assessment Error (DB ONLY Path) for User ${userId}:`, error);
         // Ensure a response is always sent
         res.status(500).json({ success: false, message: error.message || 'Assessment failed.' });
    }
});
// --- ------------------------------------------------- ---


// --- SIMULATED Assessment Endpoint (DB Only - Called from Dashboard) ---
app.post('/api/assess_credit_simulated', authenticateUser, async (req, res) => {
    const userId = req.user.id; console.log(`\n⚙️ SIMULATED Assessment request User: ${userId}`);
    const { requested_loan_amount = null, requested_loan_term = null } = req.body;
    let riskScore = null; let entitlements = {};
    try {
        // 1. Prepare Features using ONLY DB Data
        console.log(`   1. Preparing features from DB...`);
        let rawFeaturesForModel = {};
        try {
             // Fetch required DB data concurrently
             const creditSql = `SELECT employment_status, person_income, credit_utilization_ratio, payment_history, loan_term, loan_amnt AS original_loan_amount, loan_percent_income FROM credit_data WHERE user_id = ? ORDER BY recorded_at DESC LIMIT 1`;
             const userSql = `SELECT cb_person_default_on_file, cb_person_cred_hist_length FROM users WHERE user_id = ?`;
             const [[latestCreditData], [dbUserData]] = await Promise.all([ dbPool.query(creditSql, [userId]), dbPool.query(userSql, [userId]) ]);
             const creditData = latestCreditData || {}; if (!dbUserData) throw new Error("User profile missing.");
             const pIncome = Number(creditData.person_income || dbUserData.person_income || 0);
             const lAmnt = Number(requested_loan_amount || creditData.original_loan_amount || 1000); // Use default amount for dashboard estimate
             const lTerm = Number(requested_loan_term || creditData.loan_term || 6);             // Use default term for dashboard estimate
             const util = calculate_util_ratio(null, null, creditData.credit_utilization_ratio) ?? 0.1;
             const history = calculate_payment_history([], dbUserData, creditData.payment_history) ?? 500;
             // Assemble features
             rawFeaturesForModel = {
                 'employment_status': mapEmploymentStatus(creditData.employment_status || dbUserData.user_employment_status),
                 'person_income': pIncome, 'cb_person_default_on_file': dbUserData.cb_person_default_on_file || 'N',
                 'cb_person_cred_hist_length': Number(dbUserData.cb_person_cred_hist_length || 0),
                 'original_loan_amount': Number(creditData.original_loan_amount || 0), 'loan_term': lTerm, 'loan_amnt': lAmnt,
                 'credit_utilization_ratio': util, 'payment_history': history,
                 'loan_percent_income': calculate_lpi(lAmnt, pIncome) ?? 1.0,
             };
             // Cleanup...
             Object.keys(rawFeaturesForModel).forEach(k => { if(rawFeaturesForModel[k]===null){/*Defaults*/} if(typeof rawFeaturesForModel[k]==='number' && isNaN(rawFeaturesForModel[k])) rawFeaturesForModel[k]=0;});
             console.log(`✅ Raw features prepared (SIMULATED):`, JSON.stringify(rawFeaturesForModel));
        } catch (dataPrepError) { console.error(`❌ Error prep features (SIM):`, dataPrepError); return res.status(500).json({ success: false, message: 'Internal error preparing data.' });}

        // 2. Call Python Service
        console.log(`   2. Calling Python service...`);
        if (!PYTHON_PREDICTION_URL) return res.status(503).json({ success: false, message: 'Config error.' });
        try {
            const predictionResponse = await fetch(PYTHON_PREDICTION_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ features: rawFeaturesForModel }) });
             if (!predictionResponse.ok) { const errTxt = await predictionResponse.text(); throw new Error(`Prediction service HTTP error: ${predictionResponse.status} - ${errTxt}`); }
             const predictionResult = await predictionResponse.json(); if (predictionResult.error) throw new Error(`Prediction service failed: ${predictionResult.error}`); riskScore = predictionResult.risk_score;
             console.log(`     Score: ${riskScore}`);
        } catch (fetchError) { return res.status(503).json({ success: false, message: 'Service unavailable.' });}
        if (riskScore === null || isNaN(Number(riskScore))) return res.status(500).json({success: false, message: 'Invalid score.'});

        // 3. Map Score
        entitlements = mapScoreAndApplyAdjustments(riskScore);

        // 4. Return Result (Do NOT store simulated dashboard estimates in history)
        console.log(`✅ SIMULATED Assessment complete.`);
        res.status(200).json({ success: true, entitlements, assessmentId: null, simulated: true });

    } catch (error) { console.error(`❌ SIMULATED Assessment Error:`, error); res.status(500).json({ success: false, message: error.message || 'Simulation failed.' }); }
});
// --- --------------------------------------------- ---


// --- Confirm BNPL Order Endpoint (with Limit Check and Used Amount Update) ---
app.post('/api/confirm_bnpl_order', authenticateUser, async (req, res) => {
    const userId = req.user.id;
    const { product, term, assessmentId, paydayPreference } = req.body;
    let connection = null; // For transaction management

    console.log(`\n⚙️ Confirming BNPL order User: ${userId}, Product: ${product?.title}, Term: ${term}, PaydayPref: ${paydayPreference}`);

    // 1. Validation
    // Check product exists and has required properties
    if (!product || typeof product !== 'object' || typeof product.numericPrice !== 'number' || isNaN(product.numericPrice) || !product.title || typeof term !== 'number' || term <= 0 ) {
        console.error("Order confirmation failed: Invalid input data provided.", { product, term });
        return res.status(400).json({ success: false, message: 'Missing or invalid order details (product, term).' });
    }
    const orderAmount = Number(product.numericPrice); // Use validated numeric price

    try {
        // --- Get a connection from the pool for transaction ---
        connection = await dbPool.getConnection();
        await connection.beginTransaction();
        console.log("   DB Transaction Started.");
        // --- --------------------------------------------- ---

        // 2. Fetch User's Current Limit & Used Amount (Lock row for update)
        const limitSql = 'SELECT current_credit_limit, used_credit_amount FROM users WHERE user_id = ? FOR UPDATE';
        const [limitResults] = await connection.query(limitSql, [userId]);

        if (limitResults.length === 0) {
            // If authentication middleware passed, user *should* exist. This indicates a DB inconsistency.
            console.error(`Critical Error: User ${userId} not found during order confirmation credit check.`);
            throw new Error("User not found for credit check.");
        }
        const userData = limitResults[0];
        // Safely parse numbers, defaulting to 0 if null/undefined
        const currentLimit = parseFloat(userData.current_credit_limit || 0);
        const usedAmount = parseFloat(userData.used_credit_amount || 0);
        const availableCredit = currentLimit - usedAmount;
        console.log(`   User Limit: ${currentLimit.toFixed(2)}, Used: ${usedAmount.toFixed(2)}, Available: ${availableCredit.toFixed(2)}, Order Request: ${orderAmount.toFixed(2)}`);

        // 3. Check if Order Amount Exceeds Available Credit
        if (orderAmount > availableCredit) {
            console.warn(`   Order Rejected: Amount ${orderAmount.toFixed(2)} exceeds available credit ${availableCredit.toFixed(2)}`);
            await connection.rollback(); // Rollback transaction before returning
            // connection will be released in finally block
            return res.status(400).json({ success: false, message: `Order amount (£${orderAmount.toFixed(2)}) exceeds your available credit limit (£${availableCredit.toFixed(2)}).` });
        }
        console.log(`   Credit limit sufficient. Proceeding with order.`);

        // 4. Insert Order into DB (if limit check passes)
        // Calculate the first due date more robustly
        const now = new Date();
        const firstDueDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, now.getUTCDate())).toISOString().split('T')[0]; // Approx 1 month later (UTC)

        const orderData = {
            user_id: userId,
            assessment_id: assessmentId || null, // Link to assessment if available
            product_title: product.title,
            product_price: orderAmount, // Use validated number
            loan_amnt: orderAmount,  
            selected_term_months: term,
            remaining_balance: orderAmount, // Initial balance equals order amount
            order_status: 'ACTIVE',         // Set initial status
            next_payment_due_date: firstDueDate,
            order_timestamp: new Date()      // Use current date object for timestamp
        };
        // Use explicit column list for INSERT
        const orderSql = 'INSERT INTO orders (user_id, assessment_id, product_title, product_price, loan_amnt, selected_term_months, remaining_balance, order_status, next_payment_due_date, order_timestamp) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)';
        const orderValues = [ orderData.user_id, orderData.assessment_id, orderData.product_title, orderData.product_price, orderData.loan_amnt, orderData.selected_term_months, orderData.remaining_balance, orderData.order_status, orderData.next_payment_due_date, orderData.order_timestamp ];
        const [orderResult] = await connection.query(orderSql, orderValues);
        const orderId = orderResult.insertId;
        console.log(`✅ BNPL Order (ID: ${orderId}) record created.`);

        // 5. Update User's Used Credit Amount
        const updateUsedAmountSql = 'UPDATE users SET used_credit_amount = used_credit_amount + ? WHERE user_id = ?';
        const [updateResult] = await connection.query(updateUsedAmountSql, [orderAmount, userId]);
        if (updateResult.affectedRows === 0) {
             // This means the user_id wasn't found during update - indicates inconsistency
             console.error(`CRITICAL: Failed to update used_credit_amount for User ${userId} after order ${orderId} creation.`);
             throw new Error("Failed to update user credit usage. Order incomplete."); // Fail transaction
        }
        console.log(`✅ User ID ${userId} used_credit_amount updated (+${orderAmount.toFixed(2)}).`);

        // --- Commit transaction ---
        await connection.commit();
        console.log("   DB Transaction Committed.");
        // --- ------------------- ---

        // 6. Post-Order Logic
        // TODO: Send email/notification to user
        // TODO: Notify merchant system if needed
        // TODO: If using real payment system for disbursement, trigger it here

        res.status(201).json({ success: true, message: 'Order confirmed successfully!', orderId: orderId });

    } catch (error) {
        console.error(`❌ Error confirming BNPL order for User ${userId}:`, error);
        // --- Rollback transaction on ANY error ---
        if (connection) {
            try { await connection.rollback(); console.log("   DB Transaction Rolled Back due to error."); }
            catch (rollbackError) { console.error("   Error during Rollback:", rollbackError); }
        }
        // --- ---------------------------------- ---
        // Send appropriate error message
        res.status(500).json({ success: false, message: error.message || 'Failed to process your order.' });
    } finally {
        // --- ALWAYS release connection back to pool ---
        if (connection) {
            try { connection.release(); console.log("   DB Connection Released."); }
            catch (releaseError) { console.error("   Error releasing DB connection:", releaseError); }
        }
        // --- -------------------------------------- ---
    }
});
// --- --------------------------- ---

// --- Endpoint: Get User's Active BNPL Orders ---
app.get('/api/active_orders', authenticateUser, async (req, res) => {
    const userId = req.user.id;
    console.log(`\n⚙️ Fetching active orders request for User ID: ${userId}`);
    try {
        const sql = `
            SELECT order_id, product_title, loan_amnt, remaining_balance, selected_term_months,
                   order_status, order_timestamp, next_payment_due_date
            FROM orders
            WHERE user_id = ? AND order_status = 'ACTIVE'
            ORDER BY order_timestamp DESC
        `;
        const [orders] = await dbPool.query(sql, [userId]);
        console.log(`✅ Found ${orders.length} active orders for User ID: ${userId}`);

        // Format data for frontend
        const formattedOrders = orders.map(order => {
            const loanAmount = parseFloat(order.loan_amnt || 0);
            const remainingBalance = parseFloat(order.remaining_balance || 0);

            // --- Helper function to safely format date to YYYY-MM-DD ---
            const formatToIsoDate = (dateValue) => {
                 if (!dateValue) return null; // Return null if date is NULL in DB
                 try {
                     const d = new Date(dateValue);
                     // Check if date is valid after parsing
                     if (isNaN(d.getTime())) return null;
                     // Format to YYYY-MM-DD
                     const year = d.getFullYear();
                     const month = String(d.getMonth() + 1).padStart(2, '0'); // Month is 0-indexed
                     const day = String(d.getDate()).padStart(2, '0');
                     return `${year}-${month}-${day}`;
                 } catch (e) {
                      console.warn(`Could not format date value ${dateValue}: ${e.message}`)
                      return null; // Return null on error
                 }
            }
            // --- ---------------------------------------------------- ---

            return {
                 order_id: order.order_id,
                 product_title: order.product_title,
                 selected_term_months: order.selected_term_months,
                 order_status: order.order_status,
                 loan_amount: loanAmount,       // Use consistent key name maybe
                 remaining_balance: remainingBalance,
                 // Send date as YYYY-MM-DD string or null
                 order_timestamp: formatToIsoDate(order.order_timestamp),
                 next_payment_due_date: formatToIsoDate(order.next_payment_due_date)
            };
        });

        console.log("Formatted Active Orders being sent:", JSON.stringify(formattedOrders, null, 2));
        res.status(200).json({ success: true, activeOrders: formattedOrders });
    } catch (error) {
         console.error(`❌ DB Error fetching active orders for User ${userId}:`, error);
         res.status(500).json({ success: false, message: 'Error retrieving your active orders.' });
    }
});
// --- ----------------------------------------- ---

// --- NEW Endpoint: Make Repayment ---
app.post('/api/make_repayment', authenticateUser, async (req, res) => {
    const userId = req.user.id; // Authenticated user ID from JWT middleware
    const { order_id, repayment_amount } = req.body;
    let connection = null;
    // Convert order_id upfront for consistency
    const orderIdInt = parseInt(order_id, 10);

    console.log(`\n⚙️ Processing Repayment Request - OrderID Received: ${order_id} (Parsed: ${orderIdInt}), Amount: ${repayment_amount}, Auth User ID: ${userId}`);

    // 1. Validation
    const amount = Number(repayment_amount);
    // Check orderIdInt as well now
    if (isNaN(amount) || amount <= 0 || isNaN(orderIdInt) || orderIdInt <= 0) {
        return res.status(400).json({ success: false, message: 'Invalid order ID or repayment amount provided.' });
    }

    try {
        connection = await dbPool.getConnection();
        await connection.beginTransaction();
        console.log("   Repayment DB Transaction Started.");

        // 2. Get current order details AND user's used amount (lock rows)
        // ** Ensure user_id IS SELECTED below **
        const getOrderSql = 'SELECT user_id, remaining_balance, order_status, product_title FROM orders WHERE order_id = ? FOR UPDATE';
        const getUserSql = 'SELECT used_credit_amount FROM users WHERE user_id = ? FOR UPDATE';

        // Log SQL before execution
        console.log(`   Executing getOrderSql with orderId: ${orderIdInt}`);
        console.log(`   Executing getUserSql with userId: ${userId}`);

        const [orderResults] = await connection.query(getOrderSql, [orderIdInt]);
        const [userResults] = await connection.query(getUserSql, [userId]);

        const order = orderResults?.[0]; // Get first row or undefined
        const user = userResults?.[0];   // Get first row or undefined

        // Explicit Check if order and user data were found
        if (!order) {
             console.error(`   DB CHECK FAILED: Order ID ${orderIdInt} was NOT found.`);
             throw new Error(`Order ID ${orderIdInt} not found.`);
         }
         console.log(`   DB CHECK OK: Order Data Found (order_id=${orderIdInt}):`, order); // Log fetched order data

        if (!user) {
             // Should typically not happen if user is authenticated
             console.error(`   DB CHECK FAILED: User ID ${userId} NOT found for update.`);
             throw new Error(`User ID ${userId} not found for repayment update.`);
         }
         console.log(`   DB CHECK OK: User Data Found (user_id=${userId}):`, user); // Log fetched user data

        // --- Detailed Check JUST BEFORE the comparison ---
        const orderUserIdFromDB = order.user_id; // Explicitly get the user_id from the fetched order object
        const authenticatedUserId = userId;      // Use the id from the authenticated request

        console.log(`---> PRE-AUTH CHECK: Order's user_id from DB = ${orderUserIdFromDB} (Type: ${typeof orderUserIdFromDB})`);
        console.log(`---> PRE-AUTH CHECK: Authenticated req.user.id = ${authenticatedUserId} (Type: ${typeof authenticatedUserId})`);
        // --- -------------------------------------------- ---

        // 3. Authorization/Validation Checks
        // Convert both to Number just in case for a robust comparison
        if (Number(orderUserIdFromDB) !== Number(authenticatedUserId)) {
            // Log the failure clearly
            console.error(`!!! AUTHORIZATION FAILED: Order User ID (${orderUserIdFromDB}) !== Auth User ID (${authenticatedUserId})`);
            throw new Error("User does not own this order."); // Security check
        }
        console.log("   Authorization Check Passed."); // Log success

        if (order.order_status !== 'ACTIVE') throw new Error(`Order status is ${order.order_status}.`);
        const currentBalance = parseFloat(order.remaining_balance);
        if (amount > currentBalance) throw new Error(`Payment (£${amount.toFixed(2)}) exceeds balance (£${currentBalance.toFixed(2)}).`);


        // --- Placeholder for Real Payment Processing ---
        console.log("   *** Skipping real payment processing - Placeholder ***");
        const paymentSuccessful = true; // Assume success for prototype
        if (!paymentSuccessful) throw new Error("Payment processing failed.");
        // --- ------------------------------------- ---

        // --- Perform DB Updates within Transaction ---

        // --- Insert into transactions table ---
        console.log(`   Inserting repayment record into transactions table...`);
        const transactionDescription = `BNPL Repayment for Order #${orderIdInt} (${order.product_title || 'N/A'})`;
        const transactionSql = `INSERT INTO transactions (user_id, transaction_type, amount, transaction_status, description, is_buffer_transaction, transaction_date) VALUES (?, ?, ?, ?, ?, ?, NOW())`;
        const transactionValues = [ userId, 'REPAYMENT', amount, 'Completed', transactionDescription, 0 ];
        try { const [transResult] = await connection.query(transactionSql, transactionValues); console.log(`      -> Transaction record created (ID: ${transResult.insertId})`); }
        catch (transError){ console.error(`   ❌ Error inserting repayment transaction log:`, transError); throw new Error(`Failed to record transaction log.`); }
        // --- ------------------------------ ---


        // 4. Update Order Remaining Balance
        const newBalance = currentBalance - amount;
        const newStatus = (newBalance <= 0.005) ? 'PAID_OFF' : 'ACTIVE';
        const updateOrderSql = 'UPDATE orders SET remaining_balance = ?, order_status = ? WHERE order_id = ?';
        await connection.query(updateOrderSql, [newBalance.toFixed(2), newStatus, orderIdInt]);
        console.log(`   Order ${orderIdInt} updated. New Bal: ${newBalance.toFixed(2)}, Status: ${newStatus}`);

        // 5. Update User's Used Credit Amount (Safely)
        const currentUsedAmount = parseFloat(user.used_credit_amount); // Get from fetched user data
        const amountToDecrease = Math.min(amount, currentUsedAmount); // Cannot decrease below zero
        if(amountToDecrease < amount) console.warn(`   Adjusted decrease amount from ${amount} to ${amountToDecrease}`);
        const updateUserSql = 'UPDATE users SET used_credit_amount = used_credit_amount - ? WHERE user_id = ?';
        await connection.query(updateUserSql, [amountToDecrease.toFixed(2), userId]);
        console.log(`   User ${userId} used_credit_amount updated (-${amountToDecrease.toFixed(2)}).`);

        // ---- End DB Updates ----


        await connection.commit();
        console.log("   Repayment DB Transaction Committed.");

        res.status(200).json({ success: true, message: 'Repayment successful!', new_balance: newBalance.toFixed(2), order_status: newStatus });

    } catch (error) {
        console.error(`❌ Error processing repayment for Order ${orderIdInt || order_id}, User ${userId}:`, error);
        if (connection) { try { await connection.rollback(); console.log("   Repayment DB Transaction Rolled Back."); } catch(rollErr){console.error("Rollback Error:", rollErr);} }
        res.status(500).json({ success: false, message: error.message || 'Failed to process repayment.' });
    } finally {
        if (connection) { try { connection.release(); console.log("   Repayment DB Connection Released."); } catch(relErr){console.error("Release Error:", relErr);} }
    }
});
// --- --------------------------- ---


// --- Get Current Entitlements Endpoint ---
app.get('/api/current_entitlements', authenticateUser, async (req, res) => {
    const userId = req.user.id; console.log(`\n⚙️ Fetching current entitlements User: ${userId}`);
    try {
        const sql = `SELECT assessment_id, credit_tier, credit_limit, calculated_terms FROM credit_assessments WHERE user_id = ? ORDER BY assessment_timestamp DESC LIMIT 1`;
        const [results] = await dbPool.query(sql, [userId]);
        if (results.length === 0) { return res.status(200).json({ success: true, entitlements: { status: 'unassessed', tier: null, limit: 0, terms: [], assessmentId: null } }); }
        const latest = results[0]; let terms = []; try { terms = JSON.parse(latest.calculated_terms || '[]'); if (!Array.isArray(terms)) terms = []; } catch(e){ terms = []; }
        console.log(`✅ Found latest assessment (ID: ${latest.assessment_id})`);
        res.status(200).json({ success: true, entitlements: { status: 'assessed', tier: latest.credit_tier, limit: parseFloat(latest.credit_limit || 0), terms: terms, assessmentId: latest.assessment_id } });
    } catch (error) { console.error(`❌ DB Error fetching entitlements:`, error); res.status(500).json({ success: false, message: 'Error retrieving entitlements.' }); }
});
// --- --------------------------------- ---

// === Test Auth Route ===
app.get('/api/test-auth', authenticateUser, (req, res) => res.json({ success: true, message: `Auth OK for user ID: ${req.user.id}`}));
// === --------------- ===


// Global Error Handler
app.use((err, req, res, next) => {
  console.error("Unhandled Server Error:", err.stack || err);
  // Customize error response in production
  const message = process.env.NODE_ENV === 'production' ? 'An internal server error occurred.' : err.message;
  // Ensure headers haven't already been sent
  if (res.headersSent) {
    return next(err);
  }
  res.status(500).send({ success: false, message: message });
});

// Start Server
app.listen(PORT, () => {
    console.log(`\n🚀 Server running on port ${PORT}`);
    console.log(`🔗 Plaid Env: ${plaidEnv}`);
    console.log(`🐍 Python URL: ${PYTHON_PREDICTION_URL || 'NOT SET!'}`);
    console.log(`🔑 JWT Secret Loaded: ${JWT_SECRET ? 'Yes' : 'NO!'}`);
});