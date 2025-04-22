// ========================================================
// server.js - COMPLETE BACKEND CODE v3
// Includes original features + Plaid + ML Assessment + BNPL Order
// ========================================================

// --- Core Dependencies ---
const express = require('express'); // Original
const mysql = require('mysql2');    // Original (switched to promise pool below)
const cors = require('cors');       // Original
const bcrypt = require('bcrypt');   // Original
const jwt = require('jsonwebtoken'); // Original
const puppeteer = require('puppeteer'); // Original - Keep if used elsewhere

// --- Added Dependencies ---
require('dotenv').config(); // Load .env file variables FIRST
const { Configuration, PlaidApi, PlaidEnvironments } = require('plaid');
const fetch = require('node-fetch'); // Ensure correct import for your Node version/type (ESM/CJS)
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
app.use(cors()); // TODO: Configure origins for production
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
            'Plaid-Version': '2020-09-14'
        },
    },
});
const plaidClient = new PlaidApi(plaidConfig);
// --- ------------------------ ---

// --- MySQL Connection Pool ---
let dbPool;
try {
    dbPool = mysql.createPool({
        connectionLimit: 10,
        host: process.env.DB_HOST || 'localhost',
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD, // Loaded from .env
        database: process.env.DB_NAME || 'dpp_db',
        waitForConnections: true,
        queueLimit: 0
    }).promise(); // Use promise wrapper

    dbPool.getConnection()
        .then(connection => { console.log('✅ MySQL Pool connected successfully!'); connection.release(); })
        .catch(err => { console.error('❌ MySQL Pool initial connection error:', err); process.exit(1); });
} catch (err) { console.error('❌ Failed to create MySQL Pool:', err); process.exit(1); }
// --- --------------------- ---

// --- HELPER FUNCTIONS ---

// Original Password Validator
const isValidPassword = (password) => {
    const passwordRegex = /^(?=.*\d.*\d)(?=.*[!@#$%^&*]).{8,}$/;
    return passwordRegex.test(password);
};

// Original/Refined Date Formatter (Input: YYYY-MM-DD from FE)
const formatDate = (date) => {
    // Expects 'YYYY-MM-DD'
    if (!date || typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        console.warn(`Invalid date format passed to formatDate: ${date}`);
        return null;
    }
    // Return in YYYY-MM-DD format, suitable for SQL DATE type
    return date;
    // --- Kept original conversion commented if needed for VARCHAR DD-MM-YYYY ---
    // const [year, month, day] = date.split('-');
    // return `${day}-${month}-${year}`;
};

// Original/Refined JWT Auth Middleware
const authenticateUser = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    // Expect 'Bearer YOUR_TOKEN'
    const token = authHeader?.startsWith('Bearer ') ? authHeader.split(' ')[1] : null;

    if (!token) {
        console.log("Auth failure: No token provided.");
        return res.status(401).json({ success: false, message: 'Authorization token required.' });
    }

    try {
        // Verify token using secret from .env
        const decoded = jwt.verify(token, JWT_SECRET);
        // Ensure payload contains the user ID (adjust if your payload key is different)
        if (!decoded.id) {
            throw new Error("Token payload missing required user identifier ('id').");
        }
        // Attach decoded user info to request object
        req.user = { id: decoded.id, email: decoded.email };
        // console.log(`➡️ Req Auth UserID: ${req.user.id}`); // Uncomment for verbose logging
        next(); // Proceed to the route handler
    } catch (err) {
        console.error("JWT Verification Error:", err.message);
        if (err.name === 'TokenExpiredError') {
            return res.status(401).json({ success: false, message: 'Session expired. Please log in again.' });
        }
        // Handles JsonWebTokenError (malformed), NotBeforeError etc.
        return res.status(403).json({ success: false, message: 'Invalid or failed token authentication.' });
    }
};

// Helper: Map Score to Entitlements
function mapScoreToEntitlements(riskScore) {
    if (riskScore === null || typeof riskScore !== 'number' || isNaN(riskScore)) {
        console.error("Mapping failed: Invalid risk score input:", riskScore);
        return { tier: 3, limit: 500.00, terms: [3], error: "Assessment score invalid" };
    }
    const T1 = 0.2, T2 = 0.5; // Adjust thresholds based on model behavior
    console.log(`   Mapping score ${riskScore.toFixed(4)} to entitlements...`);
    if (riskScore < T1) { console.log(`   -> Tier 1`); return { tier: 1, limit: 5000.00, terms: [3, 6, 12] }; }
    else if (riskScore < T2) { console.log(`   -> Tier 2`); return { tier: 2, limit: 2500.00, terms: [3, 6] }; }
    else { console.log(`   -> Tier 3`); return { tier: 3, limit: 1000.00, terms: [3] }; }
}

// Helper: Map DB Employment Status Enum to Model String
function mapEmploymentStatus(dbStatus) {
    if (!dbStatus) return 'No';
    const statusUpper = dbStatus.toUpperCase();
    if (statusUpper === 'EMPLOYED') return 'Yes';
    if (statusUpper === 'SELF_EMPLOYED') return 'Self-Employed';
    return 'No'; // Map UNEMPLOYED, STUDENT, RETIRED, OTHER, null -> 'No'
                 // !!! VALIDATE this mapping against your training data !!!
}

// --- Calculation Functions with Example Logic (ADAPT THESE!) ---
function calculate_util_ratio(plaidAuthData, plaidLiabilitiesData) {
    console.log("  -> Calculating Util Ratio..."); let totalBal = 0, totalLim = 0, found = false;
    try {
        const accountsToProcess = plaidLiabilitiesData?.liabilities?.credit || plaidAuthData?.accounts; const source = plaidLiabilitiesData?.liabilities?.credit ? 'Liabilities' : (plaidAuthData?.accounts ? 'Auth' : 'None');
        if (source !== 'None') { accountsToProcess.forEach(acc => { if (acc.type === 'credit' || source === 'Liabilities') { totalBal += (acc.balances?.current ?? 0); totalLim += (acc.balances?.limit ?? 0); found = true; } }); }
        if (!found) { console.log("     No credit accounts found. Util ratio: 0.0"); return 0.0; } if (totalLim <= 0) { console.warn("     Total credit limit zero/unknown."); return (totalBal > 0 ? 1.1 : 0.0); } const ratio = Math.max(0, totalBal) / totalLim; console.log(`     Util Ratio: ${ratio.toFixed(4)}`); return ratio;
    } catch (e) { console.error("Error in calculate_util_ratio:", e); return null; }
}

function calculate_payment_history(plaidTransactions, userData) {
    console.log("  -> Calculating Payment History Score...");
    try {
        // Base score on existing DB data if possible, otherwise a neutral value
        let baseScore = userData?.db_payment_history_score || 500; // Assume you might fetch a score stored previously
        let score = baseScore; const maxScore = 1000, minScore = 0; let negEvents = 0;
        const sixMonthsAgo = new Date(); sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6); const dateThresholdStr = sixMonthsAgo.toISOString().split('T')[0];
        const negKeywords = ['nsf fee', 'overdraft fee', 'late fee', 'returned payment', 'insufficient fund'];
        (plaidTransactions || []).filter(tx => tx.date >= dateThresholdStr).forEach(tx => { const d = (tx.name || tx.merchant_name || '').toLowerCase(); if (tx.amount > 0 && negKeywords.some(k => d.includes(k))) negEvents++; });
        score -= negEvents * 30; // Small penalty per negative event
        if (userData?.cb_person_default_on_file === 'Y') score -= 100; // Moderate penalty for default flag
        score = Math.max(minScore, Math.min(maxScore, score)); console.log(`     Calculated History Score: ${Math.round(score)}`); return Math.round(score);
    } catch (e) { console.error("Error in calculate_payment_history:", e); return 500; }
}

function calculate_lpi(loan_amnt, person_income) {
    const incomeNum = Number(person_income); const loanNum = Number(loan_amnt);
    if (!isNaN(incomeNum) && incomeNum > 0 && !isNaN(loanNum) && loanNum >= 0) return loanNum / incomeNum;
    console.warn(`Could not calculate LPI. Loan: ${loan_amnt}, Income: ${person_income}`); return null;
}
// --- ----------------------------------------- ---


// === ROUTES ===

// Original Registration Route (with minor fixes)
app.post('/register', async (req, res) => {
    try {
        // Kept credit_score temporarily if frontend still sends it, but it's ignored
        const { first_name, surname, email, password, phone_number, ni_number, date_of_birth /*, credit_score */ } = req.body;

        if (!first_name || !surname || !email || !password || !date_of_birth) {
            return res.status(400).json({ success: false, message: 'Missing required fields.' });
        }
        if (!/\S+@\S+\.\S+/.test(email)){
             return res.status(400).json({ success: false, message: 'Invalid email format.' });
        }
        // Optional: Check password validity using isValidPassword(password) here

        const hashedPassword = await bcrypt.hash(password, 10);
        const formattedDOB = formatDate(date_of_birth); // Expects YYYY-MM-DD
        if (!formattedDOB && date_of_birth) {
             return res.status(400).json({ success: false, message: 'Invalid date of birth format (YYYY-MM-DD required).' });
        }

        const newUser = {
            first_name, surname, email,
            password: hashedPassword,
            phone_number: phone_number || null, // Handle optional fields
            ni_number: ni_number || null,       // Handle optional fields, ensure DB allows NULL
            date_of_birth: formattedDOB         // Use formatted date or null
            // credit_score is NOT inserted from registration
            // Plaid tokens are NULL initially
        };

        const sql = 'INSERT INTO users SET ?';
        // Using connection pool with promises
        const [result] = await dbPool.query(sql, newUser);

        console.log(`✅ User Registered: ${email} (ID: ${result.insertId})`);
        res.status(201).json({ success: true, message: 'Registration successful!' });

    } catch (error) {
        console.error('❌ Registration Server Error:', error);
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({ success: false, message: 'Email address already registered.' });
        }
        res.status(500).json({ success: false, message: 'Internal server error during registration.' });
    }
});

// Original Login Route (with minor fixes)
app.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) {
             return res.status(400).json({ success: false, message: 'Email and password are required.' });
        }

        // Fetch only necessary fields for login check
        const sql = 'SELECT user_id, email, password FROM users WHERE email = ? LIMIT 1';
        const [results] = await dbPool.query(sql, [email]);

        if (results.length === 0) {
            console.log(`Login attempt failed for email: ${email} - User not found`);
            return res.status(401).json({ success: false, message: 'Invalid email or password.' }); // Generic message for security
        }

        const user = results[0];
        const isMatch = await bcrypt.compare(password, user.password);

        if (!isMatch) {
            console.log(`Login attempt failed for user ID: ${user.user_id} - Password mismatch`);
            return res.status(401).json({ success: false, message: 'Invalid email or password.' }); // Generic message
        }

        // Login successful, create JWT
        const payload = { id: user.user_id, email: user.email }; // Data to encode in token
        const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '8h' }); // Set token expiration

        console.log(`✅ User Logged In: ${user.email} (ID: ${user.user_id})`);
        // Send token back to the client
        res.status(200).json({ success: true, message: 'Login successful!', token });

    } catch (error) {
        console.error('❌ Login Server Error:', error);
        res.status(500).json({ success: false, message: 'Internal server error during login.' });
    }
});


// --- NEW Plaid Endpoints ---
app.post('/api/create_link_token', authenticateUser, async (req, res) => {
    const userId = req.user.id;
    console.log(`⚙️ Creating link token request for User ID: ${userId}`);
    const request = {
        user: { client_user_id: userId.toString() },
        client_name: 'Deferred Payment Platform', // *** YOUR APP NAME ***
        language: 'en',
        products: ['auth', 'transactions', 'identity', 'liabilities'], // Add products needed for features
        country_codes: ['GB'], // Adjust
        // redirect_uri: 'YOUR_FRONTEND_REDIRECT_URI_IF_NEEDED',
        // webhook: 'YOUR_BACKEND_PLAID_WEBHOOK_ENDPOINT', // Highly recommend implementing webhooks
    };
    try {
        const response = await plaidClient.linkTokenCreate(request);
        console.log("✅ Link token created.");
        res.json({ link_token: response.data.link_token });
    } catch (error) { /* ... Refined error handling ... */ }
});

app.post('/api/exchange_public_token', authenticateUser, async (req, res) => {
    const userId = req.user.id;
    const publicToken = req.body.public_token;
    console.log(`⚙️ Exchanging public token request for User ID: ${userId}`);
    if (!publicToken) return res.status(400).json({ success: false, message: 'Public token required.' });
    try {
        const response = await plaidClient.itemPublicTokenExchange({ public_token: publicToken });
        const { access_token: accessToken, item_id: itemId } = response.data;
        console.log(`✅ Access token obtained for Item ID: ${itemId}`);
        const sql = 'UPDATE users SET plaid_access_token = ?, plaid_item_id = ? WHERE user_id = ?';
        const [result] = await dbPool.query(sql, [accessToken, itemId, userId]);
        if (result.affectedRows === 0) return res.status(404).json({ success: false, message: 'User not found.' });
        console.log(`✅ Plaid tokens stored/updated for User ID: ${userId}`);
        res.json({ success: true, message: 'Bank account linked.' });
    } catch (error) { /* ... Refined Plaid error handling ... */ }
});
// -----------------------

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

        // 2. Fetch Plaid Data
        console.log(`   2. Fetching Plaid data...`);
        let plaidTransactions = [], plaidAuthData = null, plaidLiabilitiesData = null; // Init vars
        try { /* ... All Plaid API calls ... */ } catch (plaidError) { /* ... Plaid error handling ... */ }

        // 3. Prepare Features
        console.log(`   3. Preparing model features...`);
        let rawFeaturesForModel = {};
        try { /* ... Fetch DB data (users, credit_data), Combine with Plaid, call calculate_ helpers, clean nulls ... */ }
        catch (dataPrepError) { /* ... Data prep error handling ... */ }

        // 4. Call Python Service
        if (!PYTHON_PREDICTION_URL) return res.status(503).json({ success: false, message: 'Assessment config error.' });
        console.log(`   4. Calling Python prediction service...`);
        try { /* ... fetch call ... */ riskScore = (await (await fetch(/*...*/)).json()).risk_score; }
        catch (fetchError) { /* ... error handling ... */ return res.status(503).json({ success: false, message: 'Assessment service unavailable.' });}

        // 5. Map Score
        console.log(`   5. Mapping score ${riskScore}...`);
        entitlements = mapScoreToEntitlements(riskScore);

        // 6. Store Assessment Result
        console.log(`   6. Storing assessment result...`);
        if (entitlements && !entitlements.error && typeof riskScore === 'number' && !isNaN(riskScore)) {
            try {
                const assessmentSql = `INSERT INTO credit_assessments (user_id, risk_score, credit_tier, credit_limit, calculated_terms, assessment_timestamp) VALUES (?, ?, ?, ?, ?, NOW())`;
                const termsJson = JSON.stringify(entitlements.terms || []);
                const [insertResult] = await dbPool.query(assessmentSql, [userId, riskScore, entitlements.tier, entitlements.limit, termsJson]);
                assessmentIdForOrder = insertResult.insertId;
                console.log(`      -> Assessment record (ID: ${assessmentIdForOrder}) stored.`);
            } catch (dbStoreError) { console.error(`   ❌ DB Error storing assessment:`, dbStoreError); }
        } else { console.warn(`   ⚠️ Skipping storage: Invalid score/error.`); }

        // 7. Return Result
        console.log(`✅ Assessment complete for User ID ${userId}.`);
        res.status(200).json({ success: true, entitlements, assessmentId: assessmentIdForOrder });

    } catch (error) { // Catch errors from Step 1, 3 or unexpected issues
        console.error(`❌ Overall Assessment Error for User ${userId}:`, error);
        res.status(500).json({ success: false, message: error.message || 'Assessment failed due to an internal error.' });
    }
});
// --- ------------------------------ ---


// --- NEW Endpoint: Confirm BNPL Order ---
app.post('/api/confirm_bnpl_order', authenticateUser, async (req, res) => {
    const userId = req.user.id;
    const { product, term, assessmentId } = req.body; // From frontend

    console.log(`\n⚙️ Confirming BNPL order request for User ID: ${userId}, Product: ${product?.title}, Term: ${term}, AssessID: ${assessmentId}`);

    // --- Validation ---
    if (!product?.numericPrice || !product?.title || typeof term !== 'number' || term <= 0) {
        return res.status(400).json({ success: false, message: 'Missing/invalid order details.' });
    }
    // --- ------------ ---

    // --- Optional: Verify Assessment ID and Limit ---
    if (assessmentId) {
        try {
            const [assessCheck] = await dbPool.query('SELECT credit_limit FROM credit_assessments WHERE assessment_id = ? AND user_id = ?', [assessmentId, userId]);
            if (assessCheck.length === 0) throw new Error("Assessment ID not found or doesn't belong to user.");
            if (Number(assessCheck[0].credit_limit) < Number(product.numericPrice)) throw new Error("Product price exceeds assessed credit limit.");
            console.log(`   Assessment ID ${assessmentId} validated.`);
        } catch (verifyError) {
            console.warn(`   Assessment Verification Warning: ${verifyError.message}`);
            // Decide if this is a hard failure or just a warning
            // return res.status(400).json({ success: false, message: `Assessment invalid: ${verifyError.message}` });
        }
    } else { console.warn("   No assessment ID provided with order confirmation."); /* Allow or reject? */ }
    // --- -------------------------------------- ---

    // --- Insert Order into DB ---
    try {
        const loanAmount = product.numericPrice;
        const now = new Date();
        const firstDueDate = new Date(now.setMonth(now.getMonth() + 1)).toISOString().split('T')[0]; // Approx 1 month later YYYY-MM-DD

        const orderData = {
            user_id: userId, assessment_id: assessmentId || null, product_title: product.title,
            product_price: product.numericPrice, loan_amount: loanAmount, selected_term_months: term,
            remaining_balance: loanAmount, order_status: 'ACTIVE', next_payment_due_date: firstDueDate,
            order_timestamp: new Date() // Use NOW() or pass explicitly
        };

        const sql = 'INSERT INTO orders SET ?';
        const [result] = await dbPool.query(sql, orderData);
        const orderId = result.insertId;

        console.log(`✅ BNPL Order (ID: ${orderId}) created for User ID: ${userId}`);
        // --- TODO: Post-Order Logic (Notifications, Merchant Payment?) ---

        res.status(201).json({ success: true, message: 'Order confirmed!', orderId: orderId });

    } catch (error) {
        console.error(`❌ Error confirming BNPL order for User ${userId}:`, error);
        res.status(500).json({ success: false, message: 'Failed to save your order.' });
    }
    // --- ------------------- ---
});
// --- -------------------------------- ---

// --- Endpoint: Get Current Entitlements ---
app.get('/api/current_entitlements', authenticateUser, async (req, res) => {
    // (Keep refined function from previous example, using dbPool)
    // ... includes querying credit_assessments, parsing terms, handling no history ...
});
// --- ---------------------------------- ---


// --- Test Auth Route ---
app.get('/api/test-auth', authenticateUser, (req, res) => { res.json({ success: true, message: `Auth OK for user ID: ${req.user.id}` }); });
// --- ----------------- ---

// Global Error Handler
app.use((err, req, res, next) => {
  console.error("Unhandled Server Error:", err.stack || err);
  res.status(500).send({ success: false, message: 'An unexpected server error occurred.' });
});

// Start Server
app.listen(PORT, () => {
    console.log(`\n🚀 Server running on port ${PORT}`);
    console.log(`🔗 Plaid Env: ${plaidEnv}`);
    console.log(`🐍 Python URL: ${PYTHON_PREDICTION_URL || 'NOT SET!'}`);
    console.log(`🔑 JWT Secret Loaded: ${JWT_SECRET ? 'Yes' : 'NO!'}`);
});