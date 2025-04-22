// ========================================================
// server.js - COMPLETE BACKEND CODE v5 (SIMULATED ASSESSMENT)
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
    if (!password) return false;
    const passwordRegex = /^(?=.*\d.*\d)(?=.*[!@#$%^&*]).{8,}$/;
    return passwordRegex.test(password);
};

// Updated Date Formatter (Handles YYYY-MM-DD and DD-MM-YYYY)
const formatDate = (date) => {
    if (!date || typeof date !== 'string') return null;
    if (/^\d{4}-\d{2}-\d{2}$/.test(date)) { return date; }
    else if (/^\d{2}-\d{2}-\d{4}$/.test(date)) { const [day, month, year] = date.split('-'); return `${year}-${month}-${day}`; }
    else { console.warn(`Invalid date format: ${date}.`); return null; }
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
function mapScoreToEntitlements(riskScore) {
    if (riskScore === null || typeof riskScore !== 'number' || isNaN(riskScore)) { console.error("Mapping score error: Invalid input", riskScore); return { tier: 3, limit: 500.00, terms: [3], error: "Invalid score" }; }
    const T1 = 0.2, T2 = 0.5;
    console.log(`   Mapping score ${riskScore.toFixed(4)}...`);
    if (riskScore < T1) return { tier: 1, limit: 5000.00, terms: [3, 6, 12] };
    else if (riskScore < T2) return { tier: 2, limit: 2500.00, terms: [3, 6] };
    else return { tier: 3, limit: 1000.00, terms: [3] };
}

// Helper: Map DB Employment Status Enum to Model String
function mapEmploymentStatus(dbStatus) {
    if (!dbStatus) return 'No'; const statusUpper = String(dbStatus).toUpperCase();
    if (statusUpper === 'EMPLOYED') return 'Yes'; if (statusUpper === 'SELF_EMPLOYED') return 'Self-Employed'; return 'No';
}
// --- ------------------------------------------------------------------------- ---

// --- Calculation Functions (SIMULATED - Rely on DB/Defaults) ---
function calculate_util_ratio(plaidAuthData, plaidLiabilitiesData, historicalRatio) {
    console.log("  -> Calculating Util Ratio (SIMULATED - Using Fallback)...");
    const fallbackRatio = (historicalRatio !== null && !isNaN(Number(historicalRatio))) ? Number(historicalRatio) : 0.1;
    console.log(`     Util Ratio (DB based): ${fallbackRatio.toFixed(4)}`); return fallbackRatio;
}

function calculate_payment_history(plaidTransactions, userData, historicalScore) {
    console.log("  -> Calculating Payment History Score (SIMULATED - Using DB)...");
    try {
        const baseScore = (historicalScore !== null && !isNaN(Number(historicalScore))) ? Number(historicalScore) : 500;
        let score = baseScore; const maxScore = 1000, minScore = 0;
        const defaultPenalty = 100; if (userData?.cb_person_default_on_file === 'Y') score -= defaultPenalty;
        score = Math.max(minScore, Math.min(maxScore, score)); console.log(`     History Score (DB based): ${Math.round(score)}`); return Math.round(score);
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
    if (!first_name || !surname || !email || !password || !date_of_birth) return res.status(400).json({ success: false, message: 'Missing required fields.' });
    if (!/\S+@\S+\.\S+/.test(email)) return res.status(400).json({ success: false, message: 'Invalid email format.' });
    const formattedDOB = formatDate(date_of_birth);
    if (!formattedDOB && date_of_birth) return res.status(400).json({ success: false, message: 'Invalid date format (YYYY-MM-DD required).' });
    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        // Include default 'N' for the new default flag during registration
        const newUser = { first_name, surname, email, password: hashedPassword, phone_number: phone_number || null, ni_number: ni_number || null, date_of_birth: formattedDOB, cb_person_default_on_file: 'N' };
        const sql = 'INSERT INTO users (first_name, surname, email, password, phone_number, ni_number, date_of_birth, cb_person_default_on_file) VALUES (?, ?, ?, ?, ?, ?, ?, ?)';
        const [result] = await dbPool.query(sql, [newUser.first_name, newUser.surname, newUser.email, newUser.password, newUser.phone_number, newUser.ni_number, newUser.date_of_birth, newUser.cb_person_default_on_file]);
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
        const payload = { id: user.user_id, email: user.email };
        const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '8h' });
        console.log(`✅ User Logged In: ${user.email} (ID: ${user.user_id})`);
        res.status(200).json({ success: true, message: 'Login successful!', token });
    } catch (error) {
        console.error('❌ Login Server Error:', error);
        res.status(500).json({ success: false, message: 'Login failed.' });
    }
});

// --- Plaid Endpoints (For Setup/Demonstration - Exchange has simulated storage) ---
app.post('/api/create_link_token', authenticateUser, async (req, res) => {
    const userId = req.user.id;
    console.log(`⚙️ Creating link token request for User ID: ${userId}`);
    const request = { user: { client_user_id: userId.toString() }, client_name: 'Deferred Payment Platform (Demo)', language: 'en', products: ['auth', 'transactions', 'identity', 'liabilities'], country_codes: ['GB'] };
    try { const response = await plaidClient.linkTokenCreate(request); res.json({ link_token: response.data.link_token }); }
    catch (error) { console.error('❌ Plaid link token error:', error.response?.data || error.message); res.status(500).json({ success: false, message: 'Could not initiate bank link.' }); }
});

app.post('/api/exchange_public_token', authenticateUser, async (req, res) => {
    const userId = req.user.id;
    const { public_token: publicToken } = req.body;
    console.log(`⚙️ Exchange public token request for User ID: ${userId}`);
    // SIMULATION HANDLING: Store placeholder if no real token provided
    if (!publicToken && plaidEnv === PlaidEnvironments.sandbox) {
        console.warn("   No public token (Simulation Mode). Storing placeholder...");
         const fakeAccessToken = `simulated-access-${userId}-${Date.now()}`;
         const fakeItemId = `simulated-item-${userId}`;
         try {
             const sql = 'UPDATE users SET plaid_access_token = ?, plaid_item_id = ? WHERE user_id = ?';
             const [result] = await dbPool.query(sql, [fakeAccessToken, fakeItemId, userId]);
             if (result.affectedRows === 0) return res.status(404).json({ success: false, message: 'User not found.' });
             console.log(`✅ SIMULATED Plaid tokens stored for User ID: ${userId}`);
             res.json({ success: true, message: 'Bank account linked (Simulated).' });
         } catch (dbError) { console.error("   DB Error storing simulated Plaid info:", dbError); res.status(500).json({ success: false, message: 'Failed to save simulated link.' }); }
         return;
    }
    // Logic for REAL token exchange (if frontend ever sends one)
    if (!publicToken) return res.status(400).json({ success: false, message: 'Public token required.' });
    try {
        const response = await plaidClient.itemPublicTokenExchange({ public_token: publicToken });
        const { access_token: accessToken, item_id: itemId } = response.data;
        const sql = 'UPDATE users SET plaid_access_token = ?, plaid_item_id = ? WHERE user_id = ?';
        const [result] = await dbPool.query(sql, [accessToken, itemId, userId]);
        if (result.affectedRows === 0) return res.status(404).json({ success: false, message: 'User not found.' });
        console.log(`✅ REAL Plaid tokens stored for User ID: ${userId}`);
        res.json({ success: true, message: 'Bank account linked successfully.' });
    } catch (error) { console.error('❌ Plaid token exchange error:', error.response?.data || error.message); res.status(500).json({ success: false, message: 'Could not finalize bank link.' }); }
});
// --- --------------------------------------------------------------------- ---


// --- Credit Assessment Endpoint (SIMULATED - Uses DB Data Only) ---
app.post('/api/assess_credit', authenticateUser, async (req, res) => {
    const userId = req.user.id;
    console.log(`\n⚙️ Assessment request for User ID: ${userId} (SIMULATED - DB Data Only)`);
    const { requested_loan_amount = null, requested_loan_term = null } = req.body;
    let assessmentIdForOrder = null; let riskScore = null; let entitlements = {};

    try {
        // --- 1. Informational Check for Plaid Token (Doesn't block) ---
        console.log(`   1. Checking for Plaid token (informational)...`);
        try { const [userCheck] = await dbPool.query('SELECT plaid_access_token FROM users WHERE user_id = ?', [userId]); if (userCheck[0]?.plaid_access_token) console.log(`      -> Plaid token placeholder exists.`); else console.log(`      -> No Plaid token placeholder found.`); }
        catch (dbError) { console.error(`   ⚠️ DB Error checking token (User ${userId}):`, dbError); }

        // --- 2. SKIP Plaid Data Fetching ---
        console.log(`   2. Skipping Plaid API calls (SIMULATION MODE).`);

        // --- 3. Prepare Features using ONLY DB Data ---
        console.log(`   3. Preparing model features from DB...`);
        let rawFeaturesForModel = {};
        try {
            // Fetch latest credit_data and specific user data concurrently
            const creditSql = `SELECT * FROM credit_data WHERE user_id = ? ORDER BY recorded_at DESC LIMIT 1`;
            // Fetch ALL features needed by model from users table (including the new default flag)
            const userSql = `SELECT person_income AS user_person_income, employment_status AS user_employment_status, cb_person_default_on_file, cb_person_cred_hist_length FROM users WHERE user_id = ?`;
            const [[latestCreditData], [dbUserData]] = await Promise.all([ dbPool.query(creditSql, [userId]), dbPool.query(userSql, [userId]) ]);
            const creditData = latestCreditData || {};
            if (!dbUserData) throw new Error("User profile data not found.");

            // Determine final values for model features
            const final_person_income = Number(creditData.person_income || dbUserData.user_person_income || 0);
            const final_loan_amnt = Number(requested_loan_amount || creditData.original_loan_amount || 0);
            const final_loan_term = Number(requested_loan_term || creditData.loan_term || 0);

            // Call calculation functions (passing null/empty Plaid args, but needed DB data)
            const calculated_util_ratio_db = calculate_util_ratio(null, null, creditData.credit_utilization_ratio) ?? 0.1; // Uses historical ratio as fallback
            const calculated_payment_history_db = calculate_payment_history([], dbUserData, creditData.payment_history) ?? 500; // Passes dbUserData for flag check, historical score as fallback

            // Assemble the features object for Python model
            rawFeaturesForModel = {
                'employment_status': mapEmploymentStatus(dbUserData.user_employment_status || creditData.employment_status),
                'person_income': final_person_income,
                'cb_person_default_on_file': dbUserData.cb_person_default_on_file || 'N', // Use newly added column
                'cb_person_cred_hist_length': Number(dbUserData.cb_person_cred_hist_length || 0), // Ensure this column exists in users!

                'original_loan_amount': Number(creditData.original_loan_amount || 0),
                'loan_term': final_loan_term,
                'loan_amnt': final_loan_amnt,

                'credit_utilization_ratio': calculated_util_ratio_db,
                'payment_history': calculated_payment_history_db,
                'loan_percent_income': calculate_lpi(final_loan_amnt, final_person_income) ?? creditData.loan_percent_income ?? 1.0, // Default high LPI if calc fails
            };

            // Final cleanup
            Object.keys(rawFeaturesForModel).forEach(key => {
                // Exclude known string types
                if (key !== 'employment_status' && key !== 'cb_person_default_on_file') {
                     if (rawFeaturesForModel[key] === null || rawFeaturesForModel[key] === undefined || isNaN(Number(rawFeaturesForModel[key]))) {
                        console.warn(`     Feature '${key}' is null/NaN/undefined, setting to 0.`); rawFeaturesForModel[key] = 0;
                     } else { rawFeaturesForModel[key] = Number(rawFeaturesForModel[key]); }
                 } else if (rawFeaturesForModel[key] === null || rawFeaturesForModel[key] === undefined){ // Handle null categoricals
                      if (key === 'employment_status') rawFeaturesForModel[key] = 'No'; else rawFeaturesForModel[key] = 'N';
                 }
             });
            console.log(`✅ Raw features prepared (DB ONLY):`, JSON.stringify(rawFeaturesForModel, null, 2));

        } catch (dataPrepError) {
            console.error(`❌ Error preparing features (DB) for User ${userId}:`, dataPrepError);
            return res.status(500).json({ success: false, message: 'Internal error preparing assessment data.' });
        }

        // --- 4. Call Python Service ---
        if (!PYTHON_PREDICTION_URL) return res.status(503).json({ success: false, message: 'Assessment service config error.' });
        console.log(`   4. Calling Python prediction service...`);
        try {
            const predictionResponse = await fetch(PYTHON_PREDICTION_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ features: rawFeaturesForModel }) });
            if (!predictionResponse.ok) throw new Error(`Prediction service HTTP error: ${predictionResponse.status}`);
            const predictionResult = await predictionResponse.json();
            if (predictionResult.error) throw new Error(`Prediction service failed: ${predictionResult.error}`);
            riskScore = predictionResult.risk_score;
            console.log(`     Risk score received: ${riskScore}`);
        } catch (fetchError) { console.error(`❌ Error calling prediction service:`, fetchError); return res.status(503).json({ success: false, message: 'Assessment service unavailable.' }); }
        if (riskScore === null || isNaN(Number(riskScore))) return res.status(500).json({success: false, message: 'Invalid score from assessment.'});


        // --- 5. Map Score ---
        console.log(`   5. Mapping score ${riskScore}...`);
        entitlements = mapScoreToEntitlements(riskScore);

        // --- 6. Store Assessment Result in History Table ---
        console.log(`   6. Storing assessment result...`);
        if (entitlements && !entitlements.error) {
            try {
                const sql = `INSERT INTO credit_assessments (user_id, risk_score, credit_tier, credit_limit, calculated_terms, assessment_timestamp) VALUES (?, ?, ?, ?, ?, NOW())`;
                const terms = JSON.stringify(entitlements.terms || []);
                const [insResult] = await dbPool.query(sql, [userId, riskScore, entitlements.tier, entitlements.limit, terms]);
                assessmentIdForOrder = insResult.insertId; console.log(`      -> Assessment record (ID: ${assessmentIdForOrder}) stored.`);
            } catch (dbErr) { console.error(`   ❌ DB Error storing assessment:`, dbErr); }
        } else { console.warn(`   ⚠️ Skipping storage: Invalid score/entitlement error.`); }

        // --- 7. Return Result ---
        console.log(`✅ Assessment complete (SIMULATED) for User ID ${userId}.`);
        res.status(200).json({ success: true, entitlements, assessmentId: assessmentIdForOrder });

    } catch (error) { // Catch remaining errors
        console.error(`❌ Overall Assessment Error (SIMULATED) for User ${userId}:`, error);
        res.status(500).json({ success: false, message: error.message || 'Assessment failed.' });
    }
});
// --- ------------------------------------------ ---


// --- Confirm BNPL Order Endpoint ---
app.post('/api/confirm_bnpl_order', authenticateUser, async (req, res) => {
    const userId = req.user.id;
    const { product, term, assessmentId } = req.body; // Expect product object, term number, optional assessment ID
    console.log(`\n⚙️ Confirming BNPL order request for User ID: ${userId}`);
    // Validation
    if (!product?.numericPrice || !product?.title || typeof term !== 'number' || term <= 0) return res.status(400).json({ success: false, message: 'Missing/invalid order details.' });

    // Optional: Verify Assessment ID / Limit
    if (assessmentId) { /* ... (Code to verify assessment) ... */ } else { console.warn("   No assessment ID provided with order."); }

    // Insert Order
    try {
        const loanAmount = product.numericPrice; const now = new Date();
        const firstDueDate = new Date(now.setMonth(now.getMonth() + 1)).toISOString().split('T')[0];
        const orderData = { user_id: userId, assessment_id: assessmentId || null, product_title: product.title, product_price: product.numericPrice, loan_amount: loanAmount, selected_term_months: term, remaining_balance: loanAmount, order_status: 'ACTIVE', next_payment_due_date: firstDueDate, order_timestamp: new Date() };
        const sql = 'INSERT INTO orders SET ?';
        const [result] = await dbPool.query(sql, orderData); const orderId = result.insertId;
        console.log(`✅ BNPL Order (ID: ${orderId}) created for User ID: ${userId}`);
        // TODO: Post-Order Logic (Notifications, etc.)
        res.status(201).json({ success: true, message: 'Order confirmed!', orderId });
    } catch (error) { console.error(`❌ Error confirming BNPL order:`, error); res.status(500).json({ success: false, message: 'Failed to save order.' }); }
});
// --- --------------------------- ---


// --- Get Current Entitlements Endpoint ---
app.get('/api/current_entitlements', authenticateUser, async (req, res) => {
    const userId = req.user.id;
    console.log(`\n⚙️ Fetching current entitlements request for User ID: ${userId}`);
    try {
        const sql = `SELECT assessment_id, credit_tier, credit_limit, calculated_terms, assessment_timestamp FROM credit_assessments WHERE user_id = ? ORDER BY assessment_timestamp DESC LIMIT 1`;
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
  // Avoid sending stack trace to client in production for security
  const message = process.env.NODE_ENV === 'production' ? 'An unexpected server error occurred.' : err.message;
  res.status(500).send({ success: false, message: message });
});

// Start Server
app.listen(PORT, () => {
    console.log(`\n🚀 Server running on port ${PORT}`);
    console.log(`🔗 Plaid Env: ${plaidEnv}`); // Show active Plaid Env
    console.log(`🐍 Python URL: ${PYTHON_PREDICTION_URL || 'NOT SET!'}`);
    console.log(`🔑 JWT Secret Loaded: ${JWT_SECRET ? 'Yes' : 'NO!'}`);
});