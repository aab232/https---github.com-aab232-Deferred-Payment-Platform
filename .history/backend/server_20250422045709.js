import express from 'express';
import mysql from 'mysql2/promise';
import cors from 'cors';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
import { Configuration, PlaidApi, PlaidEnvironments } from 'plaid';
import fetch from 'node-fetch'; // Ensure v2 if using CommonJS, or setup package.json for ES modules

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
        connectionLimit: 10, host: process.env.DB_HOST || 'localhost', user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD, database: process.env.DB_NAME || 'dpp_db',
        waitForConnections: true, queueLimit: 0
    }).promise(); // Use promise wrapper

    dbPool.getConnection()
        .then(connection => { console.log('✅ MySQL Pool connected successfully!'); connection.release(); })
        .catch(err => { console.error('❌ MySQL Pool initial connection error:', err); process.exit(1); });
} catch (err) { console.error('❌ Failed to create MySQL Pool:', err); process.exit(1); }
// --- --------------------- ---

// --- HELPER FUNCTIONS ---
const formatDate = (date) => { if (!date || typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) { console.warn(`Invalid date format: ${date}`); return null; } return date; };

const authenticateUser = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader?.startsWith('Bearer ') ? authHeader.split(' ')[1] : null;
    if (!token) return res.status(401).json({ success: false, message: 'Authorization token required.' });
    try { const decoded = jwt.verify(token, JWT_SECRET); if (!decoded.id) throw new Error("Token missing ID."); req.user = { id: decoded.id, email: decoded.email }; next(); }
    catch (err) { console.error("JWT Error:", err.message); if (err.name === 'TokenExpiredError') return res.status(401).json({ success: false, message: 'Session expired.' }); return res.status(403).json({ success: false, message: 'Invalid token.' }); }
};

function mapScoreToEntitlements(riskScore) {
    if (riskScore === null || typeof riskScore !== 'number' || isNaN(riskScore)) { return { tier: 3, limit: 500.00, terms: [3], error: "Assessment score invalid" }; }
    const T1 = 0.2, T2 = 0.5; // Define thresholds
    console.log(`   Mapping score ${riskScore.toFixed(4)}...`);
    if (riskScore < T1) return { tier: 1, limit: 5000.00, terms: [3, 6, 12] }; // Low Risk
    else if (riskScore < T2) return { tier: 2, limit: 2500.00, terms: [3, 6] }; // Medium Risk
    else return { tier: 3, limit: 1000.00, terms: [3] }; // High Risk
}

function mapEmploymentStatus(dbStatus) { // Maps DB ENUM to Model String
    if (!dbStatus) return 'No'; // Default if null
    const statusUpper = dbStatus.toUpperCase(); // Handle potential case issues
    if (statusUpper === 'EMPLOYED') return 'Yes';
    if (statusUpper === 'SELF_EMPLOYED') return 'Self-Employed';
    // Treat UNEMPLOYED, STUDENT, RETIRED, OTHER as 'No' for the model
    // !! Double-check this mapping against your training data logic !!
    return 'No';
}

// --- Calculation Functions with Example Logic (ADAPT THESE!) ---
function calculate_util_ratio(plaidAuthData, plaidLiabilitiesData) {
    console.log("  -> Calculating Util Ratio..."); let totalBal = 0, totalLim = 0, found = false;
    try {
        const accountsToProcess = plaidLiabilitiesData?.liabilities?.credit || plaidAuthData?.accounts;
        const source = plaidLiabilitiesData?.liabilities?.credit ? 'Liabilities' : (plaidAuthData?.accounts ? 'Auth' : 'None');
        if (source !== 'None') {
            accountsToProcess.forEach(acc => { if (acc.type === 'credit' || source === 'Liabilities') { totalBal += (acc.balances?.current ?? 0); totalLim += (acc.balances?.limit ?? 0); found = true; }});
            console.log(`     Util from ${source}: Bal=${totalBal.toFixed(2)}, Lim=${totalLim.toFixed(2)}`);
        }
        if (!found) return 0.0; if (totalLim <= 0) return (totalBal > 0 ? 1.1 : 0.0); // Use 1.1 to indicate overlimit/unknown
        const ratio = Math.max(0, totalBal) / totalLim; return ratio;
    } catch (e) { console.error(" Error in calculate_util_ratio:", e); return null; }
}

function calculate_payment_history(plaidTransactions, userData) {
    console.log("  -> Calculating Payment History Score...");
    try {
        const baseScore = 500; let score = baseScore; const maxScore = 1000, minScore = 0;
        let negEvents = 0; const sixMonthsAgo = new Date(); sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6); const dateThreshold = sixMonthsAgo.toISOString().split('T')[0];
        const negKeywords = ['nsf fee', 'overdraft fee', 'late fee', 'returned payment', 'insufficient fund'];
        (plaidTransactions || []).filter(tx => tx.date >= dateThreshold).forEach(tx => { const d = (tx.name || tx.merchant_name || '').toLowerCase(); if (tx.amount > 0 && negKeywords.some(k => d.includes(k))) negEvents++; });
        const negPenalty = 30; score -= negEvents * negPenalty; if(negEvents > 0) console.log(`     Penalty for ${negEvents} negative flags.`);
        const defaultPenalty = 100; if (userData?.cb_person_default_on_file === 'Y') { score -= defaultPenalty; console.log(`     Penalty for default flag.`);}
        score = Math.max(minScore, Math.min(maxScore, score)); console.log(`     Calculated History Score: ${Math.round(score)}`); return Math.round(score);
    } catch (e) { console.error(" Error in calculate_payment_history:", e); return 500; } // Default score on error
}

function calculate_lpi(loan_amnt, person_income) { /* ... (keep function from previous example) ... */ }
// --- ----------------------------- ---

// === ROUTES ===

// Registration Route
app.post('/register', async (req, res) => { /* ... (keep refined route logic from previous examples) ... */ });

// Login Route
app.post('/login', async (req, res) => { /* ... (keep refined route logic from previous examples) ... */ });

// --- Plaid Endpoints ---
app.post('/api/create_link_token', authenticateUser, async (req, res) => { /* ... (keep refined route logic) ... */ });
app.post('/api/exchange_public_token', authenticateUser, async (req, res) => { /* ... (keep refined route logic) ... */ });
// -----------------------

// --- Credit Assessment Endpoint ---
app.post('/api/assess_credit', authenticateUser, async (req, res) => {
    const userId = req.user.id;
    console.log(`\n⚙️ Assessment request for User ID: ${userId}`);
    const { requested_loan_amount = null, requested_loan_term = null } = req.body; // Get requested vals

    let accessToken, plaidTransactions = [], plaidAuthData = null, plaidLiabilitiesData = null; // Declare vars
    let userData = {}, latestCreditData = {};
    let rawFeaturesForModel = {};
    let riskScore = null;
    let assessmentIdForOrder = null; // To link order to assessment

    try {
        // 1. Get Access Token
        console.log(`   1. Fetching Plaid token...`);
        const [userCheck] = await dbPool.query('SELECT plaid_access_token FROM users WHERE user_id = ?', [userId]);
        if (!userCheck[0]?.plaid_access_token) return res.status(400).json({ success: false, message: 'Bank account must be linked.' });
        accessToken = userCheck[0].plaid_access_token;

        // 2. Fetch Plaid Data
        console.log(`   2. Fetching Plaid data...`);
        try {
            // Transactions (Sync)
            const txReq = { access_token: accessToken }; let added = [], mod = [], more = true, cur = null;
            while(more){ const current = cur ? {...txReq, cursor: cur} : txReq; const r = await plaidClient.transactionsSync(current); added = added.concat(r.data.added); mod = mod.concat(r.data.modified); more = r.data.has_more; cur = r.data.next_cursor;}
            plaidTransactions = added.concat(mod); console.log(`      - Synced ${plaidTransactions.length} txns.`);
            // Auth
            try { const r = await plaidClient.authGet({ access_token: accessToken }); plaidAuthData = r.data; console.log(`      - Fetched Auth.`); } catch (e) { console.warn(" Auth fetch warning:", e.message); }
             // Liabilities
             try { const r = await plaidClient.liabilitiesGet({ access_token: accessToken }); plaidLiabilitiesData = r.data; console.log(`      - Fetched Liabilities.`); } catch (e) { console.warn(" Liabilities fetch warning:", e.message); }
             // TODO: Fetch other needed Plaid products (Income, etc.)

        } catch (plaidError) {
            console.error(`❌ Plaid API Error for User ${userId}:`, plaidError.response ? JSON.stringify(plaidError.response.data) : plaidError.message);
             if (plaidError.response?.data?.error_code === 'ITEM_LOGIN_REQUIRED') return res.status(401).json({ success: false, needsRelink: true, message: 'Bank connection needs update.' });
             return res.status(503).json({success: false, message: 'Failed fetching bank data.'});
        }

        // 3. Prepare Features for Python Service
        console.log(`   3. Preparing model features...`);
        // Fetch required DB data concurrently
        const creditSql = `SELECT * FROM credit_data WHERE user_id = ? ORDER BY recorded_at DESC LIMIT 1`;
        const userSql = `SELECT person_income, employment_status, cb_person_default_on_file, cb_person_cred_hist_length FROM users WHERE user_id = ?`; // Get only needed fields
        const [[dbCreditData], [dbUserData]] = await Promise.all([ dbPool.query(creditSql, [userId]), dbPool.query(userSql, [userId]) ]);
        latestCreditData = dbCreditData || {}; // Use empty object if no history
        if (!dbUserData) return res.status(404).json({ success: false, message: 'User profile not found.' });

        // Determine final values for features, prioritizing sources
        const final_person_income = latestCreditData.person_income || dbUserData.person_income || 0; // TODO: Use Plaid Income if available
        const final_loan_amnt = requested_loan_amount || latestCreditData.original_loan_amount || 0;
        const final_loan_term = requested_loan_term || latestCreditData.loan_term || 0;

        // Build the feature object matching Python script's expectations
        rawFeaturesForModel = {
            'employment_status': mapEmploymentStatus(dbUserData.employment_status || latestCreditData.employment_status), // Map DB value
            'person_income': final_person_income,
            'cb_person_default_on_file': dbUserData.cb_person_default_on_file || latestCreditData.cb_person_default_on_file || 'N', // Ensure Y/N
            'cb_person_cred_hist_length': Number(dbUserData.cb_person_cred_hist_length || latestCreditData.cb_person_cred_hist_length || 0),
            'original_loan_amount': Number(latestCreditData.original_loan_amount || 0), // Historical ref
            'loan_term': Number(final_loan_term),   // Current request/historical
            'loan_amnt': Number(final_loan_amnt),     // Current request/historical
            'credit_utilization_ratio': calculate_util_ratio(plaidAuthData, plaidLiabilitiesData) ?? latestCreditData.credit_utilization_ratio ?? 0.1,
            'payment_history': calculate_payment_history(plaidTransactions, dbUserData) ?? latestCreditData.payment_history ?? 500,
            'loan_percent_income': calculate_lpi(final_loan_amnt, final_person_income) ?? latestCreditData.loan_percent_income ?? null, // Recalculate
        };

        // Final cleanup
        for (const key in rawFeaturesForModel) { /* ... (Cleanup nulls/NaNs) ... */ }
        console.log(`     Raw features ready:`, JSON.stringify(rawFeaturesForModel)); // Log before sending


        // 4. Call Python Service
        if (!PYTHON_PREDICTION_URL) throw new Error('Prediction service URL not configured.'); // Should have been caught earlier
        console.log(`   4. Calling Python prediction service...`);
        const predictionResponse = await fetch(PYTHON_PREDICTION_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ features: rawFeaturesForModel }) });
        if (!predictionResponse.ok) throw new Error(`Prediction service error: ${predictionResponse.status} ${await predictionResponse.text()}`);
        const predictionResult = await predictionResponse.json();
        if (predictionResult.error) throw new Error(`Prediction service failed: ${predictionResult.error}`);
        riskScore = predictionResult.risk_score;
        console.log(`     Risk score received: ${riskScore}`);

        // 5. Map Score
        console.log(`   5. Mapping score to entitlements...`);
        const entitlements = mapScoreToEntitlements(riskScore);

        // 6. Store Assessment Result
        console.log(`   6. Storing assessment result...`);
        if (entitlements && !entitlements.error && typeof riskScore === 'number' && !isNaN(riskScore)) {
            try {
                const assessmentSql = `INSERT INTO credit_assessments (user_id, risk_score, credit_tier, credit_limit, calculated_terms, assessment_timestamp) VALUES (?, ?, ?, ?, ?, NOW())`;
                const termsJson = JSON.stringify(entitlements.terms || []);
                const [insertResult] = await dbPool.query(assessmentSql, [userId, riskScore, entitlements.tier, entitlements.limit, termsJson]);
                assessmentIdForOrder = insertResult.insertId; // Capture ID
                console.log(`      -> Assessment record (ID: ${assessmentIdForOrder}) stored.`);
            } catch (dbStoreError) { console.error(`   ❌ DB Error storing assessment:`, dbStoreError); }
        } else { console.warn(`   ⚠️ Skipping storage: Invalid score/error.`); }

        // 7. Return Result
        console.log(`✅ Assessment complete for User ID ${userId}.`);
        res.status(200).json({ success: true, entitlements, assessmentId: assessmentIdForOrder }); // Send back result and ID

    } catch (error) {
        // Catch errors from any step 1-5 that weren't handled locally
        console.error(`❌ Overall Assessment Error for User ${userId}:`, error);
        // Avoid sending detailed internal errors to client
        res.status(500).json({ success: false, message: error.message || 'An internal error occurred during assessment.' });
    }
});
// --- -------------------------- ---

// --- NEW Endpoint: Confirm BNPL Order ---
app.post('/api/confirm_bnpl_order', authenticateUser, async (req, res) => {
    const userId = req.user.id;
    const { product, term, assessmentId } = req.body; // Expect product object, term number, assessment ID

    console.log(`\n⚙️ Confirming BNPL order request for User ID: ${userId}`);
    console.log(`   Product: ${product?.title}, Price: ${product?.numericPrice}, Term: ${term}m, Assessment ID: ${assessmentId}`);

    // Basic Validation
    if (!product || typeof product !== 'object' || !product.numericPrice || !product.title || !term || typeof term !== 'number' || term <= 0) {
        return res.status(400).json({ success: false, message: 'Missing or invalid order details (product, term).' });
    }
    // Optionally validate assessmentId format if needed

    // Optional: Verify Assessment Validity (ensure assessmentId belongs to user and approved >= product price)
    let isValidAssessment = false;
    if (assessmentId) {
        try {
            const checkSql = `SELECT credit_limit FROM credit_assessments WHERE assessment_id = ? AND user_id = ?`;
            const [checkResults] = await dbPool.query(checkSql, [assessmentId, userId]);
            if (checkResults.length > 0 && Number(checkResults[0].credit_limit) >= Number(product.numericPrice)) {
                isValidAssessment = true;
                 console.log(`   Assessment ID ${assessmentId} validated for amount.`);
            } else {
                 console.warn(`   Assessment ID ${assessmentId} invalid or insufficient limit for this user/product.`);
            }
        } catch (verifyError) {
             console.error(`   Error verifying assessment ID ${assessmentId}:`, verifyError);
             // Proceed without verification? Or return error? For now, proceed cautiously.
        }
    } else {
         console.warn("   No assessment ID provided with order confirmation request.");
         // Decide business rule: Allow order without recent assessment link? Or reject?
         // return res.status(400).json({ success: false, message: 'Valid assessment reference is required.' });
    }
    // Decide if isValidAssessment check should block the order if it fails

    // Proceed to insert order
    try {
        const loanAmount = product.numericPrice; // Finance full amount
        // TODO: Calculate next_payment_due_date
        const now = new Date();
        const firstDueDate = new Date(now.setMonth(now.getMonth() + 1)).toISOString().split('T')[0]; // Approx 1 month later

        const orderData = {
            user_id: userId,
            assessment_id: assessmentId || null, // Link if available
            product_title: product.title,
            product_price: product.numericPrice,
            loan_amount: loanAmount,
            selected_term_months: term,
            remaining_balance: loanAmount, // Initial balance
            order_status: 'ACTIVE', // Assume active immediately
            next_payment_due_date: firstDueDate, // Set initial due date
            order_timestamp: new Date() // Explicit timestamp (NOW() works too)
        };

        const sql = 'INSERT INTO orders SET ?';
        const [result] = await dbPool.query(sql, orderData);
        const orderId = result.insertId;

        console.log(`✅ BNPL Order (ID: ${orderId}) created for User ID: ${userId}`);

        // --- TODO: Add Post-Order Logic (Notifications, Trigger Merchant Payment?) ---

        res.status(201).json({
            success: true,
            message: 'Order confirmed successfully!',
            orderId: orderId
        });

    } catch (error) {
        console.error(`❌ Error confirming BNPL order for User ${userId}:`, error);
        res.status(500).json({ success: false, message: 'Failed to save your order.' });
    }
});
// --- ---------------------------- ---


// --- Endpoint: Get Current Entitlements ---
app.get('/api/current_entitlements', authenticateUser, async (req, res) => {
    const userId = req.user.id;
    console.log(`\n⚙️ Fetching current entitlements request for User ID: ${userId}`);
    try {
        const sql = `SELECT assessment_id, credit_tier, credit_limit, calculated_terms, assessment_timestamp
                     FROM credit_assessments WHERE user_id = ? ORDER BY assessment_timestamp DESC LIMIT 1`;
        const [results] = await dbPool.query(sql, [userId]);
        if (results.length === 0) {
            return res.status(200).json({ success: true, entitlements: { status: 'unassessed', tier: null, limit: 0, terms: [], assessmentId: null } });
        }
        const latest = results[0]; let terms = [];
        try { terms = JSON.parse(latest.calculated_terms || '[]'); if (!Array.isArray(terms)) terms = []; } catch(e){ terms = []; }
        console.log(`✅ Found latest assessment (ID: ${latest.assessment_id}) for User ID: ${userId}`);
        res.status(200).json({ success: true, entitlements: { status: 'assessed', tier: latest.credit_tier, limit: parseFloat(latest.credit_limit || 0), terms: terms, assessmentId: latest.assessment_id } });
    } catch (error) { /* ... Error handling ... */ }
});
// --- ---------------------------------- ---


// === Test Auth Route ===
app.get('/api/test-auth', authenticateUser, (req, res) => { res.json({ success: true, message: `Auth OK for user ID: ${req.user.id}` }); });
// === --------------- ===

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