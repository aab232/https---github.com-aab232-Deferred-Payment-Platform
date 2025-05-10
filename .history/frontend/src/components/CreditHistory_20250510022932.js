import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import './CreditHistory.css';
import BackButton from './BackButton';

// --- authenticated fetch helper ---
// this function wraps the native fetch api to automatically include the authentication token
// and provide consistent response/error objects for better error handling
async function authenticatedFetch(url, options = {}) {
    // retrieves the auth token from local storage
    const token = localStorage.getItem('authToken');
    // prepares http headers, defaulting to json content type
    const headers = { 'Content-Type': 'application/json', ...options.headers };
    if (token) { // if a token exists, add it to the authorization header
        headers['Authorization'] = `Bearer ${token}`;
    } else { // if no token is found, log a warning and return a simulated unauthorized response
        console.warn('Auth token missing for', url);
        // ensure the returned object mimics a fetch response for consistent handling
        return { ok: false, status: 401, statusText: 'Unauthorized', json: async () => ({ success: false, message: 'Auth token missing.' }), text: async () => ('{\'success\':false,\'message\':\'Auth token missing.\'}')};
    }
    try {
        // determine the base api url from environment variables or default to localhost:5000
        const apiUrl = process.env.REACT_APP_API_BASE_URL || 'http://localhost:5000';
        // perform the fetch request to the backend
        const response = await fetch(`${apiUrl}${url}`, { ...options, headers });
        return response; // return the raw response object
    } catch (error) { // catch network errors or other issues during the fetch operation
        console.error(`NETWORK/FETCH Error for ${url}:`, error);
        // return an object mimicking a failed fetch response for consistent error handling
        return { ok: false, status: 503, statusText: 'Service Unavailable', json: async () => ({ success: false, message: 'Network error or server unavailable.' }), text: async () => ('{\'success\':false,\'message\':\'Network error or server unavailable.\'}') };
    }
}
// --- ------------------------------------------------------- ---

// defines the credithistory react component
const CreditHistory = () => {
    // state to store the array of credit assessment history records
    const [history, setHistory] = useState([]);
    // state to track whether the history data is currently being loaded
    const [loading, setLoading] = useState(true);
    // state to store any error message encountered while fetching history
    const [error, setError] = useState(null);
    // react-router hook for programmatic navigation
    const navigate = useNavigate();

    // memoized asynchronous function to fetch credit assessment history from the backend
    // ismountedref is used to prevent state updates if the component unmounts during an async operation
    const fetchHistory = useCallback(async (isMountedRef) => {
        setLoading(true); // indicate that loading has started
        setError(null); // clear any previous errors
        console.log('Fetching assessment history...'); // your existing log

        // make an authenticated api call to the backend endpoint for assessment history
        const response = await authenticatedFetch('/api/assessment_history');

        // check if the component is still mounted before attempting to update state
        if (!isMountedRef.current) {
            console.log('History fetch aborted, component unmounted.'); // your existing log
            return; // exit if unmounted to prevent state update errors
        }

        let resultData = { success: false, message: 'Unknown error occurred.'}; // default error object
        try {
            // check if the response object itself is valid and has an 'ok' property
            if (!response || typeof response.ok === 'undefined') {
                 throw new Error('Invalid response object from fetch helper.');
            }

            // if the http response was ok (e.g., status 200-299), try to parse the body as json
            if (response.ok) {
                resultData = await response.json(); // parse successful response
            } else { // if response was not ok (e.g., 4xx or 5xx error)
                const errorText = await response.text(); // get the error message text from the server
                // set a default error message structure, using the server's text or status
                resultData = { success: false, message: errorText || `Server error: ${response.status}` };
                try {
                    // attempt to parse the error text as json, as the backend might send a structured error
                    const errorJson = JSON.parse(errorText);
                    // if parsing is successful and json contains a message, use it
                    resultData.message = errorJson.message || resultData.message;
                } catch (e) { /* ignore if the error body wasn't json, resultdata.message will retain errorText */ }
            }
        } catch (e) { // catch errors from .json() parsing or other issues in the try block
            console.error('Failed parsing history JSON or processing response:', e);
             // construct an error message, including response status if available
             resultData = { success: false, message: `Error ${response?.status}: ${e.message || 'Could not parse server response.'}` };
        }

        // update component state based on the processed resultdata
        if (resultData.success) { // if the api call was successful and data processed correctly
            setHistory(resultData.history || []); // set history state, defaulting to an empty array if data.history is missing
        } else { // if there was an error
            setError(resultData.message || 'Failed to load history.'); // set the error message state
            // if the response indicates an authentication or authorization error, redirect to login
            if (response && (response.status === 401 || response.status === 403)) {
                 console.log('Auth error detected, redirecting to login.'); // your existing log
                 navigate('/login'); // perform navigation
            }
        }
        setLoading(false); // indicate that loading is complete

    }, [navigate]); // usecallback dependencies: navigate is used for redirection on auth error

    // useeffect hook to fetch history when the component mounts
    // or when the fetchhistory function reference itself changes
    useEffect(() => {
        const isMountedRef = { current: true }; // create a ref to track if the component is mounted
        fetchHistory(isMountedRef); // call the fetchhistory function, passing the ref
        // cleanup function: runs when the component unmounts
        return () => { isMountedRef.current = false; }; // sets the ref to false to prevent state updates on unmounted component
    }, [fetchHistory]); // dependency array for the effect

    // helper function to format a timestamp string into a more readable date and time format
    const formatTimestamp = (timestamp) => {
        if (!timestamp) return 'N/A'; // return 'n/a' if timestamp is missing
        try {
            // date formatting options for tolocalestring
            const options = { year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true, timeZoneName: 'short' };
            return new Date(timestamp).toLocaleString(undefined, options); // use browser's default locale and specified options
        } catch (e) { return String(timestamp); } // return original string if formatting fails
    };

    // helper function to format an array of loan terms into a readable string
    const formatTerms = (terms) => {
        if (!terms || !Array.isArray(terms) || terms.length === 0) return 'None'; // return 'none' if no terms or invalid
        // join terms with a comma and add 'months' or 'month' label appropriately
        return terms.join(', ') + (terms.length > 1 || (terms.length === 1 && terms[0] > 1) ? ' months' : ' month');
    }

    // jsx for rendering the credit history page ui
    return (
        // main container for the page, applies general layout and background
        <div className="container history-container">
            {/* styled card to hold the content, for consistency with other pages */}
            <div className="form-card history-card">
                <BackButton /> {/* back navigation button component */}
                <h2>My Credit Assessment History</h2> {/* page title */}

                {/* conditional rendering: display loading message while data is being fetched */}
                {loading && <p className="loading-message">Loading history...</p>}
                {/* conditional rendering: display error message if an error occurred */}
                {error && <p className="error-message" style={{textAlign:'center'}}>{error}</p>}

                {/* conditional rendering: display message if no history records found (and not loading/no error) */}
                {!loading && !error && history.length === 0 && (
                    <p style={{textAlign:'center', marginTop:'20px'}}>No past assessment records are available.</p>
                )}

                {/* conditional rendering: display the history table if data loaded successfully and history is not empty */}
                {!loading && !error && history.length > 0 && (
                    // container for the table, allows scrolling if table is too wide
                    <div className="history-table-container">
                        <table className="history-table"> {/* table for displaying assessment history */}
                            <thead> {/* table header row */}
                                <tr>
                                    <th>Date & Time</th>
                                    <th>Score</th>
                                    <th>Tier</th>
                                    <th>Limit</th>
                                    <th>Terms</th>
                                </tr>
                            </thead>
                            <tbody> {/* table body, mapping over the history array to create rows */}
                                {history.map((assessment) => (
                                    // each row is keyed by the unique assessment_id
                                    <tr key={assessment.assessment_id}>
                                        {/* display formatted timestamp */}
                                        <td>{formatTimestamp(assessment.assessment_timestamp)}</td>
                                        {/* display risk score, formatted to 4 decimal places, or 'n/a' if null */}
                                        <td>{assessment.risk_score !== null ? assessment.risk_score.toFixed(4) : 'N/A'}</td>
                                        {/* display credit tier, or 'n/a' if null */}
                                        <td>{assessment.credit_tier ?? 'N/A'}</td>
                                        {/* display formatted credit limit */}
                                        <td>{formatCurrency(assessment.credit_limit)}</td>
                                        {/* display formatted loan terms */}
                                        <td>{formatTerms(assessment.calculated_terms)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}

                {/* button to navigate back to the dashboard */}
                <button onClick={() => navigate('/dashboard')} className="btn back-button" style={{marginTop: '30px'}}>
                    Back to Dashboard
                </button>
            </div>
        </div>
    );
};

// helper function to format a numeric value as currency
const formatCurrency = (value) => `£${(Number(value) || 0).toFixed(2)}`; // prefixes with £ and formats to 2 decimal places

// export the credithistory component for use in other parts of the application
export default CreditHistory;