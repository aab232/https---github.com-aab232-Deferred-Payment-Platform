import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
// Import your fetch helper and CSS
// import { authenticatedFetch } from '../utils/api';
import './CreditHistory.css'; // Create this CSS file

// --- Copy/paste authenticatedFetch helper here if not shared ---
async function authenticatedFetch(url, options = {}) { /* ... */ }
// --- ------------------------------------------------------- ---

const CreditHistory = () => {
    const [history, setHistory] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const navigate = useNavigate();

    useEffect(() => {
        let isMounted = true;
        const fetchHistory = async () => {
            setLoading(true);
            setError(null);
            const response = await authenticatedFetch('/api/assessment_history'); // GET request
            if (!isMounted) return;

            let resultData;
            try {
                resultData = await response.json();
            } catch (e) {
                 resultData = { success: false, message: "Invalid server response."};
            }


            if (response.ok && resultData.success) {
                setHistory(resultData.history || []);
            } else {
                setError(resultData.message || 'Failed to load history.');
                 if(response.status === 401) navigate('/login'); // Redirect if auth fails
            }
            setLoading(false);
        };

        fetchHistory();
        return () => { isMounted = false; }; // Cleanup
    }, [navigate]); // Dependency for error handling redirect


    // Helper to format timestamp
    const formatTimestamp = (timestamp) => {
        if (!timestamp) return 'N/A';
        try {
            return new Date(timestamp).toLocaleString(); // Adjust locale/options as needed
        } catch (e) {
             return timestamp; // Return original if parsing fails
        }
    };

    return (
        <div className="history-container">
            {/* Consider adding a standard Navbar component here */}
            <div className="history-card">
                <h2>My Credit Assessment History</h2>

                {loading && <p className="loading-message">Loading history...</p>}
                {error && <p className="error-message">{error}</p>}

                {!loading && !error && history.length === 0 && (
                    <p>You have no past assessment records.</p>
                )}

                {!loading && !error && history.length > 0 && (
                    <table className="history-table">
                        <thead>
                            <tr>
                                <th>Date & Time</th>
                                <th>Risk Score</th>
                                <th>Credit Tier</th>
                                <th>Credit Limit</th>
                                <th>Available Terms</th>
                            </tr>
                        </thead>
                        <tbody>
                            {history.map((assessment) => (
                                <tr key={assessment.assessment_id}>
                                    <td>{formatTimestamp(assessment.assessment_timestamp)}</td>
                                    <td>{assessment.risk_score !== null ? assessment.risk_score.toFixed(4) : 'N/A'}</td>
                                    <td>{assessment.credit_tier ?? 'N/A'}</td>
                                    <td>£{(assessment.credit_limit ?? 0).toFixed(2)}</td>
                                    <td>{(assessment.calculated_terms ?? []).join(', ') || 'None'}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}

                <button onClick={() => navigate('/dashboard')} className="back-button">
                    Back to Dashboard
                </button>
            </div>
        </div>
    );
};

export default CreditHistory;