import React, { useState, useCallback } from 'react'; // Removed useEffect
import { useNavigate } from 'react-router-dom';
// Removed Plaid Link Hook import: import { usePlaidLink } from 'react-plaid-link';
// Import your authenticatedFetch helper
// import { authenticatedFetch } from '../utils/api'; // Adjust path

// --- Copy/paste authenticatedFetch helper here if not shared ---
async function authenticatedFetch(url, options = {}) { /* ... Keep helper ... */ }
// --- ------------------------------------------------------- ---


const LinkAccount = () => {
    const navigate = useNavigate();
    const [linkLoading, setLinkLoading] = useState(false);
    const [linkError, setLinkError] = useState(null);
    const [linkSuccess, setLinkSuccess] = useState(false);
    // No linkToken state needed

    // Function to simulate backend token exchange (stores placeholder)
    const simulateTokenExchange = useCallback(async () => {
        setLinkLoading(true); setLinkError(null); setLinkSuccess(false);
        console.log("Simulating Plaid token exchange on backend...");
        // Call backend - backend knows it's simulation without real public_token
        const response = await authenticatedFetch('/api/exchange_public_token', {
             method: 'POST',
             // Send empty/null public_token, backend handles it
             body: JSON.stringify({ public_token: null })
        });
         let resultData; try { resultData = await response.json(); } catch (e) { resultData = {success: false, message: "Invalid server response"}; }
        setLinkLoading(false);
        if (response.ok && resultData.success) { setLinkSuccess(true); }
        else { setLinkError(resultData.message || "Simulated link failed."); if(response.status === 401) navigate('/login'); }
    // Dependency only on navigate for error handling
    }, [navigate]);

    // Simplified button handler for simulation
    const handleSimulatedLinkClick = () => {
        simulateTokenExchange(); // Just trigger the simulated backend call
    };

    // No usePlaidLink hook needed
    // No useEffect to open Link needed

    return (
        <div className='container'>
             <div className='form-card'>
                <h2>Link Bank Account (Simulation Setup)</h2>
                <p>
                    Connect your bank account securely. For this prototype,
                    clicking below simulates a successful Sandbox connection on the backend.
                </p>
                <button onClick={handleSimulatedLinkClick} disabled={linkLoading} className="modal-action-button estimate-button" style={{marginTop: '20px'}}>
                    {linkLoading ? 'Linking (Simulating)...' : 'Link Simulated Account'}
                </button>
                {linkError && <p className='assessment-error' style={{marginTop: '15px'}}>{linkError}</p>}
                {linkSuccess && <p className='assessment-approved' style={{marginTop: '15px'}}>✅ Bank account linked successfully (Simulated)!</p>}
                <p style={{marginTop: '30px'}}> <span className="link-lookalike" onClick={() => navigate('/dashboard')}> Back to Dashboard </span> </p>
             </div>
        </div>
    );
};

export default LinkAccount;