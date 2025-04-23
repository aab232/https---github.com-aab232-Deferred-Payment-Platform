import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import './Dashboard.css'; // Ensure this path is correct

// --- Authenticated Fetch Helper (Keep as is or import) ---
async function authenticatedFetch(url, options = {}) { /* ... */ }
// --- ------------------------------------------------- ---


// --- Dashboard Sections (Use path for navigation, id for special actions) ---
const dashboardSections = [
    // Use an ID for the button that triggers the simulation
    { title: 'Get Credit Estimate', id: 'run-estimate', icon: '📊' },
    // Use paths for buttons that navigate
    { title: 'My Credit Report', path: '/credit-report', icon: '📄'},
    { title: 'Make Repayments', path: '/repayments', icon: '💳'},
    { title: 'Set Spending Limit', path: '/spending-limit', icon: '⚙️'},
    { title: 'Buffer Bag', path: '/buffer-bag', icon: '🛍️'},
    { title: 'Link/Manage Bank Account', path: '/link-account', icon: '🔗'}, // Added example path for linking
];
// --- --------------------------------------------------------------------- ---


const Dashboard = () => {
    const navigate = useNavigate();

    // --- State for Estimate/Simulated Assessment ---
    const [estimateLoading, setEstimateLoading] = useState(false);
    const [estimateResult, setEstimateResult] = useState(null);
    // --- ----------------------------------------- ---

    // --- State/Effect for Current Stored Entitlements ---
    const [currentEntitlements, setCurrentEntitlements] = useState({ status: 'loading' });
    useEffect(() => {
        const fetchCurrentEntitlements = async () => {
            const response = await authenticatedFetch('/api/current_entitlements');
            // Check if component is still mounted before setting state
            let isMounted = true;
            if (isMounted) {
                try {
                    const resultData = await response.json();
                    if (response.ok && resultData.success) {
                        setCurrentEntitlements(resultData.entitlements);
                    } else {
                        setCurrentEntitlements({ status: 'error', message: resultData.message || 'Failed' });
                    }
                } catch(e) {
                     setCurrentEntitlements({ status: 'error', message: 'Failed to parse server response' });
                }
            }
            return () => { isMounted = false; }; // Cleanup function for useEffect
        };
        fetchCurrentEntitlements();
    }, []); // Empty dependency array means run once on mount
    // --- -------------------------------------------- ---


    // --- Handler for Simulated Assessment Button ---
    const handleSimulatedAssessment = async () => {
        console.log("Running SIMULATED assessment...");
        setEstimateLoading(true);
        setEstimateResult(null); // Clear previous estimate

        // Call the SIMULATION endpoint
        const response = await authenticatedFetch('/api/assess_credit_simulated', { method: 'POST' });
        let resultData;
        try {
             resultData = await response.json();
        } catch (e) { resultData = {success: false, message: "Invalid server response"}; }

        setEstimateLoading(false);

        if (response.ok && resultData.success) {
            setEstimateResult({ ...resultData, success: true });
        } else {
            setEstimateResult({ success: false, message: resultData.message || 'Estimate failed.' });
            if (response.status === 401) navigate('/login');
        }
    };
    // --- -------------------------------------- ---

    // --- Simple Navigation Handler ---
    const handleNavigate = (path) => {
        if (path) {
             navigate(path);
        }
    };
    // --- ------------------------- ---


    return (
        <div className="dashboard-container">
            <div className="dashboard-card">
                <h2 className="dashboard-heading">Your Dashboard</h2>
                <p className="dashboard-welcome">Welcome back!</p>

                {/* 1. Display Current Stored Status */}
                <div className="current-status-section">
                     <h4>Current Credit Status</h4>
                     {/* ... (Keep display logic as before) ... */}
                      {currentEntitlements.status === 'loading' && <p>Loading status...</p>}
                      {currentEntitlements.status === 'error' && <p className="assessment-error">Could not load status: {currentEntitlements.message}</p>}
                      {currentEntitlements.status === 'unassessed' && <p>You have not completed a credit assessment yet.</p>}
                      {currentEntitlements.status === 'assessed' && ( /* ... */ )}
                </div>

                {/* 2. Section for Running and Displaying the Estimate */}
                <div className="simulate-assessment-section">
                     {/* This button now triggers the simulated assessment */}
                     {/* We can map it like the others using the ID */}
                </div>

                {/* Display Estimate Result Area */}
                <div className="estimate-results-area">
                     {estimateLoading && <p className="assessment-status">Calculating estimate...</p>}
                     {estimateResult && !estimateResult.success && <p className="assessment-error estimate-display">Estimate Error: {estimateResult.message}</p>}
                     {estimateResult && estimateResult.success && ( /* ... Keep display logic ... */ )}
                </div>

                {/* 3. Grid for other dashboard tools */}
                <h3 className="dashboard-section-heading">Account Tools</h3>
                <div className="dashboard-grid">
                     {dashboardSections.map((section) => (
                         <div
                             key={section.path || section.id} // Use path or id as key
                             className="dashboard-item"
                             // Call the appropriate handler based on ID or PATH
                             onClick={() => {
                                 if (section.id === 'run-estimate') {
                                     handleSimulatedAssessment();
                                 } else if (section.path) {
                                     handleNavigate(section.path); // Use the simple navigate handler
                                 }
                             }}
                             role="button"
                             tabIndex={0}
                             onKeyPress={(e) => {
                                 if (e.key === 'Enter') {
                                     if (section.id === 'run-estimate') handleSimulatedAssessment();
                                     else if (section.path) handleNavigate(section.path);
                                 }
                             }}
                             aria-label={section.title} // Good for accessibility
                         >
                            {section.icon && <span className="dashboard-item-icon">{section.icon}</span>} {/* Display icon */}
                            <h3 className="dashboard-item-title">{section.title}</h3>
                         </div>
                     ))}
                 </div>

             </div> {/* End dashboard-card */}
         </div> // End dashboard-container
     );
 };

export default Dashboard;