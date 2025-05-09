import React, { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import BackButton from './BackButton';


// --- Authenticated Fetch Helper ---
// Make sure this is the corrected version that always returns a fetch-like object
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
    const navigate = useNavigate();
    const [linkLoading, setLinkLoading] = useState(false);
    const [linkError, setLinkError] = useState(null);
    const [linkSuccess, setLinkSuccess] = useState(false);

    // Function to simulate backend token exchange (stores placeholder)
    const simulateTokenExchange = useCallback(async () => {
        setLinkLoading(true);
        setLinkError(null); // Clear previous error before new attempt
        setLinkSuccess(false); // Clear previous success before new attempt
        console.log("Simulating Plaid token exchange on backend...");

        const response = await authenticatedFetch('/api/exchange_public_token', {
             method: 'POST',
             body: JSON.stringify({ public_token: null }) // Backend handles this as simulation
        });

        setLinkLoading(false); // Stop loading indicator

        let resultData = { success: false, message: "An unexpected error occurred during simulation." }; // Default error data

        try {
            // Ensure response object exists and has a .json method before trying to parse
            if (response && typeof response.json === 'function') {
                resultData = await response.json();
            } else if (response && typeof response.text === 'function') {
                // Fallback for non-JSON error responses, to provide some server text
                const errorText = await response.text();
                resultData = { success: false, message: `Simulation setup failed. Server response: ${errorText}` };
                console.error("Simulated Link: Response was not valid JSON or response object malformed. Text:", errorText, "Response:", response);
            } else {
                // If response itself is totally missing or malformed from authenticatedFetch's perspective
                console.error("Simulated Link: Invalid or missing response object from authenticatedFetch.");
                // The message in resultData ("An unexpected error...") will be used.
            }
        } catch (e) {
            // Catch error if .json() parsing itself fails (e.g., malformed JSON string)
            console.error("Simulated Link: Error parsing JSON response:", e);
            resultData = { success: false, message: "Simulation setup failed: Could not process server's response." };
        }

        if (response && response.ok && resultData && resultData.success) {
            setLinkSuccess(true);
            setLinkError(null); // Explicitly clear error on success
        } else {
            setLinkSuccess(false); // Explicitly clear success on error
            let errorMessage = "Failed to simulate account link. Please try again."; // Default user-friendly message

            if (resultData && resultData.message) {
                errorMessage = resultData.message; // Use message from backend if available
            } else if (response && response.status === 503) { // Specifically from authenticatedFetch catch
                errorMessage = "Simulation service is temporarily unavailable. Please try again later.";
            }

            if (response && response.status === 401) {
                errorMessage = "Your session has expired. Please log in again to link your account.";
                // Optional: navigate('/login'); or provide a login button
            }
            setLinkError(errorMessage);
        }
    }, []);

    // Simplified button handler for simulation
    const handleSimulatedLinkClick = () => {
        simulateTokenExchange(); // Just trigger the simulated backend call
    };

    return (
        <div className='container'>
            <BackButton />
             <div className='form-card'>
                <h2>Link Bank Account (Simulation Setup)</h2>
                <p>
                    Connect your bank account securely. For this prototype,
                    clicking below simulates a successful sandbox connection on the backend.
                </p>
                <button
                    onClick={handleSimulatedLinkClick}
                    disabled={linkLoading}
                    className="modal-action-button estimate-button" // Assuming these are your desired classes
                    style={{marginTop: '20px',
                            display: 'block',
                            marginLeft: 'auto',
                            marginRight: 'auto'
                    }}
                >
                    {linkLoading ? 'Linking...' : 'Link Simulated Account'}
                </button>
                {linkError && <p className='assessment-error' style={{marginTop: '15px', textAlign: 'center'}}>{linkError}</p>}
                {linkSuccess && <p className='assessment-approved' style={{marginTop: '15px', textAlign: 'center'}}>✅ Bank account has been linked successfully (Simulated)!</p>}
                <p style={{marginTop: '30px', textAlign: 'center'}}></p>
             </div>
        </div>
    );
};

export default LinkAccount;