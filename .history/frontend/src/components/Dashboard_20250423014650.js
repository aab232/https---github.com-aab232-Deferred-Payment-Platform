import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import './Dashboard.css'; // Ensure this path is correct

// --- Authenticated Fetch Helper (Needs to be defined or imported) ---
async function authenticatedFetch(url, options = {}) {
    const token = localStorage.getItem('authToken');
    const headers = { 'Content-Type': 'application/json', ...options.headers };
    if (token) { headers['Authorization'] = `Bearer ${token}`; }
    else { return { ok: false, status: 401, json: async () => ({ success: false, message: "Auth token missing." }) }; }
    try { const apiUrl = process.env.REACT_APP_API_BASE_URL || 'http://localhost:5000'; const response = await fetch(`${apiUrl}${url}`, { ...options, headers }); return response; }
    catch (error) { console.error(`API Error ${url}:`, error); return { ok: false, status: 503, json: async () => ({ success: false, message: "Network error." }) }; }
}
// --- ------------------------------------------------------------- ---


// --- Dashboard Sections Configuration ---
const dashboardSections = [
    { title: 'Get Credit Estimate', id: 'run-estimate', icon: '📊' },
    { title: 'My Credit History', path: '/credit-history', icon: '📄'}, // Changed from Report to History
    { title: 'Make Repayments', path: '/repayments', icon: '💳'},
    { title: 'Set Spending Limit', path: '/spending-limit', icon: '⚙️'},
    { title: 'Buffer Bag', path: '/buffer-bag', icon: '🛍️'},
    { title: 'Link/Manage Bank Account', path: '/link-account', icon: '🔗'},
];
// --- ------------------------------------ ---


const Dashboard = () => {
    const navigate = useNavigate();

    // --- State for Estimate/Simulated Assessment ---
    const [estimateLoading, setEstimateLoading] = useState(false);
    const [estimateResult, setEstimateResult] = useState(null);
    // --- ----------------------------------------- ---

    // --- State/Effect for Current Stored Entitlements ---
    const [currentEntitlements, setCurrentEntitlements] = useState({ status: 'loading' });
    useEffect(() => {
        let isMounted = true;
        const fetchCurrentEntitlements = async () => {
            console.log("Fetching current entitlements on mount..."); // Added log
            // Setting status explicitly at start in case of re-fetch logic added later
            // If already loading, perhaps skip? (Optional optimization)
             if(isMounted) setCurrentEntitlements({ status: 'loading' });

            const response = await authenticatedFetch('/api/current_entitlements');
            if (!isMounted) return;

            let resultData;
            try { resultData = await response.json(); }
            catch (e) { console.error("Failed parsing entitlements JSON:", e); resultData = { success: false, message: "Invalid server response." }; }

            if (response.ok && resultData.success) {
                console.log("Received current entitlements:", resultData.entitlements); // Log success
                setCurrentEntitlements(resultData.entitlements);
            } else {
                 console.error("Failed to fetch current entitlements:", resultData); // Log failure
                 setCurrentEntitlements({ status: 'error', message: resultData.message || 'Failed to load status' });
                 // Navigate only if it's clearly an authentication issue
                 if (response.status === 401 || response.status === 403) {
                    console.log("Auth error fetching entitlements, navigating to login.");
                    navigate('/login');
                 }
            }
        };
        fetchCurrentEntitlements();
        return () => { isMounted = false; console.log("Entitlements fetch effect cleanup."); };
     // Only run on mount, navigate dependency only relevant if used inside.
    }, [navigate]); // Added navigate because it *is* used in error path
    // --- -------------------------------------------- ---


    // --- Handler for Simulated Assessment Button Click ---
    const handleSimulatedAssessment = async () => {
        console.log("Running SIMULATED assessment...");
        setEstimateLoading(true); // Use setter
        setEstimateResult(null); // Use setter

        const response = await authenticatedFetch('/api/assess_credit_simulated', { method: 'POST' });
        let resultData;
        try { resultData = await response.json(); }
        catch (e) { resultData = {success: false, message: "Invalid server response"}; }

        setEstimateLoading(false); // Use setter

        if (response.ok && resultData.success) {
             console.log("Simulated assessment success:", resultData);
             setEstimateResult({ ...resultData, success: true }); // Use setter
        } else {
             console.error("Simulated assessment failed:", resultData);
             setEstimateResult({ success: false, message: resultData.message || 'Estimate failed.' }); // Use setter
             if (response.status === 401 || response.status === 403) navigate('/login'); // Redirect if auth specifically fails here
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

                {/* 1. Display Current Stored Status (Uses currentEntitlements) */}
                <div className="current-status-section">
                     <h4>Current Credit Status</h4>
                     {currentEntitlements.status === 'loading' && <p>Loading status...</p>}
                     {currentEntitlements.status === 'error' && <p className="assessment-error">Could not load status: {currentEntitlements.message}</p>}
                     {currentEntitlements.status === 'unassessed' && <p>You have not completed a credit assessment yet. Try the estimate below.</p>}
                     {currentEntitlements.status === 'assessed' && (
                         <div>
                             <p>Latest Limit: <strong>£{(currentEntitlements.limit ?? 0).toFixed(2)}</strong> (Tier: {currentEntitlements.tier ?? 'N/A'})</p>
                             <p>Available Terms: {(currentEntitlements.terms ?? []).join(', ') || 'None Available'}</p>
                             {/* Optionally show assessment ID for reference */}
                             {/* <p style={{fontSize: '0.8em', color: '#6c757d'}}>(Ref Assessment: {currentEntitlements.assessmentId ?? 'N/A'})</p> */}
                         </div>
                     )}
                </div>

                {/* 2. Section Displaying Estimate Results (Uses estimateLoading, estimateResult) */}
                <div className="estimate-results-area">
                     {/* Display only if loading or an estimate result exists */}
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

                {/* 3. Grid for dashboard tools (Uses estimateLoading, handleSimulatedAssessment, handleNavigate) */}
                <h3 className="dashboard-section-heading">Account Tools</h3>
                <div className="dashboard-grid">
                    {dashboardSections.map((section) => {
                        const action = section.id === 'run-estimate' ? handleSimulatedAssessment : () => handleNavigate(section.path);
                        const isDisabled = section.id === 'run-estimate' && estimateLoading; // Use state variable

                        return (
                            <div
                                key={section.path || section.id}
                                className={`dashboard-item ${isDisabled ? 'disabled' : ''}`}
                                onClick={!isDisabled && action ? action : undefined}
                                role="button" tabIndex={isDisabled ? -1 : 0}
                                onKeyPress={(e) => { if (e.key === 'Enter' && !isDisabled && action) { action(); } }}
                                aria-label={section.title} title={section.title} aria-disabled={isDisabled}
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
}; // <-- End of Dashboard component function

export default Dashboard;