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
    } else { // if no token is found, log a warning and return a simulated unauthorized response
        console.warn('Auth token missing for API call to', url);
        return { ok: false, status: 401, json: async () => ({ success: false, message: 'Authentication token missing.' }) };
    }
    try {
        // determine the base api url from environment variables or default to localhost:5000
        const apiUrl = process.env.REACT_APP_API_BASE_URL || 'http://localhost:5000';
        // make the actual fetch request to the backend
        const response = await fetch(`${apiUrl}${url}`, { ...options, headers });
        return response; // return the raw response object
    } catch (error) { // catch network errors or other issues during the fetch itself
        console.error(`API Fetch Error for ${url}:`, error);
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

    // memoized function to fetch the buffer bag balance from the backend
    const fetchBufferBalance = useCallback(async () => {
        setLoadingBalance(true); // indicate that balance loading has started
        setFetchError(null); // clear any previous fetch errors
        console.log('BufferBag.js: fetchBufferBalance START.');
        try {
            console.log('BufferBag.js: Attempting authenticatedFetch for /api/buffer/balance');
            const response = await authenticatedFetch('/api/buffer/balance'); // call the backend endpoint
            console.log('BufferBag.js: authenticatedFetch for balance RESPONSE RECEIVED. Status:', response.status, 'Ok:', response.ok, 'Object:', response);

            if (!response) { // check if response is unexpectedly null/undefined
                console.error('BufferBag.js: authenticatedFetch returned undefined or null.');
                throw new Error('Failed to fetch: No response from server.');
            }
            if (typeof response.json !== 'function') { // check if response has a .json method
                 console.error('BufferBag.js: Response object does not have a .json method.', response);
                 const textResponse = await response.text().catch(() => 'Could not read response text.');
                 throw new Error(`Invalid response format from server (not JSON). Content: ${textResponse}`);
            }

            console.log('BufferBag.js: Attempting response.json() for balance');
            const data = await response.json(); // parse the json response
            console.log('BufferBag.js: Parsed data from balance response:', data);

            // if response is ok, success flag is true, and balance data is present
            if (response.ok && data && data.success && typeof data.balance !== 'undefined') {
                console.log(`BufferBag.js: SUCCESS from API. Setting balance to: '${data.balance}' (type: ${typeof data.balance})`);
                setBalance(data.balance); // update the balance state
            } else { // if api call was not successful or data is missing
                const errorMessage = data?.message || `API error: Failed to load buffer balance (Status: ${response.status}, Ok: ${response.ok}, Success: ${data?.success}, Balance defined: ${typeof data?.balance !== 'undefined'})`;
                console.error('BufferBag.js: API error or !response.ok for balance:', errorMessage, 'Full data:', data, 'Full response:', response);
                throw new Error(errorMessage); // throw an error to be caught by catch block
            }
        } catch (err) { // catch any errors from the try block
            console.error('BufferBag.js: CATCH block in fetchBufferBalance. Error message:', err.message, 'Full error object:', err, 'Stack:', err.stack);
            setFetchError(err.message || 'An error occurred while fetching balance.'); // set the fetch error state
             // if it's an authentication error (401), redirect to login page
             if (err.message?.includes('401') || (err.response && err.response.status === 401) || err.status === 401 ) {
                console.log('BufferBag.js: Auth error in fetchBufferBalance, navigating to login.');
                navigate('/login');
            }
        } finally { // this block executes regardless of success or failure
            console.log('BufferBag.js: fetchBufferBalance FINALLY. Setting loadingBalance to false.');
            setLoadingBalance(false); // indicate that balance loading has finished
        }
    // dependencies for usecallback ensure stability based on these values
    }, [navigate, setLoadingBalance, setFetchError, setBalance]);

    // effect hook to fetch buffer balance when the component mounts
    // or when the fetchbufferbalance function itself changes
    useEffect(() => {
        console.log('BufferBag.js: useEffect initial call to fetchBufferBalance because fetchBufferBalance changed or on mount.');
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
        console.log('BufferBag.js: handleDeposit - Setting isActionLoading to true.');
        setIsActionLoading(true); // indicate that an action is processing
        setActionMessage({ type: '', text: '' }); // clear previous messages
        try {
            // call the backend api to process the deposit
            const response = await authenticatedFetch('/api/buffer/deposit', {
                method: 'POST',
                body: JSON.stringify({ amount: depositAmount, payment_method_nonce: 'simulated-card-nonce' }) // send amount and a simulated nonce
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
                console.log('BufferBag.js: handleDeposit - About to await fetchBufferBalance after successful deposit.');
                await fetchBufferBalance(); // re-fetch the balance to show the updated amount
                console.log('BufferBag.js: handleDeposit - fetchBufferBalance completed after deposit.');
            } else { // if api call failed
                throw new Error(data.message || 'Deposit failed.'); // throw error with backend message or default
            }
        } catch (err) { // catch any errors from the deposit process
            console.error('BufferBag.js: CATCH in handleDeposit. Error:', err.message);
            setActionMessage({ type: 'error', text: `Deposit Error: ${err.message}` }); // show error message
            // if it's an auth error, redirect to login
            if (err.response?.status === 401 || err.status === 401 || err.message?.includes('401')) navigate('/login');
        } finally { // always execute this block
            console.log('BufferBag.js: handleDeposit FINALLY, setting isActionLoading to false.');
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
        console.log('BufferBag.js: handleWithdraw - Setting isActionLoading to true.');
        setIsActionLoading(true); // indicate action processing
        setActionMessage({ type: '', text: '' }); // clear previous messages
        try {
            // call backend api to process withdrawal
            const response = await authenticatedFetch('/api/buffer/withdraw', {
                method: 'POST',
                body: JSON.stringify({ amount: withdrawAmount }) // send withdrawal amount
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
                console.log('BufferBag.js: handleWithdraw - About to await fetchBufferBalance after successful withdrawal.');
                await fetchBufferBalance(); // re-fetch balance to show updated amount
                console.log('BufferBag.js: handleWithdraw - fetchBufferBalance completed after withdrawal.');
            } else { // if api call failed
                throw new Error(data.message || 'Withdrawal failed.'); // throw error
            }
        } catch (err) { // catch errors during withdrawal process
            console.error('BufferBag.js: CATCH in handleWithdraw. Error:', err.message);
            setActionMessage({ type: 'error', text: `Withdrawal Error: ${err.message}` }); // show error message
            // if auth error, redirect to login
            if (err.response?.status === 401 || err.status === 401 || err.message?.includes('401')) navigate('/login');
        } finally { // always executed
            console.log('BufferBag.js: handleWithdraw FINALLY, setting isActionLoading to false.');
            setIsActionLoading(false); // reset action loading state
        }
    };

    // derives the current balance as a number, or null if not available/parsed
    const currentNumericBalance = balance !== null ? parseFloat(balance) : null;

    // jsx for rendering the component's ui
    return (
        <div className='container buffer-container'> {/* main container for the page */}
            <div className='form-card buffer-card'> {/* styled card for the content */}
                <BackButton /> {/* component to navigate back */}
                <h2 style={{ marginTop: '10px', textAlign: 'center' }}>My Buffer Bag</h2> {/* page title */}

                {/* informational paragraph about the buffer bag feature */}
                <p className='buffer-info'>
                    2% of each BNPL instalment payment automatically goes into the Buffer Bag.
                    This can be used as a safety net or savings towards future payments. Funds can also be deposited or withdrawn directly at any time.
                    Keep up the responsible borrowing!
                </p>

                {/* console log for observing ui rendering state */}
                {console.log('BufferBag.js: RENDERING UI. loadingBalance:', loadingBalance, 'fetchError:', fetchError, 'balance:', balance)}
                {/* conditional rendering: show loading message while balance is being fetched */}
                {loadingBalance && <p className='loading-message'>Loading buffer balance...</p>}

                {/* conditional rendering: show error message if fetching balance failed */}
                {!loadingBalance && fetchError && (
                    <p className='error-message' style={{ textAlign: 'center' }}>
                        Error loading balance: {fetchError}
                    </p>
                )}

                {/* conditional rendering: show message if balance isn't available after loading (and no error) */}
                {!loadingBalance && !fetchError && balance === null && (
                     <p className='info-text' style={{ textAlign: 'center' }}>
                        Buffer balance is not yet available.
                     </p>
                )}

                {/* conditional rendering: display the current balance if successfully loaded */}
                {!loadingBalance && !fetchError && balance !== null && (
                    <div className='balance-display'>
                        Current Buffer Balance:
                        <span className='balance-amount'>£{balance}</span> {/* displays balance with currency symbol */}
                    </div>
                )}

                {/* container for deposit and withdrawal action forms */}
                <div className='buffer-actions'>
                    {/* deposit form */}
                    <form className='buffer-form' onSubmit={handleDeposit}>
                        <h4>Deposit to Buffer Bag</h4> {/* form title */}
                        <input
                            type='number' // input for deposit amount
                            placeholder='£ Deposit Amount' // placeholder text
                            value={depositAmountInput} // controlled input value
                            onChange={handleDepositAmountChange} // handler for input changes
                            disabled={isActionLoading} // disable if an action is processing
                            min='0.01' step='0.01' // html5 validation attributes
                            required // html5 validation
                            className='form-input' // class for styling
                        />
                        <button
                            type='submit' // submit button for deposit
                            className='btn deposit-button' // css classes for styling
                            // button is disabled if an action is loading, input is empty, or amount is not positive
                            disabled={isActionLoading || !depositAmountInput || parseFloat(depositAmountInput) <= 0}>
                            {isActionLoading ? 'Processing...' : 'Deposit'} {/* dynamic button text based on loading state */}
                        </button>
                    </form>

                    {/* withdrawal form */}
                    <form className='buffer-form' onSubmit={handleWithdraw}>
                        <h4>Withdraw from Buffer Bag</h4> {/* form title */}
                        <input
                            type='number' // input for withdrawal amount
                            placeholder='£ Withdraw Amount' // placeholder text
                            value={withdrawAmountInput} // controlled input value
                            onChange={handleWithdrawAmountChange} // handler for input changes
                            // disable if action loading, balance not available/valid, or balance is zero
                            disabled={ isActionLoading || currentNumericBalance === null || isNaN(currentNumericBalance) || currentNumericBalance <= 0 }
                            min='0.01' step='0.01' // html5 validation
                            max={currentNumericBalance || 0} // html5 validation: max is current balance
                            required // html5 validation: field is required
                            className='form-input' // class for styling
                        />
                        <button
                            type='submit' // submit button for withdrawal
                            className='btn withdraw-button' // css classes for styling
                            // button disabled under various conditions (loading, invalid input, insufficient balance)
                            disabled={ isActionLoading || !withdrawAmountInput || parseFloat(withdrawAmountInput) <= 0 || currentNumericBalance === null || isNaN(currentNumericBalance) || currentNumericBalance <= 0 || parseFloat(withdrawAmountInput) > currentNumericBalance }>
                            {isActionLoading ? 'Processing...' : 'Withdraw'} {/* dynamic button text */}
                        </button>
                    </form>
                </div>

                {/* displays success or error messages after actions */}
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