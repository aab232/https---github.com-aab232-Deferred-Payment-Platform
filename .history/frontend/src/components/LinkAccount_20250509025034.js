import React, { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import BackButton from './BackButton';
import './LinkAccount.css'; // <--- IMPORT THE NEW CSS FILE

// --- Authenticated Fetch Helper ---
async function authenticatedFetch(url, options = {}) {
    const token = localStorage.getItem('authToken');
    const headers = { 'Content-Type': 'application/json', ...options.headers };

    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    } else {
        console.warn("Auth token missing for API call to", url);
        return {
            ok: false,
            status: 401,
            json: async () => ({ success: false, message: "Authentication token missing." }),
            text: async () => ("Authentication token missing.")
        };
    }

    try {
        const apiUrl = process.env.REACT_APP_API_BASE_URL || 'http://localhost:5000';
        const response = await fetch(`${apiUrl}${url}`, { ...options, headers });
        return response;
    } catch (error) {
        console.error(`API Fetch Error for ${url}:`, error);
        return {
            ok: false,
            status: 503, // Service Unavailable or network error
            json: async () => ({ success: false, message: "Network error or server unavailable." }),
            text: async () => (error.message || "Network error or server unavailable.")
        };
    }
}
// --- ---------------------------- ---


const LinkAccount = () => {
    const [linkLoading, setLinkLoading] = useState(false);
    const [linkError, setLinkError] = useState(null);
    const [linkSuccess, setLinkSuccess] = useState(false);

    // Function to simulate backend token exchange (stores placeholder)
    const simulateTokenExchange = useCallback(async () => {
        setLinkLoading(true);
        setLinkError(null);
        setLinkSuccess(false);
        console.log("Simulating Plaid token exchange on backend...");

        const response = await authenticatedFetch('/api/exchange_public_token', {
             method: 'POST',
             body: JSON.stringify({ public_token: null })
        });

        setLinkLoading(false);

        let resultData = { success: false, message: "An unexpected error occurred during simulation." };

        try {
            if (response && typeof response.json === 'function') {
                resultData = await response.json();
            } else if (response && typeof response.text === 'function') {
                const errorText = await response.text();
                resultData = { success: false, message: `Simulation setup failed. Server response: ${errorText}` };
                console.error("Simulated Link: Response was not valid JSON or response object malformed. Text:", errorText, "Response:", response);
            } else {
                console.error("Simulated Link: Invalid or missing response object from authenticatedFetch.");
            }
        } catch (e) {
            console.error("Simulated Link: Error parsing JSON response:", e);
            resultData = { success: false, message: "Simulation setup failed: Could not process server's response." };
        }

        if (response && response.ok && resultData && resultData.success) {
            setLinkSuccess(true);
            setLinkError(null);
        } else {
            setLinkSuccess(false);
            let errorMessage = "Failed to simulate account link. Please try again.";

            if (resultData && resultData.message) {
                errorMessage = resultData.message;
            } else if (response && response.status === 503) {
                errorMessage = "Simulation service is temporarily unavailable. Please try again later.";
            }

            if (response && response.status === 401) {
                errorMessage = "Your session has expired. Please log in again to link your account.";
                // navigate('/login'); // Still an option if you want to redirect
            }
            setLinkError(errorMessage);
        }
    }, []); // navigate removed as it's not used in the callback directly

    const handleSimulatedLinkClick = () => {
        simulateTokenExchange();
    };

    return (
        // Use the more specific container class from LinkAccount.css
        <div className='link-account-container'>
            <BackButton />
             {/* Use the more specific form card class from LinkAccount.css */}
             <div className='link-account-form-card'>
                <h2>Link Bank Account (Simulation Setup)</h2>
                <p>
                    Connect your bank account securely. For this prototype,
                    clicking below simulates a successful Sandbox connection on the backend.
                </p>
                <button
                    onClick={handleSimulatedLinkClick}
                    disabled={linkLoading}
                    // Use the new CSS class for the button, inline styles removed
                    className="link-account-button"
                >
                    {linkLoading ? 'Linking...' : 'Link Simulated Account'}
                </button>
                {/* Use new CSS classes for messages, inline styles removed */}
                {linkError && <p className='link-account-message-error'>{linkError}</p>}
                {linkSuccess && <p className='link-account-message-success'>✅ Bank account has been linked successfully (Simulated)!</p>}
                {/* Empty <p> tag completely removed */}
             </div>
        </div>
    );
};

export default LinkAccount;