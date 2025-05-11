import express from 'express'; // web framework for node.js
import mysql from 'mysql2/promise'; // mysql database driver with promise support
import cors from 'cors'; // middleware for enabling cross-origin resource sharing
import bcrypt from 'bcrypt'; // library for hashing passwords securely
import jwt from 'jsonwebtoken'; // for creating and verifying json web tokens (for authentication)
import dotenv from 'dotenv';
import { Configuration, PlaidApi, PlaidEnvironments } from 'plaid'; // plaid sdk for bank interactions
import fetch from 'node-fetch'; // library for making http requests to other services


// --- environment variable checks & setup ---
dotenv.config();
const PORT = process.env.PORT || 5000; // server port, defaults to 5000 if not specified
const PYTHON_PREDICTION_URL = process.env.PYTHON_PREDICTION_SERVICE_URL; // url for the python risk prediction service
const JWT_SECRET = process.env.JWT_SECRET; // secret key used for signing and verifying jwts
const PLAID_CLIENT_ID = process.env.PLAID_CLIENT_ID; // your plaid client id
const PLAID_SECRET_SANDBOX = process.env.PLAID_SECRET_SANDBOX; // your plaid secret for the sandbox environment
const BUFFER_CONTRIBUTION_PERCENTAGE = parseFloat(process.env.BUFFER_CONTRIBUTION_PERCENTAGE || 0.02); // Default to 2%


// critical startup checks
if (!JWT_SECRET) { console.error('FATAL ERROR: JWT_SECRET not defined in .env file.'); process.exit(1); } // exits if jwt secret is missing
if (!PLAID_CLIENT_ID || !PLAID_SECRET_SANDBOX) { console.error('FATAL ERROR: Plaid Client ID or Sandbox Secret not defined in .env.'); process.exit(1); } // exits if plaid credentials are not found
if (!PYTHON_PREDICTION_URL) { console.error('CRITICAL WARNING: PYTHON_PREDICTION_SERVICE_URL not set. Assessment endpoint WILL FAIL.'); } // warning if prediction url is missing
if (!process.env.DB_PASSWORD) { console.warn('WARNING: DB_PASSWORD not set in .env.');} // logs a warning if db password is not set
console.log(`Buffer Contribution Percentage set to: ${(BUFFER_CONTRIBUTION_PERCENTAGE * 100).toFixed(1)}%`); // logs the configured buffer contribution
// --- ----------------------------------- ---

const app = express(); // creates an express application instance

// middleware
app.use(cors()); // enables cors for all routes
app.use(express.json()); // Parse JSON request bodies

// --- plaid client configuration ---
let plaidEnv = PlaidEnvironments.sandbox; // sets plaid environment to sandbox
let plaidSecret = PLAID_SECRET_SANDBOX; // uses the sandbox secret key
const plaidConfig = new Configuration({ // configuration object for the plaid api client
    basePath: plaidEnv, // specifies the plaid api base path
    baseOptions: { // base options for plaid api requests
        headers: { // http headers required by plaid
            'PLAID-CLIENT-ID': PLAID_CLIENT_ID,
            'PLAID-SECRET': plaidSecret,
            'Plaid-Version': '2020-09-14' // specifies the plaid api version
        },
    },
});
const plaidClient = new PlaidApi(plaidConfig); // initialises the plaid api client
// --- ------------------------ ---

// --- mySQL connection pool ---
let dbPool; // declares a variable to hold the mysql connection pool
try {
    dbPool = mysql.createPool({ // Not awaiting here, createPool is synchronous
        connectionLimit: 10, // maximum number of connections in the pool
        host: process.env.DB_HOST || 'localhost', // database server host
        user: process.env.DB_USER || 'root', // database user
        password: process.env.DB_PASSWORD, // database password
        database: process.env.DB_NAME || 'dpp_db', // name of the database
        waitForConnections: true, // if all connections are in use, queue the request
        queueLimit: 0 // no limit on the number of queued connection requests
    });

    // Test connection (async)
    dbPool.getConnection() // attempts to get a connection from the pool
        .then(connection => {
            console.log(' MySQL Pool connected successfully!'); // logs success
            connection.release(); // releases the connection
        })
        .catch(err => {
            console.error(' MySQL Pool initial connection error:', err); // logs error if connection fails
            process.exit(1); // exits if database is not reachable
        });
} catch (err) {
     console.error(' Failed to create MySQL Pool:', err); // logs error if pool creation fails
     process.exit(1); // exits if pool creation fails
}
// --- --------------------- ---

// --- HELPER FUNCTIONS ---
// checks if a given password string meets complexity requirements
const isValidPassword = (password) => {
    if (!password) return false; // false if no password
    const passwordRegex = /^(?=.*\d.*\d)(?=.*[!@#$%^&*]).{8,}$/; // min 8 chars, 2 digits, 1 special
    return passwordRegex.test(password); // test password against regex
};

// formats a date string into yyyy-mm-dd for database consistency
const formatDate = (date) => {
    if (!date || typeof date !== 'string') return null; // handles null or non-string input
    if (/^\d{4}-\d{2}-\d{2}$/.test(date)) { return date; } // if already yyyy-mm-dd
    else if (/^\d{2}-\d{2}-\d{4}$/.test(date)) { const [day, month, year] = date.split('-'); return `${year}-${month}-${day}`; } // converts dd-mm-yyyy
    else {
        console.warn(`Invalid date format passed to formatDate: ${date}.`); // warn for unhandled formats
        return null; // return null
    }
};

// middleware function to authenticate a user via jwt
const authenticateUser = (req, res, next) => {
    const authHeader = req.headers['authorization']; // gets the authorisation header
    const token = authHeader?.startsWith('Bearer ') ? authHeader.split(' ')[1] : null; // extracts token
    if (!token) return res.status(401).json({ success: false, message: 'Authorization token required.' }); // deny if no token
    try {
        const decoded = jwt.verify(token, JWT_SECRET); // verifies token
        if (!decoded.id) throw new Error('Token payload missing \'id\'.'); // check for user id in payload
        req.user = { id: decoded.id, email: decoded.email }; // attach user info to request
        next(); // proceed
    } catch (err) {
        console.error('JWT Error:', err.message); // log jwt errors
        const status = err.name === 'TokenExpiredError' ? 401 : 403; // set status based on error
        const message = err.name === 'TokenExpiredError' ? 'Session expired.' : 'Invalid token.'; // set message
        return res.status(status).json({ success: false, message }); // return error
    }
};

// function to map a raw risk score to business-defined credit tiers, limits, and terms,
// and then applies various adjustments based on other user data
function mapScoreAndApplyAdjustments(riskScore, defaultFlag, employmentStatusDB, utilizationRatioRaw) {
    console.log(`   Inputs - Score: ${riskScore?.toFixed(4)}, Default: ${defaultFlag}, EmpStatus: ${employmentStatusDB}, UtilRatio: ${utilizationRatioRaw}`);
    let baseTier, baseLimit, baseTerms; // variables for initial entitlements
    let finalLimit; // variable for credit limit after adjustments
    const adjustments = []; // array to track adjustments
    const defaultFlagIsY = (defaultFlag === 'Y'); // boolean for default flag

    if (riskScore === null || typeof riskScore !== 'number' || isNaN(riskScore)) { // handles invalid risk score
        console.error('Mapping failed: Invalid risk score input:', riskScore); // log critical error
        baseTier = 7; baseLimit = 150.00; baseTerms = [3]; // default to highest risk
        return { tier: baseTier, limit: baseLimit, terms: baseTerms, error: 'Invalid score' };
    }

    // defines risk score thresholds for credit tiers
    const TIER1_MAX = 0.14, TIER2_MAX = 0.28, TIER3_MAX = 0.42, TIER4_MAX = 0.56, TIER5_MAX = 0.70, TIER6_MAX = 0.84;
    // determines base entitlements based on score
    if (riskScore < TIER1_MAX)       { baseTier = 1; baseLimit = 2500.00; baseTerms = [3, 6, 12]; }
    else if (riskScore < TIER2_MAX) { baseTier = 2; baseLimit = 1750.00; baseTerms = [3, 6, 12]; }
    else if (riskScore < TIER3_MAX) { baseTier = 3; baseLimit = 1250.00; baseTerms = [3, 6];    }
    else if (riskScore < TIER4_MAX) { baseTier = 4; baseLimit = 800.00;  baseTerms = [3, 6];    }
    else if (riskScore < TIER5_MAX) { baseTier = 5; baseLimit = 500.00;  baseTerms = [3];       }
    else if (riskScore < TIER6_MAX) { baseTier = 6; baseLimit = 300.00;  baseTerms = [3];       }
    else                              { baseTier = 7; baseLimit = 150.00;  baseTerms = [3];       }
    console.log(`   -> Base Entitlements: Tier ${baseTier}, Limit ${baseLimit.toFixed(2)}, Terms [${baseTerms.join(',')}]`);
    finalLimit = baseLimit; // initialise final limit

    // applies specific adjustments
    if (defaultFlagIsY) { finalLimit *= 0.75; adjustments.push('Default Flag (-25%)'); } // reduce if default flag

    const empStatusUpper = String(employmentStatusDB || '').toUpperCase(); // normalise employment status
    const isUnemployedOrOther = !['EMPLOYED', 'SELF_EMPLOYED'].includes(empStatusUpper); // check for non-standard employment
    if (isUnemployedOrOther) {
        let reductionPercent = 0.20; // base reduction
        if (baseTier >= 6) { reductionPercent += 0.10; adjustments.push(`Employment (${empStatusUpper}) & High Risk Penalty (-${(reductionPercent * 100).toFixed(0)}%)`); }
        else { adjustments.push(`Employment (${empStatusUpper}) Penalty (-${(reductionPercent * 100).toFixed(0)}%)`); }
        finalLimit *= (1 - reductionPercent); // apply reduction
    }

    const HIGH_UTIL_THRESHOLD = 0.70; // threshold for high credit utilisation
    const utilization = isNaN(Number(utilizationRatioRaw)) ? 0 : Number(utilizationRatioRaw); // parse utilisation safely
    if (utilization > HIGH_UTIL_THRESHOLD) { // if utilisation is high
        if (defaultFlagIsY) { finalLimit *= 0.85; adjustments.push('High Util & Default (-15%)'); } // penalty if high util and default
        else { const MAX_LIMIT_CAP = 3000.00; finalLimit = Math.min(finalLimit * 1.20, MAX_LIMIT_CAP); adjustments.push(finalLimit === MAX_LIMIT_CAP ? 'High Util Bonus (Hit Cap)' : 'High Util Bonus (+20%)');} // potential bonus if no default
    }

    const MINIMUM_LIMIT = 50.00; // minimum allowed credit limit
    if (finalLimit < MINIMUM_LIMIT) { finalLimit = MINIMUM_LIMIT; adjustments.push(`Limit adjusted to Min (£${MINIMUM_LIMIT.toFixed(2)})`); } // ensure not below minimum

    console.log(`   Adjustments Applied: ${adjustments.length > 0 ? adjustments.join('; ') : 'None'}`); // logs summary of adjustments
    console.log(`   -> Final Entitlements: Tier ${baseTier}, Limit ${finalLimit.toFixed(2)}, Terms [${baseTerms.join(',')}]`); // logs final outcome
    return { tier: baseTier, limit: parseFloat(finalLimit.toFixed(2)), terms: baseTerms, error: null }; // returns entitlements
}

// maps a database employment status string to a simpler category for the model
function mapEmploymentStatus(dbStatus) {
    if (!dbStatus) return 'No'; // default if no status
    const statusUpper = String(dbStatus).toUpperCase(); // normalise for comparison
    if (statusUpper === 'EMPLOYED') return 'Yes';
    if (statusUpper === 'SELF_EMPLOYED') return 'Self-Employed';
    return 'No'; // for other cases
}

// calculates credit utilisation ratio (simulated for prototype)
function calculate_util_ratio(plaidAuthData, plaidLiabilitiesData, historicalRatio) {
    console.log('  -> Calculating Util Ratio (SIMULATED - Using Fallback)...'); // using single quotes for simple string
    const fallbackRatio = (historicalRatio !== null && !isNaN(Number(historicalRatio))) ? Number(historicalRatio) : 0.1; // use historical or default
    console.log(`     Util Ratio (DB based): ${fallbackRatio.toFixed(4)}`);
    return fallbackRatio; // returns ratio
}

// calculates a payment history score (simulated)
function calculate_payment_history(plaidTransactions, userData, historicalScore) {
    console.log('  -> Calculating Payment History Score (SIMULATED - Using DB)...'); // using single quotes
    try {
        const baseScore = (historicalScore !== null && !isNaN(Number(historicalScore))) ? Number(historicalScore) : 500; // use historical or default
        let score = baseScore; const maxScore = 1000, minScore = 0; // define score range
        if (userData?.cb_person_default_on_file === 'Y') { score -= 100; console.log('     Penalty for default flag.'); } // penalty for default
        score = Math.max(minScore, Math.min(maxScore, score)); // ensure score within bounds
        console.log(`     History Score (DB based): ${Math.round(score)}`);
        return Math.round(score); // return final score
    } catch (e) {
        console.error(' Error calculating payment history (DB):', e); // log error
        return 500; // default score on error
    }
}

// calculates the loan-to-income (lpi) ratio
function calculate_lpi(loan_amnt, person_income) {
    const incomeNum = Number(person_income); // convert income to number
    const loanNum = Number(loan_amnt); // convert loan amount to number
    if (!isNaN(incomeNum) && incomeNum > 0 && !isNaN(loanNum) && loanNum >= 0) { // ensure valid numbers, positive income
        return loanNum / incomeNum; // calculate ratio
    }
    console.warn(`     Could not calculate LPI. Loan: ${loan_amnt}, Income: ${person_income}`);
    return null; // return null if inputs invalid
}
// --- ------------------------------------------------------------------------- ---

// === ROUTES ===

// handles new user registration requests
app.post('/register', async (req, res) => {
    const { first_name, surname, email, password, phone_number, ni_number, date_of_birth } = req.body; // extract details from request

    // basic server-side validation
    if (!first_name || !surname || !email || !password || !date_of_birth) {
        return res.status(400).json({ success: false, message: 'Missing required fields.' });
    }
    if (!/\S+@\S+\.\S+/.test(email)) { // simple email format check
        return res.status(400).json({ success: false, message: 'Invalid email format.' });
    }
    const formattedDOB = formatDate(date_of_birth); // format date of birth
    if (!formattedDOB && date_of_birth) { // if dob provided but format was wrong
        return res.status(400).json({ success: false, message: 'Invalid date format (YYYY-MM-DD required).' });
    }
    if (!formattedDOB) { // if dob is missing
        return res.status(400).json({ success: false, message: 'Date of birth is required (YYYY-MM-DD).' });
    }

    try {
        const hashedPassword = await bcrypt.hash(password, 10); // hash the password
        const newUser = { // create new user object with defaults
            first_name, surname, email, password: hashedPassword,
            phone_number: phone_number || null,
            ni_number: ni_number || null,
            date_of_birth: formattedDOB,
            cb_person_default_on_file: 'N', // credit bureau default flag
            cb_person_cred_hist_length: 0, // credit history length
            current_credit_limit: 0.00, // initial credit limit
            used_credit_amount: 0.00, // initial used credit
            buffer_bag_balance: 0.00, // initial buffer balance
            monthly_spending_limit: null // initial user-set spending limit
        };
        // backticks for multiline SQL are correct
        const sql = `INSERT INTO users (first_name, surname, email, password, phone_number, ni_number, date_of_birth, cb_person_default_on_file, cb_person_cred_hist_length, current_credit_limit, used_credit_amount, buffer_bag_balance, monthly_spending_limit) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
        const values = [ // values for the query
            newUser.first_name, newUser.surname, newUser.email, newUser.password,
            newUser.phone_number, newUser.ni_number, newUser.date_of_birth,
            newUser.cb_person_default_on_file, newUser.cb_person_cred_hist_length,
            newUser.current_credit_limit, newUser.used_credit_amount, newUser.buffer_bag_balance,
            newUser.monthly_spending_limit
        ];
        const [result] = await dbPool.query(sql, values); // execute insert query
        console.log(` User Registered: ${email} (ID: ${result.insertId})`); // log successful registration
        res.status(201).json({ success: true, message: 'Registration successful!' }); // send success response
    } catch (error) {
        console.error(' Registration Server Error:', error); // log error if registration fails
        if (error.code === 'ER_DUP_ENTRY') { // handle specific db error for duplicate email
            return res.status(409).json({ success: false, message: 'Email already registered.' });
        }
        console.error(`Unexpected DB error during registration for ${email}:`, error); // log other unexpected db errors
        res.status(500).json({ success: false, message: 'Registration failed due to a server issue.' }); // generic error
    }
});

// handles user login attempts
app.post('/login', async (req, res) => {
    const { email, password } = req.body; // extract email and password
    if (!email || !password) { // ensure both provided
        return res.status(400).json({ success: false, message: 'Email and Password are required.' });
    }
    try {
        const sql = 'SELECT user_id, email, password FROM users WHERE email = ? LIMIT 1'; // query to find user
        const [results] = await dbPool.query(sql, [email]); // execute query

        if (results.length === 0) { // if no user found
            console.log(`Login fail: Email not found - ${email}`);
            return res.status(401).json({ success: false, message: 'Invalid email or password.' }); // generic message
        }
        const user = results[0]; // user object from db

        const isMatch = await bcrypt.compare(password, user.password); // compare submitted password with hash
        if (!isMatch) { // if passwords don't match
            console.log(`Login fail: Password mismatch - User ID ${user.user_id}`);
            return res.status(401).json({ success: false, message: 'Invalid email or password.' }); // generic message
        }

        const payload = { id: user.user_id, email: user.email }; // data for jwt payload
        const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '8h' }); // create and sign jwt, expires in 8 hours

        console.log(` User Logged In: ${user.email} (ID: ${user.user_id})`); // log successful login
        res.status(200).json({ success: true, message: 'Login successful!', token: token }); // send success response with token
    } catch (error) {
        console.error(' Login Server Error:', error); // log error if login fails
        res.status(500).json({ success: false, message: 'Login failed due to a server issue.' }); // generic error
    }
});

// endpoint for frontend to request a plaid link_token
app.post('/api/create_link_token', authenticateUser, async (req, res) => {
    const userId = req.user.id; // authenticated user id
    console.log(` Creating Plaid link token request for User: ${userId}`);
    const request = { user: { client_user_id: userId.toString() }, client_name: 'DPP Finance Demo', language: 'en', products: ['auth', 'transactions', 'identity', 'liabilities'], country_codes: ['GB'] }; // plaid request parameters
    try {
        const response = await plaidClient.linkTokenCreate(request); // call plaid api
        res.json({ link_token: response.data.link_token, success: true }); // send token to client
    } catch (error) {
        console.error(' Plaid link token creation error:', error.response?.data || error.message); // log plaid error
        res.status(500).json({ success: false, message: 'Could not create Plaid link token.' }); // generic error to client
    }
});

// endpoint for frontend to exchange a public_token for an access_token (simulated for prototype)
app.post('/api/exchange_public_token', authenticateUser, async (req, res) => {
    const userId = req.user.id; // authenticated user id
    const { public_token: publicToken } = req.body; // public token from client
    // check for public token, allowing null for explicit simulation but not other falsy non-string values
    if (publicToken === undefined || (publicToken !== null && typeof publicToken !== 'string')) {
        return res.status(400).json({ success: false, message: 'Public token is required or must be null for simulation.' });
    }

    console.log(`⚙️ Exchanging public token request (Simulated storage) User: ${userId}`);
    // generate fake tokens for simulation
    const fakeAccessToken = `simulated-access-${userId}-${Date.now()}`;
    const fakeItemId = `simulated-item-${userId}-${Date.now()}`; // added timestamp to ensure uniqueness if called rapidly
    try {
        const sql = 'UPDATE users SET plaid_access_token = ?, plaid_item_id = ? WHERE user_id = ?'; // sql to update user
        const [result] = await dbPool.query(sql, [fakeAccessToken, fakeItemId, userId]); // execute update
        if (result.affectedRows === 0) { // if user not found
            console.warn(`Attempted to store simulated Plaid tokens for non-existent User ID: ${userId}`);
            return res.status(404).json({ success: false, message: 'User not found.' });
        }
        console.log(` SIMULATED Plaid tokens stored in DB for User ID: ${userId}`); // log success
        // adjust message based on whether it was an explicit simulation (publictoken was null)
        const message = (publicToken === null)
            ? 'Bank account link simulated successfully (explicit frontend simulation).'
            : 'Bank account linked (Simulated Plaid exchange & DB storage).';
        res.json({ success: true, message: message }); // success response
    } catch (dbError) {
        console.error(` DB Error storing simulated Plaid tokens for User ID ${userId}:`, dbError);
        res.status(500).json({ success: false, message: 'Database error during simulated token storage.' }); // db error response
    }
});

// --- MAIN Credit Assessment Endpoint ---
// performs a full credit assessment, calls python service, stores results
app.post('/api/assess_credit', authenticateUser, async (req, res) => {
    const userId = req.user.id; // authenticated user id
    console.log(`\n⚙️ Starting Credit Assessment (SIMULATION MODE) for User: ${userId}`);
    const { requested_loan_amount = null, requested_loan_term = null } = req.body; // loan details
    console.log(`   Requested Loan Amount: ${requested_loan_amount}, Term: ${requested_loan_term}`);
    // declare variables for assessment process
    let assessmentIdForOrder = null, riskScore = null, entitlements = {}, rawFeaturesForModel = {}, dbUserData = null, latestCreditData = null;
    let original_db_employment_status = null, raw_credit_utilization_ratio = null, db_default_flag = 'N';

    try {
        console.log('   1 & 2. Skipping Plaid data fetch and processing (SIMULATION MODE).');
        console.log('   3. Preparing features from Database...');
        try {
            // sql to get latest credit data and user profile flags
            const creditSql = `SELECT employment_status, person_income, credit_utilization_ratio, payment_history, loan_term, loan_amnt AS original_loan_amount, loan_percent_income FROM credit_data WHERE user_id = ? ORDER BY recorded_at DESC LIMIT 1`;
            const userSql = `SELECT cb_person_default_on_file, cb_person_cred_hist_length FROM users WHERE user_id = ?`;
            const [[latestCreditDataResult], [dbUserDataResult]] = await Promise.all([dbPool.query(creditSql, [userId]), dbPool.query(userSql, [userId])]); // fetch concurrently
            latestCreditData = latestCreditDataResult || {}; dbUserData = dbUserDataResult; // assign with fallbacks
            if (!dbUserData) { // user must exist
                console.error(` User profile not found for User ID: ${userId}`);
                throw new Error('User profile data missing for assessment.');
            }
            console.log('      Fetched User Data:', dbUserData); console.log('      Fetched Latest Credit Data:', latestCreditData);

            // prepare features from fetched data
            original_db_employment_status = latestCreditData.employment_status || 'OTHER';
            raw_credit_utilization_ratio = latestCreditData.credit_utilization_ratio;
            db_default_flag = dbUserData.cb_person_default_on_file || 'N';
            const pIncome = Number(latestCreditData.person_income || 0);
            const lAmnt = Number(requested_loan_amount || latestCreditData.original_loan_amount || 1000);
            const lTerm = Number(requested_loan_term || latestCreditData.loan_term || 6);
            const utilRatio = calculate_util_ratio(null, null, raw_credit_utilization_ratio) ?? 0.1;
            const historyScore = calculate_payment_history([], dbUserData, latestCreditData.payment_history) ?? 500;
            rawFeaturesForModel = { // assemble features object
                'employment_status': mapEmploymentStatus(original_db_employment_status), 'person_income': pIncome,
                'cb_person_default_on_file': db_default_flag, 'cb_person_cred_hist_length': Number(dbUserData.cb_person_cred_hist_length || 0),
                'original_loan_amount': Number(latestCreditData.original_loan_amount || 0), 'loan_term': lTerm, 'loan_amnt': lAmnt,
                'credit_utilization_ratio': utilRatio, 'payment_history': historyScore, 'loan_percent_income': calculate_lpi(lAmnt, pIncome) ?? 1.0,
            };
            // normalise numeric features
            Object.keys(rawFeaturesForModel).forEach(key => {
                if (key !== 'employment_status' && key !== 'cb_person_default_on_file') { rawFeaturesForModel[key] = Number(rawFeaturesForModel[key] || 0); if (isNaN(rawFeaturesForModel[key])) rawFeaturesForModel[key] = 0; }
                else if (!rawFeaturesForModel[key]) { rawFeaturesForModel[key] = (key === 'employment_status' ? 'No' : 'N');}
            });
            console.log('       Features prepared (DB ONLY):', JSON.stringify(rawFeaturesForModel));
        } catch (dataPrepError) {
            console.error(` DB Error for User ${userId}:`, dataPrepError); return res.status(500).json({ success: false, message: `Error preparing data: ${dataPrepError.message}` });}

        console.log('   4. Calling Python Prediction Service...');
        if (!PYTHON_PREDICTION_URL) { console.error(' PYTHON_PREDICTION_SERVICE_URL is not set.'); throw new Error('Prediction service configuration missing.');} // check if url is set
        try {
            const predRes = await fetch(PYTHON_PREDICTION_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ features: rawFeaturesForModel }) }); // call python service
            if (!predRes.ok) { const errBody = await predRes.text(); throw new Error(`Prediction service HTTP Error: ${predRes.status}. Body: ${typeof errBody === 'string' ? errBody : 'N/A'}`);} // handle http errors
            const predResult = await predRes.json(); // parse response
            if (predResult.error) throw new Error(`Prediction failed: ${predResult.error}`); // handle errors from service
            riskScore = predResult.risk_score; // get risk score
            console.log(`      Received Risk Score: ${riskScore}`);
            if (riskScore === null || typeof riskScore !== 'number' || isNaN(riskScore)) throw new Error('Invalid risk score from prediction service.'); // validate score
        } catch (fetchError) {
            console.error(' Python Service Error:', fetchError); throw new Error(`Assessment service unavailable: ${fetchError.message}`);}

        console.log('   5. Mapping score and applying adjustments...');
        entitlements = mapScoreAndApplyAdjustments(riskScore, db_default_flag, original_db_employment_status, raw_credit_utilization_ratio); // map score to entitlements
        if (entitlements.error) throw new Error(`Failed to determine entitlements: ${entitlements.error}`);
        console.log(`      Calculated Entitlements: Tier ${entitlements.tier}, Limit ${entitlements.limit.toFixed(2)}, Terms [${entitlements.terms.join(',')}]`);

        console.log('   6. Storing assessment result and updating user\'s limit...');
        if (!entitlements.error && riskScore !== null) { // only store if valid
            let connection; // db connection for transaction
            try {
                connection = await dbPool.getConnection(); await connection.beginTransaction(); // start transaction
                const assessSql = `INSERT INTO credit_assessments
                                     (user_id, risk_score, credit_tier, credit_limit, calculated_terms,
                                      assessment_timestamp)
                                   VALUES (?, ?, ?, ?, ?, NOW())`; // sql to insert assessment
                const assessVals = [ // values for query
                    userId, riskScore.toFixed(6), entitlements.tier,
                    entitlements.limit.toFixed(2), JSON.stringify(entitlements.terms),
                ];
                const [insRes] = await connection.query(assessSql, assessVals); // execute insert
                assessmentIdForOrder = insRes.insertId; // get new assessment id
                console.log(`       Assessment record created (ID: ${assessmentIdForOrder})`);

                const updUserLimitSql = 'UPDATE users SET current_credit_limit = ? WHERE user_id = ?'; // sql to update user's limit
                const [updRes] = await connection.query(updUserLimitSql, [entitlements.limit.toFixed(2), userId]); // execute update
                if (updRes.affectedRows === 0) throw new Error('Failed to update user\'s credit limit.'); // error if no update
                console.log(`       User ${userId}'s current_credit_limit updated to ${entitlements.limit.toFixed(2)}`);

                await connection.commit(); // commit transaction
                console.log('      DB Transaction Committed (Assessment Record + User Limit Update).');
            } catch (dbStoreError) {
                console.error(` DB Error during storage/update for User ${userId}:`, dbStoreError);
                if (connection) {
                    try { await connection.rollback(); console.log('      DB Transaction Rolled Back.'); }
                    catch (rollbackErr) { console.error('      Error during Rollback:', rollbackErr); }
                }
                assessmentIdForOrder = null; // reset id if storage failed
                console.error('Assessment result storage failed.');
                throw dbStoreError;
            } finally {
                if (connection) { // always release connection
                    try {
                        connection.release();
                        console.log('      DB Connection Released (Assessment Storage).');
                    } catch (releaseErr) {
                        console.error('      Error releasing DB connection (Assessment Storage):', releaseErr);
                    }
                }
            }
        } else {
            console.warn('   Skipping storage due to invalid score or entitlement error.');
        }

        console.log(` Assessment complete (SIMULATION MODE) for User: ${userId}`);
        // fetch user's current used amount for accurate available_credit in response
        const [currentUserDataForResponse] = await dbPool.query('SELECT used_credit_amount FROM users WHERE user_id = ?', [userId]);
        const finalUsedAmount = parseFloat(currentUserDataForResponse[0]?.used_credit_amount || 0);

        res.status(200).json({ // send success response
            success: true,
            message: 'Credit assessment completed.',
            entitlements: {
                tier: entitlements.tier,
                limit: entitlements.limit,
                terms: entitlements.terms,
                used_credit_amount: finalUsedAmount,
                available_credit: Math.max(0, entitlements.limit - finalUsedAmount) // calculate available credit
            },
            assessmentId: assessmentIdForOrder // send assessment id if stored
        });

    } catch (error) { // main catch block for the route
        console.error(` Overall Assessment Error for User ${userId}:`, error);
        let statusCode = 500; // default error status
        // set specific status based on error type
        if (error.message?.includes('User profile data missing')) statusCode = 404;
        else if (error.message?.includes('Prediction service') || error.message?.includes('Assessment service unavailable')) statusCode = 503;
        else if (error.message?.includes('Invalid risk score') || error.message?.includes('Failed to determine entitlements')) statusCode = 500;
        else if (error.message?.includes('returned error')) statusCode = 502;
        else if (error.code === 'ER_BAD_FIELD_ERROR') {
             console.error('Database schema error encountered during assessment storage.');
             error.message = 'Database configuration error prevented assessment storage.';
        }
        else if (error.message?.includes('Failed to update user\'s credit limit')) {
            statusCode = 500;
            error.message = 'Failed to update user limit after assessment.';
        }

        res.status(statusCode).json({ success: false, message: error.message || 'Credit assessment failed.' }); // send error
    }
});


// provides a quick, non-persisted simulated assessment (for dashboard estimate feature)
app.post('/api/assess_credit_simulated', authenticateUser, async (req, res) => {
    const userId = req.user.id; // authenticated user
    console.log(`\n SIMULATED Dashboard Assessment request User: ${userId}`);
    const { requested_loan_amount = 1000, requested_loan_term = 6 } = req.body; // loan details with defaults
    console.log(`   Dashboard estimate using Amount: ${requested_loan_amount}, Term: ${requested_loan_term}`);
    // declare variables for simulation
    let riskScore = null, entitlements = {}, rawFeaturesForModel = {}, dbUserData = null, latestCreditData = null;
    let original_db_employment_status = null, raw_credit_utilization_ratio = null, db_default_flag = 'N';

    try {
        console.log('   1. Preparing features from DB for simulation...');
        try {
            // sql to get latest credit data and user profile data
            const creditSql = `SELECT employment_status, person_income, credit_utilization_ratio, payment_history, loan_term, loan_amnt AS original_loan_amount, loan_percent_income FROM credit_data WHERE user_id = ? ORDER BY recorded_at DESC LIMIT 1`;
            const userSql = `SELECT cb_person_default_on_file, cb_person_cred_hist_length FROM users WHERE user_id = ?`;
            const [[latestCreditDataResult], [dbUserDataResult]] = await Promise.all([ dbPool.query(creditSql, [userId]), dbPool.query(userSql, [userId]) ]);
            latestCreditData = latestCreditDataResult || {}; dbUserData = dbUserDataResult; // assign with fallbacks
            if (!dbUserData) throw new Error('User profile missing for simulation.'); // user must exist

            console.log('      Fetched User Data (Sim):', dbUserData); console.log('      Fetched Latest Credit Data (Sim):', latestCreditData);

            // prepare features for model
            original_db_employment_status = latestCreditData.employment_status || 'OTHER';
            raw_credit_utilization_ratio = latestCreditData.credit_utilization_ratio;
            db_default_flag = dbUserData.cb_person_default_on_file || 'N';
            const pIncome = Number(latestCreditData.person_income || 0);
            const lAmnt = Number(requested_loan_amount); const lTerm = Number(requested_loan_term); // use requested values
            const utilRatio = calculate_util_ratio(null, null, raw_credit_utilization_ratio) ?? 0.1;
            const historyScore = calculate_payment_history([], dbUserData, latestCreditData.payment_history) ?? 500;
            rawFeaturesForModel = { // assemble features
                'employment_status': mapEmploymentStatus(original_db_employment_status), 'person_income': pIncome,
                'cb_person_default_on_file': db_default_flag, 'cb_person_cred_hist_length': Number(dbUserData.cb_person_cred_hist_length || 0),
                'original_loan_amount': Number(latestCreditData.original_loan_amount || 0), 'loan_term': lTerm, 'loan_amnt': lAmnt,
                'credit_utilization_ratio': utilRatio, 'payment_history': historyScore, 'loan_percent_income': calculate_lpi(lAmnt, pIncome) ?? 1.0,
            };
            // normalise numeric features
            Object.keys(rawFeaturesForModel).forEach(k => {
                if (k !== 'employment_status' && k !== 'cb_person_default_on_file') { rawFeaturesForModel[k] = Number(rawFeaturesForModel[k] || 0); if (isNaN(rawFeaturesForModel[k])) rawFeaturesForModel[k] = 0;}
                else if (!rawFeaturesForModel[k]) { rawFeaturesForModel[k] = (k === 'employment_status' ? 'No' : 'N');}
            });
            console.log('       Raw features prepared (SIMULATED):', JSON.stringify(rawFeaturesForModel));
        } catch (dataPrepError) {
            console.error('    Error preparing features (SIM):', dataPrepError); return res.status(500).json({ success: false, message: 'Internal error preparing simulation data.' });}

        console.log('   2. Calling Python service for simulation...');
        if (!PYTHON_PREDICTION_URL) return res.status(503).json({ success: false, message: 'Prediction service configuration error.' }); // check service url
        try {
            const predRes = await fetch(PYTHON_PREDICTION_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ features: rawFeaturesForModel }) });
            if (!predRes.ok) { const errTxt = await predRes.text(); throw new Error(`Prediction service HTTP error: ${predRes.status} - ${typeof errTxt === 'string' ? errTxt : 'N/A'}`);}
            const predResult = await predRes.json(); if (predResult.error) throw new Error(`Prediction service failed: ${predResult.error}`);
            riskScore = predResult.risk_score; // get score
            console.log(`      Simulated Score: ${riskScore}`);
        } catch (fetchError) {
            console.error(`    Python service error (SIM): ${fetchError.message}`); return res.status(503).json({ success: false, message: 'Prediction service unavailable for simulation.' });}
        if (riskScore === null || typeof riskScore !== 'number' || isNaN(Number(riskScore))) return res.status(500).json({success: false, message: 'Invalid score received from simulation service.'}); // validate score

        console.log('   3. Mapping simulated score and applying adjustments...');
        entitlements = mapScoreAndApplyAdjustments(riskScore, db_default_flag, original_db_employment_status, raw_credit_utilization_ratio); // map score
        if (entitlements.error) {
            console.error(`    Error mapping simulated score: ${entitlements.error}`); return res.status(500).json({success: false, message: 'Error calculating simulated entitlements.'});}
        console.log(`      Simulated Entitlements: Tier ${entitlements.tier}, Limit ${entitlements.limit.toFixed(2)}, Terms [${entitlements.terms.join(',')}]`);

        console.log(` SIMULATED Dashboard Assessment complete for User: ${userId}.`);
        res.status(200).json({ success: true, entitlements: { tier: entitlements.tier, limit: entitlements.limit, terms: entitlements.terms }, assessmentId: null, simulated: true }); // respond (no assessmentid)
    } catch (error) {
        console.error(` SIMULATED Assessment Flow Error for User ${userId}:`, error);
        res.status(500).json({ success: false, message: error.message || 'Simulation request failed.' }); }
});

// handles confirmation of a bnpl order
app.post('/api/confirm_bnpl_order', authenticateUser, async (req, res) => {
    const userId = req.user.id; // authenticated user
    const { product, term, assessmentId } = req.body; // order details
    let connection = null; // db connection for transaction
    console.log(`\n Confirming BNPL order Request - User: ${userId}, Assessment ID: ${assessmentId}, Term: ${term}`);
    console.log('   Product Details Received:', JSON.stringify(product));
    // validate incoming data
    if (!product || typeof product !== 'object' || typeof product.numericPrice !== 'number' || isNaN(product.numericPrice) || product.numericPrice <= 0 || !product.title || typeof term !== 'number' || term <= 0) {
        console.error('   Order confirmation failed: Invalid input data provided.', { product, term, assessmentId });
        return res.status(400).json({ success: false, message: 'Missing or invalid order details (product price/title, term).' });
    }
    const orderAmount = Number(product.numericPrice); const selectedTerm = Number(term); // ensure numeric
    console.log(`   Validated Order Amount: ${orderAmount.toFixed(2)}, Term: ${selectedTerm} months`);

    try {
        connection = await dbPool.getConnection(); await connection.beginTransaction(); console.log('   DB Transaction Started for Order Confirmation.');
        // fetch user's credit details, locking the row
        const limitSql = 'SELECT current_credit_limit, used_credit_amount FROM users WHERE user_id = ? FOR UPDATE';
        const [limitResults] = await connection.query(limitSql, [userId]);
        if (limitResults.length === 0) { await connection.rollback(); throw new Error('User record not found for credit check.'); } // user must exist
        const userData = limitResults[0];
        const currentLimit = parseFloat(userData.current_credit_limit || 0); const usedAmount = parseFloat(userData.used_credit_amount || 0);
        const availableCredit = Math.max(0, currentLimit - usedAmount); // calculate available credit
        console.log(`   User Limit: ${currentLimit.toFixed(2)}, Used: ${usedAmount.toFixed(2)}, Available: ${availableCredit.toFixed(2)}`);
        // check if enough credit
        if (orderAmount > availableCredit) {
            await connection.rollback(); console.log('   DB Transaction Rolled Back (Insufficient Credit).');
            return res.status(400).json({ success: false, message: `Order amount (£${orderAmount.toFixed(2)}) exceeds your available credit (£${availableCredit.toFixed(2)}).`});
        }
        console.log('   Credit limit sufficient. Proceeding with order creation.');
        // calculate first due date (example: 2 months from now, 1st of month)
        const now = new Date(); let dueYear = now.getUTCFullYear(); let dueMonthJs = now.getUTCMonth() + 2; // month is 0-indexed, so +2 is two months ahead
        if (dueMonthJs > 11) { // if month overflows into next year (e.g. 12 becomes Jan of next year, 13 becomes Feb)
            dueYear += Math.floor(dueMonthJs / 12); // add full years
            dueMonthJs = dueMonthJs % 12; // get the month index for the new year
        }
        const firstDueDate = `${dueYear}-${String(dueMonthJs + 1).padStart(2, '0')}-01`; // month for display/SQL is 1-indexed
        console.log(`      Calculated First Due Date: ${firstDueDate}`);
        // prepare order data for insertion
        const orderData = { user_id: userId, assessment_id: assessmentId || null, product_title: product.title, product_price: orderAmount, loan_amnt: orderAmount, selected_term_months: selectedTerm, remaining_balance: orderAmount, order_status: 'ACTIVE', next_payment_due_date: firstDueDate, order_timestamp: new Date() };
        const orderSql = `INSERT INTO orders (user_id, assessment_id, product_title, product_price, loan_amnt, selected_term_months, remaining_balance, order_status, next_payment_due_date, order_timestamp) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
        const orderValues = [orderData.user_id, orderData.assessment_id, orderData.product_title, orderData.product_price, orderData.loan_amnt, orderData.selected_term_months, orderData.remaining_balance, orderData.order_status, orderData.next_payment_due_date, orderData.order_timestamp];
        const [orderResult] = await connection.query(orderSql, orderValues); const orderId = orderResult.insertId; // insert order
        console.log(`       BNPL Order (ID: ${orderId}) record created successfully.`);
        // update user's used credit amount
        const updateUsedAmountSql = 'UPDATE users SET used_credit_amount = used_credit_amount + ? WHERE user_id = ?';
        const [updateResult] = await connection.query(updateUsedAmountSql, [orderAmount.toFixed(2), userId]);
        if (updateResult.affectedRows === 0) { await connection.rollback(); throw new Error('Failed to update user credit usage. Order incomplete.'); }
        console.log(`       User ID ${userId} used_credit_amount updated (+${orderAmount.toFixed(2)}).`);
        await connection.commit(); console.log('   DB Transaction Committed Successfully for Order Confirmation.');
        res.status(201).json({ success: true, message: 'Order confirmed successfully!', orderId: orderId }); // send success
    } catch (error) {
        console.error(` Error confirming BNPL order for User ${userId}:`, error);
        if (connection) await connection.rollback().catch(rbErr => console.error('Rollback Error:', rbErr));
        let statusCode = 500; if (error.message.includes('User record not found')) statusCode = 404;
        const clientMessage = (process.env.NODE_ENV === 'production') ? 'Failed to process your order due to a server issue.' : error.message;
        res.status(statusCode).json({ success: false, message: clientMessage }); // send error
    } finally {
        if (connection) { // always release connection
            try { connection.release(); console.log('   DB Connection Released (Order Confirm).');}
            catch (e){ console.error('Error releasing connection (Order Confirm)', e)}
        }
    }
});

// fetches active (ongoing) orders for the authenticated user
app.get('/api/active_orders', authenticateUser, async (req, res) => {
    const userId = req.user.id; // authenticated user id
    console.log(`\n Fetching active orders request for User ID: ${userId}`);
    try {
        const sql = `SELECT order_id, product_title, loan_amnt, remaining_balance, selected_term_months, order_status, order_timestamp, next_payment_due_date FROM orders WHERE user_id = ? AND order_status = 'ACTIVE' ORDER BY order_timestamp DESC`;
        const [orders] = await dbPool.query(sql, [userId]); // execute query
        console.log(` Found ${orders.length} active orders for User ID: ${userId}`);
        const formatToIsoDate = (dateValue) => { // helper to format date strings
             if (!dateValue) return null; // handle null input
             try { const d = new Date(dateValue); if (isNaN(d.getTime())) return null; return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }
             catch (e) { console.warn(`Error formatting date ${dateValue}: ${e.message}`); return null; }
        };
        // map db rows to frontend-friendly format
        const formattedOrders = orders.map(order => ({
             order_id: order.order_id, product_title: order.product_title || 'N/A', selected_term_months: order.selected_term_months, order_status: order.order_status,
             loan_amount: parseFloat(order.loan_amnt || 0), remaining_balance: parseFloat(order.remaining_balance || 0),
             order_timestamp: formatToIsoDate(order.order_timestamp), next_payment_due_date: formatToIsoDate(order.next_payment_due_date)
        }));
        res.status(200).json({ success: true, activeOrders: formattedOrders }); // send formatted orders
    } catch (error) {
        console.error(` DB Error fetching active orders for User ${userId}:`, error);
        res.status(500).json({ success: false, message: 'Error retrieving your active orders.' });}
});

// gets the user's current self-set monthly spending limit and their overall assessed credit limit
app.get('/api/spending-limit', authenticateUser, async (req, res) => {
    const userId = req.user.id; // authenticated user id
    console.log(`\n Fetching spending limit for User ID: ${userId}`);
    try {
        const sql = 'SELECT current_credit_limit, monthly_spending_limit FROM users WHERE user_id = ?'; // query for limits
        const [userRows] = await dbPool.query(sql, [userId]); // execute query
        if (userRows.length === 0) { // if user not found
            return res.status(404).json({ success: false, message: 'User not found.' });
        }
        const userData = userRows[0]; // user data
        const overallCreditLimit = parseFloat(userData.current_credit_limit || 0); // overall assessed limit
        // monthly_spending_limit can be null in db if not set
        const currentSpendingLimit = userData.monthly_spending_limit !== null ? parseFloat(userData.monthly_spending_limit) : null;

        console.log(`   User ${userId}: Overall Credit Limit £${overallCreditLimit.toFixed(2)}, Current Spending Limit: ${currentSpendingLimit !== null ? `£${currentSpendingLimit.toFixed(2)}` : 'Not Set'}`);
        res.status(200).json({ // send response
            success: true,
            overallCreditLimit: overallCreditLimit.toFixed(2),
            currentSpendingLimit: currentSpendingLimit !== null ? currentSpendingLimit.toFixed(2) : null
        });

    } catch (error) {
        console.error(` Error fetching spending limit for User ${userId}:`, error);
        res.status(500).json({ success: false, message: 'Could not retrieve spending limit information.' });
    }
});


// --- ASSESSMENT HISTORY ENDPOINT ---
// fetches all past credit assessments for the authenticated user
app.get('/api/assessment_history', authenticateUser, async (req, res) => {
    const userId = req.user.id; // authenticated user id
    console.log(`\n Fetching assessment history for User ID: ${userId}`);
    try {
        // sql to select relevant fields from credit_assessments table for the user, ordered by most recent first
        const sql = `
            SELECT assessment_id, assessment_timestamp, risk_score, credit_tier, credit_limit, calculated_terms
            FROM credit_assessments
            WHERE user_id = ?
            ORDER BY assessment_timestamp DESC
        `;
        const [historyRows] = await dbPool.query(sql, [userId]); // execute the query

        // map the raw database rows to a format suitable for the frontend
        const formattedHistory = historyRows.map(row => {
            let termsArray = []; // default to empty array for 'calculated_terms'
            try {
                if (row.calculated_terms) { // only attempt to parse if 'calculated_terms' has a value
                    const parsedTerms = JSON.parse(row.calculated_terms); // parse the json string
                    if (Array.isArray(parsedTerms)) { // if parsing results in an array, use it
                        termsArray = parsedTerms;
                    } else { // if parsed but not array, log warning
                        console.warn(`User ${userId}, Assessment ${row.assessment_id}: 'calculated_terms' was not an array after parsing:`, row.calculated_terms);
                    }
                }
            } catch (e) { // if json parsing fails
                console.warn(`User ${userId}, Assessment ${row.assessment_id}: Error parsing 'calculated_terms' JSON string: '${row.calculated_terms}'. Error: ${e.message}`);
            }
            // return a new object with formatted/parsed values
            return {
                assessment_id: row.assessment_id,
                assessment_timestamp: row.assessment_timestamp,
                risk_score: row.risk_score !== null ? parseFloat(row.risk_score) : null, // ensure numeric or null
                credit_tier: row.credit_tier,
                credit_limit: parseFloat(row.credit_limit || 0), // ensure numeric
                calculated_terms: termsArray // use the parsed (or default empty) array
            };
        });

        console.log(`    Found ${formattedHistory.length} assessment records for User ${userId}.`);
        res.status(200).json({ success: true, history: formattedHistory }); // send history data to client

    } catch (error) {
        console.error(` DB Error fetching assessment history for User ${userId}:`, error.message, error.stack);
        res.status(500).json({ success: false, message: 'Error retrieving your assessment history.' });
    }
});

// sets or updates a user's self-defined monthly spending limit
app.post('/api/spending-limit', authenticateUser, async (req, res) => {
    const userId = req.user.id; // authenticated user id
    const { spendingLimit } = req.body; // new limit from request (can be a number or null)

    console.log(`\n⚙️ Setting spending limit for User ID: ${userId} to: ${spendingLimit === null ? 'NULL (Remove)' : `£${Number(spendingLimit).toFixed(2)}`}`);

    let newLimitValue = null; // default to null (meaning remove the limit)
    if (spendingLimit !== null) { // if a specific limit value is provided
        newLimitValue = parseFloat(spendingLimit); // parse to float
        if (isNaN(newLimitValue) || newLimitValue < 0) { // validate: must be non-negative number
            return res.status(400).json({ success: false, message: 'Invalid spending limit amount provided.' });
        }
    }

    try {
        // fetch the user's overall assessed credit limit for validation
        const [userRows] = await dbPool.query('SELECT current_credit_limit FROM users WHERE user_id = ?', [userId]);
        if (userRows.length === 0) return res.status(404).json({ success: false, message: 'User not found.' }); // user must exist
        const overallCreditLimit = parseFloat(userRows[0].current_credit_limit || 0); // user's total credit limit

        // new spending limit cannot exceed the user's overall assessed credit limit
        if (newLimitValue !== null && newLimitValue > overallCreditLimit) {
            return res.status(400).json({
                success: false,
                message: `Monthly spending limit (£${newLimitValue.toFixed(2)}) cannot exceed overall credit limit of £${overallCreditLimit.toFixed(2)}.`
            });
        }
        // sql to update the 'monthly_spending_limit' field
        const sql = 'UPDATE users SET monthly_spending_limit = ? WHERE user_id = ?';
        // execute update; if newlimitvalue is null, database field will be set to null
        const [updateResult] = await dbPool.query(sql, [newLimitValue !== null ? newLimitValue.toFixed(2) : null, userId]);

        if (updateResult.affectedRows === 0) { // should not happen if user was found above
            throw new Error('Failed to update spending limit. User may not exist or no change was needed.');
        }

        // create appropriate success message based on whether limit was set or removed
        const successMessage = newLimitValue !== null
            ? `Monthly spending limit successfully set to £${newLimitValue.toFixed(2)}.`
            : 'Monthly spending limit successfully removed.';
        console.log(`    User ${userId} monthly_spending_limit updated. ${successMessage}`);
        res.status(200).json({ // send success response
            success: true,
            message: successMessage,
            newSpendingLimit: newLimitValue !== null ? newLimitValue.toFixed(2) : null // return new limit as string or null
        });

    } catch (error) {
        console.error(` Error setting spending limit for User ${userId}:`, error);
        res.status(500).json({ success: false, message: error.message || 'Could not update spending limit.' });
    }
});

// processes a repayment made by a user for a specific bnpl order
app.post('/api/make_repayment', authenticateUser, async (req, res) => {
    const userId = req.user.id; // authenticated user id
    const { order_id, repayment_amount } = req.body; // order id and amount from request
    let connection = null; // database connection for transaction
    const orderIdInt = parseInt(order_id, 10); // ensure order id is an integer
    const amount = Number(repayment_amount); // ensure repayment amount is a number

    console.log(`\n Processing Repayment Request - OrderID: ${orderIdInt}, Amount: ${repayment_amount}, User: ${userId}`);
    // validate input: order id and amount must be positive numbers
    if (isNaN(orderIdInt) || orderIdInt <= 0 || isNaN(amount) || amount <= 0) {
        console.warn(`   Repayment Validation Failed: OrderID='${order_id}', Amount='${repayment_amount}'`);
        return res.status(400).json({ success: false, message: 'Invalid order ID or repayment amount.' });
    }
    console.log(`   Validated Repayment Amount: ${amount.toFixed(2)} for Order ID: ${orderIdInt}`);

    try {
        connection = await dbPool.getConnection(); await connection.beginTransaction(); // get connection and start transaction
        console.log('   Repayment DB Transaction Started.');

        // sql to fetch order details, locking the row for update
        const getOrderSql = 'SELECT user_id, remaining_balance, order_status, product_title FROM orders WHERE order_id = ? FOR UPDATE';
        // sql to fetch user's financial details, also locking for update
        const getUserSql = 'SELECT used_credit_amount, buffer_bag_balance FROM users WHERE user_id = ? FOR UPDATE';

        // execute both queries concurrently
        const [orderQueryResults, userQueryResults] = await Promise.all([
            connection.query(getOrderSql, [orderIdInt]),
            connection.query(getUserSql, [userId])
        ]);

        const orderRows = orderQueryResults[0]; // actual array of rows for the order query
        const userRows = userQueryResults[0];   // actual array of rows for the user query
        const order = orderRows.length > 0 ? orderRows[0] : null; // get the first order object, or null
        const user = userRows.length > 0 ? userRows[0] : null;   // get the first user object, or null

        // --- validation checks before proceeding ---
        if (!order) { // order must exist
            console.error(`   Repayment Error: Order with ID ${orderIdInt} not found in the database.`);
            throw new Error(`Order ID ${orderIdInt} not found. Cannot process repayment.`);
        }
        console.log('   Order Data Found:', order); // log found order data

        if (!user) { // user must exist
            console.error(`   Repayment Error: User with ID ${userId} (from token) not found in the database.`);
            throw new Error(`User ID ${userId} not found for repayment. User may not exist.`);
        }
        console.log('   User Data Found:', user); // log found user data

        // crucial security check: ensure the authenticated user owns this order
        console.log('      OWNERSHIP CHECK: Comparing Order User ID with Token User ID');
        console.log(`      OWNERSHIP CHECK: order.user_id (from DB): '${order.user_id}' (type: ${typeof order.user_id})`);
        console.log(`      OWNERSHIP CHECK: userId (from token): '${userId}' (type: ${typeof userId})`);

        const orderUserIdAsNumber = Number(order.user_id); // convert order's user id to number
        const tokenUserIdAsNumber = Number(userId); // ensure token user id is treated as number

        if (orderUserIdAsNumber !== tokenUserIdAsNumber) { // compare ids
            console.error(`      AUTHORIZATION FAILED: Order User ID (${orderUserIdAsNumber}) does not match Token User ID (${tokenUserIdAsNumber}).`);
            throw new Error('Authorization failed: User does not own this order.');
        }
        console.log('      -> Authorization Check Passed.');

        // check if order is 'active' and eligible for repayment
        if (order.order_status !== 'ACTIVE') {
            console.warn(`   Repayment Attempt on Non-Active Order: Order ID ${orderIdInt}, Status: ${order.order_status}`);
            throw new Error(`Cannot repay order with status ${order.order_status}.`);
        }
        console.log('      -> Order Status Check Passed.');

        const currentBalance = parseFloat(order.remaining_balance); // current remaining balance of the order
        if (isNaN(currentBalance)) { // balance must be a number
             console.error(`   Repayment Error: remaining_balance for order ${orderIdInt} is not a valid number: '${order.remaining_balance}'`);
             throw new Error('Error reading order balance. Please contact support.');
        }

        const epsilon = 0.001; // small tolerance for floating point comparisons
        // repayment amount cannot exceed the remaining balance (plus small epsilon)
        if (amount > currentBalance + epsilon) {
            console.warn(`   Repayment Amount Exceeds Balance: Amount £${amount.toFixed(2)}, Balance £${currentBalance.toFixed(2)}`);
            throw new Error(`Payment amount (£${amount.toFixed(2)}) exceeds remaining balance (£${currentBalance.toFixed(2)}).`);
        }
        console.log('      -> Amount Check Passed.');
        // --- end validation checks ---

        console.log('*** Simulating external payment processing gateway call... SUCCEEDED. ***');

        console.log('   Performing Database Updates within Transaction...');
        // log the repayment itself as a transaction record
        const repayDesc = `BNPL Repayment for Order #${orderIdInt} (${order.product_title || 'N/A'})`;
        const repayTxSql = `INSERT INTO transactions (user_id, transaction_type, amount, transaction_status, description, is_buffer_transaction, transaction_date) VALUES (?, ?, ?, ?, ?, ?, NOW())`;
        const [repayTransResult] = await connection.query(repayTxSql, [userId, 'REPAYMENT', amount, 'Completed', repayDesc, 0]);
        console.log(`         -> Repayment Transaction logged (ID: ${repayTransResult.insertId})`);

        // update the order's remaining balance and status
        const newBalance = currentBalance - amount; // calculate new balance
        const newStatus = (newBalance <= epsilon) ? 'PAID_OFF' : 'ACTIVE'; // if balance near zero, mark as paid
        await connection.query('UPDATE orders SET remaining_balance = ?, order_status = ? WHERE order_id = ?', [newBalance.toFixed(2), newStatus, orderIdInt]);
        console.log(`         -> Order ${orderIdInt} updated. New Bal: ${newBalance.toFixed(2)}, Status: ${newStatus}`);

        // update the user's total 'used_credit_amount'
        const currentUsedAmountDB = parseFloat(user.used_credit_amount);
        const validUsedAmount = isNaN(currentUsedAmountDB) ? 0 : currentUsedAmountDB; // handle nan
        const amountToDecrease = Math.min(amount, validUsedAmount); // prevent reducing below zero
        await connection.query('UPDATE users SET used_credit_amount = GREATEST(0, used_credit_amount - ?) WHERE user_id = ?', [amountToDecrease.toFixed(2), userId]);
        console.log(`         -> User ${userId} used_credit_amount updated by -${amountToDecrease.toFixed(2)}. Previous DB used amount was ~£${validUsedAmount.toFixed(2)}`);

        // process buffer bag contribution
        const bufferContribution = parseFloat((amount * BUFFER_CONTRIBUTION_PERCENTAGE).toFixed(2));
        console.log(`      BUFFER CONTRIBUTION: £${bufferContribution.toFixed(2)} from repayment of £${amount.toFixed(2)}`);
        if (bufferContribution > 0) { // only if contribution positive
            const bufferDesc = `Buffer Bag contribution from Order #${orderIdInt} repayment`;
            const bufferTxSql = `INSERT INTO transactions (user_id, transaction_type, amount, transaction_status, description, is_buffer_transaction, transaction_date) VALUES (?, ?, ?, ?, ?, ?, NOW())`;
            const [bufferTransResult] = await connection.query(bufferTxSql, [userId, 'BUFFER_CONTRIBUTION', bufferContribution, 'Completed', bufferDesc, 1]);
            console.log(`            -> Buffer Transaction Logged (ID: ${bufferTransResult.insertId})`);

            await connection.query('UPDATE users SET buffer_bag_balance = buffer_bag_balance + ? WHERE user_id = ?', [bufferContribution.toFixed(2), userId]);
            const currentBufferBalanceDB = parseFloat(user.buffer_bag_balance);
            const validBufferBalance = isNaN(currentBufferBalanceDB) ? 0 : currentBufferBalanceDB; // handle nan
            const newBufferBalanceTotal = (validBufferBalance + bufferContribution).toFixed(2);
            console.log(`            -> User ${userId} buffer_bag_balance updated. Previous DB buffer ~£${validBufferBalance.toFixed(2)}. New total buffer ~£${newBufferBalanceTotal}`);
        } else {
            console.log(`         Skipping buffer contribution (calculated contribution is £${bufferContribution.toFixed(2)}).`);
        }
        // ---- end of database updates ----

        await connection.commit(); // commit all changes
        console.log('    Repayment DB Transaction Committed Successfully.');
        res.status(200).json({ success: true, message: 'Repayment successful!', new_balance: newBalance.toFixed(2), order_status: newStatus, buffer_contribution_added: bufferContribution.toFixed(2) });
    } catch (error) {
        console.error(` Error processing repayment for Order ${orderIdInt || order_id}, User ${userId}:`, error.message, error.stack ? `\nStack: ${error.stack}` : '');
        if (connection) { // if transaction started, rollback
            await connection.rollback().catch(rbErr => console.error('   Rollback Error during catch:', rbErr));
        }
        let statusCode = 500; // default error status
        // set specific status codes
        if (error.message.includes('not found')) statusCode = 404;
        else if (error.message.includes('Authorization failed')) statusCode = 403;
        else if (error.message.includes('Invalid') || error.message.includes('exceeds') || error.message.includes('status is')) statusCode = 400;
        else if (error.message.includes('Error reading order balance')) statusCode = 500;

        res.status(statusCode).json({ success: false, message: error.message || 'Failed to process repayment.' });
    } finally {
        if (connection) { // always release connection
            try {
                connection.release();
                console.log('   DB Connection Released (Repayment).');
            } catch (e) {
                console.error('   Error releasing connection (Repayment):', e);
            }
        }
    }
});

// gets the authenticated user's current credit entitlements and available credit
app.get('/api/current_entitlements', authenticateUser, async (req, res) => {
    const userId = req.user.id; // authenticated user id
    console.log(`\n⚙️ Fetching current entitlements & available credit for User: ${userId}`);
    try {
        // sql to get latest formal assessment
        const assessmentSql = `SELECT assessment_id, credit_tier, credit_limit, calculated_terms FROM credit_assessments WHERE user_id = ? ORDER BY assessment_timestamp DESC LIMIT 1`;
        // sql to get current credit figures from users table
        const userCreditSql = `SELECT current_credit_limit, used_credit_amount FROM users WHERE user_id = ?`;
        const [[latestAssessment], [userCreditData]] = await Promise.all([ dbPool.query(assessmentSql, [userId]), dbPool.query(userCreditSql, [userId]) ]); // execute concurrently
        if (!userCreditData) {
            console.error(`Critical Error: User ${userId} not found.`); return res.status(404).json({ success: false, message: 'User not found.' }); }
        // use limits from users table as source of truth
        const currentUsedAmount = parseFloat(userCreditData.used_credit_amount || 0);
        const currentLimit = parseFloat(userCreditData.current_credit_limit || 0);
        if (!latestAssessment) { // if no formal assessment yet
            const availableCredit = Math.max(0, currentLimit - currentUsedAmount);
            return res.status(200).json({ success: true, entitlements: { status: 'unassessed', tier: null, limit: currentLimit, terms: [], assessmentId: null, used_credit_amount: currentUsedAmount, available_credit: availableCredit }});
        }
        console.log(` Found latest assessment (ID: ${latestAssessment.assessment_id}) for User: ${userId}`);
        let terms = []; // default to empty array for terms
        try {
            terms = JSON.parse(latestAssessment.calculated_terms || '[]'); // parse terms string
            if (!Array.isArray(terms)) terms = []; // ensure array
        } catch (e) {
            console.warn(`Error parsing terms for assessment ${latestAssessment.assessment_id}:`, e.message); terms = []; }
        const availableCredit = Math.max(0, currentLimit - currentUsedAmount); // calculate available credit
        console.log(`   User ${userId}: Limit=${currentLimit.toFixed(2)}, Used=${currentUsedAmount.toFixed(2)}, Avail=${availableCredit.toFixed(2)}`);
        res.status(200).json({ success: true, entitlements: { status: 'assessed', tier: latestAssessment.credit_tier, limit: currentLimit, terms: terms, assessmentId: latestAssessment.assessment_id, used_credit_amount: currentUsedAmount, available_credit: availableCredit }});
    } catch (error) {
        console.error(` DB Error fetching entitlements/credit for User ${userId}:`, error);
        res.status(500).json({ success: false, message: 'Error retrieving your credit information.' });}
});

// --- BUFFER BAG ENDPOINTS ---
// fetches the current balance of the user's buffer bag
app.get('/api/buffer/balance', authenticateUser, async (req, res) => {
    const userId = req.user.id; // authenticated user id
    console.log(`\n Fetching buffer balance for User ID: ${userId}`);
    try {
        const sql = 'SELECT buffer_bag_balance FROM users WHERE user_id = ?'; // sql to get balance
        console.log(`   Executing SQL for buffer balance: ${sql} with User ID: ${userId}`);
        const [results] = await dbPool.query(sql, [userId]); // execute query
        console.log(`   SQL Query for buffer balance executed. Results length: ${results.length}`);
        if (results.length === 0) { // if user not found
            console.warn(`   User ID ${userId} not found for buffer balance.`);
            return res.status(404).json({ success: false, message: 'User not found.' });
        }
        const rawBalanceFromDB = results[0].buffer_bag_balance; // raw balance from db
        console.log(`   Raw balance from DB for User ${userId}: '${rawBalanceFromDB}'`);
        let numericBalance = parseFloat(rawBalanceFromDB); // parse to float
        console.log(`   After parseFloat, numericBalance is: ${numericBalance}, type: ${typeof numericBalance}`);
        if (isNaN(numericBalance)) { // if parsing fails
            console.warn(`   User ${userId}'s buffer_bag_balance ('${rawBalanceFromDB}') was not a valid number or was null/empty. Defaulting to 0.00.`);
            numericBalance = 0.00; // default to zero
        }
        console.log(`   Before toFixed, numericBalance is: ${numericBalance}`);
        const formattedBalance = numericBalance.toFixed(2); // format to 2 decimal places
        console.log(`   After toFixed, formattedBalance is: ${formattedBalance}`);
        console.log(`Server: About to send success response for GET buffer balance for User ${userId}. Balance: £${formattedBalance}`);
        res.status(200).json({ success: true, balance: formattedBalance }); // send success
        console.log(`Server: GET Buffer balance response SENT for User ${userId}.`);
        return; // explicitly stop execution
    } catch (error) {
        console.error(` Error fetching buffer balance for User ${userId}:`, error.message, error.stack);
        if (!res.headersSent) { res.status(500).json({ success: false, message: 'Could not retrieve buffer balance due to a server issue.' });}
        return; // stop execution
    }
});

// handles a deposit into the user's buffer bag
app.post('/api/buffer/deposit', authenticateUser, async (req, res) => {
    const userId = req.user.id; const { amount } = req.body; // user id and deposit amount
    console.log(`\n Processing Buffer Deposit Request - User: ${userId}, Amount: ${amount}`);
    const depositAmount = parseFloat(amount); // parse to float
    if (isNaN(depositAmount) || depositAmount <= 0) { // validate amount
        console.warn(`   Deposit validation failed: Invalid amount ('${amount}')`);
        return res.status(400).json({ success: false, message: 'Invalid deposit amount provided.' });
    }
    let connection; // db connection for transaction
    try {
        connection = await dbPool.getConnection(); await connection.beginTransaction(); console.log('   Buffer Deposit DB Transaction Started.');
        // update user's buffer balance
        const [updateResult] = await connection.query('UPDATE users SET buffer_bag_balance = buffer_bag_balance + ? WHERE user_id = ?', [depositAmount.toFixed(2), userId]);
        if (updateResult.affectedRows === 0) throw new Error('User not found or balance update failed for deposit.');
        console.log(`      User ${userId} buffer_bag_balance updated by +${depositAmount.toFixed(2)}`);
        // log the deposit as a transaction
        const depositDesc = 'Manual buffer bag deposit.';
        const [transResult] = await connection.query(`INSERT INTO transactions (user_id, transaction_type, amount, transaction_status, description, is_buffer_transaction, transaction_date) VALUES (?, ?, ?, ?, ?, ?, NOW())`, [userId, 'BUFFER_DEPOSIT', depositAmount.toFixed(2), 'Completed', depositDesc, 1]);
        console.log(`      Buffer Deposit Transaction logged (ID: ${transResult.insertId})`);
        await connection.commit(); console.log('    Buffer Deposit DB Transaction Committed.');
        // get new balance to return to client
        const [balanceResult] = await dbPool.query('SELECT buffer_bag_balance FROM users WHERE user_id = ?', [userId]);
        const newBalance = parseFloat(balanceResult[0]?.buffer_bag_balance || 0).toFixed(2);
        res.status(200).json({ success: true, message: `Successfully deposited £${depositAmount.toFixed(2)}.`, new_balance: newBalance });
    } catch (error) {
        console.error(` Error processing buffer deposit for User ${userId}:`, error);
        if (connection) await connection.rollback().catch(rbErr => console.error('Rollback Error:', rbErr));
        res.status(500).json({ success: false, message: error.message || 'Failed to process deposit.' });
    } finally {
        if (connection) { // always release connection
            try {
                connection.release();
                console.log('   DB Connection Released (Deposit).');
            } catch (releaseErr) {
                console.error('   Error releasing DB connection (deposit):', releaseErr);
            }
        }
    }
});

// handles a withdrawal from the user's buffer bag
app.post('/api/buffer/withdraw', authenticateUser, async (req, res) => {
    const userId = req.user.id; const { amount } = req.body; // user id and withdrawal amount
    console.log(`\n Processing Buffer Withdrawal Request - User: ${userId}, Amount: ${amount}`);
    const withdrawAmount = parseFloat(amount); // parse to float
    if (isNaN(withdrawAmount) || withdrawAmount <= 0) { // validate amount
        console.warn(`   Withdrawal validation failed: Invalid amount ('${amount}')`);
        return res.status(400).json({ success: false, message: 'Invalid withdrawal amount.' });
    }
    let connection; // db connection for transaction
    try {
        connection = await dbPool.getConnection(); await connection.beginTransaction(); console.log('   Buffer Withdrawal DB Transaction Started.');
        // get current balance, locking row
        const [userRows] = await connection.query('SELECT buffer_bag_balance FROM users WHERE user_id = ? FOR UPDATE', [userId]);
        if (userRows.length === 0) throw new Error('User not found for withdrawal.'); // user must exist

        const currentBalance = parseFloat(userRows[0].buffer_bag_balance || 0); // get current balance
        // check if withdrawal amount exceeds balance
        if (withdrawAmount > currentBalance) {
            await connection.commit(); // commit to release lock
            return res.status(400).json({ success: false, message: 'Withdrawal amount exceeds buffer balance.' });
        }
        // update user's buffer balance
        const [updateResult] = await connection.query('UPDATE users SET buffer_bag_balance = buffer_bag_balance - ? WHERE user_id = ?', [withdrawAmount.toFixed(2), userId]);
        if (updateResult.affectedRows === 0) throw new Error('Balance update failed during withdrawal.');
        console.log(`      User ${userId} buffer_bag_balance updated by -${withdrawAmount.toFixed(2)}`);
        // log the withdrawal as a transaction
        const withdrawDesc = 'Manual buffer bag withdrawal.';
        const [transResult] = await connection.query(`INSERT INTO transactions (user_id, transaction_type, amount, transaction_status, description, is_buffer_transaction, transaction_date) VALUES (?, ?, ?, ?, ?, ?, NOW())`, [userId, 'BUFFER_WITHDRAWAL', withdrawAmount.toFixed(2), 'Completed', withdrawDesc, 1]);
        console.log(`      Buffer Withdrawal Transaction logged (ID: ${transResult.insertId})`);
        await connection.commit(); console.log('    Buffer Withdrawal DB Transaction Committed.');
        const newBalance = (currentBalance - withdrawAmount).toFixed(2); // calculate new balance
        res.status(200).json({ success: true, message: `Successfully withdrew £${withdrawAmount.toFixed(2)}.`, new_balance: newBalance });
    } catch (error) {
        console.error(` Error processing buffer withdrawal for User ${userId}:`, error);
        if (connection) await connection.rollback().catch(rbErr => console.error('Rollback Error:', rbErr));
        res.status(500).json({ success: false, message: error.message || 'Failed to process withdrawal.' });
    } finally {
        if (connection) { // always release connection
            try {
                connection.release();
                console.log('   DB Connection Released (Withdraw).');
            } catch (releaseErr) {
                console.error('   Error releasing DB connection (withdraw):', releaseErr);
            }
        }
    }
});
// --- --------------------- ---

// test route for checking authentication status
app.get('/api/test-auth', authenticateUser, (req, res) => {
    res.json({ success: true, message: `Auth OK for user ID: ${req.user.id}, Email: ${req.user.email}`});
});

// generic error handler for unhandled errors
app.use((err, req, res, next) => {
  console.error('Unhandled Express Error:', err.stack || err); // log full error
  const message = (process.env.NODE_ENV === 'production' && !err.status) ? 'An unexpected internal server error occurred.' : err.message || 'Unknown server error';
  const statusCode = typeof err.status === 'number' ? err.status : 500; // use error status or default
  if (res.headersSent) return next(err); // if response already started, pass to express default
  res.status(statusCode).json({ success: false, message: message }); // send json error
});

// catch-all for 404 not found routes
app.use((req, res, next) => {
  res.status(404).json({ success: false, message: `Endpoint not found: ${req.method} ${req.originalUrl}` });
});

// starts the server
app.listen(PORT, () => {
    console.log(`\n Server is running on port ${PORT}`);
    console.log('--------------------------------------------------');
    console.log(` Plaid Environment:     ${plaidEnv}`);
    console.log(` Python Prediction URL: ${PYTHON_PREDICTION_URL || 'NOT SET! - Assessment endpoints require this.'}`);
    console.log(` JWT Secret Loaded:     ${JWT_SECRET ? 'Yes' : 'NO! - Authentication will fail.'}`);
    console.log(` Buffer Contribution:   ${(BUFFER_CONTRIBUTION_PERCENTAGE * 100).toFixed(1)}% of repayment amount`);
    console.log('--------------------------------------------------');
});