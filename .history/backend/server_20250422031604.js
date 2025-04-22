const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
// const puppeteer = require('puppeteer'); // Removed if not needed

// --- NEW REQUIRES ---
require('dotenv').config(); // Load .env file variables FIRST
const { Configuration, PlaidApi, PlaidEnvironments } = require('plaid');
const fetch = require('node-fetch'); // For calling Python service
// --- -------------- ---

const app = express();
// --- Use Port from .env or default to 5000 ---
const PORT = process.env.PORT || 5000;
// --- -------------------------------------- ---
const PYTHON_PREDICTION_URL = process.env.PYTHON_PREDICTION_SERVICE_URL;
const JWT_SECRET = process.env.JWT_SECRET; // Load JWT Secret

// --- Input Validation & Startup Checks ---
if (!JWT_SECRET) {
    console.error("FATAL ERROR: JWT_SECRET is not defined in .env file. Exiting.");
    process.exit(1); // Exit if critical config missing
}
if (!process.env.PLAID_CLIENT_ID || !process.env.PLAID_SECRET_SANDBOX) { // Check Sandbox specifically for now
     console.error("FATAL ERROR: Plaid Client ID or Sandbox Secret not defined in .env file. Exiting.");
     process.exit(1); // Exit if critical config missing
}
if (!PYTHON_PREDICTION_URL) {
    // Allow startup but warn heavily, assessment endpoint will fail
    console.error("------------------------------------------------------------------");
    console.error("ERROR: PYTHON_PREDICTION_SERVICE_URL is not defined in .env file!");
    console.error("The /api/assess_credit endpoint will NOT function correctly.");
    console.error("------------------------------------------------------------------");
}
// --- ----------------------------------- ---

// Middleware
app.use(cors()); // TODO: Configure specific origins for production environment
app.use(express.json()); // For parsing application/json request bodies

// --- Plaid Client Configuration ---
// Determine Plaid environment based on available secrets (simple logic)
// In a real app, you might use NODE_ENV or another env variable to switch
let plaidEnv = PlaidEnvironments.sandbox;
let plaidSecret = process.env.PLAID_SECRET_SANDBOX;
// TODO: Add logic here to check for DEV/PROD secrets if needed later
// if (process.env.NODE_ENV === 'production' && process.env.PLAID_SECRET_PRODUCTION) {
//     plaidEnv = PlaidEnvironments.production;
//     plaidSecret = process.env.PLAID_SECRET_PRODUCTION;
// } else if (process.env.NODE_ENV === 'development' && process.env.PLAID_SECRET_DEVELOPMENT) {
//     plaidEnv = PlaidEnvironments.development;
//     plaidSecret = process.env.PLAID_SECRET_DEVELOPMENT;
// }

const plaidConfig = new Configuration({
    basePath: plaidEnv,
    baseOptions: {
        headers: {
            'PLAID-CLIENT-ID': process.env.PLAID_CLIENT_ID,
            'PLAID-SECRET': plaidSecret,
            'Plaid-Version': '2020-09-14' // Recommended: Specify Plaid API version
        },
    },
});
const plaidClient = new PlaidApi(plaidConfig);
// --- ------------------------ ---

// --- MySQL Connection using .env & Pool ---
const dbPool = mysql.createPool({
    connectionLimit: 10, // Adjust pool size as needed
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD, // Ensure this is set in .env
    database: process.env.DB_NAME || 'dpp_db',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
}).promise(); // Use promise wrapper for async/await
// --- --------------------------------- ---

// Check DB Pool on startup
dbPool.getConnection()
    .then(connection => {
        console.log('✅ MySQL Pool connected successfully!');
        connection.release(); // Release the connection back to the pool
    })
    .catch(err => {
        console.error('❌ MySQL Pool connection error:', err);
        console.error("Ensure database server is running and credentials in .env are correct.");
        process.exit(1); // Exit if DB connection fails on startup
    });

// --- HELPER FUNCTIONS ---

// Function to convert date (Assuming input is YYYY-MM-DD)
const formatDate = (date) => {
    if (!date || typeof date !== 'string') return null;
    // Basic regex to check YYYY-MM-DD format
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        console.warn(`Unexpected date format received by formatDate: ${date}. Expected YYYY-MM-DD.`);
        return null; // Return null for invalid format
    }
    const [year, month, day] = date.split('-');
    // If DB column is DATE or DATETIME type, store as 'YYYY-MM-DD'
    // If DB column is VARCHAR requiring 'DD-MM-YYYY', use the conversion below
    // return `${day}-${month}-${year}`; // Use this only if DB REQUIRES DD-MM-YYYY
    return `${year}-${month}-${day}`; // Standard SQL DATE format
};

// JWT Authentication Middleware (No changes from previous correct version)
const authenticateUser = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1] : null;

    if (!token) {
        return res.status(401).json({ success: false, message: 'Authorization token required (Bearer Token).' });
    }

    jwt.verify(token, JWT_SECRET, (err, decoded) => {
        if (err) {
            console.error("JWT Verification Error:", err.message);
             if (err.name === 'TokenExpiredError') {
                 return res.status(401).json({ success: false, message: 'Session expired. Please log in again.' });
             }
            return res.status(403).json({ success: false, message: 'Invalid or failed token authentication.' });
        }
        if (!decoded || !decoded.id) {
             console.error("JWT decoded payload missing 'id'. Payload:", decoded);
             return res.status(403).json({ success: false, message: 'Invalid token payload.' });
        }
        req.user = { id: decoded.id, email: decoded.email }; // Attach user id and email
        // console.log(`➡️ Request Authenticated - UserID: ${req.user.id}`); // Optional: logs every authenticated request
        next();
    });
};


// Map Score to Entitlements Helper
function mapScoreToEntitlements(riskScore) {
    // Ensure thresholds and tiers make sense for your model/business
    if (riskScore === null || typeof riskScore !== 'number' || isNaN(riskScore)) {
        console.error("Mapping score failed: Invalid risk score input:", riskScore);
        // Return a default high-risk/error tier consistently
        return { tier: 3, limit: 500.00, terms: [3], error: "Assessment score invalid" };
    }
     // Define tiers clearly (lower score = lower risk = better tier)
     const TIER_1_THRESHOLD = 0.2;
     const TIER_2_THRESHOLD = 0.5;

     if (riskScore < TIER_1_THRESHOLD) { // Low Risk
        return { tier: 1, limit: 5000.00, terms: [3, 6, 12] };
     } else if (riskScore < TIER_2_THRESHOLD) { // Medium Risk
        return { tier: 2, limit: 2500.00, terms: [3, 6] };
     } else { // High Risk
        return { tier: 3, limit: 1000.00, terms: [3] };
     }
}
// --- ------------------ ---


// === ROUTES ===

// Registration Route
app.post('/register', async (req, res) => {
    try {
        const { first_name, surname, email, password, phone_number, ni_number, date_of_birth } = req.body;

        // --- Server-side Validation ---
        if (!first_name || !surname || !email || !password || !date_of_birth) {
            return res.status(400).json({ success: false, message: 'Missing required fields (First Name, Surname, Email, Password, Date of Birth).' });
        }
        // Basic email format check (more robust validation recommended)
        if (!/\S+@\S+\.\S+/.test(email)) {
             return res.status(400).json({ success: false, message: 'Invalid email format.' });
        }
        // Add password strength check if desired (using isValidPassword or library)
        // --- ----------------------- ---

        const hashedPassword = await bcrypt.hash(password, 10);
        const formattedDOB = formatDate(date_of_birth); // Expects YYYY-MM-DD
        if (!formattedDOB && date_of_birth) { // Check if formatting failed but date was provided
            return res.status(400).json({ success: false, message: 'Invalid date of birth format (YYYY-MM-DD expected).' });
        }

        const newUser = {
            first_name,
            surname,
            email,
            password: hashedPassword,
            phone_number: phone_number || null,
            ni_number: ni_number || null,
            date_of_birth: formattedDOB ? formattedDOB : null // Store as YYYY-MM-DD or DD-MM-YYYY based on formatDate output and DB type
            // No plaid tokens or credit score at registration initially
        };

        const sql = 'INSERT INTO users SET ?';
        const [result] = await dbPool.query(sql, newUser);

        console.log(`✅ User Registered: ${email} (ID: ${result.insertId})`);
        res.status(201).json({ success: true, message: 'Registration successful!' });

    } catch (error) {
        console.error('❌ Registration Server Error:', error);
        if (error.code === 'ER_DUP_ENTRY') { // Specific check for duplicate email
            return res.status(409).json({ success: false, message: 'An account with this email address already exists.' });
        }
        // Generic error for other DB issues or unexpected problems
        res.status(500).json({ success: false, message: 'Registration failed due to a server error.' });
    }
});

// Login Route
app.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) {
             return res.status(400).json({ success: false, message: 'Email and password are required.' });
        }

        // Select only needed fields
        const sql = 'SELECT user_id, email, password FROM users WHERE email = ?';
        const [results] = await dbPool.query(sql, [email]);

        if (results.length === 0) {
            console.log(`Login attempt failed for email: ${email} - User not found`);
            return res.status(401).json({ success: false, message: 'Invalid email or password.' }); // Generic message
        }

        const user = results[0];
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            console.log(`Login attempt failed for user ID: ${user.user_id} - Password mismatch`);
            return res.status(401).json({ success: false, message: 'Invalid email or password.' }); // Generic message
        }

        // Create JWT Payload
        const payload = { id: user.user_id, email: user.email }; // Ensure 'id' matches authenticateUser expectation
        const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '8h' }); // Example: 8 hour expiration

        console.log(`✅ User Logged In: ${user.email} (ID: ${user.user_id})`);
        res.status(200).json({ success: true, message: 'Login successful!', token }); // Send the token

    } catch (error) {
        console.error('❌ Login Server Error:', error);
        res.status(500).json({ success: false, message: 'Internal server error during login.' });
    }
});


// --- Plaid Endpoints ---
app.post('/api/create_link_token', authenticateUser, async (req, res) => {
    const userId = req.user.id;
    console.log(`⚙️ Creating link token request for User ID: ${userId}`);

    const products = ['auth', 'transactions', 'identity']; // Add/remove products as needed
    const country_codes = ['GB']; // Adjust for target countries

    const request = {
        user: { client_user_id: userId.toString() }, // Must be a string
        client_name: 'Deferred Payment Platform', // *** YOUR APP NAME ***
        language: 'en',
        products: products,
        country_codes: country_codes,
        // webhook: 'YOUR_WEBHOOK_ENDPOINT_URL', // Define and uncomment if using webhooks
    };

    try {
        const response = await plaidClient.linkTokenCreate(request);
        console.log("✅ Link token created.");
        res.json({ link_token: response.data.link_token });
    } catch (error) {
        console.error('❌ Plaid link token creation error:', error.response ? JSON.stringify(error.response.data, null, 2) : error.message);
        res.status(500).json({ success: false, message: 'Could not initiate bank connection process.' });
    }
});

app.post('/api/exchange_public_token', authenticateUser, async (req, res) => {
    const userId = req.user.id;
    const publicToken = req.body.public_token;
    console.log(`⚙️ Exchanging public token request for User ID: ${userId}`);

    if (!publicToken) {
         return res.status(400).json({ success: false, message: 'Plaid public token is required.' });
    }

    try {
        const response = await plaidClient.itemPublicTokenExchange({ public_token: publicToken });
        const accessToken = response.data.access_token;
        const itemId = response.data.item_id;
        console.log(`✅ Access token obtained for Item ID: ${itemId}`);

        // Store securely in database
        const sql = 'UPDATE users SET plaid_access_token = ?, plaid_item_id = ? WHERE user_id = ?';
        const [result] = await dbPool.query(sql, [accessToken, itemId, userId]);

        if (result.affectedRows === 0) {
             console.warn(`⚠️ No user found with ID ${userId} when storing Plaid tokens.`);
             return res.status(404).json({ success: false, message: 'User not found for saving bank connection.' });
        }
        console.log(`✅ Plaid tokens stored/updated for User ID: ${userId}`);
        res.json({ success: true, message: 'Bank account linked successfully.' });

    } catch (error) {
        console.error('❌ Plaid token exchange error:', error.response ? JSON.stringify(error.response.data, null, 2) : error.message);
        // Handle common Plaid errors
        if (error.response && error.response.data) {
            const errCode = error.response.data.error_code;
            if (errCode === 'INVALID_PUBLIC_TOKEN') {
                return res.status(400).json({ success: false, message: 'Link session expired or token invalid. Please try linking again.' });
            } // Add handling for other potential Plaid error codes...
        }
        res.status(500).json({ success: false, message: 'Could not finalize bank account link.' });
    }
});
// -----------------------

// --- Credit Assessment Endpoint ---
app.post('/api/assess_credit', authenticateUser, async (req, res) => {
    const userId = req.user.id;
    console.log(`⚙️ Assessment request received for User ID: ${userId}`);

    // Optional: Get requested amount/term from request body if frontend sends it
    const requested_loan_amount = req.body.requested_loan_amount || null;
    const requested_loan_term = req.body.requested_loan_term || null;

    // 1. Get Access Token
    let accessToken = null;
    try {
        const [userCheck] = await dbPool.query('SELECT plaid_access_token FROM users WHERE user_id = ?', [userId]);
        if (userCheck.length === 0) {
            return res.status(404).json({ success: false, message: 'User account not found.' });
        }
        if (!userCheck[0].plaid_access_token) {
            return res.status(400).json({ success: false, message: 'Bank account not linked via Plaid. Please link an account first.' });
        }
        accessToken = userCheck[0].plaid_access_token;
    } catch (dbError) {
        console.error(`❌ DB Error retrieving token for User ${userId}:`, dbError);
        return res.status(500).json({ success: false, message: 'Database error retrieving account info.' });
    }

    // 2. Fetch Plaid Data (Example includes Transactions, Identity, Auth)
    let plaidTransactions = [];
    // Initialize other Plaid data vars to null
    let plaidAuthData = null;
    let plaidIdentityData = null;
    // Add more here if needed (Income, Assets, Liabilities...)

    try {
        console.log(`⏳ Fetching Plaid data for User ID: ${userId}`);
        // --- Sync Transactions ---
        const txRequest = { access_token: accessToken };
        let allAdded = [], allModified = [], hasMore = true, cursor = null;
        while (hasMore) { /* ... transaction sync loop (same as before) ... */ }
        plaidTransactions = allAdded.concat(allModified);
        console.log(`  - Fetched/Synced ${plaidTransactions.length} transactions.`);

        // --- Fetch Auth (Example) ---
        try {
            const authResponse = await plaidClient.authGet({ access_token: accessToken });
            plaidAuthData = authResponse.data;
            console.log(`  - Fetched Plaid Auth (account details).`);
        } catch (authError) { console.warn("⚠️ Could not fetch Plaid Auth:", authError.response?.data?.error_message || authError.message); }

        // --- Fetch Identity (Example) ---
        try {
            const identityResponse = await plaidClient.identityGet({ access_token: accessToken });
            plaidIdentityData = identityResponse.data;
            console.log(`  - Fetched Plaid Identity.`);
        } catch (idError) { console.warn("⚠️ Could not fetch Plaid Identity:", idError.response?.data?.error_message || idError.message); }

        // --- TODO: Fetch Plaid Income, Assets, Liabilities etc. if needed ---

        console.log(`✅ Plaid data fetched for User ID: ${userId}`);

    } catch (plaidError) {
        console.error(`❌ Plaid API Error for User ${userId}:`, plaidError.response ? JSON.stringify(plaidError.response.data, null, 2) : plaidError.message);
        // Handle ITEM_LOGIN_REQUIRED, other common Plaid errors
        if (plaidError.response?.data?.error_code === 'ITEM_LOGIN_REQUIRED') {
            return res.status(401).json({ success: false, needsRelink: true, message: 'Bank connection requires update. Please re-link your account.' });
        } // Add more handlers...
        return res.status(500).json({ success: false, message: 'Failed to retrieve necessary data from bank connection.' });
    }

    // 3. Prepare Features for Python Service
    let rawFeaturesForModel = {};
    try {
        console.log(`⏳ Preparing features for User ID: ${userId}`);
        // --- Fetch latest record from credit_data table ---
        const creditSql = `
            SELECT employment_status, person_income, credit_utilization_ratio, payment_history,
                   loan_term, loan_amount AS original_loan_amount, loan_percent_income,
                   cb_person_default_on_file, cb_person_cred_hist_length
            FROM credit_data WHERE user_id = ? ORDER BY recorded_at DESC LIMIT 1`;
        const [creditResults] = await dbPool.query(creditSql, [userId]);
        const latestCreditData = creditResults.length > 0 ? creditResults[0] : {}; // Use empty object if no history

        // --- Fetch needed fields directly from users table ---
        // Adjust query if some features are ONLY in users table
        const [userResults] = await dbPool.query(
            `SELECT person_income AS user_person_income, -- Example: Alias if names clash
                    cb_person_default_on_file AS user_cb_default,
                    cb_person_cred_hist_length AS user_cb_length,
                    employment_status as user_emp_status -- If it's primarily stored here
             FROM users WHERE user_id = ?`,
             [userId]
         );
         const userData = userResults[0]; // Assumes user exists

        // --- TODO: Map features - Prioritize sources & handle potential nulls ---
        // Get values, potentially overriding historical with current/Plaid/request data
        const employment_status = userData.user_emp_status || latestCreditData.employment_status || 'OTHER'; // Example priority
        const person_income = latestCreditData.person_income || userData.user_person_income || 0; // Needs Plaid Income verification ideally
        const loan_amnt_current = requested_loan_amount || latestCreditData.original_loan_amount || 0;
        const loan_term_current = requested_loan_term || latestCreditData.loan_term || 0;

        // Map to EXACT names model expects
        rawFeaturesForModel = {
            'employment_status': employment_status, // Adjust key if model expects 'employment _status'
            'person_income': person_income,
            'cb_person_default_on_file': userData.user_cb_default || latestCreditData.cb_person_default_on_file || 'N',
            'cb_person_cred_hist_length': userData.user_cb_length || latestCreditData.cb_person_cred_hist_length || 0,
            'original_loan_amount': latestCreditData.original_loan_amount || 0, // Historical reference?
            'loan_term': loan_term_current,
            'loan_amnt': loan_amnt_current, // Amount for *this* assessment
            'credit_utilization_ratio': calculate_util_ratio(plaidTransactions, plaidAuthData, null, userData) ?? latestCreditData.credit_utilization_ratio ?? 0.1,
            'payment_history': calculate_payment_history(plaidTransactions, userData) ?? latestCreditData.payment_history ?? 0,
            'loan_percent_income': calculate_lpi(loan_amnt_current, person_income) ?? latestCreditData.loan_percent_income ?? 1.0, // Recalculate LPI
        };

        // --- Final check/cleanup for nulls/NaNs ---
        for (const key in rawFeaturesForModel)
        console.log("✅ Features prepared:", rawFeaturesForModel);

    } catch (dataPrepError) {
         console.error(`❌ Error preparing features for User ${userId}:`, dataPrepError);
         return res.status(500).json({ success: false, message: 'Internal error preparing assessment data.' });
    }

    // 4. Call Python Service
    let riskScore = null;
    if (!PYTHON_PREDICTION_URL) { return res.status(503).json({ success: false, message: 'Assessment service unavailable (Configuration).' }); }
    try {
        console.log(`⏳ Calling Python prediction service for User ID: ${userId}`);
        const predictionResponse = await fetch(PYTHON_PREDICTION_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ features: rawFeaturesForModel })
        });

        if (!predictionResponse.ok) {
            const errorBody = await predictionResponse.text();
            console.error(`Prediction service error: Status ${predictionResponse.status}, Body: ${errorBody}`);
            throw new Error(`Assessment service failed (Status ${predictionResponse.status})`);
        }

        const predictionResult = await predictionResponse.json();
        if (predictionResult.error) {
            console.error(`Prediction service returned error: ${predictionResult.error} - ${predictionResult.details || ''}`);
            throw new Error(`Assessment service processing error: ${predictionResult.error}`);
        }
        riskScore = predictionResult.risk_score;
        console.log(`✅ Risk score received: ${riskScore}`);

    } catch (fetchError) {
        console.error(`❌ Error calling prediction service for User ${userId}:`, fetchError.message);
        return res.status(503).json({ success: false, message: 'Credit assessment service unavailable.' });
    }

    // 5. Map Score to Entitlements
    const entitlements = mapScoreToEntitlements(riskScore);

    // 6. Store Assessment Result in 'credit_assessments'
    if (entitlements && !entitlements.error && typeof riskScore === 'number' && !isNaN(riskScore)) {
        try {
            const assessmentSql = `
                INSERT INTO credit_assessments
                    (user_id, risk_score, credit_tier, credit_limit, calculated_terms, assessment_timestamp)
                VALUES (?, ?, ?, ?, ?, NOW())
            `;
            const termsJson = JSON.stringify(entitlements.terms || []);
            const [insertResult] = await dbPool.query(assessmentSql, [userId, riskScore, entitlements.tier, entitlements.limit, termsJson]);
            console.log(`✅ Assessment record (ID: ${insertResult.insertId}) stored for User ID: ${userId}`);
        } catch (dbStoreError) {
             console.error(`❌ DB Error storing assessment for User ${userId}:`, dbStoreError);
             // Log but don't fail the user request
        }
    } else {
         console.warn(`⚠️ Skipping assessment storage for User ${userId} due to invalid score or error.`);
    }

    // 7. Return Result
    console.log(`✅ Assessment complete for User ID ${userId}. Entitlements:`, entitlements);
    res.status(200).json({ success: true, entitlements }); // Always return current assessment result
});
// ------------------------------


// --- NEW Endpoint: Get Current User Entitlements ---
app.get('/api/current_entitlements', authenticateUser, async (req, res) => {
    // (Keep the function from the previous example - using dbPool)
    const userId = req.user.id;
    console.log(`⚙️ Fetching current entitlements request for User ID: ${userId}`);
    try {
        const sql = `SELECT ... FROM credit_assessments WHERE user_id = ? ORDER BY assessment_timestamp DESC LIMIT 1`;
        const [results] = await dbPool.query(sql, [userId]);
        if (results.length === 0) { /* ... return 'unassessed' status ... */ }
        const latestAssessment = results[0];
        const terms = JSON.parse(latestAssessment.calculated_terms || '[]');
        // ... (return success with latestAssessment details) ...
    } catch (error) { /* ... error handling ... */ }
});
// === ------------------------------------ ===


// === Placeholder Calculation Functions ===
// TODO: IMPLEMENT THESE ACCURATELY
function calculate_util_ratio(transactions, authData, liabilitiesData, userData) { console.warn("Implement calculate_util_ratio!"); return 0.3; }
function calculate_payment_history(transactions, userData) { console.warn("Implement calculate_payment_history!"); return 500; }
function calculate_lpi(loan_amnt, person_income) { if (person_income && loan_amnt && person_income > 0) return loan_amnt / person_income; return null; }
// === ----------------------------- ===

// === Basic Route for Testing Authentication ===
app.get('/api/test-auth', authenticateUser, (req, res) => {
    res.json({ success: true, message: `Auth OK for user ID: ${req.user.id}` });
});
// === ------------------------------------ ===

// Global Error Handler (Keep from previous example)
app.use((err, req, res, next) => { /* ... */ });


// Start Server
app.listen(PORT, () => {
    // (Keep the startup logs from previous example)
    console.log(`\n🚀 Server running on port ${PORT}...`);
    console.log(`🔗 Plaid Env: ${plaidEnv}`);
    console.log(`🐍 Python URL: ${PYTHON_PREDICTION_URL || 'NOT SET!'}`);
});