// src/components/BufferBag.js

// react core hooks for state, side effects, and memoization
import React, { useState, useEffect, useCallback } from 'react';
// hook from react-router for programmatic navigation
import { useNavigate } from 'react-router-dom';
// component for a 'back' navigation button
import BackButton from './BackButton';
// specific css styles for this bufferbag component
import './BufferBag.css';

// --- authenticated fetch helper ---
// a wrapper around the native fetch api to automatically include an authentication token
// and provide consistent response/error objects
async function authenticatedFetch(url, options = {}) {
    // retrieves the auth token from local storage
    const token = localStorage.getItem('authToken');
    // prepares http headers, defaulting to json content type and including any passed options
    const headers = { 'Content-Type': 'application/json', ...options.headers };
    if (token) { // if a token exists, add it to the 'authorization' header
        headers['Authorization'] = `Bearer ${token}`;
    } else { // if no token is found, log a warning and return a simulated unauthorized response
        console.warn('Auth token missing for API call to', url);
        return { ok: false, status: 401, json: async () => ({ success: false, message: 'Authentication token missing.' }) };
    }
    try {
        // determine the base api url from environment variables or default to localhost:5000
        const apiUrl = process.env.REACT_APP_API_BASE_URL || 'http://localhost:5000';
        // perform the fetch request to the backend
        const response = await fetch(`${apiUrl}${url}`, { ...options, headers });
        return response; // return the raw response object
    } catch (error) { // catch network errors or other issues during the fetch operation itself
        console.error(`API Fetch Error for ${url}:`, error);
        // return a fetch-like response object for consistent error handling by the caller
        return {
            ok: false,
            status: 503, // indicates service unavailable or a network error
            json: async () => ({ success: false, message: 'Network error or server unavailable.' }),
            text: async () => ('Network error or server unavailable.') // provides a .text() method for robustness
        };
    }
}
// --- ---------------------------- ---

// defines the bufferbag react component
const BufferBag = () => {
    // state to hold the current buffer bag balance fetched from the server
    const [balance, setBalance] = useState(null);
    // state to track whether the balance is currently being loaded
    const [loadingBalance, setLoadingBalance] = useState(true);
    // state to store any error message encountered while fetching the balance
    const [fetchError, setFetchError] = useState(null);

    // state for the value in the deposit amount input field
    const [depositAmountInput, setDepositAmountInput] = useState('');
    // state for the value in the withdrawal amount input field
    const [withdrawAmountInput, setWithdrawAmountInput] = useState('');
    // state to indicate if a deposit or withdrawal action is currently in progress (for disabling buttons)
    const [isActionLoading, setIsActionLoading] = useState(false);
    // state to display success or error messages to the user after an action
    const [actionMessage, setActionMessage] = useState({ type: '', text: '' }); // 'type' can be 'success' or 'error'

    // react-router hook for programmatic navigation
    const navigate = useNavigate();

    // memoized asynchronous function to fetch the buffer bag balance from the backend
    const fetchBufferBalance = useCallback(async () => {
        setLoadingBalance(true); // set loading state to true at the start of the fetch
        setFetchError(null); // clear any previous errors related to fetching the balance
        console.log('BufferBag.js: fetchBufferBalance START.'); // your existing debug log
        try {
            console.log('BufferBag.js: Attempting authenticatedFetch for /api/buffer/balance'); // your debug log
            const response = await authenticatedFetch('/api/buffer/balance'); // api call to get balance
            console.log('BufferBag.js: authenticatedFetch for balance RESPONSE RECEIVED. Status:', response.status, 'Ok:', response.ok, 'Object:', response); // your debug log

            // check if the response object is valid
            if (!response) {
                console.error('BufferBag.js: authenticatedFetch returned undefined or null.');
                throw new Error('Failed to fetch: No response from server.');
            }
            // check if the response object has a .json method
            if (typeof response.json !== 'function') {
                 console.error('BufferBag.js: Response object does not have a .json method.', response);
                 const textResponse = await response.text().catch(() => 'Could not read response text.'); // attempt to get text if .json fails
                 throw new Error(`Invalid response format from server (not JSON). Content: ${textResponse}`);
            }

            console.log('BufferBag.js: Attempting response.json() for balance'); // your debug log
            const data = await response.json(); // parse the json data from the response
            console.log('BufferBag.js: Parsed data from balance response:', data); // your debug log

            // if the response is ok, the backend indicates success, and balance data is present
            if (response.ok && data && data.success && typeof data.balance !== 'undefined') {
                console.log(`BufferBag.js: SUCCESS from API. Setting balance to: '${data.balance}' (type: ${typeof data.balance})`); // your debug log
                setBalance(data.balance); // update the balance state with the fetched value
            } else { // if the api call was not successful or data is malformed/missing
                const errorMessage = data?.message || `API error: Failed to load buffer balance (Status: ${response.status}, Ok: ${response.ok}, Success: ${data?.success}, Balance defined: ${typeof data?.balance !== 'undefined'})`;
                console.error('BufferBag.js: API error or !response.ok for balance:', errorMessage, 'Full data:', data, 'Full response:', response); // your debug log
                throw new Error(errorMessage); // throw an error to be handled by the catch block
            }
        } catch (err) { // catches errors from the try block (network, parsing, thrown errors)
            console.error('BufferBag.js: CATCH block in fetchBufferBalance. Error message:', err.message, 'Full error object:', err, 'Stack:', err.stack); // your debug log
            setFetchError(err.message || 'An error occurred while fetching balance.'); // update the fetch error state
             // if the error indicates an authentication issue (e.g., status 401)
             if (err.message?.includes('401') || (err.response && err.response.status === 401) || err.status === 401 ) {
                console.log('BufferBag.js: Auth error in fetchBufferBalance, navigating to login.'); // your debug log
                navigate('/login'); // redirect the user to the login page
            }
        } finally { // this block executes after the try or catch block has completed
            console.log('BufferBag.js: fetchBufferBalance FINALLY. Setting loadingBalance to false.'); // your debug log
            setLoadingBalance(false); // set loading state to false as the fetch process is complete
        }
    // dependencies for usecallback: ensures the function is stable unless these change
    // state setters from usestate and navigate are stable by default
    }, [navigate, setLoadingBalance, setFetchError, setBalance]);

    // useeffect hook to call fetchbufferbalance when the component first mounts
    // or if the fetchbufferbalance function reference changes
    useEffect(() => {
        console.log('BufferBag.js: useEffect initial call to fetchBufferBalance because fetchBufferBalance changed or on mount.'); // your debug log
        fetchBufferBalance(); // trigger the balance fetch
    }, [fetchBufferBalance]); // dependency array for the effect

    // event handler for changes in the deposit amount input field
    const handleDepositAmountChange = (e) => {
        const value = e.target.value; // get the current value from the input
        // regex validation to allow only numbers and up to two decimal places, or an empty string
        if (/^\d*\.?\d{0,2}$/.test(value) || value === '') {
            setDepositAmountInput(value); // update the state for the deposit input
            setActionMessage({ type: '', text: '' }); // clear any existing action messages
        }
    };

    // event handler for changes in the withdrawal amount input field
    const handleWithdrawAmountChange = (e) => {
        const value = e.target.value; // get the current value
        // regex validation, same as deposit
        if (/^\d*\.?\d{0,2}$/.test(value) || value === '') {
            setWithdrawAmountInput(value); // update state for withdrawal input
            setActionMessage({ type: '', text: '' }); // clear action messages
        }
    };

    // event handler for submitting the deposit form
    const handleDeposit = async (e) => {
        e.preventDefault(); // prevent the default browser form submission
        const depositAmount = parseFloat(depositAmountInput); // parse the input value to a number
        // validate the deposit amount: must be a positive number
        if (isNaN(depositAmount) || depositAmount <= 0) {
            setActionMessage({ type: 'error', text: 'Please enter a valid amount to deposit.' });
            return; // exit if invalid
        }
        console.log('BufferBag.js: handleDeposit - Setting isActionLoading to true.'); // your debug log
        setIsActionLoading(true); // set loading state for the action
        setActionMessage({ type: '', text: '' }); // clear previous messages
        try {
            // make an authenticated api call to the backend deposit endpoint
            const response = await authenticatedFetch('/api/buffer/deposit', {
                method: 'POST', // http method
                body: JSON.stringify({ amount: depositAmount, payment_method_nonce: 'simulated-card-nonce' }) // send amount and a placeholder nonce
            });
            // validate the response object from the api call
            if (!response || typeof response.json !== 'function') {
                 const textResponse = response ? await response.text().catch(() => 'Could not read response text.') : 'No response object';
                 throw new Error(`Invalid response from deposit: ${textResponse}`);
            }
            const data = await response.json(); // parse the json response
            // if the api call was successful (http ok and backend success flag)
            if (response.ok && data.success) {
                setActionMessage({ type: 'success', text: data.message || 'Deposit action processed.' }); // display success message
                setDepositAmountInput(''); // clear the deposit input field
                console.log('BufferBag.js: handleDeposit - About to await fetchBufferBalance after successful deposit.'); // your debug log
                await fetchBufferBalance(); // refresh the displayed balance
                console.log('BufferBag.js: handleDeposit - fetchBufferBalance completed after deposit.'); // your debug log
            } else { // if api call was not successful
                throw new Error(data.message || 'Deposit failed.'); // throw error with message from backend or default
            }
        } catch (err) { // catch any errors from the try block
            console.error('BufferBag.js: CATCH in handleDeposit. Error:', err.message); // your debug log
            setActionMessage({ type: 'error', text: `Deposit Error: ${err.message}` }); // display error message
            // if authentication error, redirect to login
            if (err.response?.status === 401 || err.status === 401 || err.message?.includes('401')) navigate('/login');
        } finally { // always executed after try/catch
            console.log('BufferBag.js: handleDeposit FINALLY, setting isActionLoading to false.'); // your debug log
            setIsActionLoading(false); // reset the action loading state
        }
    };

    // event handler for submitting the withdrawal form
    const handleWithdraw = async (e) => {
        e.preventDefault(); // prevent default form submission
        const withdrawAmount = parseFloat(withdrawAmountInput); // parse withdrawal amount
        // validate withdrawal amount: must be a positive number
        if (isNaN(withdrawAmount) || withdrawAmount <= 0) {
            setActionMessage({ type: 'error', text: 'Please enter a valid amount to withdraw.' });
            return; // exit if invalid
        }
        const numericBalance = parseFloat(balance); // parse current balance
        // further validation: balance must be valid, and withdrawal cannot exceed balance
        if (balance === null || isNaN(numericBalance) || withdrawAmount > numericBalance) {
            setActionMessage({ type: 'error', text: 'Withdrawal amount exceeds buffer balance or balance is invalid.' });
            return; // exit if validation fails
        }
        console.log('BufferBag.js: handleWithdraw - Setting isActionLoading to true.'); // your debug log
        setIsActionLoading(true); // set loading state for the action
        setActionMessage({ type: '', text: '' }); // clear previous messages
        try {
            // make authenticated api call to backend withdrawal endpoint
            const response = await authenticatedFetch('/api/buffer/withdraw', {
                method: 'POST', // http method
                body: JSON.stringify({ amount: withdrawAmount }) // send withdrawal amount
            });
            // validate response object
            if (!response || typeof response.json !== 'function') {
                const textResponse = response ? await response.text().catch(() => 'Could not read response text.') : 'No response object';
                throw new Error(`Invalid response from withdraw: ${textResponse}`);
            }
            const data = await response.json(); // parse json response
            // if api call successful
            if (response.ok && data.success) {
                setActionMessage({ type: 'success', text: data.message || 'Withdrawal action processed.' }); // display success message
                setWithdrawAmountInput(''); // clear withdrawal input field
                console.log('BufferBag.js: handleWithdraw - About to await fetchBufferBalance after successful withdrawal.'); // your debug log
                await fetchBufferBalance(); // refresh displayed balance
                console.log('BufferBag.js: handleWithdraw - fetchBufferBalance completed after withdrawal.'); // your debug log
            } else { // if api call failed
                throw new Error(data.message || 'Withdrawal failed.'); // throw error
            }
        } catch (err) { // catch errors from withdrawal process
            console.error('BufferBag.js: CATCH in handleWithdraw. Error:', err.message); // your debug log
            setActionMessage({ type: 'error', text: `Withdrawal Error: ${err.message}` }); // display error message
            // if auth error, redirect to login
            if (err.response?.status === 401 || err.status === 401 || err.message?.includes('401')) navigate('/login');
        } finally { // always executed
            console.log('BufferBag.js: handleWithdraw FINALLY, setting isActionLoading to false.'); // your debug log
            setIsActionLoading(false); // reset action loading state
        }
    };

    // convert the string balance state to a number for comparisons and calculations
    const currentNumericBalance = balance !== null ? parseFloat(balance) : null;

    // jsx for rendering the component
    return (
        <div className='container buffer-container'> {/* main page container */}
            <div className='form-card buffer-card'> {/* styled card for content */}
                <BackButton /> {/* back navigation button */}
                <h2 style={{ marginTop: '10px', textAlign: 'center' }}>My Buffer Bag</h2> {/* page title */}

                {/* informational text about the buffer bag feature */}
                <p className='buffer-info'>
                    2% of each BNPL instalment payment you make automatically goes into your Buffer Bag.
                    This can be used as a safety net or savings towards your future payments. You can also deposit or withdraw funds directly at any time.
                    Keep up the responsible borrowing!
                </p>

                {/* your existing log for rendering state */}
                {console.log('BufferBag.js: RENDERING UI. loadingBalance:', loadingBalance, 'fetchError:', fetchError, 'balance:', balance)}
                {/* conditionally render loading message while balance is being fetched */}
                {loadingBalance && <p className='loading-message'>Loading your buffer balance...</p>}

                {/* conditionally render error message if fetching balance failed */}
                {!loadingBalance && fetchError && (
                    <p className='error-message' style={{ textAlign: 'center' }}>
                        Error loading balance: {fetchError}
                    </p>
                )}

                {/* conditionally render message if balance is unavailable after loading (and no error) */}
                {!loadingBalance && !fetchError && balance === null && (
                     <p className='info-text' style={{ textAlign: 'center' }}>
                        Buffer balance is not yet available.
                     </p>
                )}

                {/* conditionally render the current balance if successfully loaded */}
                {!loadingBalance && !fetchError && balance !== null && (
                    <div className='balance-display'>
                        Current Buffer Balance:
                        <span className='balance-amount'>£{balance}</span> {/* displays balance with currency symbol */}
                    </div>
                )}

                {/* container for the deposit and withdrawal action forms */}
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
                            min='0.01' step='0.01' // html5 validation: minimum amount and step
                            required // html5 validation: field is required
                            className='form-input' // css class for styling
                        />
                        <button
                            type='submit' // form submit button
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
                            min='0.01' step='0.01' // html5 validation: minimum amount and step
                            max={currentNumericBalance || 0} // html5 validation: max is current balance
                            required // html5 validation: field is required
                            className='form-input' // css class for styling
                        />
                        <button
                            type='submit' // form submit button
                            className='btn withdraw-button' // css classes for styling
                            // button disabled under various conditions (loading, invalid input, insufficient balance)
                            disabled={ isActionLoading || !withdrawAmountInput || parseFloat(withdrawAmountInput) <= 0 || currentNumericBalance === null || isNaN(currentNumericBalance) || currentNumericBalance <= 0 || parseFloat(withdrawAmountInput) > currentNumericBalance }>
                            {isActionLoading ? 'Processing...' : 'Withdraw'} {/* dynamic button text */}
                        </button>
                    </form>
                </div>

                {/* conditionally display success or error messages after actions */}
                {actionMessage.text && (
                    <div className={`message ${actionMessage.type}`} style={{ marginTop: '20px', textAlign: 'center' }}>
                        {actionMessage.text}
                    </div>
                )}
            </div>
        </div>
    );
};

// export the bufferbag component for use in other parts of the application
export default BufferBag;