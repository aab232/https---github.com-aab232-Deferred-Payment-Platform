const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
// const puppeteer = require('puppeteer'); // Keep if used elsewhere, otherwise remove

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

// --- Input Validation ---
if (!JWT_SECRET) {
    console.error("FATAL ERROR: JWT_SECRET is not defined in .env file. Exiting.");
    process.exit(1); // Exit if critical config missing
}
if (!process.env.PLAID_CLIENT_ID || !process.env.PLAID_SECRET_SANDBOX) {
     console.error("FATAL ERROR: Plaid Client ID or Sandbox Secret not defined in .env file. Exiting.");
     process.exit(1); // Exit if critical config missing
}
if (!PYTHON_PREDICTION_URL) {
    console.warn("WARNING: PYTHON_PREDICTION_SERVICE_URL is not defined in .env file. Assessment endpoint will fail.");
}
// --- ----------------- ---

// Middleware
app.use(cors()); // Consider more restrictive CORS settings for production
app.use(express.json()); // For parsing application/json request bodies

// --- Plaid Client Configuration ---
const plaidConfig = new Configuration({
    basePath: PlaidEnvironments.sandbox, // CHANGE TO development/production LATER
    baseOptions: {
        headers: {
            'PLAID-CLIENT-ID': process.env.PLAID_CLIENT_ID,
            'PLAID-SECRET': process.env.PLAID_SECRET_SANDBOX, // CHANGE TO development/production LATER
            'Plaid-Version': '2020-09-14' // Specify Plaid API version (optional but recommended)
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
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME || 'dpp_db',
    waitForConnections: true,
    queueLimit: 0
}).promise(); // Use promise wrapper for async/await
// --- --------------------------------- ---

// Check DB Pool on startup (optional but good)
dbPool.getConnection()
    .then(connection => {
        console.log('✅ MySQL Pool connected successfully!');
        connection.release();
    })
    .catch(err => {
        console.error('❌ MySQL Pool connection error:', err);
        process.exit(1);
    });

// --- HELPER FUNCTIONS ---

// Password Validator (Existing - keep if used during registration/updates)
// const isValidPassword = (password) => { ... };

// Function to convert date (Refined)
const formatDate = (date) => {
    // Expects 'YYYY-MM-DD' from standard HTML date inputs
    if (!date || typeof date !== 'string') return null;
    const parts = date.split('-');
    if (parts.length === 3 && parts[0].length === 4) { // Basic check for YYYY-MM-DD
        const [year, month, day] = parts;
        // Format as 'DD-MM-YYYY' for potential DB storage if that's the required format
        // If DB uses DATE type, it might be better to store as 'YYYY-MM-DD' directly
        return `${day}-${month}-${year}`;
    }
    console.warn(`Unexpected date format received by formatDate: ${date}. Expected YYYY-MM-DD.`);
    return null; // Return null or original if format is bad
};

// JWT Authentication Middleware (Refined)
const authenticateUser = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1] : null;

    if (!token) {
        return res.status(401).json({ success: false, message: 'Authorization token required (Bearer Token).' });
    }

    jwt.verify(token, JWT_SECRET, (err, decoded) => { // Use secret from env
        if (err) {
            console.error("JWT Verification Error:", err.message);
             if (err.name === 'TokenExpiredError') {
                 return res.status(401).json({ success: false, message: 'Session expired. Please log in again.' });
             }
            return res.status(403).json({ success: false, message: 'Invalid or failed token authentication.' });
        }
        // Attach user id and email from token payload to the request
        if (!decoded || !decoded.id) {
             console.error("JWT decoded payload missing 'id'. Payload:", decoded);
             return res.status(403).json({ success: false, message: 'Invalid token payload.' });
        }
        req.user = { id: decoded.id, email: decoded.email };
        console.log(`➡️ Request Authenticated - UserID: ${req.user.id}`);
        next();
    });
};

// Map Score to Entitlements Helper
function mapScoreToEntitlements(riskScore) {
    // (Keep the function from the previous example - adjust thresholds/tiers)
    if (riskScore === null || typeof riskScore !== 'number' || isNaN(riskScore)) {
        console.error("Invalid risk score received for mapping:", riskScore);
        return { tier: 3, limit: 500, terms: [3], error: "Assessment score invalid" };
    }
     if (riskScore < 0.2) { return { tier: 1, limit: 5000, terms: [3, 6, 12] }; }
     else if (riskScore < 0.5) { return { tier: 2, limit: 2500, terms: [3, 6] }; }
     else { return { tier: 3, limit: 1000, terms: [3] }; }
}
// --- ------------------ ---

// === DATABASE SCHEMA REMINDER ===
// Make sure your `users` table has columns like:
// `plaid_access_token` VARCHAR(255) NULLABLE
// `plaid_item_id` VARCHAR(255) NULLABLE
// Also, columns for features if storing them: `employment_status`, `person_income`, etc.
// And columns for assessment results: `current_risk_score` FLOAT NULLABLE, etc.
// === ---------------------- ===

// === ROUTES ===

// Registration Route (Refined)
app.post('/register', async (req, res) => {
    // (Keep the function from the previous example - ensuring pool is used)
    try {
        const { first_name, surname, email, password, phone_number, ni_number, date_of_birth } = req.body;
        if (!first_name || !surname || !email || !password || !date_of_birth) { /* ... error ... */ }
        // Add other validation checks

        const hashedPassword = await bcrypt.hash(password, 10);
        const formattedDOB = formatDate(date_of_birth);
        if (!formattedDOB && date_of_birth) { /* ... date format error ... */ }

        const newUser = { /* ... user data ... */
             first_name, surname, email,
             password: hashedPassword,
             phone_number: phone_number || null,
             ni_number: ni_number || null,
             date_of_birth: formattedDOB
        };

        const sql = 'INSERT INTO users SET ?';
        const [result] = await dbPool.query(sql, newUser); // Use dbPool

        console.log(`✅ User Registered: ${email} (ID: ${result.insertId})`);
        res.status(201).json({ success: true, message: 'Registration successful!' });
    } catch (error) { /* ... error handling, check for ER_DUP_ENTRY ... */
        console.error('❌ Registration Server Error:', error);
        if (error.code === 'ER_DUP_ENTRY') { return res.status(409).json({ success: false, message: 'Email already registered.' });}
        res.status(500).json({ success: false, message: 'Internal server error during registration.' });
    }
});

// Login Route (Refined)
app.post('/login', async (req, res) => {
    // (Keep the function from the previous example - ensuring pool is used and JWT includes user_id)
    try {
        const { email, password } = req.body;
        if (!email || !password) { /* ... error ... */}

        const sql = 'SELECT user_id, email, password FROM users WHERE email = ?';
        const [results] = await dbPool.query(sql, [email]); // Use dbPool

        if (results.length === 0) { return res.status(401).json({ success: false, message: 'Invalid credentials.' }); }

        const user = results[0];
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) { return res.status(401).json({ success: false, message: 'Invalid credentials.' }); }

        const payload = { id: user.user_id, email: user.email }; // MUST include id
        const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '1h' });

        console.log(`✅ User Logged In: ${user.email} (ID: ${user.user_id})`);
        res.status(200).json({ success: true, message: 'Login successful!', token });
    } catch (error) { /* ... error handling ... */
        console.error('❌ Login error:', error);
        res.status(500).json({ success: false, message: 'Internal server error during login.' });
    }
});


// --- NEW PLAID ENDPOINTS ---
app.post('/api/create_link_token', authenticateUser, async (req, res) => {
    const userId = req.user.id;
    console.log(`⚙️ Creating link token request for User ID: ${userId}`);

    // Define products and countries based on your needs
    const products = ['auth', 'transactions', 'identity']; // Add 'income_verification', 'assets' as needed
    const country_codes = ['GB']; // e.g., ['US', 'CA']

    const request = {
        user: { client_user_id: userId.toString() },
        client_name: 'Deferred Payment Platform', // --- TODO: Change to your app name ---
        language: 'en',
        products: products,
        country_codes: country_codes,
        // webhook: 'https://your-webhook-url.com/plaid_webhook', // Strongly recommend setting up webhooks
    };

    try {
        const response = await plaidClient.linkTokenCreate(request);
        console.log("✅ Link token created successfully.");
        res.json({ link_token: response.data.link_token });
    } catch (error) {
        console.error('❌ Error creating Plaid link token:', error.response ? JSON.stringify(error.response.data, null, 2) : error.message);
        res.status(500).json({ success: false, message: 'Could not create Plaid link token.' });
    }
});

app.post('/api/exchange_public_token', authenticateUser, async (req, res) => {
    const userId = req.user.id;
    const publicToken = req.body.public_token;
    console.log(`⚙️ Exchanging public token request for User ID: ${userId}`);

    if (!publicToken) {
         return res.status(400).json({ success: false, message: 'Public token is required.' });
    }

    try {
        const response = await plaidClient.itemPublicTokenExchange({ public_token: publicToken });
        const accessToken = response.data.access_token;
        const itemId = response.data.item_id;
        console.log(`✅ Access token obtained for Item ID: ${itemId}`);

        // --- Store securely in database ---
        const sql = 'UPDATE users SET plaid_access_token = ?, plaid_item_id = ? WHERE user_id = ?';
        const [result] = await dbPool.query(sql, [accessToken, itemId, userId]); // Use dbPool

        if (result.affectedRows === 0) {
             console.warn(`⚠️ No user found with ID ${userId} to update Plaid token.`);
             // Consider if this should be a 404 or if the user context implies they exist
             return res.status(404).json({ success: false, message: 'User session invalid or user not found.' });
        }
        console.log(`✅ Plaid tokens stored/updated for User ID: ${userId}`);
        res.json({ success: true, message: 'Bank account linked successfully.' });
        // --- ---------------------------- ---

    } catch (error) {
        console.error('❌ Error exchanging Plaid public token:', error.response ? JSON.stringify(error.response.data, null, 2) : error.message);
         // Handle common Plaid errors explicitly
         if (error.response && error.response.data) {
             const errData = error.response.data;
             if (errData.error_code === 'INVALID_PUBLIC_TOKEN') {
                 return res.status(400).json({ success: false, message: 'Invalid or expired Plaid public token.' });
             }
              // Add more specific Plaid error handling here...
         }
        res.status(500).json({ success: false, message: 'Could not link bank account due to a server error.' });
    }
});
// -----------------------

// --- Credit Assessment Endpoint ---
app.post('/api/assess_credit', authenticateUser, async (req, res) => {
    // (Keep the function from the previous example, using dbPool)
     const userId = req.user.id;
     console.log(`⚙️ Credit assessment request for User ID: ${userId}`);
     // --- 1. Get Access Token ---
     let accessToken = null;
     try {
         const [results] = await dbPool.query('SELECT plaid_access_token FROM users WHERE user_id = ?', [userId]);
         if (results.length === 0 || !results[0].plaid_access_token) { /* ... error ... */ }
         accessToken = results[0].plaid_access_token;
     } catch (dbError) { /* ... db error handling ... */ }

     // --- 2. Fetch Plaid Data ---
     let plaidTransactions = []; // Add other vars: plaidIdentity, plaidAuth, plaidIncome
     try {
         // Example: Transactions Sync Loop (add calls for Identity, Auth, Income etc.)
         const request = { access_token: accessToken };
         let allAdded = [], allModified = [], hasMore = true, cursor = null;
         while (hasMore) {
             const currentRequest = cursor ? { ...request, cursor: cursor } : request;
             const response = await plaidClient.transactionsSync(currentRequest);
             allAdded = allAdded.concat(response.data.added);
             allModified = allModified.concat(response.data.modified);
             hasMore = response.data.has_more;
             cursor = response.data.next_cursor;
         }
         plaidTransactions = allAdded.concat(allModified);
         console.log(`✅ Fetched/Synced ${plaidTransactions.length} Plaid transactions.`);
         // --- TODO: Fetch Identity, Auth, Income etc. here ---

     } catch (plaidError) { /* ... plaid error handling ... */ }

     // --- 3. Prepare Features for Python ---
     let rawFeaturesForModel = {};
     try {
        // --- TODO: Implement your logic here ---
        // Fetch needed user data from DB (e.g., static info like DoB for age calc?)
        // Combine with fetched Plaid data
        // Calculate derived features (util ratio, payment hist, lpi)
        // Map to EXACT keys expected by prediction_service.py's DataFrame creation
        // Example (Needs your actual data and logic):
         const [userResults] = await dbPool.query(`SELECT employment_status, person_income,
         date_of_birth, cb_person_default_on_file, cb_person_cred_hist_length FROM users WHERE user_id = ?`, [userId]);
         const userData = userResults[0];

         rawFeaturesForModel = {
            'employment_status': userData.employment_status, // Ensure 'Yes'/'No'/'Self-Employed' format
            'person_income': userData.person_income, // Or override with verified Plaid Income
            'cb_person_default_on_file': userData.cb_person_default_on_file, // Ensure 'Y'/'N' format
            'cb_person_cred_hist_length': userData.cb_person_cred_hist_length,

            // Features likely needing calculation / input from user request maybe?
            'original_loan_amount': req.body.requested_loan_amount || 0, // Example if user requests amount
            'loan_term': req.body.requested_loan_term || 0, // Example if user requests term
            'loan_amnt': req.body.requested_loan_amount || 0, // Same as original_loan_amount? Clarify

            // Calculated Features (use placeholder funcs for now)
            'credit_utilization_ratio': calculate_util_ratio(plaidTransactions, userData),
            'payment_history': calculate_payment_history(plaidTransactions, userData),
         };
          // Calculate LPI last, requires loan_amnt and person_income
         rawFeaturesForModel['loan_percent_income'] = calculate_lpi(rawFeaturesForModel['loan_amnt'], rawFeaturesForModel['person_income']);

         console.log("Prepared Raw Features for Model:", rawFeaturesForModel);
        // --------------------------------------

     } catch (dataPrepError) { /* ... data prep error handling ... */ }

     // --- 4. Call Python Service ---
     let riskScore = null;
     if (!PYTHON_PREDICTION_URL) {
        console.error("Prediction service URL not configured.");
        return res.status(500).json({ success: false, message: 'Assessment service configuration error.' });
     }
     try {
         const predictionResponse = await fetch(PYTHON_PREDICTION_URL, {
             method: 'POST',
             headers: { 'Content-Type': 'application/json' },
             body: JSON.stringify({ features: rawFeaturesForModel })
         });
         if (!predictionResponse.ok) { /* ... handle bad response status ... */ }
         const predictionResult = await predictionResponse.json();
         if (predictionResult.error) { /* ... handle error from python ... */ }
         riskScore = predictionResult.risk_score;
         console.log(`✅ Received risk score: ${riskScore}`);
     } catch (fetchError) { /* ... fetch error handling ... */ }

     // --- 5. Map Score ---
     const entitlements = mapScoreToEntitlements(riskScore);

     // --- 6. Store Result (Optional) ---
     try {
         // (Keep the DB update logic from previous example)
         const assessmentSql = 'UPDATE users SET current_risk_score = ?, current_credit_tier = ?, current_credit_limit = ?, assessment_date = NOW() WHERE user_id = ?';
         await dbPool.query(assessmentSql, [riskScore, entitlements.tier, entitlements.limit, userId]);
         console.log(`✅ Assessment result stored for User ID: ${userId}`);
     } catch (dbStoreError) { /* ... log db error, don't fail request ... */ }

     // --- 7. Return Result ---
     console.log(`✅ Assessment complete. Entitlements:`, entitlements);
     res.status(200).json({ success: true, entitlements });
});
// ------------------------------


// === Placeholder Calculation Functions ===
function calculate_util_ratio(transactions, userData) { /* ... Needs Impl ... */ return 0.3; }
function calculate_payment_history(transactions, userData) { /* ... Needs Impl ... */ return 500; }
function calculate_lpi(loan_amnt, person_income) { /* ... Needs Impl ... */ if (person_income && loan_amnt && person_income > 0) return loan_amnt / person_income; return 0.1; }
// === ----------------------------- ===

// === Basic Route for Testing Authentication ===
app.get('/api/test-auth', authenticateUser, (req, res) => {
    // If authenticateUser calls next(), the request reaches here
    res.json({ success: true, message: `Authentication successful for user ID: ${req.user.id}, email: ${req.user.email}` });
});
// === ------------------------------------ ===

// Global Error Handler (Refined)
app.use((err, req, res, next) => {
  console.error("Unhandled Error Caught:", err.stack || err);
  // Avoid sending stack trace to client in production
  res.status(500).send({ success: false, message: 'An unexpected server error occurred.' });
});


// Start Server
app.listen(PORT, () => {
    console.log(`\n🚀 Server is running on port ${PORT}`);
    console.log(`🔗 Plaid Environment: ${plaidConfig.basePath === PlaidEnvironments.sandbox ? 'Sandbox' : (plaidConfig.basePath === PlaidEnvironments.development ? 'Development' : 'Production')}`);
    console.log(`🐍 Python Prediction Service URL: ${PYTHON_PREDICTION_URL || 'Not Set'}`);
    console.log(`🔑 JWT Secret Loaded: ${JWT_SECRET ? 'Yes' : 'NO (Using default - INSECURE)'}`);
});