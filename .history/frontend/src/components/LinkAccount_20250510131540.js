import React, { useState, useCallback } from 'react';
import BackButton from './BackButton';
import './LinkAccount.css';

// --- authenticated fetch helper ---
// a wrapper around the native fetch api to automatically include an authentication token
// and provide consistent response/error objects for handling api calls
async function authenticatedFetch(url, options = {}) {
    // retrieves the auth token from local storage
    const token = localStorage.getItem('authToken');
    // prepares http headers, defaulting to json content type
    const headers = { 'Content-Type': 'application/json', ...options.headers };
    if (token) { // if a token exists, add it to the authorisation header
        headers['Authorization'] = `Bearer ${token}`;
    } else { // if no token is found, log a warning and return a simulated unauthorised response
        console.warn('Auth token missing for API call to', url);
        return {
            ok: false,
            status: 401,
            json: async () => ({ success: false, message: 'Authentication token missing.' }),
            text: async () => ('Authentication token missing.')
        };
    }
    try {
        // determine base api url from environment variables or default to localhost:5000
        const apiUrl = process.env.REACT_APP_API_BASE_URL || 'http://localhost:5000';
        // perform fetch request to the backend
        const response = await fetch(`${apiUrl}${url}`, { ...options, headers });
        return response; // return the raw response object
    } catch (error) { // catch network errors or other issues during the fetch operation
        console.error(`API Fetch Error for ${url}:`, error);
        // return a fetch-like response object for consistent error handling
        return {
            ok: false,
            status: 503, // indicates service unavailable or a network error
            json: async () => ({ success: false, message: 'Network error or server unavailable.' }),
            text: async () => (error.message || 'Network error or server unavailable.')
        };
    }
}
// --- ---------------------------- ---


// defines linkaccount react component for managing bank account linking (simulated)
const LinkAccount = () => {
    // state to manage the loading status while the link process is occurring
    const [linkLoading, setLinkLoading] = useState(false);
    // state to store any error message if the linking process fails
    const [linkError, setLinkError] = useState(null);
    // state to indicate if the account linking was successful
    const [linkSuccess, setLinkSuccess] = useState(false);

    // function to simulate the backend token exchange process for plaid
    // usecallback doesn't rely on external props/state beyond setters
    const simulateTokenExchange = useCallback(async () => {
        setLinkLoading(true); // set loading to true at the start of the simulation
        setLinkError(null); // clear any previous errors
        setLinkSuccess(false); // clear any previous success status
        console.log('Simulating Plaid token exchange on backend...'); // debug log

        // makes an authenticated api call to the backend endpoint responsible for exchanging tokens
        const response = await authenticatedFetch('/api/exchange_public_token', {
             method: 'POST', // http post method
             body: JSON.stringify({ public_token: null }) // sends 'null' to backend, signalling a simulation
        });

        setLinkLoading(false); // set loading to false as the api call has completed

        // default resultdata in case parsing or response handling fails unexpectedly
        let resultData = { success: false, message: 'An unexpected error occurred during simulation.' };

        try {
            // check if the response object is valid and has a .json method
            if (response && typeof response.json === 'function') {
                resultData = await response.json(); // parse the json response from the backend
            } else if (response && typeof response.text === 'function') { // if not json, try to get as text
                const errorText = await response.text(); // get raw text response
                resultData = { success: false, message: `Simulation setup failed. Server response: ${errorText}` };
                console.error('Simulated Link: Response was not valid JSON or response object malformed. Text:', errorText, 'Response:', response);
            } else { // if the response object itself is missing or malformed
                console.error('Simulated Link: Invalid or missing response object from authenticatedFetch.');
            }
        } catch (e) { // catch errors specifically from json parsing (e.g., malformed json string)
            console.error('Simulated Link: Error parsing JSON response:', e);
            resultData = { success: false, message: 'Simulation setup failed: Could not process server\'s response.' };
        }

        // evaluate outcome based on response and parsed data
        if (response && response.ok && resultData && resultData.success) { // if http response ok and backend confirms success
            setLinkSuccess(true); // set success state to true
            setLinkError(null); // ensure no error message is shown
        } else { // if there was an error or backend reported failure
            setLinkSuccess(false); // ensure success state is false
            let errorMessage = 'Failed to simulate account link. Please try again.'; // default error message

            if (resultData && resultData.message) { // prioritise message from backend if available
                errorMessage = resultData.message;
            } else if (response && response.status === 503) { // if specifically a service unavailable error from fetch helper
                errorMessage = 'Simulation service is temporarily unavailable. Please try again later.';
            }

            if (response && response.status === 401) { // if authentication error
                errorMessage = 'The session has expired. Please log in again to link the account.';
                // navigate('/login'); // this was previously an option for redirection
            }
            setLinkError(errorMessage); // set the error message state
        }
    }, []); // empty dependency array as this callback does not depend on component props/state (navigate was removed)

    // handler for the 'link simulated account' button click
    const handleSimulatedLinkClick = () => {
        simulateTokenExchange(); // triggers the token exchange simulation
    };

    // jsx for rendering the link account page ui
    return (
        // main container for the page, applies general layout styling
        <div className='link-account-container'>
            <BackButton /> {/* back navigation button component */}
             {/* styled card element for the main content of this page */}
             <div className='link-account-form-card'>
                <h2>Link Your Bank Account</h2> {/* page title */}
                {/* informational paragraph about the simulation */}
                <p>
                    Connect a bank account securely. For this prototype,
                    clicking below simulates a successful Sandbox connection on the backend.
                </p>
                {/* button to trigger the simulated account linking process */}
                <button
                    onClick={handleSimulatedLinkClick} // sets click handler
                    disabled={linkLoading} // button is disabled while loading
                    className='link-account-button' // css class for styling
                >
                    {linkLoading ? 'Linking...' : 'Link Simulated Account'} {/* dynamic button text */}
                </button>
                {/* conditionally render error message if linkerror state is set */}
                {linkError && <p className='link-account-message-error'>{linkError}</p>}
                {/* conditionally render success message if linksuccess state is true */}
                {linkSuccess && <p className='link-account-message-success'>✅ Bank account has been linked successfully (Simulated)!</p>}
             </div>
        </div>
    );
};

// exports the linkaccount component for use in other parts of the application
export default LinkAccount;