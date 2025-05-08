// --- Core Dependencies ---
import express from 'express';
import mysql from 'mysql2/promise'; // Using promise version
import cors from 'cors';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv'; // Load .env file variables FIRST
import { Configuration, PlaidApi, PlaidEnvironments } from 'plaid';
import fetch from 'node-fetch';
// --- -------------------- ---


// --- Environment Variable Checks & Setup ---
dotenv.config(); // Ensure this is called before accessing process.env
const PORT = process.env.PORT || 5000;
const PYTHON_PREDICTION_URL = process.env.PYTHON_PREDICTION_SERVICE_URL;
const JWT_SECRET = process.env.JWT_SECRET;
const PLAID_CLIENT_ID = process.env.PLAID_CLIENT_ID;
const PLAID_SECRET_SANDBOX = process.env.PLAID_SECRET_SANDBOX;
const BUFFER_CONTRIBUTION_PERCENTAGE = parseFloat(process.env.BUFFER_CONTRIBUTION_PERCENTAGE || 0.02); // Default to 2%


// Critical startup checks
if (!JWT_SECRET) { console.error("FATAL ERROR: JWT_SECRET not defined in .env file."); process.exit(1); }
if (!PLAID_CLIENT_ID || !PLAID_SECRET_SANDBOX) { console.error("FATAL ERROR: Plaid Client ID or Sandbox Secret not defined in .env."); process.exit(1); }
if (!PYTHON_PREDICTION_URL) { console.error("CRITICAL WARNING: PYTHON_PREDICTION_SERVICE_URL not set. Assessment endpoint WILL FAIL."); }
if (!process.env.DB_PASSWORD) { console.warn("WARNING: DB_PASSWORD not set in .env.");}
console.log(`Buffer Contribution Percentage set to: ${(BUFFER_CONTRIBUTION_PERCENTAGE * 100).toFixed(1)}%`);
// --- ----------------------------------- ---

const app = express();

// Middleware
app.use(cors());
app.use(express.json()); // Parse JSON request bodies

// --- Plaid Client Configuration ---
let plaidEnv = PlaidEnvironments.sandbox;
let plaidSecret = PLAID_SECRET_SANDBOX;
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
    dbPool = mysql.createPool({ // Not awaiting here, createPool is synchronous
        connectionLimit: 10,
        host: process.env.DB_HOST || 'localhost',
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME || 'dpp_db',
        waitForConnections: true,
        queueLimit: 0
    });

    // Test connection (async)
    dbPool.getConnection()
        .then(connection => {
            console.log('✅ MySQL Pool connected successfully!');
            connection.release();
        })
        .catch(err => {
            console.error('❌ MySQL Pool initial connection error:', err);
            process.exit(1);
        });
} catch (err) {
     console.error('❌ Failed to create MySQL Pool:', err);
     process.exit(1);
}
// --- --------------------- ---

// --- HELPER FUNCTIONS ---
const isValidPassword = (password) => {
    if (!password) return false;
    const passwordRegex = /^(?=.*\d.*\d)(?=.*[!@#$%^&*]).{8,}$/;
    return passwordRegex.test(password);
};

const formatDate = (date) => {
    if (!date || typeof date !== 'string') return null;
    if (/^\d{4}-\d{2}-\d{2}$/.test(date)) { return date; }
    else if (/^\d{2}-\d{2}-\d{4}$/.test(date)) { const [day, month, year] = date.split('-'); return `${year}-${month}-${day}`; }
    else { console.warn(`Invalid date format passed to formatDate: ${date}.`); return null; }
};

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

function mapScoreAndApplyAdjustments(riskScore, defaultFlag, employmentStatusDB, utilizationRatioRaw) {
    console.log(`   Inputs - Score: ${riskScore?.toFixed(4)}, Default: ${defaultFlag}, EmpStatus: ${employmentStatusDB}, UtilRatio: ${utilizationRatioRaw}`);
    let baseTier, baseLimit, baseTerms;
    let finalLimit;
    const adjustments = [];
    const defaultFlagIsY = (defaultFlag === 'Y');

    if (riskScore === null || typeof riskScore !== 'number' || isNaN(riskScore)) {
        console.error("Mapping failed: Invalid risk score input:", riskScore);
        baseTier = 7; baseLimit = 150.00; baseTerms = [3];
        return { tier: baseTier, limit: baseLimit, terms: baseTerms, error: "Invalid score" };
    }

    const TIER1_MAX = 0.14, TIER2_MAX = 0.28, TIER3_MAX = 0.42, TIER4_MAX = 0.56, TIER5_MAX = 0.70, TIER6_MAX = 0.84;
    if (riskScore < TIER1_MAX)       { baseTier = 1; baseLimit = 2500.00; baseTerms = [3, 6, 12]; }
    else if (riskScore < TIER2_MAX) { baseTier = 2; baseLimit = 1750.00; baseTerms = [3, 6, 12]; }
    else if (riskScore < TIER3_MAX) { baseTier = 3; baseLimit = 1250.00; baseTerms = [3, 6]; }
    else if (riskScore < TIER4_MAX) { baseTier = 4; baseLimit = 800.00;  baseTerms = [3, 6]; }
    else if (riskScore < TIER5_MAX) { baseTier = 5; baseLimit = 500.00;  baseTerms = [3]; }
    else if (riskScore < TIER6_MAX) { baseTier = 6; baseLimit = 300.00;  baseTerms = [3]; }
    else                              { baseTier = 7; baseLimit = 150.00;  baseTerms = [3]; }
    console.log(`   -> Base Entitlements: Tier ${baseTier}, Limit ${baseLimit.toFixed(2)}, Terms [${baseTerms.join(',')}]`);
    finalLimit = baseLimit;

    if (defaultFlagIsY) { finalLimit *= 0.75; adjustments.push(`Default Flag (-25%)`); }
    const empStatusUpper = String(employmentStatusDB || '').toUpperCase();
    const isUnemployedOrOther = !['EMPLOYED', 'SELF_EMPLOYED'].includes(empStatusUpper);
    if (isUnemployedOrOther) {
        let reductionPercent = 0.20;
        if (baseTier >= 6) { reductionPercent += 0.10; adjustments.push(`Employment (${empStatusUpper}) & High Risk Penalty (-${(reductionPercent * 100).toFixed(0)}%)`); }
        else { adjustments.push(`Employment (${empStatusUpper}) Penalty (-${(reductionPercent * 100).toFixed(0)}%)`); }
        finalLimit *= (1 - reductionPercent);
    }
    const HIGH_UTIL_THRESHOLD = 0.70; const utilization = isNaN(Number(utilizationRatioRaw)) ? 0 : Number(utilizationRatioRaw);
    if (utilization > HIGH_UTIL_THRESHOLD) {
        if (defaultFlagIsY) { finalLimit *= 0.85; adjustments.push(`High Util & Default (-15%)`); }
        else { const MAX_LIMIT_CAP = 3000.00; finalLimit = Math.min(finalLimit * 1.20, MAX_LIMIT_CAP); adjustments.push(finalLimit === MAX_LIMIT_CAP ? `High Util Bonus (Hit Cap)` : `High Util Bonus (+20%)`);}
    }
    const MINIMUM_LIMIT = 50.00; if (finalLimit < MINIMUM_LIMIT) { finalLimit = MINIMUM_LIMIT; adjustments.push(`Limit adjusted to Min (${MINIMUM_LIMIT.toFixed(2)})`); }
    console.log(`   Adjustments Applied: ${adjustments.length > 0 ? adjustments.join('; ') : 'None'}`);
    console.log(`   -> Final Entitlements: Tier ${baseTier}, Limit ${finalLimit.toFixed(2)}, Terms [${baseTerms.join(',')}]`);
    return { tier: baseTier, limit: parseFloat(finalLimit.toFixed(2)), terms: baseTerms, error: null };
}

function mapEmploymentStatus(dbStatus) {
    if (!dbStatus) return 'No'; const statusUpper = String(dbStatus).toUpperCase();
    if (statusUpper === 'EMPLOYED') return 'Yes'; if (statusUpper === 'SELF_EMPLOYED') return 'Self-Employed'; return 'No';
}

function calculate_util_ratio(plaidAuthData, plaidLiabilitiesData, historicalRatio) {
    console.log("  -> Calculating Util Ratio (SIMULATED - Using Fallback)...");
    const fallbackRatio = (historicalRatio !== null && !isNaN(Number(historicalRatio))) ? Number(historicalRatio) : 0.1;
    console.log(`     Util Ratio (DB based): ${fallbackRatio.toFixed(4)}`);
    return fallbackRatio;
}

function calculate_payment_history(plaidTransactions, userData, historicalScore) {
    console.log("  -> Calculating Payment History Score (SIMULATED - Using DB)...");
    try {
        const baseScore = (historicalScore !== null && !isNaN(Number(historicalScore))) ? Number(historicalScore) : 500;
        let score = baseScore; const maxScore = 1000, minScore = 0;
        if (userData?.cb_person_default_on_file === 'Y') { score -= 100; console.log(`     Penalty for default flag.`); }
        score = Math.max(minScore, Math.min(maxScore, score));
        console.log(`     History Score (DB based): ${Math.round(score)}`); return Math.round(score);
    } catch (e) { console.error(" Error calculating payment history (DB):", e); return 500; }
}

function calculate_lpi(loan_amnt, person_income) {
    const incomeNum = Number(person_income); const loanNum = Number(loan_amnt);
    if (!isNaN(incomeNum) && incomeNum > 0 && !isNaN(loanNum) && loanNum >= 0) return loanNum / incomeNum;
    console.warn(`     Could not calculate LPI. Loan: ${loan_amnt}, Income: ${person_income}`); return null;
}
// --- ------------------------------------------------------------------------- ---

// === ROUTES ===

app.post('/register', async (req, res) => {
    const { first_name, surname, email, password, phone_number, ni_number, date_of_birth } = req.body;
    if (!first_name || !surname || !email || !password || !date_of_birth) return res.status(400).json({ success: false, message: 'Missing required fields.' });
    if (!/\S+@\S+\.\S+/.test(email)) return res.status(400).json({ success: false, message: 'Invalid email format.' });
    const formattedDOB = formatDate(date_of_birth);
    if (!formattedDOB && date_of_birth) return res.status(400).json({ success: false, message: 'Invalid date format (YYYY-MM-DD required).' });
    if (!formattedDOB) return res.status(400).json({ success: false, message: 'Date of birth is required (YYYY-MM-DD).' });

    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        const newUser = {
            first_name, surname, email, password: hashedPassword,
            phone_number: phone_number || null, ni_number: ni_number || null, date_of_birth: formattedDOB,
            cb_person_default_on_file: 'N', cb_person_cred_hist_length: 0,
            current_credit_limit: 0.00, used_credit_amount: 0.00, buffer_bag_balance: 0.00
        };
        const sql = `INSERT INTO users (first_name, surname, email, password, phone_number, ni_number, date_of_birth, cb_person_default_on_file, cb_person_cred_hist_length, current_credit_limit, used_credit_amount, buffer_bag_balance) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
        const values = [
            newUser.first_name, newUser.surname, newUser.email, newUser.password,
            newUser.phone_number, newUser.ni_number, newUser.date_of_birth,
            newUser.cb_person_default_on_file, newUser.cb_person_cred_hist_length,
            newUser.current_credit_limit, newUser.used_credit_amount, newUser.buffer_bag_balance
        ];
        const [result] = await dbPool.query(sql, values);
        console.log(`✅ User Registered: ${email} (ID: ${result.insertId})`);
        res.status(201).json({ success: true, message: 'Registration successful!' });
    } catch (error) {
        console.error('❌ Registration Server Error:', error);
        if (error.code === 'ER_DUP_ENTRY') return res.status(409).json({ success: false, message: 'Email already registered.' });
        console.error(`Unexpected DB error during registration for ${email}:`, error);
        res.status(500).json({ success: false, message: 'Registration failed due to a server issue.' });
    }
});

app.post('/login', async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ success: false, message: 'Email and Password are required.' });
    try {
        const sql = 'SELECT user_id, email, password FROM users WHERE email = ? LIMIT 1';
        const [results] = await dbPool.query(sql, [email]);
        if (results.length === 0) { console.log(`Login fail: Email not found - ${email}`); return res.status(401).json({ success: false, message: 'Invalid email or password.' }); }
        const user = results[0];
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) { console.log(`Login fail: Password mismatch - User ID ${user.user_id}`); return res.status(401).json({ success: false, message: 'Invalid email or password.' }); }
        const payload = { id: user.user_id, email: user.email };
        const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '8h' });
        console.log(`✅ User Logged In: ${user.email} (ID: ${user.user_id})`);
        res.status(200).json({ success: true, message: 'Login successful!', token: token });
    } catch (error) {
        console.error('❌ Login Server Error:', error);
        res.status(500).json({ success: false, message: 'Login failed due to a server issue.' });
    }
});

app.post('/api/create_link_token', authenticateUser, async (req, res) => {
    const userId = req.user.id; console.log(`⚙️ Creating Plaid link token request for User: ${userId}`);
    const request = { user: { client_user_id: userId.toString() }, client_name: 'DPP Finance Demo', language: 'en', products: ['auth', 'transactions', 'identity', 'liabilities'], country_codes: ['GB'] };
    try { const response = await plaidClient.linkTokenCreate(request); res.json({ link_token: response.data.link_token, success: true }); }
    catch (error) { console.error('❌ Plaid link token creation error:', error.response?.data || error.message); res.status(500).json({ success: false, message: 'Could not create Plaid link token.' }); }
});

app.post('/api/exchange_public_token', authenticateUser, async (req, res) => {
    const userId = req.user.id; const { public_token: publicToken } = req.body;
    if (!publicToken || typeof publicToken !== 'string') return res.status(400).json({ success: false, message: 'Public token is required.' });
    console.log(`⚙️ Exchanging public token request (Simulated storage) User: ${userId}`);
    const fakeAccessToken = `simulated-access-${userId}-${Date.now()}`; const fakeItemId = `simulated-item-${userId}`;
    try {
        const sql = 'UPDATE users SET plaid_access_token = ?, plaid_item_id = ? WHERE user_id = ?';
        const [result] = await dbPool.query(sql, [fakeAccessToken, fakeItemId, userId]);
        if (result.affectedRows === 0) { console.warn(`Attempted to store simulated Plaid tokens for non-existent User ID: ${userId}`); return res.status(404).json({ success: false, message: 'User not found.' }); }
        console.log(`✅ SIMULATED Plaid tokens stored in DB for User ID: ${userId}`);
        res.json({ success: true, message: 'Bank account linked (Simulated successful exchange and storage).' });
    } catch (dbError) { console.error(`❌ DB Error storing simulated Plaid tokens for User ID ${userId}:`, dbError); res.status(500).json({ success: false, message: 'Database error during simulated token storage.' }); }
});

// --- MAIN Credit Assessment Endpoint ---
app.post('/api/assess_credit', authenticateUser, async (req, res) => {
    const userId = req.user.id;
    console.log(`\n⚙️ Starting Credit Assessment (SIMULATION MODE) for User: ${userId}`);
    const { requested_loan_amount = null, requested_loan_term = null } = req.body;
    console.log(`   Requested Loan Amount: ${requested_loan_amount}, Term: ${requested_loan_term}`);
    let assessmentIdForOrder = null, riskScore = null, entitlements = {}, rawFeaturesForModel = {}, dbUserData = null, latestCreditData = null;
    let original_db_employment_status = null, raw_credit_utilization_ratio = null, db_default_flag = 'N';

    try {
        console.log(`   1 & 2. Skipping Plaid data fetch and processing (SIMULATION MODE).`);
        console.log(`   3. Preparing features from Database...`);
        try {
            const creditSql = `SELECT employment_status, person_income, credit_utilization_ratio, payment_history, loan_term, loan_amnt AS original_loan_amount, loan_percent_income FROM credit_data WHERE user_id = ? ORDER BY recorded_at DESC LIMIT 1`;
            const userSql = `SELECT cb_person_default_on_file, cb_person_cred_hist_length FROM users WHERE user_id = ?`;
            const [[latestCreditDataResult], [dbUserDataResult]] = await Promise.all([dbPool.query(creditSql, [userId]), dbPool.query(userSql, [userId])]);
            latestCreditData = latestCreditDataResult || {}; dbUserData = dbUserDataResult;
            if (!dbUserData) { console.error(`❌ User profile not found for User ID: ${userId}`); throw new Error("User profile data missing for assessment.");}
            console.log("      Fetched User Data:", dbUserData); console.log("      Fetched Latest Credit Data:", latestCreditData);

            original_db_employment_status = latestCreditData.employment_status || 'OTHER';
            raw_credit_utilization_ratio = latestCreditData.credit_utilization_ratio;
            db_default_flag = dbUserData.cb_person_default_on_file || 'N';
            const pIncome = Number(latestCreditData.person_income || 0);
            const lAmnt = Number(requested_loan_amount || latestCreditData.original_loan_amount || 1000);
            const lTerm = Number(requested_loan_term || latestCreditData.loan_term || 6);
            const utilRatio = calculate_util_ratio(null, null, raw_credit_utilization_ratio) ?? 0.1;
            const historyScore = calculate_payment_history([], dbUserData, latestCreditData.payment_history) ?? 500;
            rawFeaturesForModel = {
                'employment_status': mapEmploymentStatus(original_db_employment_status), 'person_income': pIncome,
                'cb_person_default_on_file': db_default_flag, 'cb_person_cred_hist_length': Number(dbUserData.cb_person_cred_hist_length || 0),
                'original_loan_amount': Number(latestCreditData.original_loan_amount || 0), 'loan_term': lTerm, 'loan_amnt': lAmnt,
                'credit_utilization_ratio': utilRatio, 'payment_history': historyScore, 'loan_percent_income': calculate_lpi(lAmnt, pIncome) ?? 1.0,
            };
            Object.keys(rawFeaturesForModel).forEach(key => {
                if (key !== 'employment_status' && key !== 'cb_person_default_on_file') { rawFeaturesForModel[key] = Number(rawFeaturesForModel[key] || 0); if (isNaN(rawFeaturesForModel[key])) rawFeaturesForModel[key] = 0; }
                else if (!rawFeaturesForModel[key]) { rawFeaturesForModel[key] = (key === 'employment_status' ? 'No' : 'N');}
            });
            console.log(`      ✅ Features prepared (DB ONLY):`, JSON.stringify(rawFeaturesForModel));
        } catch (dataPrepError) { console.error(`❌ DB Error for User ${userId}:`, dataPrepError); return res.status(500).json({ success: false, message: `Error preparing data: ${dataPrepError.message}` });}

        console.log(`   4. Calling Python Prediction Service...`);
        if (!PYTHON_PREDICTION_URL) { console.error("❌ PYTHON_PREDICTION_SERVICE_URL is not set."); throw new Error('Prediction service configuration missing.');}
        try {
            const predRes = await fetch(PYTHON_PREDICTION_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ features: rawFeaturesForModel }) });
            if (!predRes.ok) { const errBody = await predRes.text(); throw new Error(`Prediction service HTTP Error: ${predRes.status}. Body: ${errBody}`);}
            const predResult = await predRes.json(); if (predResult.error) throw new Error(`Prediction failed: ${predResult.error}`);
            riskScore = predResult.risk_score; console.log(`      Received Risk Score: ${riskScore}`);
            if (riskScore === null || typeof riskScore !== 'number' || isNaN(riskScore)) throw new Error('Invalid risk score from prediction service.');
        } catch (fetchError) { console.error(`❌ Python Service Error:`, fetchError); throw new Error(`Assessment service unavailable: ${fetchError.message}`);}

        console.log(`   5. Mapping score and applying adjustments...`);
        entitlements = mapScoreAndApplyAdjustments(riskScore, db_default_flag, original_db_employment_status, raw_credit_utilization_ratio);
        if (entitlements.error) throw new Error(`Failed to determine entitlements: ${entitlements.error}`);
        console.log(`      Calculated Entitlements: Tier ${entitlements.tier}, Limit ${entitlements.limit.toFixed(2)}, Terms [${entitlements.terms.join(',')}]`);

        console.log(`   6. Storing assessment result and updating user's limit...`);
        if (!entitlements.error && riskScore !== null) {
            let connection;
            try {
                connection = await dbPool.getConnection(); await connection.beginTransaction();
                // *** FIX 1: Removed assessment_status from INSERT ***
                const assessSql = `INSERT INTO credit_assessments
                                     (user_id, risk_score, credit_tier, credit_limit, calculated_terms,
                                      assessment_timestamp)
                                   VALUES (?, ?, ?, ?, ? NOW())`;
                const assessVals = [
                    userId,
                    riskScore.toFixed(6),
                    entitlements.tier,
                    entitlements.limit.toFixed(2),
                    JSON.stringify(entitlements.terms),

                ];
                const [insRes] = await connection.query(assessSql, assessVals);
                assessmentIdForOrder = insRes.insertId;
                console.log(`      ✅ Assessment record created (ID: ${assessmentIdForOrder})`);

                const updUserLimitSql = 'UPDATE users SET current_credit_limit = ? WHERE user_id = ?';
                const [updRes] = await connection.query(updUserLimitSql, [entitlements.limit.toFixed(2), userId]);
                if (updRes.affectedRows === 0) throw new Error("Failed to update user's credit limit."); // Fail transaction if update fails
                console.log(`      ✅ User ${userId}'s current_credit_limit updated to ${entitlements.limit.toFixed(2)}`);

                await connection.commit();
                console.log("      DB Transaction Committed (Assessment Record + User Limit Update).");
            } catch (dbStoreError) {
                console.error(`❌ DB Error during storage/update for User ${userId}:`, dbStoreError);
                if (connection) {
                    try { await connection.rollback(); console.log("      DB Transaction Rolled Back."); } // Added rollback logging
                    catch (rollbackErr) { console.error("      Error during Rollback:", rollbackErr); }
                }
                assessmentIdForOrder = null; // Reset assessmentId as storage failed
                console.error("Assessment result storage failed."); // Log the failure
                // Decide whether to re-throw or allow the request to succeed without assessment ID
                // Let's re-throw to make the failure clear in the outer catch
                throw dbStoreError; // Re-throw the DB error
            } finally {
                if (connection) {
                    try {
                        connection.release();
                        console.log("      DB Connection Released (Assessment Storage).");
                    } catch (releaseErr) {
                        console.error("      Error releasing DB connection (Assessment Storage):", releaseErr);
                    }
                }
            }
        } else {
            console.warn(`   Skipping storage due to invalid score or entitlement error.`);
        }

        // Only reach here if the storage/update succeeded OR was skipped due to score/entitlement error
        console.log(`✅ Assessment complete (SIMULATION MODE) for User: ${userId}`);
        // Fetch user data again AFTER potential updates to get latest used_credit_amount for accurate available_credit response
         const [currentUserDataForResponse] = await dbPool.query('SELECT used_credit_amount FROM users WHERE user_id = ?', [userId]);
         const finalUsedAmount = parseFloat(currentUserDataForResponse[0]?.used_credit_amount || 0);

        res.status(200).json({
            success: true,
            message: "Credit assessment completed.",
            entitlements: {
                tier: entitlements.tier,
                limit: entitlements.limit,
                terms: entitlements.terms,
                used_credit_amount: finalUsedAmount, // Use potentially updated amount
                available_credit: Math.max(0, entitlements.limit - finalUsedAmount) // Recalculate available credit
            },
            assessmentId: assessmentIdForOrder // Send assessment ID only if successfully stored
        });

    } catch (error) {
        // This outer catch block handles errors from DB Prep, Python Call, Mapping, and Re-thrown DB Storage errors
        console.error(`❌ Overall Assessment Error for User ${userId}:`, error);
        let statusCode = 500;
        if (error.message?.includes("User profile data missing")) statusCode = 404;
        else if (error.message?.includes("Prediction service") || error.message?.includes("Assessment service unavailable")) statusCode = 503;
        else if (error.message?.includes("Invalid risk score") || error.message?.includes("Failed to determine entitlements")) statusCode = 500;
        else if (error.message?.includes("returned error")) statusCode = 502;
        // Check for the specific DB error we fixed
        else if (error.code === 'ER_BAD_FIELD_ERROR') {
             console.error("Database schema error encountered during assessment storage."); // Log specific type
             error.message = "Database configuration error prevented assessment storage."; // More user-friendly message
        }
        else if (error.message?.includes("Failed to update user's credit limit")) {
            statusCode = 500; // Internal inconsistency
            error.message = "Failed to update user limit after assessment.";
        }

        res.status(statusCode).json({ success: false, message: error.message || 'Credit assessment failed.' });
    }
});


// --- Other routes remain largely the same, ensure buffer endpoints have corrected finally blocks ---

app.post('/api/assess_credit_simulated', authenticateUser, async (req, res) => {
    const userId = req.user.id;
    console.log(`\n⚙️ SIMULATED Dashboard Assessment request User: ${userId}`);
    const { requested_loan_amount = 1000, requested_loan_term = 6 } = req.body;
    console.log(`   Dashboard estimate using Amount: ${requested_loan_amount}, Term: ${requested_loan_term}`);
    let riskScore = null, entitlements = {}, rawFeaturesForModel = {}, dbUserData = null, latestCreditData = null;
    let original_db_employment_status = null, raw_credit_utilization_ratio = null, db_default_flag = 'N';

    try {
        console.log(`   1. Preparing features from DB for simulation...`);
        try {
            const creditSql = `SELECT employment_status, person_income, credit_utilization_ratio, payment_history, loan_term, loan_amnt AS original_loan_amount, loan_percent_income FROM credit_data WHERE user_id = ? ORDER BY recorded_at DESC LIMIT 1`;
            const userSql = `SELECT cb_person_default_on_file, cb_person_cred_hist_length FROM users WHERE user_id = ?`; // MODIFIED
            const [[latestCreditDataResult], [dbUserDataResult]] = await Promise.all([ dbPool.query(creditSql, [userId]), dbPool.query(userSql, [userId]) ]);
            latestCreditData = latestCreditDataResult || {}; dbUserData = dbUserDataResult;
            if (!dbUserData) throw new Error("User profile missing for simulation.");
            console.log("      Fetched User Data (Sim):", dbUserData); console.log("      Fetched Latest Credit Data (Sim):", latestCreditData);

            original_db_employment_status = latestCreditData.employment_status || 'OTHER'; // MODIFIED
            raw_credit_utilization_ratio = latestCreditData.credit_utilization_ratio;
            db_default_flag = dbUserData.cb_person_default_on_file || 'N';
            const pIncome = Number(latestCreditData.person_income || 0); // MODIFIED
            const lAmnt = Number(requested_loan_amount); const lTerm = Number(requested_loan_term);
            const utilRatio = calculate_util_ratio(null, null, raw_credit_utilization_ratio) ?? 0.1;
            const historyScore = calculate_payment_history([], dbUserData, latestCreditData.payment_history) ?? 500;
            rawFeaturesForModel = {
                'employment_status': mapEmploymentStatus(original_db_employment_status), 'person_income': pIncome,
                'cb_person_default_on_file': db_default_flag, 'cb_person_cred_hist_length': Number(dbUserData.cb_person_cred_hist_length || 0),
                'original_loan_amount': Number(latestCreditData.original_loan_amount || 0), 'loan_term': lTerm, 'loan_amnt': lAmnt,
                'credit_utilization_ratio': utilRatio, 'payment_history': historyScore, 'loan_percent_income': calculate_lpi(lAmnt, pIncome) ?? 1.0,
            };
            Object.keys(rawFeaturesForModel).forEach(k => {
                if (k !== 'employment_status' && k !== 'cb_person_default_on_file') { rawFeaturesForModel[k] = Number(rawFeaturesForModel[k] || 0); if (isNaN(rawFeaturesForModel[k])) rawFeaturesForModel[k] = 0;}
                else if (!rawFeaturesForModel[k]) { rawFeaturesForModel[k] = (k === 'employment_status' ? 'No' : 'N');}
            });
            console.log(`      ✅ Raw features prepared (SIMULATED):`, JSON.stringify(rawFeaturesForModel));
        } catch (dataPrepError) { console.error(`   ❌ Error preparing features (SIM):`, dataPrepError); return res.status(500).json({ success: false, message: 'Internal error preparing simulation data.' });}

        console.log(`   2. Calling Python service for simulation...`);
        if (!PYTHON_PREDICTION_URL) return res.status(503).json({ success: false, message: 'Prediction service configuration error.' });
        try {
            const predRes = await fetch(PYTHON_PREDICTION_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ features: rawFeaturesForModel }) });
            if (!predRes.ok) { const errTxt = await predRes.text(); throw new Error(`Prediction service HTTP error: ${predRes.status} - ${errTxt}`);}
            const predResult = await predRes.json(); if (predResult.error) throw new Error(`Prediction service failed: ${predResult.error}`);
            riskScore = predResult.risk_score; console.log(`      Simulated Score: ${riskScore}`);
        } catch (fetchError) { console.error(`   ❌ Python service error (SIM): ${fetchError.message}`); return res.status(503).json({ success: false, message: 'Prediction service unavailable for simulation.' });}
        if (riskScore === null || typeof riskScore !== 'number' || isNaN(Number(riskScore))) return res.status(500).json({success: false, message: 'Invalid score received from simulation service.'});

        console.log(`   3. Mapping simulated score and applying adjustments...`);
        entitlements = mapScoreAndApplyAdjustments(riskScore, db_default_flag, original_db_employment_status, raw_credit_utilization_ratio);
        if (entitlements.error) { console.error(`   ❌ Error mapping simulated score: ${entitlements.error}`); return res.status(500).json({success: false, message: 'Error calculating simulated entitlements.'});}
        console.log(`      Simulated Entitlements: Tier ${entitlements.tier}, Limit ${entitlements.limit.toFixed(2)}, Terms [${entitlements.terms.join(',')}]`);

        console.log(`✅ SIMULATED Dashboard Assessment complete for User: ${userId}.`);
        res.status(200).json({ success: true, entitlements: { tier: entitlements.tier, limit: entitlements.limit, terms: entitlements.terms }, assessmentId: null, simulated: true });
    } catch (error) { console.error(`❌ SIMULATED Assessment Flow Error for User ${userId}:`, error); res.status(500).json({ success: false, message: error.message || 'Simulation request failed.' }); }
});

app.post('/api/confirm_bnpl_order', authenticateUser, async (req, res) => {
    const userId = req.user.id;
    const { product, term, assessmentId } = req.body;
    let connection = null;
    console.log(`\n⚙️ Confirming BNPL order Request - User: ${userId}, Assessment ID: ${assessmentId}, Term: ${term}`);
    console.log(`   Product Details Received:`, JSON.stringify(product));
    if (!product || typeof product !== 'object' || typeof product.numericPrice !== 'number' || isNaN(product.numericPrice) || product.numericPrice <= 0 || !product.title || typeof term !== 'number' || term <= 0) {
        console.error("   Order confirmation failed: Invalid input data provided.", { product, term, assessmentId });
        return res.status(400).json({ success: false, message: 'Missing or invalid order details (product price/title, term).' });
    }
    const orderAmount = Number(product.numericPrice); const selectedTerm = Number(term);
    console.log(`   Validated Order Amount: ${orderAmount.toFixed(2)}, Term: ${selectedTerm} months`);

    try {
        connection = await dbPool.getConnection(); await connection.beginTransaction(); console.log("   DB Transaction Started for Order Confirmation.");
        const limitSql = 'SELECT current_credit_limit, used_credit_amount FROM users WHERE user_id = ? FOR UPDATE';
        const [limitResults] = await connection.query(limitSql, [userId]);
        if (limitResults.length === 0) { await connection.rollback(); throw new Error("User record not found for credit check."); }
        const userData = limitResults[0];
        const currentLimit = parseFloat(userData.current_credit_limit || 0); const usedAmount = parseFloat(userData.used_credit_amount || 0);
        const availableCredit = Math.max(0, currentLimit - usedAmount);
        console.log(`   User Limit: ${currentLimit.toFixed(2)}, Used: ${usedAmount.toFixed(2)}, Available: ${availableCredit.toFixed(2)}`);
        if (orderAmount > availableCredit) {
            await connection.rollback(); console.log("   DB Transaction Rolled Back (Insufficient Credit).");
            return res.status(400).json({ success: false, message: `Order amount (£${orderAmount.toFixed(2)}) exceeds your available credit (£${availableCredit.toFixed(2)}).`});
        }
        console.log(`   Credit limit sufficient. Proceeding with order creation.`);
        const now = new Date(); let dueYear = now.getUTCFullYear(); let dueMonth = now.getUTCMonth() + 2;
        if (dueMonth > 12) { dueMonth = 1; dueYear += 1; }
        const firstDueDate = `${dueYear}-${String(dueMonth).padStart(2, '0')}-01`; console.log(`      Calculated First Due Date: ${firstDueDate}`);
        const orderData = { user_id: userId, assessment_id: assessmentId || null, product_title: product.title, product_price: orderAmount, loan_amnt: orderAmount, selected_term_months: selectedTerm, remaining_balance: orderAmount, order_status: 'ACTIVE', next_payment_due_date: firstDueDate, order_timestamp: new Date() };
        const orderSql = `INSERT INTO orders (user_id, assessment_id, product_title, product_price, loan_amnt, selected_term_months, remaining_balance, order_status, next_payment_due_date, order_timestamp) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
        const orderValues = [orderData.user_id, orderData.assessment_id, orderData.product_title, orderData.product_price, orderData.loan_amnt, orderData.selected_term_months, orderData.remaining_balance, orderData.order_status, orderData.next_payment_due_date, orderData.order_timestamp];
        const [orderResult] = await connection.query(orderSql, orderValues); const orderId = orderResult.insertId;
        console.log(`      ✅ BNPL Order (ID: ${orderId}) record created successfully.`);
        const updateUsedAmountSql = 'UPDATE users SET used_credit_amount = used_credit_amount + ? WHERE user_id = ?';
        const [updateResult] = await connection.query(updateUsedAmountSql, [orderAmount.toFixed(2), userId]);
        if (updateResult.affectedRows === 0) { await connection.rollback(); throw new Error("Failed to update user credit usage. Order incomplete."); }
        console.log(`      ✅ User ID ${userId} used_credit_amount updated (+${orderAmount.toFixed(2)}).`);
        await connection.commit(); console.log("   DB Transaction Committed Successfully for Order Confirmation.");
        res.status(201).json({ success: true, message: 'Order confirmed successfully!', orderId: orderId });
    } catch (error) {
        console.error(`❌ Error confirming BNPL order for User ${userId}:`, error);
        if (connection) await connection.rollback().catch(rbErr => console.error("Rollback Error:", rbErr));
        let statusCode = 500; if (error.message.includes("User record not found")) statusCode = 404;
        const clientMessage = (process.env.NODE_ENV === 'production') ? 'Failed to process your order due to a server issue.' : error.message;
        res.status(statusCode).json({ success: false, message: clientMessage });
    } finally { if (connection) { try { connection.release(); console.log("   DB Connection Released (Order Confirm).");} catch (e){ console.error("Error releasing connection (Order Confirm)", e)} }} // FIXED finaly block
});

app.get('/api/active_orders', authenticateUser, async (req, res) => {
    const userId = req.user.id; console.log(`\n⚙️ Fetching active orders request for User ID: ${userId}`);
    try {
        const sql = `SELECT order_id, product_title, loan_amnt, remaining_balance, selected_term_months, order_status, order_timestamp, next_payment_due_date FROM orders WHERE user_id = ? AND order_status = 'ACTIVE' ORDER BY order_timestamp DESC`;
        const [orders] = await dbPool.query(sql, [userId]);
        console.log(`✅ Found ${orders.length} active orders for User ID: ${userId}`);
        const formatToIsoDate = (dateValue) => {
             if (!dateValue) return null; try { const d = new Date(dateValue); if (isNaN(d.getTime())) return null; return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; } catch (e) { console.warn(`Error formatting date ${dateValue}: ${e.message}`); return null; }
        };
        const formattedOrders = orders.map(order => ({
             order_id: order.order_id, product_title: order.product_title || 'N/A', selected_term_months: order.selected_term_months, order_status: order.order_status,
             loan_amount: parseFloat(order.loan_amnt || 0), remaining_balance: parseFloat(order.remaining_balance || 0),
             order_timestamp: formatToIsoDate(order.order_timestamp), next_payment_due_date: formatToIsoDate(order.next_payment_due_date)
        }));
        res.status(200).json({ success: true, activeOrders: formattedOrders });
    } catch (error) { console.error(`❌ DB Error fetching active orders for User ${userId}:`, error); res.status(500).json({ success: false, message: 'Error retrieving your active orders.' });}
});

app.post('/api/make_repayment', authenticateUser, async (req, res) => {
    const userId = req.user.id; const { order_id, repayment_amount } = req.body; let connection = null;
    const orderIdInt = parseInt(order_id, 10);
    console.log(`\n⚙️ Processing Repayment Request - OrderID: ${orderIdInt}, Amount: ${repayment_amount}, User: ${userId}`);
    const amount = Number(repayment_amount);
    if (isNaN(orderIdInt) || orderIdInt <= 0 || isNaN(amount) || amount <= 0) return res.status(400).json({ success: false, message: 'Invalid order ID or repayment amount.' });
    console.log(`   Validated Repayment Amount: ${amount.toFixed(2)} for Order ID: ${orderIdInt}`);

    try {
        connection = await dbPool.getConnection(); await connection.beginTransaction(); console.log("   Repayment DB Transaction Started.");
        const getOrderSql = 'SELECT user_id, remaining_balance, order_status, product_title FROM orders WHERE order_id = ? FOR UPDATE';
        const getUserSql = 'SELECT used_credit_amount, buffer_bag_balance FROM users WHERE user_id = ? FOR UPDATE';
        const [[order], [user]] = await Promise.all([connection.query(getOrderSql, [orderIdInt]), connection.query(getUserSql, [userId])]);

        if (!order) throw new Error(`Order ID ${orderIdInt} not found.`); console.log(`   Order Data Found:`, order);
        if (!user) throw new Error(`User ID ${userId} not found for repayment.`); console.log(`   User Data Found: used_credit=${user.used_credit_amount}, buffer_balance=${user.buffer_bag_balance}`);
        if (Number(order.user_id) !== Number(userId)) throw new Error("Authorization failed: User does not own this order."); console.log("      -> Authorization Check Passed.");
        if (order.order_status !== 'ACTIVE') throw new Error(`Cannot repay order with status ${order.order_status}.`); console.log("      -> Order Status Check Passed.");
        const currentBalance = parseFloat(order.remaining_balance);
        if (amount > currentBalance + 0.001) throw new Error(`Payment amount (£${amount.toFixed(2)}) exceeds remaining balance (£${currentBalance.toFixed(2)}).`); console.log(`      -> Amount Check Passed.`);

        console.log("*** Simulating external payment processing gateway call... SUCCEEDED. ***");

        console.log("   Performing Database Updates within Transaction...");
        const repayDesc = `BNPL Repayment for Order #${orderIdInt} (${order.product_title || 'N/A'})`;
        const repayTxSql = `INSERT INTO transactions (user_id, transaction_type, amount, transaction_status, description, is_buffer_transaction, transaction_date) VALUES (?, ?, ?, ?, ?, ?, NOW())`;
        const [repayTransResult] = await connection.query(repayTxSql, [userId, 'REPAYMENT', amount, 'Completed', repayDesc, 0]); console.log(`         -> Repayment Transaction logged (ID: ${repayTransResult.insertId})`);
        const newBalance = currentBalance - amount; const newStatus = (newBalance <= 0.005) ? 'PAID_OFF' : 'ACTIVE';
        await connection.query('UPDATE orders SET remaining_balance = ?, order_status = ? WHERE order_id = ?', [newBalance.toFixed(2), newStatus, orderIdInt]); console.log(`         -> Order ${orderIdInt} updated. New Bal: ${newBalance.toFixed(2)}, Status: ${newStatus}`);
        const currentUsedAmount = parseFloat(user.used_credit_amount || 0); const amountToDecrease = Math.min(amount, currentUsedAmount);
        await connection.query('UPDATE users SET used_credit_amount = GREATEST(0, used_credit_amount - ?) WHERE user_id = ?', [amountToDecrease.toFixed(2), userId]); console.log(`         -> User ${userId} used_credit_amount updated (-${amountToDecrease.toFixed(2)}).`);

        const bufferContribution = parseFloat((amount * BUFFER_CONTRIBUTION_PERCENTAGE).toFixed(2));
        console.log(`      D. Buffer Contribution: £${bufferContribution.toFixed(2)}`);
        if (bufferContribution > 0) {
            const bufferDesc = `Buffer Bag contribution from Order #${orderIdInt} repayment`;
            const bufferTxSql = `INSERT INTO transactions (user_id, transaction_type, amount, transaction_status, description, is_buffer_transaction, transaction_date) VALUES (?, ?, ?, ?, ?, ?, NOW())`;
            const [bufferTransResult] = await connection.query(bufferTxSql, [userId, 'BUFFER_CONTRIBUTION', bufferContribution, 'Completed', bufferDesc, 1]); console.log(`            -> Buffer Transaction Logged (ID: ${bufferTransResult.insertId})`);
            await connection.query('UPDATE users SET buffer_bag_balance = buffer_bag_balance + ? WHERE user_id = ?', [bufferContribution.toFixed(2), userId]);
            const newBufferBalance = (parseFloat(user.buffer_bag_balance || 0) + bufferContribution).toFixed(2);
            console.log(`            -> User ${userId} buffer_bag_balance updated. New Buffer: ~£${newBufferBalance}`);
        } else { console.log(`         Skipping buffer contribution processing.`);}

        await connection.commit(); console.log("   ✅ Repayment DB Transaction Committed Successfully.");
        res.status(200).json({ success: true, message: 'Repayment successful!', new_balance: newBalance.toFixed(2), order_status: newStatus, buffer_contribution_added: bufferContribution.toFixed(2) });
    } catch (error) {
        console.error(`❌ Error processing repayment for Order ${orderIdInt || order_id}, User ${userId}:`, error);
        if (connection) await connection.rollback().catch(rbErr => console.error("Rollback Error:", rbErr));
        let statusCode = 500; if (error.message.includes("not found")) statusCode = 404; else if (error.message.includes("Authorization failed")) statusCode = 403; else if (error.message.includes("Invalid") || error.message.includes("exceeds") || error.message.includes("status is")) statusCode = 400;
        res.status(statusCode).json({ success: false, message: error.message || 'Failed to process repayment.' });
    } finally { if (connection) { try { connection.release(); console.log("   DB Connection Released (Repayment).");} catch (e) {console.error("Error releasing connection (Repayment)", e)} }} // FIXED finaly block
});

app.get('/api/current_entitlements', authenticateUser, async (req, res) => {
    const userId = req.user.id; console.log(`\n⚙️ Fetching current entitlements & available credit for User: ${userId}`);
    try {
        const assessmentSql = `SELECT assessment_id, credit_tier, credit_limit, calculated_terms FROM credit_assessments WHERE user_id = ? ORDER BY assessment_timestamp DESC LIMIT 1`;
        const userCreditSql = `SELECT current_credit_limit, used_credit_amount FROM users WHERE user_id = ?`;
        const [[latestAssessment], [userCreditData]] = await Promise.all([ dbPool.query(assessmentSql, [userId]), dbPool.query(userCreditSql, [userId]) ]);
        if (!userCreditData) { console.error(`Critical Error: User ${userId} not found.`); return res.status(404).json({ success: false, message: "User not found." });}
        const currentUsedAmount = parseFloat(userCreditData.used_credit_amount || 0); const currentLimit = parseFloat(userCreditData.current_credit_limit || 0);
        if (!latestAssessment) {
            const availableCredit = Math.max(0, currentLimit - currentUsedAmount);
            return res.status(200).json({ success: true, entitlements: { status: 'unassessed', tier: null, limit: currentLimit, terms: [], assessmentId: null, used_credit_amount: currentUsedAmount, available_credit: availableCredit }});
        }
        console.log(`✅ Found latest assessment (ID: ${latestAssessment.assessment_id}) for User: ${userId}`);
        let terms = []; try { terms = JSON.parse(latestAssessment.calculated_terms || '[]'); if (!Array.isArray(terms)) terms = []; } catch (e) { console.warn(`Error parsing terms for assessment ${latestAssessment.assessment_id}:`, e.message); terms = [];}
        const availableCredit = Math.max(0, currentLimit - currentUsedAmount); console.log(`   User ${userId}: Limit=${currentLimit.toFixed(2)}, Used=${currentUsedAmount.toFixed(2)}, Avail=${availableCredit.toFixed(2)}`);
        res.status(200).json({ success: true, entitlements: { status: 'assessed', tier: latestAssessment.credit_tier, limit: currentLimit, terms: terms, assessmentId: latestAssessment.assessment_id, used_credit_amount: currentUsedAmount, available_credit: availableCredit }});
    } catch (error) { console.error(`❌ DB Error fetching entitlements/credit for User ${userId}:`, error); res.status(500).json({ success: false, message: 'Error retrieving your credit information.' });}
});

// --- BUFFER BAG ENDPOINTS ---
app.get('/api/buffer/balance', authenticateUser, async (req, res) => {
    const userId = req.user.id;
    console.log(`\n⚙️ Fetching buffer balance for User ID: ${userId}`);
    try {
        const sql = 'SELECT buffer_bag_balance FROM users WHERE user_id = ?';
        console.log(`   Executing SQL for buffer balance: ${sql} with User ID: ${userId}`);
        const [results] = await dbPool.query(sql, [userId]);
        console.log(`   SQL Query for buffer balance executed. Results length: ${results.length}`);
        if (results.length === 0) { console.warn(`   User ID ${userId} not found for buffer balance.`); return res.status(404).json({ success: false, message: "User not found." }); }
        const rawBalanceFromDB = results[0].buffer_bag_balance;
        console.log(`   Raw balance from DB for User ${userId}: '${rawBalanceFromDB}'`);
        let numericBalance = parseFloat(rawBalanceFromDB);
        console.log(`   After parseFloat, numericBalance is: ${numericBalance}, type: ${typeof numericBalance}`);
        if (isNaN(numericBalance)) {
            console.warn(`   User ${userId}'s buffer_bag_balance ('${rawBalanceFromDB}') was not a valid number or was null/empty. Defaulting to 0.00.`);
            numericBalance = 0.00;
        }
        console.log(`   Before toFixed, numericBalance is: ${numericBalance}`);
        const formattedBalance = numericBalance.toFixed(2);
        console.log(`   After toFixed, formattedBalance is: ${formattedBalance}`);
        console.log(`Server: About to send success response for GET buffer balance for User ${userId}. Balance: £${formattedBalance}`);
        res.status(200).json({ success: true, balance: formattedBalance });
        console.log(`Server: GET Buffer balance response SENT for User ${userId}.`);
        return;
    } catch (error) {
        console.error(`❌ Error fetching buffer balance for User ${userId}:`, error.message, error.stack);
        if (!res.headersSent) { res.status(500).json({ success: false, message: "Could not retrieve buffer balance due to a server issue." });}
        return;
    }
});

app.post('/api/buffer/deposit', authenticateUser, async (req, res) => {
    const userId = req.user.id; const { amount } = req.body;
    console.log(`\n⚙️ Processing Buffer Deposit Request - User: ${userId}, Amount: ${amount}`);
    const depositAmount = parseFloat(amount);
    if (isNaN(depositAmount) || depositAmount <= 0) { console.warn(`   Deposit validation failed: Invalid amount ('${amount}')`); return res.status(400).json({ success: false, message: 'Invalid deposit amount provided.' });}
    let connection;
    try {
        connection = await dbPool.getConnection(); await connection.beginTransaction(); console.log("   Buffer Deposit DB Transaction Started.");
        const [updateResult] = await connection.query('UPDATE users SET buffer_bag_balance = buffer_bag_balance + ? WHERE user_id = ?', [depositAmount.toFixed(2), userId]);
        if (updateResult.affectedRows === 0) throw new Error("User not found or balance update failed for deposit.");
        console.log(`      User ${userId} buffer_bag_balance updated by +${depositAmount.toFixed(2)}`);
        const depositDesc = `Manual buffer bag deposit.`;
        const [transResult] = await connection.query(`INSERT INTO transactions (user_id, transaction_type, amount, transaction_status, description, is_buffer_transaction, transaction_date) VALUES (?, ?, ?, ?, ?, ?, NOW())`, [userId, 'BUFFER_DEPOSIT', depositAmount.toFixed(2), 'Completed', depositDesc, 1]);
        console.log(`      Buffer Deposit Transaction logged (ID: ${transResult.insertId})`);
        await connection.commit(); console.log("   ✅ Buffer Deposit DB Transaction Committed.");
        const [balanceResult] = await dbPool.query('SELECT buffer_bag_balance FROM users WHERE user_id = ?', [userId]);
        const newBalance = parseFloat(balanceResult[0]?.buffer_bag_balance || 0).toFixed(2);
        res.status(200).json({ success: true, message: `Successfully deposited £${depositAmount.toFixed(2)}.`, new_balance: newBalance });
    } catch (error) {
        console.error(`❌ Error processing buffer deposit for User ${userId}:`, error);
        if (connection) await connection.rollback().catch(rbErr => console.error("Rollback Error:", rbErr));
        res.status(500).json({ success: false, message: error.message || 'Failed to process deposit.' });
    } finally { // *** FIXED connection release ***
        if (connection) {
            try {
                connection.release();
                console.log("   DB Connection Released (Deposit).");
            } catch (releaseErr) {
                console.error("   Error releasing DB connection (deposit):", releaseErr);
            }
        }
    }
});

app.post('/api/buffer/withdraw', authenticateUser, async (req, res) => {
    const userId = req.user.id; const { amount } = req.body;
    console.log(`\n⚙️ Processing Buffer Withdrawal Request - User: ${userId}, Amount: ${amount}`);
    const withdrawAmount = parseFloat(amount);
    if (isNaN(withdrawAmount) || withdrawAmount <= 0) { console.warn(`   Withdrawal validation failed: Invalid amount ('${amount}')`); return res.status(400).json({ success: false, message: 'Invalid withdrawal amount.' });}
    let connection;
    try {
        connection = await dbPool.getConnection(); await connection.beginTransaction(); console.log("   Buffer Withdrawal DB Transaction Started.");
        const [userRows] = await connection.query('SELECT buffer_bag_balance FROM users WHERE user_id = ? FOR UPDATE', [userId]);
        if (userRows.length === 0) throw new Error("User not found for withdrawal.");
        const currentBalance = parseFloat(userRows[0].buffer_bag_balance || 0);
        if (withdrawAmount > currentBalance) {
            await connection.commit();
            return res.status(400).json({ success: false, message: 'Withdrawal amount exceeds buffer balance.' });
        }
        const [updateResult] = await connection.query('UPDATE users SET buffer_bag_balance = buffer_bag_balance - ? WHERE user_id = ?', [withdrawAmount.toFixed(2), userId]);
        if (updateResult.affectedRows === 0) throw new Error("Balance update failed during withdrawal.");
        console.log(`      User ${userId} buffer_bag_balance updated by -${withdrawAmount.toFixed(2)}`);
        const withdrawDesc = `Manual buffer bag withdrawal.`;
        const [transResult] = await connection.query(`INSERT INTO transactions (user_id, transaction_type, amount, transaction_status, description, is_buffer_transaction, transaction_date) VALUES (?, ?, ?, ?, ?, ?, NOW())`, [userId, 'BUFFER_WITHDRAWAL', withdrawAmount.toFixed(2), 'Completed', withdrawDesc, 1]);
        console.log(`      Buffer Withdrawal Transaction logged (ID: ${transResult.insertId})`);
        await connection.commit(); console.log("   ✅ Buffer Withdrawal DB Transaction Committed.");
        const newBalance = (currentBalance - withdrawAmount).toFixed(2);
        res.status(200).json({ success: true, message: `Successfully withdrew £${withdrawAmount.toFixed(2)}.`, new_balance: newBalance });
    } catch (error) {
        console.error(`❌ Error processing buffer withdrawal for User ${userId}:`, error);
        if (connection) await connection.rollback().catch(rbErr => console.error("Rollback Error:", rbErr));
        res.status(500).json({ success: false, message: error.message || 'Failed to process withdrawal.' });
    } finally { // *** FIXED connection release ***
        if (connection) {
            try {
                connection.release();
                console.log("   DB Connection Released (Withdraw).");
            } catch (releaseErr) {
                console.error("   Error releasing DB connection (withdraw):", releaseErr);
            }
        }
    }
});
// --- --------------------- ---

app.get('/api/test-auth', authenticateUser, (req, res) => res.json({ success: true, message: `Auth OK for user ID: ${req.user.id}, Email: ${req.user.email}`}));

app.use((err, req, res, next) => {
  console.error("Unhandled Express Error:", err.stack || err);
  const message = (process.env.NODE_ENV === 'production' && !err.status) ? 'An unexpected internal server error occurred.' : err.message || 'Unknown server error';
  const statusCode = typeof err.status === 'number' ? err.status : 500;
  if (res.headersSent) return next(err);
  res.status(statusCode).json({ success: false, message: message });
});

app.use((req, res, next) => {
  res.status(404).json({ success: false, message: `Endpoint not found: ${req.method} ${req.originalUrl}` });
});

app.listen(PORT, () => {
    console.log(`\n🚀 Server running on port ${PORT}`);
    console.log(`--------------------------------------------------`);
    console.log(`🔗 Plaid Environment:     ${plaidEnv}`);
    console.log(`🐍 Python Prediction URL: ${PYTHON_PREDICTION_URL || 'NOT SET! - Assessment endpoints require this.'}`);
    console.log(`🔑 JWT Secret Loaded:     ${JWT_SECRET ? 'Yes' : 'NO! - Authentication will fail.'}`);
    console.log(`💧 Buffer Contribution:   ${(BUFFER_CONTRIBUTION_PERCENTAGE * 100).toFixed(1)}% of repayment amount`);
    console.log(`--------------------------------------------------`);
});