// ========================================================
// server.js - COMPLETE BACKEND CODE v3
// Includes original features + Plaid + ML Assessment + BNPL Order
// ========================================================

// --- Core Dependencies ---
const express = require('express');
const mysql = require('mysql2'); // Using mysql2
const cors = require('cors');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
// const puppeteer = require('puppeteer'); // Removed as it wasn't used in provided code

// --- Added Dependencies ---
require('dotenv').config(); // Load .env file variables FIRST
const { Configuration, PlaidApi, PlaidEnvironments } = require('plaid');
const fetch = require('node-fetch'); // Using require for fetch based on original code
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

// Original Password Validator (Keep if used)
const isValidPassword = (password) => {
    const passwordRegex = /^(?=.*\d.*\d)(?=.*[!@#$%^&*]).{8,}$/;
    return passwordRegex.test(password);
};

// Updated Date Formatter (Handles multiple potential input formats)
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
// TODO: Replace these placeholders with robust calculations using provided data
function calculate_util_ratio(plaidAuthData, plaidLiabilitiesData) {
    console.log("  -> Calculating Util Ratio..."); let totalBal = 0, totalLim = 0, found = false;
    try {
        const accountsToProcess = plaidLiabilitiesData?.liabilities?.credit || plaidAuthData?.accounts;
        const source = plaidLiabilitiesData?.liabilities?.credit ? 'Liabilities' : (plaidAuthData?.accounts ? 'Auth' : 'None');
        if (source !== 'None') { accountsToProcess.forEach(acc => { if (acc.type === 'credit' || source === 'Liabilities') { totalBal += (acc.balances?.current ?? 0); totalLim += (acc.balances?.limit ?? 0); found = true; } }); }
        if (!found) { console.log("     No credit accounts found. Util ratio: 0.0"); return 0.0; }
        if (totalLim <= 0) { console.warn("     Total credit limit zero/unknown."); return (totalBal > 0 ? 1.1 : 0.0); } // Use 1.1 to signify >100% or unknown limit
        const ratio = Math.max(0, totalBal) / totalLim; console.log(`     Util Ratio: ${ratio.toFixed(4)}`); return ratio;
    } catch (e) { console.error(" Error calculating util ratio:", e); return null; } // Indicate failure
}

function calculate_payment_history(plaidTransactions, userData) {
    console.log("  -> Calculating Payment History Score...");
    try {
        // Prioritize using historical score from credit_data if available and recent?
        // For simplicity, start with a base score and adjust.
        const baseScore = 500; // Neutral starting point
        let score = baseScore; const maxScore = 1000, minScore = 0; let negEvents = 0;
        const sixMonthsAgo = new Date(); sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6); const dateThresholdStr = sixMonthsAgo.toISOString().split('T')[0];
        const negKeywords = ['nsf fee', 'overdraft fee', 'late fee', 'returned payment', 'insufficient fund'];
        // Simple check for recent negative keywords in transaction names
        (plaidTransactions || []).filter(tx => tx.date >= dateThresholdStr).forEach(tx => { const d = (tx.name || tx.merchant_name || '').toLowerCase(); if (tx.amount > 0 && negKeywords.some(k => d.includes(k))) negEvents++; });
        const negPenalty = 30; // Small penalty per event
        score -= negEvents * negPenalty; if(negEvents > 0) console.log(`     Penalty for ${negEvents} negative flags.`);
        // Apply penalty if user has a known default flag from DB
        const defaultPenalty = 100;
        if (userData?.cb_person_default_on_file === 'Y') { score -= defaultPenalty; console.log(`     Penalty for default flag.`);}
        score = Math.max(minScore, Math.min(maxScore, score)); console.log(`     Calculated History Score: ${Math.round(score)}`); return Math.round(score);
    } catch (e) { console.error(" Error calculating payment history:", e); return 500; } // Neutral score on error
}

function calculate_lpi(loan_amnt, person_income) {
    const incomeNum = Number(person_income); const loanNum = Number(loan_amnt);
    if (!isNaN(incomeNum) && incomeNum > 0 && !isNaN(loanNum) && loanNum >= 0) {
        const ratio = loanNum / incomeNum; return ratio;
    }
    console.warn(`     Could not calculate LPI. Loan: ${loan_amnt}, Income: ${person_income}`); return null;
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
    // --- --------------- ---
    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        const newUser = { first_name, surname, email, password: hashedPassword, phone_number: phone_number || null, ni_number: ni_number || null, date_of_birth: formattedDOB };
        const sql = 'INSERT INTO users SET ?';
        const [result] = await dbPool.query(sql, newUser);
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
        if (results.length === 0) return res.status(401).json({ success: false, message: 'Invalid credentials.' });
        const user = results[0];
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) return res.status(401).json({ success: false, message: 'Invalid credentials.' });
        const payload = { id: user.user_id, email: user.email }; // Crucial: include user ID
        const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '8h' }); // Define expiration
        console.log(`✅ User Logged In: ${user.email} (ID: ${user.user_id})`);
        res.status(200).json({ success: true, message: 'Login successful!', token });
    } catch (error) {
        console.error('❌ Login Server Error:', error);
        res.status(500).json({ success: false, message: 'Login failed.' });
    }
});

// --- Plaid Endpoints ---
// Create Plaid Link Token
app.post('/api/create_link_token', authenticateUser, async (req, res) => {
    const userId = req.user.id;
    console.log(`⚙️ Creating link token request for User ID: ${userId}`);
    const request = {
        user: { client_user_id: userId.toString() },
        client_name: 'Deferred Payment Platform', // ** YOUR APP NAME **
        language: 'en',
        products: ['auth', 'transactions', 'identity', 'liabilities'], // Request products needed
        country_codes: ['GB'], // Define target countries
    };
    try {
        const response = await plaidClient.linkTokenCreate(request);
        res.json({ link_token: response.data.link_token });
    } catch (error) {
        console.error('❌ Plaid link token error:', error.response?.data || error.message);
        res.status(500).json({ success: false, message: 'Could not initiate bank link.' });
    }
});

// Exchange Public Token for Access Token
app.post('/api/exchange_public_token', authenticateUser, async (req, res) => {
    const userId = req.user.id;
    const { public_token: publicToken } = req.body; // Get token from request body
    console.log(`⚙️ Exchanging public token request for User ID: ${userId}`);
    if (!publicToken) return res.status(400).json({ success: false, message: 'Public token required.' });
    try {
        const response = await plaidClient.itemPublicTokenExchange({ public_token: publicToken });
        const { access_token: accessToken, item_id: itemId } = response.data;
        console.log(`✅ Access token obtained for Item ID: ${itemId}`);
        const sql = 'UPDATE users SET plaid_access_token = ?, plaid_item_id = ? WHERE user_id = ?';
        const [result] = await dbPool.query(sql, [accessToken, itemId, userId]);
        if (result.affectedRows === 0) return res.status(404).json({ success: false, message: 'User not found.' });
        console.log(`✅ Plaid tokens stored for User ID: ${userId}`);
        res.json({ success: true, message: 'Bank account linked successfully.' });
    } catch (error) {
        console.error('❌ Plaid token exchange error:', error.response?.data || error.message);
        res.status(500).json({ success: false, message: 'Could not finalize bank link.' });
    }
});
// --- ----------------- ---

// --- Credit Assessment Endpoint ---
app.post('/api/assess_credit', authenticateUser, async (req, res) => {
    const userId = req.user.id;
    console.log(`\n⚙️ Assessment request for User ID: ${userId}`);
    const { requested_loan_amount = null, requested_loan_term = null } = req.body;
    let assessmentIdForOrder = null; let riskScore = null; let entitlements = {};

    try {
        // 1. Get Access Token
        console.log(`   1. Fetching Plaid token...`);
        const [userCheck] = await dbPool.query('SELECT plaid_access_token FROM users WHERE user_id = ?', [userId]);
        const accessToken = userCheck[0]?.plaid_access_token;
        if (!accessToken) return res.status(400).json({ success: false, message: 'Bank account must be linked.' });

        // 2. Fetch Plaid Data (Add more calls as needed)
        console.log(`   2. Fetching Plaid data...`);
        let plaidTransactions = [], plaidAuthData = null, plaidLiabilitiesData = null; // Add other types
        try {
             // Fetch Transactions, Auth, Liabilities concurrently
             const [txData, authData, liabData] = await Promise.all([
                 (async () => { // Wrap transaction sync in async IIFE
                     const txReq = { access_token: accessToken }; let added = [], mod = [], more = true, cur = null;
                     while(more){ const current = cur ? {...txReq, cursor: cur} : txReq; const r = await plaidClient.transactionsSync(current); added = added.concat(r.data.added); mod = mod.concat(r.data.modified); more = r.data.has_more; cur = r.data.next_cursor; }
                     console.log(`      - Synced ${added.length + mod.length} txns.`); return added.concat(mod);
                 })(),
                 plaidClient.authGet({ access_token: accessToken }).then(r => { console.log("      - Fetched Auth."); return r.data; }).catch(e => { console.warn("Auth fetch failed:", e.message); return null; }),
                 plaidClient.liabilitiesGet({ access_token: accessToken }).then(r => { console.log("      - Fetched Liabilities."); return r.data; }).catch(e => { console.warn("Liabilities fetch failed:", e.message); return null; })
                 // TODO: Add Promise.all entries for Identity, Income etc.
             ]);
             plaidTransactions = txData; plaidAuthData = authData; plaidLiabilitiesData = liabData;

        } catch (plaidError) { console.error(`❌ Plaid API Error for User ${userId}:`, plaidError.response?.data || plaidError.message); /* ... Plaid specific error handling ... */ }

        // 3. Prepare Features for Python Service
        console.log(`   3. Preparing model features...`);
        rawFeaturesForModel = {};
        try {
             const creditSql = `SELECT * FROM credit_data WHERE user_id = ? ORDER BY recorded_at DESC LIMIT 1`;
             const userSql = `SELECT person_income, employment_status, cb_person_default_on_file, cb_person_cred_hist_length FROM users WHERE user_id = ?`;
             const [[latestCreditData], [dbUserData]] = await Promise.all([ dbPool.query(creditSql, [userId]), dbPool.query(userSql, [userId]) ]);
             const creditData = latestCreditData || {}; // Use empty object if no history
             if (!dbUserData) throw new Error("User profile data not found.");

             const pIncome = /* Prioritize Plaid Income ? */ creditData.person_income || dbUserData.person_income || 0;
             const lAmnt = requested_loan_amount || creditData.original_loan_amount || 0;
             const lTerm = requested_loan_term || creditData.loan_term || 0;

             rawFeaturesForModel = { // Keys must match Python model's expected features
                 'employment_status': mapEmploymentStatus(dbUserData.employment_status || creditData.employment_status),
                 'person_income': pIncome,
                 'cb_person_default_on_file': dbUserData.cb_person_default_on_file || creditData.cb_person_default_on_file || 'N',
                 'cb_person_cred_hist_length': Number(dbUserData.cb_person_cred_hist_length || creditData.cb_person_cred_hist_length || 0),
                 'original_loan_amount': Number(creditData.original_loan_amount || 0),
                 'loan_term': Number(lTerm),
                 'loan_amnt': Number(lAmnt),
                 'credit_utilization_ratio': calculate_util_ratio(plaidAuthData, plaidLiabilitiesData) ?? creditData.credit_utilization_ratio ?? 0.1, // Provide relevant data
                 'payment_history': calculate_payment_history(plaidTransactions, dbUserData) ?? creditData.payment_history ?? 500, // Provide relevant data
                 'loan_percent_income': calculate_lpi(lAmnt, pIncome) ?? creditData.loan_percent_income ?? null, // Recalculate
             };
            // Final Cleanup
             for (const key in rawFeaturesForModel) { if (rawFeaturesForModel[key] === null) { /* Set default */ } /* Convert types if needed */ }
             console.log(`     Raw features ready:`, JSON.stringify(rawFeaturesForModel));

        } catch (dataPrepError) { /* ... Data prep error handling ... */ }

        // 4. Call Python Service
        if (!PYTHON_PREDICTION_URL) return res.status(503).json({ success: false, message: 'Assessment config error.' });
        console.log(`   4. Calling Python prediction service...`);
        try { /* ... fetch call and parsing riskScore ... */ } catch (fetchError) { /* ... */ }
        if (riskScore === null) return res.status(503).json({ success: false, message: 'Assessment service unavailable.' });


        // 5. Map Score
        console.log(`   5. Mapping score ${riskScore}...`);
        entitlements = mapScoreToEntitlements(riskScore);

        // 6. Store Assessment Result
        console.log(`   6. Storing assessment result...`);
        if (entitlements && !entitlements.error) {
             try {
                const sql = `INSERT INTO credit_assessments (...) VALUES (...)`;
                // ... (Execute INSERT as before) ...
                assessmentIdForOrder = insertResult.insertId;
            } catch (e) { /* Log DB store error */ }
        } else { /* Log skip reason */ }

        // 7. Return Result
        console.log(`✅ Assessment complete for User ID ${userId}.`);
        res.status(200).json({ success: true, entitlements, assessmentId: assessmentIdForOrder }); // Send back result + ID

    } catch (error) { // Catch any unhandled errors from above
        console.error(`❌ Overall Assessment Error for User ${userId}:`, error);
        res.status(500).json({ success: false, message: error.message || 'Assessment failed.' });
    }
});
// --- -------------------------- ---

// --- Confirm BNPL Order Endpoint ---
app.post('/api/confirm_bnpl_order', authenticateUser, async (req, res) => {
    const userId = req.user.id;
    const { product, term, assessmentId } = req.body;
    console.log(`\n⚙️ Confirming BNPL order request for User ID: ${userId}`);
    // --- Validation ---
    if (!product?.numericPrice || !product?.title || typeof term !== 'number' || term <= 0) return res.status(400).json({ success: false, message: 'Missing/invalid order details.' });

    // --- Optional Assessment Verification ---
    if (assessmentId) { /* ... (Verify assessmentId, user, and limit) ... */ } else { console.warn("No assessment ID provided."); /* Allow? */ }

    // --- Insert Order ---
    try {
        const loanAmount = product.numericPrice; const now = new Date();
        const firstDueDate = new Date(now.setMonth(now.getMonth() + 1)).toISOString().split('T')[0];
        const orderData = { user_id: userId, assessment_id: assessmentId || null, product_title: product.title, product_price: product.numericPrice, loan_amount: loanAmount, selected_term_months: term, remaining_balance: loanAmount, order_status: 'ACTIVE', next_payment_due_date: firstDueDate, order_timestamp: new Date() };
        const sql = 'INSERT INTO orders SET ?';
        const [result] = await dbPool.query(sql, orderData); const orderId = result.insertId;
        console.log(`✅ BNPL Order (ID: ${orderId}) created for User ID: ${userId}`);
        // --- TODO: Post-Order Logic ---
        res.status(201).json({ success: true, message: 'Order confirmed!', orderId });
    } catch (error) { console.error(`❌ Error confirming BNPL order:`, error); res.status(500).json({ success: false, message: 'Failed to save order.' }); }
});
// --- --------------------------- ---


// --- Get Current Entitlements Endpoint ---
app.get('/api/current_entitlements', authenticateUser, async (req, res) => {
    const userId = req.user.id;
    console.log(`\n⚙️ Fetching current entitlements request for User ID: ${userId}`);
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

// Global Error Handler - Basic
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