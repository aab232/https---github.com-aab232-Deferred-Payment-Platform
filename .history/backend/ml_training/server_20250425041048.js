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
    let assessmentIdForOrder = null; let riskScore = null; let entitlements = {};

    try {
        // Step 1 & 2: Informational Check & Skip Plaid Fetch
        console.log(`   1. Skipping token check & Plaid API calls (SIMULATION MODE).`);

        // Step 3: Prepare Features using ONLY DB Data
        console.log(`   2. Preparing model features from DB...`); // Renumbered log steps
        let rawFeaturesForModel = {};
        try {
            // Fetch required DB data concurrently
            const creditSql = `SELECT employment_status, person_income, credit_utilization_ratio, payment_history, loan_term, loan_amnt AS original_loan_amount, loan_percent_income FROM credit_data WHERE user_id = ? ORDER BY recorded_at DESC LIMIT 1`;
            const userSql = `SELECT cb_person_default_on_file, cb_person_cred_hist_length FROM users WHERE user_id = ?`;
            const [[latestCreditData], [dbUserData]] = await Promise.all([
                 dbPool.query(creditSql, [userId]),
                 dbPool.query(userSql, [userId])
            ]);
            const creditData = latestCreditData || {}; // Use empty object if no history
            if (!dbUserData) throw new Error("User profile data missing."); // User must exist if authenticated

            // Determine final values for features
            const final_person_income = Number(creditData.person_income || 0); // Prioritize creditData for income snapshot
            const final_loan_amnt = Number(requested_loan_amount || creditData.original_loan_amount || 0);
            const final_loan_term = Number(requested_loan_term || creditData.loan_term || 0);

            // Call calculation helpers (passing null for Plaid data, rely on DB fallbacks)
            const calculated_util_ratio_db = calculate_util_ratio(null, null, creditData.credit_utilization_ratio) ?? 0.1;
            const calculated_payment_history_db = calculate_payment_history([], dbUserData, creditData.payment_history) ?? 500; // Pass dbUserData for default flag check

            // Assemble the features object matching Python script's expected keys
            rawFeaturesForModel = {
                'employment_status': mapEmploymentStatus(creditData.employment_status || dbUserData.user_employment_status), // Map using latest snapshot or user profile
                'person_income': final_person_income,
                'cb_person_default_on_file': dbUserData.cb_person_default_on_file || 'N',
                'cb_person_cred_hist_length': Number(dbUserData.cb_person_cred_hist_length || 0), // Use value from users table

                'original_loan_amount': Number(creditData.original_loan_amount || 0), // From credit data alias
                'loan_term': final_loan_term,
                'loan_amnt': final_loan_amnt,

                'credit_utilization_ratio': calculated_util_ratio_db,
                'payment_history': calculated_payment_history_db,
                'loan_percent_income': calculate_lpi(final_loan_amnt, final_person_income) ?? 1.0, // Default high LPI if needed
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
            console.log(`✅ Raw features prepared (DB ONLY):`, JSON.stringify(rawFeaturesForModel, null, 2));

        } catch (dataPrepError) {
             console.error(`❌ Error preparing features (DB) for User ${userId}:`, dataPrepError);
             return res.status(500).json({ success: false, message: 'Internal error preparing assessment data.' });
        }

        // 3. Call Python Service (Renumbered Step)
        if (!PYTHON_PREDICTION_URL) return res.status(503).json({ success: false, message: 'Assessment config error.' });
        console.log(`   3. Calling Python prediction service...`);
        try {
             const predictionResponse = await fetch(PYTHON_PREDICTION_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ features: rawFeaturesForModel }) });
             if (!predictionResponse.ok) { const errTxt = await predictionResponse.text(); throw new Error(`Prediction service HTTP error: ${predictionResponse.status} - ${errTxt}`); }
             const predictionResult = await predictionResponse.json(); if (predictionResult.error) throw new Error(`Prediction service failed: ${predictionResult.error}`); riskScore = predictionResult.risk_score;
             console.log(`     Score: ${riskScore}`);
        } catch (fetchError) { console.error("Python Fetch Error:", fetchError); return res.status(503).json({ success: false, message: 'Assessment service unavailable.' }); }
        if (riskScore === null || isNaN(Number(riskScore))) return res.status(500).json({success: false, message: 'Invalid score received.'});

        // 4. Map Score (Renumbered Step)
        console.log(`   4. Mapping score ${riskScore}...`);
        entitlements = mapScoreToEntitlements(riskScore);

        // 5. Store Assessment Result (Renumbered Step)
        console.log(`   5. Storing assessment result...`);
        if (!entitlements.error) {
             try { const sql = `INSERT INTO credit_assessments (user_id, risk_score, credit_tier, credit_limit, calculated_terms, assessment_timestamp) VALUES (?, ?, ?, ?, ?, NOW())`; const terms = JSON.stringify(entitlements.terms||[]); const [ins] = await dbPool.query(sql, [userId, riskScore, entitlements.tier, entitlements.limit, terms]); assessmentIdForOrder = ins.insertId; console.log(`      -> Record ${assessmentIdForOrder} stored.`); }
             catch (e) { console.error("   ❌ DB Error storing assessment:", e); }
        } else { console.warn(`   ⚠️ Skipping assessment storage due to invalid score/entitlement error.`); }

        // 6. Return Result (Renumbered Step)
        console.log(`✅ Assessment complete (DB ONLY) User: ${userId}.`);
        res.status(200).json({ success: true, entitlements, assessmentId: assessmentIdForOrder });

    } catch (error) { console.error(`❌ Overall Assessment Error (DB ONLY Path):`, error); res.status(500).json({ success: false, message: error.message || 'Assessment failed.' }); }
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
        entitlements = mapScoreToEntitlements(riskScore);

        // 4. Return Result (Do NOT store simulated dashboard estimates in history)
        console.log(`✅ SIMULATED Assessment complete.`);
        res.status(200).json({ success: true, entitlements, assessmentId: null, simulated: true });

    } catch (error) { console.error(`❌ SIMULATED Assessment Error:`, error); res.status(500).json({ success: false, message: error.message || 'Simulation failed.' }); }
});
// --- --------------------------------------------- ---


// --- Confirm BNPL Order Endpoint ---
app.post('/api/confirm_bnpl_order', authenticateUser, async (req, res) => {
    const userId = req.user.id; const { product, term, assessmentId } = req.body;
    console.log(`\n⚙️ Confirming BNPL order User: ${userId}`);
    if (!product?.numericPrice || !product?.title || typeof term !== 'number' || term <= 0) return res.status(400).json({ success: false, message: 'Invalid order details.' });
    // Optional Assessment Verification can remain here if needed
    try {
        const loanAmount = product.numericPrice; const now = new Date(); const dueDate = new Date(now.setMonth(now.getMonth() + 1)).toISOString().split('T')[0];
        const orderData = { user_id: userId, assessment_id: assessmentId || null, product_title: product.title, product_price: product.numericPrice, loan_amnt: loanAmount, selected_term_months: term, remaining_balance: loanAmount, order_status: 'ACTIVE', next_payment_due_date: dueDate, order_timestamp: new Date() };
        const sql = 'INSERT INTO orders SET ?'; const [result] = await dbPool.query(sql, orderData); const orderId = result.insertId;
        console.log(`✅ BNPL Order (ID: ${orderId}) created.`);
        // TODO: Post-Order Logic (e.g., trigger email notification)
        res.status(201).json({ success: true, message: 'Order confirmed!', orderId });
    } catch (error) { console.error(`❌ Error confirming BNPL order:`, error); res.status(500).json({ success: false, message: 'Failed to save order.' }); }
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