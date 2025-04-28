import React, { useState, useEffect, useCallback } from 'react'; // Keep imports
import { useNavigate } from 'react-router-dom';
// Import your fetch helper and CSS
// import { authenticatedFetch } from '../utils/api'; // Assuming helper might be here
import './CreditHistory.css'; // Make sure this file exists

// --- Copy/paste authenticatedFetch helper here if not shared ---
// Robust version to handle network errors and check response.ok
async function authenticatedFetch(url, options = {}) {
    const token = localStorage.getItem('authToken');
    const headers = { 'Content-Type': 'application/json', ...options.headers };
    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    } else {
        console.warn("Auth token missing for", url);
        return { ok: false, status: 401, statusText: 'Unauthorized', json: async () => ({ success: false, message: "Auth token missing." }), text: async () => ('{"success":false,"message":"Auth token missing."}')};
    }
    try {
        const apiUrl = process.env.REACT_APP_API_BASE_URL || 'http://localhost:5000';
        const response = await fetch(`${apiUrl}${url}`, { ...options, headers });
        // Note: We return the response object directly for the caller to check .ok
        return response;
    } catch (error) {
        console.error(`NETWORK/FETCH Error for ${url}:`, error);
        // Return an object mimicking a failed Response
        return { ok: false, status: 503, statusText: 'Service Unavailable', json: async () => ({ success: false, message: "Network error or server unavailable." }), text: async () => ('{"success":false,"message":"Network error or server unavailable."}') };
    }
}
// --- ------------------------------------------------------- ---

const CreditHistory = () => {
    const [history, setHistory] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const navigate = useNavigate();

    // Using useCallback to memoize the fetch function if needed as dependency
    const fetchHistory = useCallback(async (isMountedRef) => {
        setLoading(true); // Set loading at the start of fetch attempt
        setError(null);
        console.log("Fetching assessment history...");

        const response = await authenticatedFetch('/api/assessment_history'); // GET request

        if (!isMountedRef.current) {
            console.log("History fetch aborted, component unmounted.");
            return; // Exit if component unmounted during fetch
        }

        let resultData = { success: false, message: "Unknown error occurred."}; // Default error
        try {
            // Check if the response object itself exists and has 'ok' property
            if (!response || typeof response.ok === 'undefined') {
                 throw new Error("Invalid response object from fetch helper.");
            }

            // Try parsing JSON only if response status was OK, otherwise parse as text for error msg
            if (response.ok) {
                resultData = await response.json(); // Try parsing successful response
            } else {
                const errorText = await response.text(); // Get error text from server
                resultData = { success: false, message: errorText || `Server error: ${response.status}` };
                try {
                    // Attempt to parse even error text as JSON, backend might send structured error
                    const errorJson = JSON.parse(errorText);
                    resultData.message = errorJson.message || resultData.message; // Use message from JSON if available
                } catch (e) { /* Ignore if error body wasn't JSON */ }
            }
        } catch (e) {
            console.error("Failed parsing history JSON or processing response:", e);
             // If response exists use its status, else it was likely a network error
             resultData = { success: false, message: `Error ${response?.status}: ${e.message || "Could not parse server response."}` };
        }

        // Update state based on the processed resultData
        if (resultData.success) {
            setHistory(resultData.history || []); // Set history or empty array
        } else {
            setError(resultData.message || 'Failed to load history.'); // Set error message
            // Redirect on critical auth errors received from backend
            if (response && (response.status === 401 || response.status === 403)) {
                 console.log("Auth error detected, redirecting to login.");
                 navigate('/login');
            }
        }
        setLoading(false); // Done loading

    }, [navigate]); // Include navigate as it's used conditionally

    // Fetch history on component mount
    useEffect(() => {
        const isMountedRef = { current: true }; // Use ref to track mount status
        fetchHistory(isMountedRef); // Pass the ref
        return () => { isMountedRef.current = false; }; // Cleanup sets ref to false on unmount
    }, [fetchHistory]); // Depend on the memoized fetchHistory function

    // Helper to format timestamp
    const formatTimestamp = (timestamp) => {
        if (!timestamp) return 'N/A';
        try {
            // More robust date formatting
            const options = { year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true, timeZoneName: 'short' };
            return new Date(timestamp).toLocaleString(undefined, options); // Use browser's locale
        } catch (e) { return String(timestamp); } // Return original on error
    };

    // Helper to format terms array
    const formatTerms = (terms) => {
        if (!terms || !Array.isArray(terms) || terms.length === 0) return 'None';
        return terms.join(', ') + (terms.length > 1 || terms[0] > 1 ? ' months' : ' month'); // Add 'months'/'month' label
    }

    // --- RETURN JSX ---
    return (
        <div className="container history-container"> {/* Use base container */}
            {/* Use form-card styling for consistency? */}
            <div className="form-card history-card">
                <h2>My Credit Assessment History</h2>

                {loading && <p className="loading-message">Loading history...</p>}
                {error && <p className="error-message" style={{textAlign:'center'}}>{error}</p>} {/* Use error style */}

                {!loading && !error && history.length === 0 && (
                    <p style={{textAlign:'center', marginTop:'20px'}}>You have no past assessment records.</p>
                )}

                {!loading && !error && history.length > 0 && (
                    <div className="history-table-container"> {/* Added container for scrolling */}
                        <table className="history-table">
                            <thead>
                                <tr>
                                    <th>Date & Time</th>
                                    <th>Score</th>
                                    <th>Tier</th>
                                    <th>Limit</th>
                                    <th>Terms</th>
                                </tr>
                            </thead>
                            <tbody>
                                {history.map((assessment) => (
                                    <tr key={assessment.assessment_id}>
                                        <td>{formatTimestamp(assessment.assessment_timestamp)}</td>
                                        <td>{assessment.risk_score !== null ? assessment.risk_score.toFixed(4) : 'N/A'}</td>
                                        <td>{assessment.credit_tier ?? 'N/A'}</td>
                                        {/* Safely format limit */}
                                        <td>{formatCurrency(assessment.credit_limit)}</td>
                                        {/* Safely format terms */}
                                        <td>{formatTerms(assessment.calculated_terms)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}

                <button onClick={() => navigate('/dashboard')} className="btn back-button" style={{marginTop: '30px'}}>
                    Back to Dashboard
                </button>
            </div>
        </div>
    );
};

// Helper outside component or in utils
const formatCurrency = (value) => `£${(Number(value) || 0).toFixed(2)}`;

export default CreditHistory;