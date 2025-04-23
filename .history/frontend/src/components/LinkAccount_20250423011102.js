// src/components/LinkAccount.js
// This component provides the UI for initiating the Plaid Link flow.
// In simulation mode, it just shows success after a fake backend call.

import React, { useState, useEffect, useCallback } from 'react'; // <-- IMPORT useEffect and useCallback
import { useNavigate } from 'react-router-dom'; // If needed for redirects
import { usePlaidLink } from 'react-plaid-link'; // For potential future use of real Link flow
// Import your authenticatedFetch helper if it's in a separate file
// import { authenticatedFetch } from '../utils/api'; // Adjust path as needed

// --- Copy/paste authenticatedFetch helper here if not shared ---
async function authenticatedFetch(url, options = {}) {
    const token = localStorage.getItem('authToken'); // Or get token from context/state management
    const headers = {
        'Content-Type': 'application/json',
        ...options.headers,
    };
    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    } else {
        console.warn("No auth token found for API call to", url);
        return {
            ok: false, status: 401,
            json: async () => ({ success: false, message: "Authentication token missing." })
        };
    }
    try {
        const apiUrl = process.env.REACT_APP_API_BASE_URL || 'http://localhost:5000'; // Backend URL
        const fullUrl = `${apiUrl}${url}`;
        const response = await fetch(fullUrl, { ...options, headers });
        return response; // Return the raw response
    } catch (error) {
        console.error(`API Fetch Error for ${url}:`, error);
        return { // Simulate fetch error response
            ok: false, status: 503, // Service Unavailable or Network Error
            json: async () => ({ success: false, message: "Network error or server unavailable." })
        };
    }
}
// --- ------------------------------------------------------- ---


const LinkAccount = () => {
    const navigate = useNavigate();
    const [linkLoading, setLinkLoading] = useState(false); // State for the button action
    const [linkError, setLinkError] = useState(null);
    const [linkSuccess, setLinkSuccess] = useState(false);
    // State for the actual link_token (not used much in simulation but good for structure)
    const [linkToken, setLinkToken] = useState(null);

    // Function to simulate the backend token exchange for the prototype
    const simulateTokenExchange = async () => {
        setLinkLoading(true);
        setLinkError(null);
        setLinkSuccess(false);

        // Call the backend endpoint - we still call it to store the placeholder token
        // In simulation, send null or a dummy public token
        const response = await authenticatedFetch('/api/exchange_public_token', {
             method: 'POST',
             body: JSON.stringify({ public_token: 'simulated_public_token_not_real' }) // Backend handles this if !publicToken
        });
         let resultData;
         try { resultData = await response.json(); }
         catch (e) { resultData = {success: false, message: "Invalid server response."}; }

        setLinkLoading(false);

        if (response.ok && resultData.success) {
            console.log("Simulated token exchange successful on backend.");
            setLinkSuccess(true); // Show success message in UI
            // Optionally redirect after success
            // setTimeout(() => navigate('/dashboard'), 2000);
        } else {
            console.error("Simulated token exchange failed:", resultData);
            setLinkError(resultData.message || "Failed to complete simulated link.");
             if(response.status === 401) navigate('/login'); // Auth expired
        }
    };


    // In a real app, you'd fetch the link_token and use usePlaidLink:
    /*
    const createLinkToken = useCallback(async () => { ... fetch link token ... setLinkToken(data.link_token); }, []);
    const { open, ready, error: plaidLinkError } = usePlaidLink({ token: linkToken, onSuccess: handlePlaidSuccess ... });
    const handleLinkButtonClick = () => createLinkToken(); // Fetch token, effect opens Plaid Link
    useEffect(() => { if (linkToken && ready) open(); }, [linkToken, ready, open]);
    */

    // Simplified button handler for simulation
    const handleSimulatedLinkClick = () => {
        // Directly call the simulation logic
        simulateTokenExchange();
    };

    return (
        <div className='container'> {/* Reuse form container style? */}
             <div className='form-card'> {/* Reuse form card style? */}
                <h2>Link Bank Account (Simulation)</h2>
                <p>
                    In a real application, clicking the button below would open the secure Plaid Link popup
                    to connect your bank. For this prototype, clicking it will simulate a successful
                    connection using Plaid's Sandbox environment setup on the backend.
                </p>

                <button
                    onClick={handleSimulatedLinkClick}
                    disabled={linkLoading}
                    className="modal-action-button estimate-button" // Style as desired
                    style={{marginTop: '20px'}} // Add space
                >
                    {linkLoading ? 'Linking (Simulating)...' : 'Link Bank Account (Simulate Sandbox)'}
                </button>

                {/* Display Errors or Success */}
                {linkError && <p className='assessment-error' style={{marginTop: '15px'}}>{linkError}</p>}
                {linkSuccess && <p className='assessment-approved' style={{marginTop: '15px'}}>✅ Bank account linked successfully (Simulated)!</p>}

                {/* Link to go back */}
                 <p style={{marginTop: '30px'}}>
                     <span className="link-lookalike" onClick={() => navigate('/dashboard')}>
                         Back to Dashboard
                     </span>
                 </p>

             </div>
        </div>
    );
};

export default LinkAccount;