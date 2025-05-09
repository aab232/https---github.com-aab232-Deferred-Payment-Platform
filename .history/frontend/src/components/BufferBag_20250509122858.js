import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import BackButton from './BackButton';
import './BufferBag.css';

// --- Authenticated Fetch Helper ---
async function authenticatedFetch(url, options = {}) {
    const token = localStorage.getItem('authToken');
    const headers = { 'Content-Type': 'application/json', ...options.headers };
    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    } else {
        console.warn("Auth token missing for API call to", url);
        return { ok: false, status: 401, json: async () => ({ success: false, message: "Authentication token missing." }) };
    }
    try {
        const apiUrl = process.env.REACT_APP_API_BASE_URL || 'http://localhost:5000';
        const response = await fetch(`${apiUrl}${url}`, { ...options, headers });
        return response;
    } catch (error) {
        console.error(`API Fetch Error for ${url}:`, error);
        // Ensure a fetch-like response for consistent error handling downstream
        return {
            ok: false,
            status: 503, // Service Unavailable or network error
            json: async () => ({ success: false, message: "Network error or server unavailable." }),
            text: async () => ("Network error or server unavailable.") // Add text() for robustness
        };
    }
}
// --- ---------------------------- ---

const BufferBag = () => {
    const [balance, setBalance] = useState(null);
    const [loadingBalance, setLoadingBalance] = useState(true);
    const [fetchError, setFetchError] = useState(null);

    const [depositAmountInput, setDepositAmountInput] = useState('');
    const [withdrawAmountInput, setWithdrawAmountInput] = useState('');
    const [isActionLoading, setIsActionLoading] = useState(false);
    const [actionMessage, setActionMessage] = useState({ type: '', text: '' });

    const navigate = useNavigate();

    const fetchBufferBalance = useCallback(async () => {
        setLoadingBalance(true);
        setFetchError(null);
        console.log("BufferBag.js: fetchBufferBalance START.");
        try {
            console.log("BufferBag.js: Attempting authenticatedFetch for /api/buffer/balance");
            const response = await authenticatedFetch('/api/buffer/balance');
            console.log("BufferBag.js: authenticatedFetch for balance RESPONSE RECEIVED. Status:", response.status, "Ok:", response.ok, "Object:", response);

            if (!response) {
                console.error("BufferBag.js: authenticatedFetch returned undefined or null.");
                throw new Error('Failed to fetch: No response from server.');
            }
            if (typeof response.json !== 'function') {
                 console.error("BufferBag.js: Response object does not have a .json method.", response);
                 const textResponse = await response.text().catch(() => "Could not read response text.");
                 throw new Error(`Invalid response format from server (not JSON). Content: ${textResponse}`);
            }

            console.log("BufferBag.js: Attempting response.json() for balance");
            const data = await response.json();
            console.log("BufferBag.js: Parsed data from balance response:", data);

            if (response.ok && data && data.success && typeof data.balance !== 'undefined') {
                console.log(`BufferBag.js: SUCCESS from API. Setting balance to: '${data.balance}' (type: ${typeof data.balance})`);
                setBalance(data.balance);
            } else {
                const errorMessage = data?.message || `API error: Failed to load buffer balance (Status: ${response.status}, Ok: ${response.ok}, Success: ${data?.success}, Balance defined: ${typeof data?.balance !== 'undefined'})`;
                console.error("BufferBag.js: API error or !response.ok for balance:", errorMessage, "Full data:", data, "Full response:", response);
                throw new Error(errorMessage);
            }
        } catch (err) {
            console.error("BufferBag.js: CATCH block in fetchBufferBalance. Error message:", err.message, "Full error object:", err, "Stack:", err.stack);
            setFetchError(err.message || "An error occurred while fetching balance.");
             if (err.message?.includes("401") || (err.response && err.response.status === 401) || err.status === 401 ) {
                console.log("BufferBag.js: Auth error in fetchBufferBalance, navigating to login.");
                navigate('/login');
            }
        } finally {
            console.log("BufferBag.js: fetchBufferBalance FINALLY. Setting loadingBalance to false.");
            setLoadingBalance(false);
        }
    // --- MODIFIED DEPENDENCY ARRAY HERE ---
    // Removed `loadingBalance` (the state value) from dependencies.
    // State setters (setLoadingBalance, setFetchError, setBalance) and navigate are stable.
    }, [navigate, setLoadingBalance, setFetchError, setBalance]);

    useEffect(() => {
        console.log("BufferBag.js: useEffect initial call to fetchBufferBalance because fetchBufferBalance changed or on mount.");
        fetchBufferBalance();
    }, [fetchBufferBalance]); // This will now only run when fetchBufferBalance definition (useCallback) changes or on mount.

    const handleDepositAmountChange = (e) => {
        const value = e.target.value;
        if (/^\d*\.?\d{0,2}$/.test(value) || value === '') {
            setDepositAmountInput(value);
            setActionMessage({ type: '', text: '' });
        }
    };

    const handleWithdrawAmountChange = (e) => {
        const value = e.target.value;
        if (/^\d*\.?\d{0,2}$/.test(value) || value === '') {
            setWithdrawAmountInput(value);
            setActionMessage({ type: '', text: '' });
        }
    };

    const handleDeposit = async (e) => {
        e.preventDefault();
        const depositAmount = parseFloat(depositAmountInput);
        if (isNaN(depositAmount) || depositAmount <= 0) {
            setActionMessage({ type: 'error', text: 'Please enter a valid amount to deposit.' });
            return;
        }
        console.log("BufferBag.js: handleDeposit - Setting isActionLoading to true.");
        setIsActionLoading(true);
        setActionMessage({ type: '', text: '' });
        try {
            const response = await authenticatedFetch('/api/buffer/deposit', {
                method: 'POST',
                body: JSON.stringify({ amount: depositAmount, payment_method_nonce: "simulated-card-nonce" })
            });
            if (!response || typeof response.json !== 'function') {
                 const textResponse = response ? await response.text().catch(() => "Could not read response text.") : "No response object";
                 throw new Error(`Invalid response from deposit: ${textResponse}`);
            }
            const data = await response.json();
            if (response.ok && data.success) {
                setActionMessage({ type: 'success', text: data.message || "Deposit action processed." });
                setDepositAmountInput('');
                console.log("BufferBag.js: handleDeposit - About to await fetchBufferBalance after successful deposit.");
                await fetchBufferBalance(); // This will re-fetch the balance correctly.
                console.log("BufferBag.js: handleDeposit - fetchBufferBalance completed after deposit.");
            } else {
                throw new Error(data.message || "Deposit failed.");
            }
        } catch (err) {
            console.error("BufferBag.js: CATCH in handleDeposit. Error:", err.message);
            setActionMessage({ type: 'error', text: `Deposit Error: ${err.message}` });
            if (err.response?.status === 401 || err.status === 401 || err.message?.includes("401")) navigate('/login');
        } finally {
            console.log("BufferBag.js: handleDeposit FINALLY, setting isActionLoading to false.");
            setIsActionLoading(false);
        }
    };

    const handleWithdraw = async (e) => {
        e.preventDefault();
        const withdrawAmount = parseFloat(withdrawAmountInput);
        if (isNaN(withdrawAmount) || withdrawAmount <= 0) {
            setActionMessage({ type: 'error', text: 'Please enter a valid amount to withdraw.' });
            return;
        }
        const numericBalance = parseFloat(balance);
        if (balance === null || isNaN(numericBalance) || withdrawAmount > numericBalance) {
            setActionMessage({ type: 'error', text: 'Withdrawal amount exceeds buffer balance or balance is invalid.' });
            return;
        }
        console.log("BufferBag.js: handleWithdraw - Setting isActionLoading to true.");
        setIsActionLoading(true);
        setActionMessage({ type: '', text: '' });
        try {
            const response = await authenticatedFetch('/api/buffer/withdraw', {
                method: 'POST',
                body: JSON.stringify({ amount: withdrawAmount })
            });
            if (!response || typeof response.json !== 'function') {
                const textResponse = response ? await response.text().catch(() => "Could not read response text.") : "No response object";
                throw new Error(`Invalid response from withdraw: ${textResponse}`);
            }
            const data = await response.json();
            if (response.ok && data.success) {
                setActionMessage({ type: 'success', text: data.message || "Withdrawal action processed." });
                setWithdrawAmountInput('');
                console.log("BufferBag.js: handleWithdraw - About to await fetchBufferBalance after successful withdrawal.");
                await fetchBufferBalance(); // This will re-fetch the balance correctly.
                console.log("BufferBag.js: handleWithdraw - fetchBufferBalance completed after withdrawal.");
            } else {
                throw new Error(data.message || "Withdrawal failed.");
            }
        } catch (err) {
            console.error("BufferBag.js: CATCH in handleWithdraw. Error:", err.message);
            setActionMessage({ type: 'error', text: `Withdrawal Error: ${err.message}` });
            if (err.response?.status === 401 || err.status === 401 || err.message?.includes("401")) navigate('/login');
        } finally {
            console.log("BufferBag.js: handleWithdraw FINALLY, setting isActionLoading to false.");
            setIsActionLoading(false);
        }
    };

    const currentNumericBalance = balance !== null ? parseFloat(balance) : null;

    return (
        <div className="container buffer-container">
            <div className="form-card buffer-card">
                <BackButton />
                <h2 style={{ marginTop: '10px', textAlign: 'center' }}>My Buffer Bag</h2>

                <p className="buffer-info">
                    2% of each BNPL instalment payment you make automatically goes into your Buffer Bag.
                    This can be used as a safety net or savings towards your future payments. You can also deposit or withdraw funds directly at any time.
                    Keep up the responsible borrowing!
                </p>

                {console.log("BufferBag.js: RENDERING UI. loadingBalance:", loadingBalance, "fetchError:", fetchError, "balance:", balance)}
                {loadingBalance && <p className="loading-message">Loading your buffer balance...</p>}

                {!loadingBalance && fetchError && (
                    <p className="error-message" style={{ textAlign: 'center' }}>
                        Error loading balance: {fetchError}
                    </p>
                )}

                {!loadingBalance && !fetchError && balance === null && (
                     <p className="info-text" style={{ textAlign: 'center' }}>
                        Buffer balance is not yet available.
                     </p>
                )}

                {!loadingBalance && !fetchError && balance !== null && (
                    <div className="balance-display">
                        Current Buffer Balance:
                        <span className="balance-amount">£{balance}</span>
                    </div>
                )}

                <div className="buffer-actions">
                    <form className="buffer-form" onSubmit={handleDeposit}>
                        <h4>Deposit to Buffer Bag</h4>
                        <p className="info-text">(This is a simulation - no real card payment will be processed)</p>
                        <input
                            type="number"
                            placeholder="£ Deposit Amount"
                            value={depositAmountInput}
                            onChange={handleDepositAmountChange}
                            disabled={isActionLoading}
                            min="0.01" step="0.01"
                            required
                            className='form-input'
                        />
                        <button
                            type="submit"
                            className="btn deposit-button"
                            disabled={isActionLoading || !depositAmountInput || parseFloat(depositAmountInput) <= 0}>
                            {isActionLoading ? 'Processing...' : 'Deposit'}
                        </button>
                    </form>

                    <form className="buffer-form" onSubmit={handleWithdraw}>
                        <h4>Withdraw from Buffer Bag</h4>
                        <p className="info-text">(This is a simulation - no real bank transfer will occur)</p>
                        <input
                            type="number"
                            placeholder="£ Withdraw Amount"
                            value={withdrawAmountInput}
                            onChange={handleWithdrawAmountChange}
                            disabled={ isActionLoading || currentNumericBalance === null || isNaN(currentNumericBalance) || currentNumericBalance <= 0 }
                            min="0.01" step="0.01"
                            max={currentNumericBalance || 0}
                            required
                            className='form-input'
                        />
                        <button
                            type="submit"
                            className="btn withdraw-button"
                            disabled={ isActionLoading || !withdrawAmountInput || parseFloat(withdrawAmountInput) <= 0 || currentNumericBalance === null || isNaN(currentNumericBalance) || currentNumericBalance <= 0 || parseFloat(withdrawAmountInput) > currentNumericBalance }>
                            {isActionLoading ? 'Processing...' : 'Withdraw'}
                        </button>
                    </form>
                </div>

                {actionMessage.text && (
                    <div className={`message ${actionMessage.type}`} style={{ marginTop: '20px', textAlign: 'center' }}>
                        {actionMessage.text}
                    </div>
                )}
            </div>
        </div>
    );
};

export default BufferBag;