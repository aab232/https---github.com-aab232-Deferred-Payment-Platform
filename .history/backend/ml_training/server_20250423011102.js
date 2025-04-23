const express = require('express');
const mysql = require('mysql2');
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

// --- Calculation Functions (Implement with REAL logic or keep as placeholders) ---
function calculate_util_ratio(plaidAuthData, plaidLiabilitiesData, historicalRatio) {
    // In SIMULATION, first two args are null. In Live attempt, they might be populated.
    console.log("  -> Calculating Util Ratio..."); let totalBal = 0, totalLim = 0, found = false;
    try { /* ... Logic using Liabilities > Auth > historicalRatio ... */ } catch (e) { /* ... */ return historicalRatio ?? 0.1;} // Fallback
    // Return calculated ratio or fallback
    return 0.1; // Placeholder if logic removed
}

function calculate_payment_history(plaidTransactions, userData, historicalScore) {
    // In SIMULATION, plaidTransactions is []. In Live attempt, it might have data.
    console.log("  -> Calculating Payment History Score...");
    try { /* ... Logic using historicalScore, userData.cb_.., and penalties from plaidTransactions if present ... */ } catch (e) { /* ... */ return historicalScore ?? 500; } // Fallback
     return 500; // Placeholder if logic removed
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
        // Default flags for new user
        const newUser = { first_name, surname, email, password: hashedPassword, phone_number: phone_number || null, ni_number: ni_number || null, date_of_birth: formattedDOB, cb_person_default_on_file: 'N', cb_person_cred_hist_length: 0 };
        // Explicitly list columns for insertion security/clarity
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
        if (results.length === 0) { return res.status(401).json({ success: false, message: 'Invalid credentials.' }); }
        const user = results[0];
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) { return res.status(401).json({ success: false, message: 'Invalid credentials.' }); }
        const payload = { id: user.user_id, email: user.email };
        const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '8h' });
        console.log(`✅ User Logged In: ${user.email} (ID: ${user.user_id})`);
        res.status(200).json({ success: true, message: 'Login successful!', token });
    } catch (error) {
        console.error('❌ Login Server Error:', error);
        res.status(500).json({ success: false, message: 'Login failed.' });
    }
});

// --- Plaid Endpoints ---
app.post('/api/create_link_token', authenticateUser, async (req, res) => {
    const userId = req.user.id;
    console.log(`⚙️ Creating link token request for User ID: ${userId}`);
    const request = { user: { client_user_id: userId.toString() }, client_name: 'Deferred Payment Platform (Demo)', language: 'en', products: ['auth', 'transactions', 'identity', 'liabilities'], country_codes: ['GB'] };
    try { const response = await plaidClient.linkTokenCreate(request); res.json({ link_token: response.data.link_token }); }
    catch (error) { console.error('❌ Plaid link token error:', error.response?.data || error.message); res.status(500).json({ success: false, message: 'Could not initiate bank link.' }); }
});

app.post('/api/exchange_public_token', authenticateUser, async (req, res) => {
    const userId = req.user.id; const { public_token: publicToken } = req.body; console.log(`⚙️ Exchange public token request for User ID: ${userId}`);
    // Simulation Storage
    if (!publicToken && plaidEnv === PlaidEnvironments.sandbox) {
        console.warn("   No public token (Simulation Mode). Storing placeholder...");
         const fakeAccessToken = `simulated-access-${userId}-${Date.now()}`; const fakeItemId = `simulated-item-${userId}`;
         try { const sql = 'UPDATE users SET plaid_access_token = ?, plaid_item_id = ? WHERE user_id = ?'; const [result] = await dbPool.query(sql, [fakeAccessToken, fakeItemId, userId]); if (result.affectedRows === 0) return res.status(404).json({ success: false, message: 'User not found.' }); res.json({ success: true, message: 'Bank account linked (Simulated).' }); }
         catch (dbError) { console.error("   DB Error storing simulated Plaid info:", dbError); res.status(500).json({ success: false, message: 'Failed to save simulated link.' }); } return;
    }
    // Real Token Exchange
    if (!publicToken) return res.status(400).json({ success: false, message: 'Public token required.' });
    try { const response = await plaidClient.itemPublicTokenExchange({ public_token: publicToken }); const { access_token: accessToken, item_id: itemId } = response.data; const sql = 'UPDATE users SET plaid_access_token = ?, plaid_item_id = ? WHERE user_id = ?'; const [result] = await dbPool.query(sql, [accessToken, itemId, userId]); if (result.affectedRows === 0) return res.status(404).json({ success: false, message: 'User not found.' }); res.json({ success: true, message: 'Bank account linked successfully.' }); }
    catch (error) { console.error('❌ Plaid token exchange error:', error.response?.data || error.message); res.status(500).json({ success: false, message: 'Could not finalize bank link.' }); }
});
// --- ----------------- ---


// --- PRIMARY Credit Assessment Endpoint (Tries Plaid First, then DB) ---
app.post('/api/assess_credit', authenticateUser, async (req, res) => {
    const userId = req.user.id; console.log(`\n⚙️ LIVE Assessment request for User ID: ${userId}`);
    const { requested_loan_amount = null, requested_loan_term = null } = req.body;
    let assessmentIdForOrder = null, riskScore = null, entitlements = { needsRelink: false }; // Include needsRelink flag
    let plaidDataFetched = false, plaidTransactions = [], plaidAuthData = null, plaidLiabilitiesData = null;

    try {
        // 1. Get Access Token
        const [userCheck] = await dbPool.query('SELECT plaid_access_token FROM users WHERE user_id = ?', [userId]);
        const accessToken = userCheck[0]?.plaid_access_token;

        // 2. Try Fetching Plaid Data
        if (accessToken && !accessToken.startsWith('simulated-access-')) {
            console.log(`   2. Attempting LIVE Plaid data fetch...`);
            try { /* ... Promise.all to fetch Transactions, Auth, Liabilities ... */ plaidDataFetched = true; }
            catch (plaidError) { console.warn(`   ⚠️ Plaid API fetch failed: ${plaidError.message}.`); if (plaidError.response?.data?.error_code === 'ITEM_LOGIN_REQUIRED') entitlements.needsRelink = true; }
        } else { console.log(`   2. No valid Plaid token. Using DB data only.`); }

        // 3. Prepare Features
        console.log(`   3. Preparing model features (Plaid data available: ${plaidDataFetched})...`);
        let rawFeaturesForModel = {};
        try { /* ... Fetch DB data, Combine sources, Call calculation helpers, Assemble rawFeaturesForModel ... */ }
        catch (dataPrepError) { return res.status(500).json({ success: false, message: 'Error preparing data.' }); }

        // 4. Call Python Service
        if (!PYTHON_PREDICTION_URL) return res.status(503).json({ success: false, message: 'Assessment config error.' });
        console.log(`   4. Calling Python prediction service...`);
        try { /* ... fetch call, parse riskScore ... */ }
        catch (fetchError) { return res.status(503).json({ success: false, message: 'Assessment service unavailable.' }); }
        if (riskScore === null || isNaN(Number(riskScore))) return res.status(500).json({success: false, message: 'Invalid score from assessment.'});

        // 5. Map Score
        const calculatedEntitlements = mapScoreToEntitlements(riskScore);
        entitlements = { ...calculatedEntitlements, needsRelink: entitlements.needsRelink }; // Combine results with relink flag

        // 6. Store Assessment Result
        if (!entitlements.error) { /* ... INSERT into credit_assessments, capture assessmentIdForOrder ... */ }

        // 7. Return Result
        console.log(`✅ Assessment complete (Live Attempt) for User ID ${userId}.`);
        res.status(200).json({ success: true, entitlements, assessmentId: assessmentIdForOrder });

    } catch (error) { console.error(`❌ Overall Assessment Error for User ${userId}:`, error); res.status(500).json({ success: false, message: error.message || 'Assessment failed.' }); }
});
// --- ------------------------------------------ ---


// --- SIMULATED Credit Assessment Endpoint (DB Only) ---
app.post('/api/assess_credit_simulated', authenticateUser, async (req, res) => {
    const userId = req.user.id; console.log(`\n⚙️ SIMULATED Assessment request for User ID: ${userId}`);
    const { requested_loan_amount = null, requested_loan_term = null } = req.body;
    let riskScore = null; let entitlements = {};

    try {
        // 1. Prepare Features using ONLY DB Data
        console.log(`   1. Preparing model features from DB...`);
        let rawFeaturesForModel = {};
        try {
            const creditSql = `SELECT employment_status, person_income, credit_utilization_ratio, payment_history, loan_term, loan_amount AS original_loan_amount, loan_percent_income FROM credit_data WHERE user_id = ? ORDER BY recorded_at DESC LIMIT 1`;
            const userSql = `SELECT person_income AS user_person_income, employment_status AS user_employment_status, cb_person_default_on_file, cb_person_cred_hist_length FROM users WHERE user_id = ?`;
            const [[latestCreditData], [dbUserData]] = await Promise.all([ dbPool.query(creditSql, [userId]), dbPool.query(userSql, [userId]) ]);
            const creditData = latestCreditData || {}; if (!dbUserData) throw new Error("User profile data not found.");
            const pIncome = Number(creditData.person_income || dbUserData.user_person_income || 0);
            const lAmnt = Number(requested_loan_amount || creditData.original_loan_amount || 1000);
            const lTerm = Number(requested_loan_term || creditData.loan_term || 6);
            const util = calculate_util_ratio(null, null, creditData.credit_utilization_ratio) ?? 0.1;
            const history = calculate_payment_history([], dbUserData, creditData.payment_history) ?? 500;

            rawFeaturesForModel = {
                'employment_status': mapEmploymentStatus(dbUserData.user_employment_status || creditData.employment_status),
                'person_income': pIncome,
                'cb_person_default_on_file': dbUserData.cb_person_default_on_file || 'N',
                'cb_person_cred_hist_length': Number(dbUserData.cb_person_cred_hist_length || 0),
                'original_loan_amount': Number(creditData.original_loan_amount || 0),
                'loan_term': lTerm, 'loan_amnt': lAmnt,
                'credit_utilization_ratio': util, 'payment_history': history,
                'loan_percent_income': calculate_lpi(lAmnt, pIncome) ?? 1.0,
            };
            Object.keys(rawFeaturesForModel).forEach(k => { if(rawFeaturesForModel[k]===null){ /*Defaults*/ } if(typeof rawFeaturesForModel[k]==='number' && isNaN(rawFeaturesForModel[k])) rawFeaturesForModel[k]=0; });
            console.log(`✅ Raw features prepared (SIMULATED):`, JSON.stringify(rawFeaturesForModel));

        } catch (dataPrepError) { console.error(`❌ Error preparing features (SIMULATED) for User ${userId}:`, dataPrepError); return res.status(500).json({ success: false, message: 'Internal error preparing data.' });}

        // 2. Call Python Service
        if (!PYTHON_PREDICTION_URL) return res.status(503).json({ success: false, message: 'Assessment service config error.' });
        console.log(`   2. Calling Python prediction service...`);
        try { /* ... fetch call, get riskScore ... */ } catch (fetchError) { /* ... */ }
        if (riskScore === null || isNaN(Number(riskScore))) return res.status(500).json({success: false, message: 'Invalid score.'});

        // 3. Map Score
        entitlements = mapScoreToEntitlements(riskScore);

        // 4. Return Result (No storage for simulated)
        console.log(`✅ SIMULATED Assessment complete.`);
        res.status(200).json({ success: true, entitlements, assessmentId: null, simulated: true }); // Flag as simulated

    } catch (error) { console.error(`❌ Overall SIMULATED Assessment Error:`, error); res.status(500).json({ success: false, message: error.message || 'Simulation failed.' }); }
});
// --- ------------------------------------------------- ---


// --- Confirm BNPL Order Endpoint ---
app.post('/api/confirm_bnpl_order', authenticateUser, async (req, res) => { /* ... (Keep complete route logic) ... */ });
// --- --------------------------- ---

// --- Get Current Entitlements Endpoint ---
app.get('/api/current_entitlements', authenticateUser, async (req, res) => { /* ... (Keep complete route logic) ... */ });
// --- --------------------------------- ---

// --- Test Auth Route ---
app.get('/api/test-auth', authenticateUser, (req, res) => res.json({ success: true, message: `Auth OK for user ID: ${req.user.id}`}));
// --- --------------- ---

// Global Error Handler
app.use((err, req, res, next) => {
  console.error("Unhandled Server Error:", err.stack || err);
  const message = process.env.NODE_ENV === 'production' ? 'An internal server error occurred.' : err.message;
  res.status(500).send({ success: false, message: message });
});

// Start Server
app.listen(PORT, () => {
    console.log(`\n🚀 Server running on port ${PORT}`);
    console.log(`🔗 Plaid Env: ${plaidEnv}`);
    console.log(`🐍 Python URL: ${PYTHON_PREDICTION_URL || 'NOT SET!'}`);
    console.log(`🔑 JWT Secret Loaded: ${JWT_SECRET ? 'Yes' : 'NO!'}`);
});