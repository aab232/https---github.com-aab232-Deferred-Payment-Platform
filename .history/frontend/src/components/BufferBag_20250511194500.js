import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import BackButton from './BackButton';
import './BufferBag.css';

// --- authenticated fetch helper ---
// this function wraps the native fetch api to automatically include the authentication token
// and handle some common response scenarios for consistency
async function authenticatedFetch(url, options = {}) {
    // retrieve the auth token from local storage
    const token = localStorage.getItem('authToken');
    // prepare headers, defaulting to json content type and spreading any custom options
    const headers = { 'Content-Type': 'application/json', ...options.headers };
    if (token) { // if a token exists, add it to the authorization header
        headers['Authorization'] = `Bearer ${token}`;
    } else { // if no token is found, log a warning and return a simulated unauthorised response
        console.warn('Auth token missing for API call to', url); // important warning
        return { ok: false, status: 401, json: async () => ({ success: false, message: 'Authentication token missing.' }) };
    }
    try {
        // determine the base api url from environment variables or default to localhost:5000
        const apiUrl = process.env.REACT_APP_API_BASE_URL || 'http://localhost:5000';
        // make the actual fetch request to the backend
        const response = await fetch(`${apiUrl}${url}`, { ...options, headers });
        return response; // return the raw response object
    } catch (error) { // catch network errors or other issues during the fetch itself
        console.error(`API Fetch Error for ${url}:`, error); // important error log
        // ensure a fetch-like response is returned for consistent error handling by the caller
        return {
            ok: false,
            status: 503, // service unavailable or network error
            json: async () => ({ success: false, message: 'Network error or server unavailable.' }),
            text: async () => ('Network error or server unavailable.')
        };
    }
}
// --- ---------------------------- ---

// defines the bufferbag react component
const BufferBag = () => {
    // state for the current buffer bag balance fetched from the server
    const [balance, setBalance] = useState(null);
    // state to indicate if the balance is currently being loaded
    const [loadingBalance, setLoadingBalance] = useState(true);
    // state to store any error encountered while fetching the balance
    const [fetchError, setFetchError] = useState(null);

    // state for the value in the deposit amount input field
    const [depositAmountInput, setDepositAmountInput] = useState('');
    // state for the value in the withdrawal amount input field
    const [withdrawAmountInput, setWithdrawAmountInput] = useState('');
    // state to indicate if a deposit/withdrawal action is currently processing
    const [isActionLoading, setIsActionLoading] = useState(false);
    // state for displaying messages (success/error) after actions
    const [actionMessage, setActionMessage] = useState({ type: '', text: '' });

    // hook for programmatic navigation
    const navigate = useNavigate();

    // function to fetch the buffer bag balance from the backend
    const fetchBufferBalance = useCallback(async () => {
        setLoadingBalance(true); // indicate that balance loading has started
        setFetchError(null); // clear any previous fetch errors
        try {
            const response = await authenticatedFetch('/api/buffer/balance'); // call the backend endpoint

            if (!response) { // check if response is unexpectedly null/undefined
                console.error('BufferBag.js: authenticatedFetch is undefined or null.'); // critical error
                throw new Error('Failed to fetch: No response from server.');
            }
            if (typeof response.json !== 'function') { // check if response has a .json method
                 console.error('BufferBag.js: Response object does not have a .json method.', response); // critical error
                 const textResponse = await response.text().catch(() => 'Could not read response text.');
                 throw new Error(`Invalid response format from server (not JSON). Content: ${textResponse}`);
            }

            const data = await response.json(); // parse the json response

            // if response is ok, success flag is true, and balance data is present
            if (response.ok && data && data.success && typeof data.balance !== 'undefined') {
                setBalance(data.balance); // update the balance state
            } else { // if api call was not successful or data is missing
                const errorMessage = data?.message || `API error: Could not load buffer balance (Status: ${response.status}, Ok: ${response.ok}, Success: ${data?.success}, Balance defined: ${typeof data?.balance !== 'undefined'})`;
                console.error('BufferBag.js: API error or !response.ok for balance:', errorMessage, 'Full data:', data, 'Full response:', response); // error for api failure
                throw new Error(errorMessage); // throw an error to be caught by catch block
            }
        } catch (err) { // catch any errors from the try block
            console.error('BufferBag.js: CATCH block in fetchBufferBalance. Error message:', err.message, 'Full error object:', err, 'Stack:', err.stack); // comprehensive error log
            setFetchError(err.message || 'An error occurred while fetching balance.'); // set the fetch error state
             // if it's an authentication error (401), redirect to login page
             if (err.message?.includes('401') || (err.response && err.response.status === 401) || err.status === 401 ) {
                navigate('/login');
            }
        } finally {
            setLoadingBalance(false); // indicate that balance loading has finished
        }
    }, [navigate, setLoadingBalance, setFetchError, setBalance]);

    // effect hook to fetch buffer balance when the component mounts
    // or when the fetchbufferbalance function itself changes
    useEffect(() => {
        fetchBufferBalance(); // call the fetch function
    }, [fetchBufferBalance]); // dependency array for the effect

    // handles changes to the deposit amount input field
    const handleDepositAmountChange = (e) => {
        const value = e.target.value; // get the current input value
        // regex to allow only numbers and up to two decimal places, or an empty string
        if (/^\d*\.?\d{0,2}$/.test(value) || value === '') {
            setDepositAmountInput(value); // update the deposit input state
            setActionMessage({ type: '', text: '' }); // clear any previous action messages
        }
    };

    // handles changes to the withdrawal amount input field
    const handleWithdrawAmountChange = (e) => {
        const value = e.target.value; // get the current value
        // regex, same as deposit input
        if (/^\d*\.?\d{0,2}$/.test(value) || value === '') {
            setWithdrawAmountInput(value); // update state for withdrawal input
            setActionMessage({ type: '', text: '' }); // clear action messages
        }
    };

    // handles the submission of the deposit form
    const handleDeposit = async (e) => {
        e.preventDefault(); // prevent default form submission behavior
        const depositAmount = parseFloat(depositAmountInput); // parse the input to a number
        // validate the deposit amount
        if (isNaN(depositAmount) || depositAmount <= 0) {
            setActionMessage({ type: 'error', text: 'Please enter a valid amount to deposit.' });
            return; // exit if invalid
        }
        setIsActionLoading(true); // indicate that an action is processing
        setActionMessage({ type: '', text: '' }); // clear previous messages
        try {
            // call the backend api to process the deposit
            const response = await authenticatedFetch('/api/buffer/deposit', {
                method: 'POST',
                body: JSON.stringify({ amount: depositAmount, payment_method_nonce: 'simulated-card-nonce' })
            });
            // validate the response object before trying to parse json
            if (!response || typeof response.json !== 'function') {
                 const textResponse = response ? await response.text().catch(() => 'Could not read response text.') : 'No response object';
                 throw new Error(`Invalid response from deposit: ${textResponse}`);
            }
            const data = await response.json(); // parse the response
            // if api call was successful
            if (response.ok && data.success) {
                setActionMessage({ type: 'success', text: data.message || 'Deposit action processed.' }); // show success message
                setDepositAmountInput(''); // clear the deposit input field
                await fetchBufferBalance(); // re-fetch the balance to show the updated amount
            } else { // if api call failed
                throw new Error(data.message || 'Deposit failed.'); // throw error with backend message or default
            }
        } catch (err) { // catch any errors from the deposit process
            console.error('BufferBag.js: CATCH in handleDeposit. Error:', err.message); // important error log
            setActionMessage({ type: 'error', text: `Deposit Error: ${err.message}` }); // show error message
            // if it's an auth error, redirect to login
            if (err.response?.status === 401 || err.status === 401 || err.message?.includes('401')) navigate('/login');
        } finally {
            setIsActionLoading(false); // indicate that action processing is finished
        }
    };

    // handles the submission of the withdrawal form
    const handleWithdraw = async (e) => {
        e.preventDefault(); // prevent default form submission
        const withdrawAmount = parseFloat(withdrawAmountInput); // parse withdrawal amount
        // validate withdrawal amount
        if (isNaN(withdrawAmount) || withdrawAmount <= 0) {
            setActionMessage({ type: 'error', text: 'Please enter a valid amount to withdraw.' });
            return; // exit if invalid
        }
        const numericBalance = parseFloat(balance); // parse current balance
        // ensure balance is valid and withdrawal amount doesn't exceed balance
        if (balance === null || isNaN(numericBalance) || withdrawAmount > numericBalance) {
            setActionMessage({ type: 'error', text: 'Withdrawal amount exceeds buffer balance or balance is invalid.' });
            return; // exit if validation fails
        }
        setIsActionLoading(true); // indicate action processing
        setActionMessage({ type: '', text: '' }); // clear previous messages
        try {
            // call backend api to process withdrawal
            const response = await authenticatedFetch('/api/buffer/withdraw', {
                method: 'POST',
                body: JSON.stringify({ amount: withdrawAmount })
            });
            // validate response object
            if (!response || typeof response.json !== 'function') {
                const textResponse = response ? await response.text().catch(() => 'Could not read response text.') : 'No response object';
                throw new Error(`Invalid response from withdraw: ${textResponse}`);
            }
            const data = await response.json(); // parse response
            // if api call successful
            if (response.ok && data.success) {
                setActionMessage({ type: 'success', text: data.message || 'Withdrawal action processed.' }); // show success message
                setWithdrawAmountInput(''); // clear withdrawal input field
                await fetchBufferBalance(); // re-fetch balance to show updated amount
            } else { // if api call failed
                throw new Error(data.message || 'Withdrawal failed.'); // throw error
            }
        } catch (err) { // catch errors during withdrawal process
            console.error('BufferBag.js: CATCH in handleWithdraw. Error:', err.message); // important error log
            setActionMessage({ type: 'error', text: `Withdrawal Error: ${err.message}` }); // show error message
            // if auth error, redirect to login
            if (err.response?.status === 401 || err.status === 401 || err.message?.includes('401')) navigate('/login');
        } finally { // always executed
            setIsActionLoading(false); // reset action loading state
        }
    };

    // derives the current balance as a number, or null if not available/parsed
    const currentNumericBalance = balance !== null ? parseFloat(balance) : null;

    // jsx for rendering the component's ui
    return (
        <div className='container buffer-container'>
            <div className='form-card buffer-card'>
                <BackButton />
                <h2 style={{ marginTop: '10px', textAlign: 'center' }}>My Buffer Bag</h2>

                <p className='buffer-info'>
                    2% of each BNPL instalment payment automatically goes into the Buffer Bag.
                    This can be used as a safety net or savings towards future payments. Funds can also be deposited or withdrawn directly at any time.
                    Keep up the responsible borrowing!
                </p>

                {loadingBalance && <p className='loading-message'>Loading buffer balance...</p>}

                {!loadingBalance && fetchError && (
                    <p className='error-message' style={{ textAlign: 'center' }}>
                        Error loading balance: {fetchError}
                    </p>
                )}

                {!loadingBalance && !fetchError && balance === null && (
                     <p className='info-text' style={{ textAlign: 'center' }}>
                        Buffer balance is not yet available.
                     </p>
                )}

                {!loadingBalance && !fetchError && balance !== null && (
                    <div className='balance-display'>
                        Current Buffer Balance:
                        <span className='balance-amount'>£{balance}</span>
                    </div>
                )}

                <div className='buffer-actions'>
                    <form className='buffer-form' onSubmit={handleDeposit}>
                        <h4>Deposit to Buffer Bag</h4>
                        <input
                            type='number'
                            placeholder='£ Deposit Amount'
                            value={depositAmountInput}
                            onChange={handleDepositAmountChange}
                            disabled={isActionLoading}
                            min='0.01' step='0.01'
                            required
                            className='form-input'
                        />
                        <button
                            type='submit'
                            className='btn deposit-button'
                            disabled={isActionLoading || !depositAmountInput || parseFloat(depositAmountInput) <= 0}>
                            {isActionLoading ? 'Processing...' : 'Deposit'}
                        </button>
                    </form>

                    <form className='buffer-form' onSubmit={handleWithdraw}>
                        <h4>Withdraw from Buffer Bag</h4>
                        <input
                            type='number'
                            placeholder='£ Withdraw Amount'
                            value={withdrawAmountInput}
                            onChange={handleWithdrawAmountChange}
                            disabled={ isActionLoading || currentNumericBalance === null || isNaN(currentNumericBalance) || currentNumericBalance <= 0 }
                            min='0.01' step='0.01'
                            max={currentNumericBalance || 0}
                            required
                            className='form-input'
                        />
                        <button
                            type='submit'
                            className='btn withdraw-button'
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

// export the component for use in other parts of the application
export default BufferBag;