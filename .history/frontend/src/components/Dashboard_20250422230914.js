import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import './Dashboard.css'; // Ensure this path is correct

// --- Authenticated Fetch Helper (Keep as is or import from shared location) ---
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
        // For client-side, returning error structure for caller to handle:
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
// --- ------------------------------------------------------------------------ ---


// --- Dashboard Sections Configuration ---
const dashboardSections = [
    // Button to trigger simulated DB-only assessment
    { title: 'Get Credit Estimate', id: 'run-estimate', icon: '📊' },
    // Links to other dashboard sections/pages
    { title: 'My Credit Report', path: '/credit-report', icon: '📄'},
    { title: 'Make Repayments', path: '/repayments', icon: '💳'},
    { title: 'Set Spending Limit', path: '/spending-limit', icon: '⚙️'},
    { title: 'Buffer Bag', path: '/buffer-bag', icon: '🛍️'},
    // Example path for initiating Plaid Link if user hasn't linked yet
    { title: 'Link/Manage Bank Account', path: '/link-account', icon: '🔗'},
];
// --- ------------------------------------ ---


const Dashboard = () => {
    const navigate = useNavigate();

    // --- State for Estimate/Simulated Assessment ---
    const [estimateLoading, setEstimateLoading] = useState(false);
    const [estimateResult, setEstimateResult] = useState(null); // Stores {entitlements, success} or {message, success}
    // --- ----------------------------------------- ---

    // --- State/Effect for Current Stored Entitlements ---
    const [currentEntitlements, setCurrentEntitlements] = useState({ status: 'loading' }); // Initialize as loading

    useEffect(() => {
        let isMounted = true; // Flag to prevent state update on unmounted component
        console.log("Fetching current entitlements on mount...");

        const fetchCurrentEntitlements = async () => {
            // No need to set loading state here again, it's set initially

            const response = await authenticatedFetch('/api/current_entitlements'); // GET request
            if (!isMounted) return; // Prevent update if component unmounted while fetching

            let resultData;
            try {
                 resultData = await response.json();
            } catch(e) {
                 console.error("Failed parsing entitlements JSON:", e);
                 resultData = { success: false, message: "Invalid server response." };
            }

            // Update state based on response
            if (response.ok && resultData.success) {
                setCurrentEntitlements(resultData.entitlements); // Stores {status, tier, limit, terms, assessmentId}
            } else {
                setCurrentEntitlements({ status: 'error', message: resultData.message || 'Failed to load status' });
                // If auth fails, redirect or handle - but maybe let other components handle this
                // if (response.status === 401) navigate('/login');
            }
        };

        fetchCurrentEntitlements();

        // Cleanup function for useEffect
        return () => {
            isMounted = false;
            console.log("Entitlements fetch effect cleanup.");
        };
    // }, [navigate]); // Include navigate IF needed for 401 redirect inside effect
    }, []); // *** Corrected: Empty array runs only once on mount ***
    // --- -------------------------------------------- ---


    // --- Handler for Simulated Assessment Button Click ---
    const handleSimulatedAssessment = async () => {
        console.log("Running SIMULATED assessment...");
        setEstimateLoading(true);
        setEstimateResult(null); // Clear previous estimate

        const response = await authenticatedFetch('/api/assess_credit_simulated', { method: 'POST' });
        let resultData;
         try { resultData = await response.json(); }
         catch (e) { resultData = {success: false, message: "Invalid server response"}; }

        setEstimateLoading(false);

        if (response.ok && resultData.success) {
            setEstimateResult({ ...resultData, success: true });
        } else {
            setEstimateResult({ success: false, message: resultData.message || 'Estimate failed.' });
            if (response.status === 401) navigate('/login'); // Redirect if auth specifically fails here
        }
    };
    // --- --------------------------------------------- ---

    // --- Simple Navigation Handler ---
    const handleNavigate = (path) => {
        if (path) navigate(path);
        else console.warn("Navigation attempted with no path for item.");
    };
    // --- ------------------------- ---


    // --- RETURN JSX ---
    return (
        <div className="dashboard-container">
            <div className="dashboard-card">
                <h2 className="dashboard-heading">Your Dashboard</h2>
                <p className="dashboard-welcome">Welcome back!</p>

                {/* 1. Display Current Stored Status */}
                <div className="current-status-section">
                     <h4>Current Credit Status</h4>
                     {currentEntitlements.status === 'loading' && <p>Loading status...</p>}
                     {currentEntitlements.status === 'error' && <p className="assessment-error">Could not load status: {currentEntitlements.message}</p>}
                     {currentEntitlements.status === 'unassessed' && <p>You have not completed a credit assessment yet. Try the estimate below.</p>}
                     {currentEntitlements.status === 'assessed' && (
                         <div>
                             <p>Latest Limit: <strong>£{(currentEntitlements.limit ?? 0).toFixed(2)}</strong> (Tier: {currentEntitlements.tier ?? 'N/A'})</p>
                             <p>Available Terms: {(currentEntitlements.terms ?? []).join(', ') || 'None Available'}</p>
                         </div>
                     )}
                </div>

                {/* 2. Section Displaying Estimate Results */}
                {/* Estimate results are only shown *after* the estimate button is clicked */}
                <div className="estimate-results-area">
                     {estimateLoading && <p className="assessment-status">Calculating estimate...</p>}
                     {estimateResult && !estimateResult.success && (
                         <p className="assessment-error estimate-display">Estimate Error: {estimateResult.message}</p>
                     )}
                     {estimateResult && estimateResult.success && (
                         <div className="assessment-results estimate-display">
                             <h4>Estimated Entitlements (Based on Profile):</h4>
                             <p>Est. Limit: <strong>£{(estimateResult.entitlements?.limit ?? 0).toFixed(2)}</strong></p>
                             <p>Est. Tier: {estimateResult.entitlements?.tier ?? 'N/A'}</p>
                             <p>Est. Terms: {(estimateResult.entitlements?.terms ?? []).join(', ')}</p>
                             <p className="assessment-note">(This is only an estimate. Actual approval depends on live assessment during checkout).</p>
                         </div>
                     )}
                </div>

                {/* 3. Grid for dashboard tools */}
                <h3 className="dashboard-section-heading">Account Tools</h3>
                <div className="dashboard-grid">
                    {dashboardSections.map((section) => {
                        // Determine the action for this specific section
                        const action = section.id === 'run-estimate' ? handleSimulatedAssessment : () => handleNavigate(section.path);
                        // Determine if item is disabled (only matters for estimate button currently)
                        const isDisabled = section.id === 'run-estimate' && estimateLoading;

                        return (
                            <div
                                key={section.path || section.id}
                                className={`dashboard-item ${isDisabled ? 'disabled' : ''}`} // Add disabled class if needed
                                onClick={!isDisabled ? action : undefined} // Only allow click if not disabled
                                role="button"
                                tabIndex={isDisabled ? -1 : 0} // Make non-focusable if disabled
                                onKeyPress={(e) => { if (e.key === 'Enter' && !isDisabled && action) { action(); } }}
                                aria-label={section.title}
                                title={section.title} // Tooltip
                                aria-disabled={isDisabled}
                            >
                                {section.icon && <span className="dashboard-item-icon" aria-hidden="true">{section.icon}</span>}
                                <h3 className="dashboard-item-title">{section.title}</h3>
                            </div>
                        );
                    })}
                </div>

            </div>
        </div>
    );
};

export default Dashboard;