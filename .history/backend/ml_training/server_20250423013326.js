const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
require('dotenv').config();
const { Configuration, PlaidApi, PlaidEnvironments } = require('plaid');
const fetch = require('node-fetch');
// --- --------------------------- ---

// --- Environment Variable Checks & Setup ---
const PORT = process.env.PORT || 5000;
const PYTHON_PREDICTION_URL = process.env.PYTHON_PREDICTION_SERVICE_URL;
const JWT_SECRET = process.env.JWT_SECRET;
const PLAID_CLIENT_ID = process.env.PLAID_CLIENT_ID;
const PLAID_SECRET_SANDBOX = process.env.PLAID_SECRET_SANDBOX;

// Critical startup checks
if (!JWT_SECRET || !PLAID_CLIENT_ID || !PLAID_SECRET_SANDBOX) { console.error("FATAL ERROR: Required .env variables missing (JWT/Plaid)."); process.exit(1); }
if (!PYTHON_PREDICTION_URL) { console.error("CRITICAL WARNING: PYTHON_PREDICTION_SERVICE_URL not set."); }
// --- ----------------------------------- ---

const app = express();
app.use(cors());
app.use(express.json());

// --- Plaid Client Config (Still needed for token endpoints) ---
const plaidConfig = new Configuration({ basePath: PlaidEnvironments.sandbox, baseOptions: { headers: { 'PLAID-CLIENT-ID': PLAID_CLIENT_ID, 'PLAID-SECRET': PLAID_SECRET_SANDBOX, 'Plaid-Version': '2020-09-14' } } });
const plaidClient = new PlaidApi(plaidConfig);
// --- -------------------------------------------------------- ---

// --- MySQL Connection Pool ---
let dbPool; try { dbPool = mysql.createPool({ /* DB Config from .env */ }).promise(); /* Test Connection */ } catch (e) { /* Handle Pool Error */ }
// --- --------------------- ---

// --- HELPER FUNCTIONS ---
const formatDate = (date) => { /* ... */ }; // Keep refined version
const authenticateUser = (req, res, next) => { /* ... Keep refined version ... */ };
function mapScoreToEntitlements(riskScore) { /* ... Keep function ... */ };
function mapEmploymentStatus(dbStatus) { /* ... Keep function ... */ };

// Calculation Functions (SIMPLIFIED - Rely on DB/Defaults passed as args)
function calculate_util_ratio(plaidAuthData, plaidLiabilitiesData, historicalRatio) {
    console.log("  -> Calculating Util Ratio (SIMULATED - DB Fallback)...");
    const fallbackRatio = (historicalRatio !== null && !isNaN(Number(historicalRatio))) ? Number(historicalRatio) : 0.1; // Default 10%
    console.log(`     Util Ratio (DB based): ${fallbackRatio.toFixed(4)}`);
    return fallbackRatio;
}
function calculate_payment_history(plaidTransactions, userData, historicalScore) {
    console.log("  -> Calculating Payment History Score (SIMULATED - DB Only)...");
    try { /* ... Keep logic using only userData and historicalScore ... */ } catch (e) { return 500; }
    // Example return: return Math.round(Math.max(0, Math.min(1000, (historicalScore ?? 500) - (userData?.cb_person_default_on_file === 'Y' ? 100 : 0))));
    return 500; // Placeholder
}
function calculate_lpi(loan_amnt, person_income) { /* ... Keep calculation ... */ }
// --- --------------------------------------------- ---

// === ROUTES ===

// --- User Auth ---
app.post('/register', async (req, res) => { /* ... Keep route logic (ensure default flags are set) ... */ });
app.post('/login', async (req, res) => { /* ... Keep route logic ... */ });
// --- --------- ---

// --- Plaid Setup Endpoints (Simulated Exchange) ---
app.post('/api/create_link_token', authenticateUser, async (req, res) => { /* ... Keep route logic (still needed to start demo flow) ... */ });
app.post('/api/exchange_public_token', authenticateUser, async (req, res) => {
    // Keep the SIMULATED placeholder storage logic from complete server.js v7/v8
    const userId = req.user.id; const { public_token: publicToken } = req.body; console.log(`⚙️ Exchange token request (Simulated storage) User: ${userId}`);
    const fakeAccessToken = `simulated-access-${userId}-${Date.now()}`; const fakeItemId = `simulated-item-${userId}`;
    try { const sql = 'UPDATE users SET plaid_access_token = ?, plaid_item_id = ? WHERE user_id = ?'; const [result] = await dbPool.query(sql, [fakeAccessToken, fakeItemId, userId]); if (result.affectedRows === 0) return res.status(404).json({ success: false, message: 'User not found.' }); console.log(`✅ SIMULATED Plaid tokens stored.`); res.json({ success: true, message: 'Bank account linked (Simulated).' }); }
    catch (dbError) { console.error("   DB Error storing simulated info:", dbError); res.status(500).json({ success: false, message: 'Failed to save simulated link.' }); }
});
// --- ----------------------------------------- ---

// --- MAIN Assessment Endpoint (Called by BNPL Button - uses SIMULATION logic) ---
// This is the endpoint called from the product modal. In this Scenario 1, it behaves identically
// to the explicit simulation endpoint because it will detect no *real* Plaid token.
app.post('/api/assess_credit', authenticateUser, async (req, res) => {
    const userId = req.user.id;
    console.log(`\n⚙️ Assessment request for User ID: ${userId} (USING DB-ONLY SIMULATION PATH)`);
    const { requested_loan_amount = null, requested_loan_term = null } = req.body;
    let assessmentIdForOrder = null; let riskScore = null; let entitlements = {};

    try {
        // Step 1 & 2: Check token & Skip Plaid Fetch (Same logic as simulated endpoint)
        console.log(`   1. Checking Plaid token (informational)...`);
        const [userCheck] = await dbPool.query('SELECT plaid_access_token FROM users WHERE user_id = ?', [userId]);
        if (userCheck[0]?.plaid_access_token && !userCheck[0]?.plaid_access_token.startsWith('simulated-access-')) { console.warn("   -> Real Plaid token found, but SIMULATION logic will ignore it."); }
        else { console.log("   -> No token / placeholder token found (normal for simulation)."); }
        console.log(`   2. Skipping Plaid API calls (DB ONLY ASSESSMENT).`);

        // Step 3: Prepare Features using ONLY DB Data
        console.log(`   3. Preparing model features from DB...`);
        let rawFeaturesForModel = {};
        try { /* ... Exactly the same DB query and feature prep logic as in '/api/assess_credit_simulated' ... */ }
        catch (dataPrepError) { return res.status(500).json({ success: false, message: 'Internal error preparing data.' });}

        // Step 4: Call Python Service
        console.log(`   4. Calling Python prediction service...`);
        if (!PYTHON_PREDICTION_URL) throw new Error('Python service URL missing'); // Need URL
        try { /* ... Fetch call, parse riskScore ... */ } catch (fetchError) { throw fetchError; /* Propagate error */ }
        if (riskScore === null || isNaN(Number(riskScore))) throw new Error('Invalid score from assessment service.');

        // Step 5: Map Score
        console.log(`   5. Mapping score ${riskScore}...`);
        entitlements = mapScoreToEntitlements(riskScore);

        // Step 6: Store Assessment Result
        console.log(`   6. Storing assessment result...`);
        if (entitlements && !entitlements.error) { /* ... INSERT into credit_assessments, capture assessmentIdForOrder ... */ }
        else { console.warn(`   ⚠️ Skipping storage due to invalid score/error.`); }

        // Step 7: Return Result
        console.log(`✅ Assessment complete (DB ONLY) for User ID ${userId}.`);
        res.status(200).json({ success: true, entitlements, assessmentId: assessmentIdForOrder });

    } catch (error) {
        console.error(`❌ Overall Assessment Error (DB ONLY Path) for User ${userId}:`, error);
        // Distinguish specific known errors if needed
        const message = error.message?.includes('Python service') ? 'Assessment service unavailable.' : (error.message || 'Assessment failed.');
        const status = error.message?.includes('Python service') ? 503 : 500;
        res.status(status).json({ success: false, message: message });
    }
});
// --- --------------------------------------------------------------- ---


// --- SIMULATED Assessment Endpoint (Called by Dashboard Button) ---
app.post('/api/assess_credit_simulated', authenticateUser, async (req, res) => {
    const userId = req.user.id;
    console.log(`\n⚙️ SIMULATED Assessment request for User ID: ${userId} (Explicit DB ONLY)`);
    const { requested_loan_amount = null, requested_loan_term = null } = req.body;
    let riskScore = null; let entitlements = {};

    try {
        // 1. Prepare Features using ONLY DB Data
        console.log(`   1. Preparing model features from DB...`);
        let rawFeaturesForModel = {};
        try { /* ... Exactly the same DB query and feature prep logic as in the main '/api/assess_credit' ... */ }
        catch (dataPrepError) { return res.status(500).json({ success: false, message: 'Internal error preparing data.' }); }

        // 2. Call Python Service
        console.log(`   2. Calling Python prediction service...`);
        if (!PYTHON_PREDICTION_URL) return res.status(503).json({ success: false, message: 'Assessment config error.' });
        try { /* ... Fetch call, parse riskScore ... */ }
        catch (fetchError) { /* ... error handling ... */ return res.status(503).json({ success: false, message: 'Assessment service unavailable.' });}
        if (riskScore === null || isNaN(Number(riskScore))) return res.status(500).json({success: false, message: 'Invalid score.'});

        // 3. Map Score
        console.log(`   3. Mapping score ${riskScore}...`);
        entitlements = mapScoreToEntitlements(riskScore);

        // 4. Return Result (Do NOT store simulated dashboard estimates in history)
        console.log(`✅ SIMULATED Assessment complete for User ID ${userId}.`);
        res.status(200).json({ success: true, entitlements, assessmentId: null, simulated: true }); // No ID, flag simulation

    } catch (error) { console.error(`❌ Overall SIMULATED Assessment Error:`, error); res.status(500).json({ success: false, message: error.message || 'Simulation failed.' }); }
});
// --- -------------------------------------------------------- ---


// --- Confirm BNPL Order Endpoint ---
app.post('/api/confirm_bnpl_order', authenticateUser, async (req, res) => {
    // Keep this exactly as before - it uses assessmentId if provided
    // ... (validation, optional assessment check, INSERT into orders) ...
});
// --- --------------------------- ---


// --- Get Current Entitlements Endpoint ---
app.get('/api/current_entitlements', authenticateUser, async (req, res) => {
    // Keep this exactly as before - it fetches latest from credit_assessments
});
// --- --------------------------------- ---


// --- Test Auth Route ---
app.get('/api/test-auth', authenticateUser, (req, res) => res.json({ success: true, message: `Auth OK for user ID: ${req.user.id}`}));

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