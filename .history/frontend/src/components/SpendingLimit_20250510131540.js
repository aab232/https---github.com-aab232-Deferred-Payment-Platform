import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import BackButton from './BackButton';
import './SpendingLimit.css';

// --- authenticated fetch helper ---
async function authenticatedFetch(url, options = {}) {
    const token = localStorage.getItem('authToken');
    const headers = { 'Content-Type': 'application/json', ...options.headers };
    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    } else {
        console.warn('Auth token missing for API call to', url);
        return { ok: false, status: 401, json: async () => ({ success: false, message: 'Authentication token missing.' }), text: async () => 'Authentication token missing.' };
    }
    try {
        const apiUrl = process.env.REACT_APP_API_BASE_URL || 'http://localhost:5000';
        const response = await fetch(`${apiUrl}${url}`, { ...options, headers });
        return response;
    } catch (error) {
        console.error(`API Fetch Error for ${url}:`, error);
        return { ok: false, status: 503, json: async () => ({ success: false, message: 'Network error or server unavailable.' }), text: async () => (error.message || 'Network error or server unavailable.') };
    }
}

// defines spendinglimit react component for users to set a monthly spending cap
const SpendingLimit = () => {
    // react-router hook for programmatic navigation
    const navigate = useNavigate();
    // state to store the user's overall assessed credit limit from the backend
    const [overallCreditLimit, setOverallCreditLimit] = useState(null);
    // state to store the user's current self-set monthly spending limit
    const [currentSpendingLimit, setCurrentSpendingLimit] = useState(null);
    // state for the input field where user enters a new spending limit
    const [newLimitInput, setNewLimitInput] = useState('');
    // state to track if initial limit data is being loaded
    const [isLoading, setIsLoading] = useState(true);
    // state to track if a save/update operation for the limit is in progress
    const [isSaving, setIsSaving] = useState(false);
    // state to display success or error messages to the user
    const [message, setMessage] = useState({ text: '', type: '' }); // 'type' can be 'success', 'error', or 'info'

    // memoized async function to fetch current overall credit limit and spending limit from backend
    const fetchLimits = useCallback(async () => {
        setIsLoading(true); // indicates data loading has started
        setMessage({ text: '', type: '' }); // clears any previous messages
        try {
            // makes an authenticated get request to the spending-limit api endpoint
            const response = await authenticatedFetch('/api/spending-limit');
            const data = await response.json(); // parses the json response

            if (response.ok && data.success) { // if api call was successful and backend confirms success
                // updates state with fetched limits, parsing them as floats
                setOverallCreditLimit(parseFloat(data.overallCreditLimit));
                setCurrentSpendingLimit(data.currentSpendingLimit !== null ? parseFloat(data.currentSpendingLimit) : null);
                // initialises input field with current spending limit if set, otherwise leaves it empty
                setNewLimitInput(data.currentSpendingLimit !== null ? parseFloat(data.currentSpendingLimit).toFixed(2) : '');
            } else { // if api call failed or backend reported an error
                throw new Error(data.message || 'Failed to load spending limits.'); // throws an error with message from backend or default
            }
        } catch (error) { // catches any errors from the try block (fetch, parsing, or thrown errors)
            console.error('Error fetching spending limits:', error); // logs the error
            setMessage({ text: error.message, type: 'error' }); // sets an error message for display
            // if error is due to authentication (401) or authorisation (403), redirects to login page
            if (error.response && (error.response.status === 401 || error.response.status === 403)) {
                navigate('/login');
            }
        } finally { // this block executes regardless of success or failure
            setIsLoading(false); // indicates data loading has finished
        }
    }, [navigate]); // usecallback dependency: navigate (used for redirection)

    // useeffect hook to call fetchlimits when the component first mounts
    // or if the fetchlimits function itself changes (due to its dependencies changing)
    useEffect(() => {
        fetchLimits(); // fetches initial limit data
    }, [fetchLimits]); // dependency array for the effect

    // handles changes in the new limit input field
    const handleInputChange = (e) => {
        const value = e.target.value; // gets current value from input
        // regex to allow only numbers and up to two decimal places, or an empty string
        if (/^\d*\.?\d{0,2}$/.test(value) || value === '') {
            setNewLimitInput(value); // updates the newlimitinput state
            setMessage({ text: '', type: '' }); // clears any existing user messages when input changes
        }
    };

    // handles form submission to set or update the spending limit
    const handleSubmit = async (e) => {
        e.preventDefault(); // prevents default browser form submission (page reload)
        setMessage({ text: '', type: '' }); // clears previous messages
        const newLimit = parseFloat(newLimitInput); // parses input value to a number

        // validation: new limit must be a non-negative number
        if (isNaN(newLimit) || newLimit < 0) {
            setMessage({ text: 'Please enter a valid, non-negative spending limit.', type: 'error' });
            return; // exits if invalid
        }
        // validation: new limit cannot exceed the user's overall assessed credit limit
        if (overallCreditLimit !== null && newLimit > overallCreditLimit) {
            setMessage({ text: `Spending limit cannot exceed overall credit limit of £${overallCreditLimit.toFixed(2)}.`, type: 'error' });
            return; // exits if exceeds overall limit
        }
        // note: entering 0 or clearing input effectively means removing/setting limit to null on backend

        setIsSaving(true); // indicates that save operation is in progress
        try {
            // makes an authenticated post request to backend to update spending limit
            const response = await authenticatedFetch('/api/spending-limit', {
                method: 'POST', // http method
                body: JSON.stringify({
                    // sends null if input is empty or zero (to remove limit), otherwise sends parsed numeric limit
                    spendingLimit: newLimitInput === '' || newLimit === 0 ? null : newLimit
                })
            });
            const data = await response.json(); // parses json response

            if (response.ok && data.success) { // if api call successful and backend confirms success
                // updates local state to reflect the newly saved spending limit
                setCurrentSpendingLimit(data.newSpendingLimit !== null ? parseFloat(data.newSpendingLimit) : null);
                setNewLimitInput(data.newSpendingLimit !== null ? parseFloat(data.newSpendingLimit).toFixed(2) : ''); // updates input field too
                setMessage({ text: data.message || 'Spending limit updated successfully!', type: 'success' }); // displays success message
            } else { // if api call failed or backend reported an error
                throw new Error(data.message || 'Failed to update spending limit.'); // throws error
            }
        } catch (error) { // catches errors from try block
            console.error('Error saving spending limit:', error); // logs the error
            setMessage({ text: error.message, type: 'error' }); // displays error message
        } finally { // always executes
            setIsSaving(false); // indicates save operation finished
        }
    };

    // handles 'remove limit' button click
    const handleRemoveLimit = async () => {
        // if no limit is currently set, inform user and do nothing further
        if (currentSpendingLimit === null) {
            setMessage({ text: 'No spending limit is currently set.', type: 'info' });
            return;
        }
        setNewLimitInput(''); // visually clears the input field

        const newLimitValueToSend = null; // signifies removal of the limit

        setIsSaving(true); // indicates save/remove operation is in progress
        setMessage({ text: '', type: '' }); // clear previous messages
        try {
            // makes api call to update spending limit, sending null to remove it
            const response = await authenticatedFetch('/api/spending-limit', {
                method: 'POST',
                body: JSON.stringify({ spendingLimit: newLimitValueToSend }) // send null to backend
            });
            const data = await response.json(); // parse json response

            if (response.ok && data.success) { // if api call successful
                setCurrentSpendingLimit(null); // update local state to reflect removed limit
                setNewLimitInput(''); // ensure input field is clear
                setMessage({ text: data.message || 'Spending limit removed successfully!', type: 'success' }); // display success
            } else { // if api call failed
                throw new Error(data.message || 'Failed to remove spending limit.'); // throw error
            }
        } catch (error) { // catch any errors
            console.error('Error removing spending limit:', error); // log error
            setMessage({ text: error.message, type: 'error' }); // display error
        } finally { // always executes
            setIsSaving(false); // indicates operation finished
        }
    }

    // if data is loading, show a loading message
    if (isLoading) {
        return (
            <div className="container spending-limit-container">
                <div className="form-card">
                    <BackButton />
                    <h2>Set Monthly Spending Limit</h2>
                    <p className="loading-message">Loading limits...</p>
                </div>
            </div>
        );
    }

    // jsx for rendering the spending limit page ui
    return (
        // main container for page
        <div className="container spending-limit-container">
            {/* styled card for content */}
            <div className="form-card">
                <BackButton /> {/* back navigation button */}
                <h2 style={{ textAlign: 'center', marginBottom: '20px' }}>Set Monthly Spending Limit</h2> {/* page title */}

                {/* section displaying current credit limit information */}
                <div className="current-limits-info">
                    <p>Overall Credit Limit:
                        {/* displays overall credit limit, or 'not assessed' if unavailable */}
                        <strong> £{overallCreditLimit !== null ? overallCreditLimit.toFixed(2) : 'Not Assessed'}</strong>
                    </p>
                    <p>Current Monthly Spending Limit:
                        {/* displays current spending limit, or 'not set' if null */}
                        <strong> {currentSpendingLimit !== null ? `£${currentSpendingLimit.toFixed(2)}` : 'Not Set'}</strong>
                    </p>
                    {/* additional informational note if both limits are set */}
                    {currentSpendingLimit !== null && overallCreditLimit !== null &&
                        <p className="limit-info-note">
                            This month, spending is limited to £{currentSpendingLimit.toFixed(2)} using BNPL.
                            The overall approved credit line is £{overallCreditLimit.toFixed(2)}.
                        </p>
                    }
                </div>

                {/* form for setting or updating the monthly spending limit */}
                <form onSubmit={handleSubmit} className="spending-limit-form">
                    <label htmlFor="spendingLimitInput">
                        Set New Monthly Limit (£):
                    </label>
                    {/* input field for the new spending limit */}
                    <input
                        type="text" // text type allows for more controlled input formatting with regex
                        id="spendingLimitInput"
                        value={newLimitInput} // controlled input value from state
                        onChange={handleInputChange} // handler for input changes
                        // placeholder shows max possible limit if overall limit is known
                        placeholder={overallCreditLimit !== null ? `Max £${overallCreditLimit.toFixed(2)}` : 'Enter amount'}
                        // disable input if saving or if overall limit not assessed (as it's the max cap)
                        disabled={isSaving || overallCreditLimit === null}
                        className="form-input" // css class for styling
                    />
                    {/* displays message if overall credit limit isn't assessed yet */}
                    {overallCreditLimit === null && (
                        <p className="error-message small-text">
                            The overall credit limit must be assessed before setting a spending limit.
                        </p>
                    )}
                    {/* container for action buttons */}
                    <div className="button-group">
                        {/* button to set or update the spending limit */}
                        <button
                            type="submit"
                            className="btn action-button"
                            // disable if saving, no overall limit or input matches current saved limit
                            disabled={isSaving || overallCreditLimit === null || newLimitInput === (currentSpendingLimit !== null ? currentSpendingLimit.toFixed(2) : '')}
                        >
                            {isSaving ? 'Saving...' : 'Set/Update Limit'} {/* dynamic button text */}
                        </button>
                        {/* button to remove spending limit, shown only if a limit is currently set */}
                        {currentSpendingLimit !== null && (
                            <button
                                type="button" // type button to prevent form submission
                                onClick={handleRemoveLimit} // calls remove limit handler
                                className="btn remove-button"
                                disabled={isSaving} // disable if another save/remove action is in progress
                            >
                                {isSaving ? 'Removing...' : 'Remove Limit'} {/* dynamic button text */}
                            </button>
                        )}
                    </div>
                </form>

                {/* displays success, error, or info messages after operations */}
                {message.text && (
                    <p className={`message ${message.type}`} style={{ marginTop: '20px', textAlign: 'center' }}>
                        {message.text}
                    </p>
                )}
            </div>
        </div>
    );
};

// exports spendinglimit component for use in other parts of application
export default SpendingLimit;