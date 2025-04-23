import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import './Dashboard.css';

// --- Authenticated Fetch Helper ---
async function authenticatedFetch(url, options = {}) { /* ... Keep function ... */ }
// --- -------------------------- ---


// --- Dashboard Sections Configuration ---
const dashboardSections = [
    // Button to trigger simulated DB-only assessment
    { title: 'Get Credit Estimate', id: 'run-estimate', icon: '📊' }, // Uses ID
    // Links to other dashboard sections/pages
    { title: 'My Credit Report', path: '/credit-report', icon: '📄'},
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
            /* ... Keep fetch logic ... */
            if (!isMounted) return;
            /* ... Set state based on response ... */
        };
        fetchCurrentEntitlements();
        return () => { isMounted = false; };
    }, [navigate]); // Only include navigate if essential (e.g., redirect on 401)
    // --- -------------------------------------------- ---


    // --- Handler for Simulated Assessment Button Click ---
    const handleSimulatedAssessment = async () => { /* ... Keep function ... */ };
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
                    {/* ... Keep display logic ... */}
                </div>

                {/* 2. Section Displaying Estimate Results */}
                <div className="estimate-results-area">
                    {/* ... Keep display logic for estimateLoading and estimateResult ... */}
                </div>


                {/* 3. Grid for ALL dashboard tools */}
                <h3 className="dashboard-section-heading">Account Tools</h3>
                <div className="dashboard-grid">
                    {/* Map ALL dashboard sections */}
                    {dashboardSections.map((section) => {
                        // Determine the action for this specific section
                        const action = section.id === 'run-estimate'
                                      ? handleSimulatedAssessment   // Action for estimate button
                                      : () => handleNavigate(section.path); // Action for navigation links

                        // Determine if item should be disabled
                        const isDisabled = section.id === 'run-estimate' && estimateLoading;

                        return (
                            <div
                                key={section.path || section.id} // Unique key
                                className={`dashboard-item ${isDisabled ? 'disabled' : ''}`}
                                // Only attach onClick if NOT disabled AND an action exists
                                onClick={!isDisabled && action ? action : undefined}
                                role="button"
                                tabIndex={isDisabled ? -1 : 0}
                                onKeyPress={(e) => {
                                    if (e.key === 'Enter' && !isDisabled && action) {
                                        action();
                                    }
                                }}
                                aria-label={section.title}
                                title={section.title}
                                aria-disabled={isDisabled}
                            >
                                {section.icon && <span className="dashboard-item-icon" aria-hidden="true">{section.icon}</span>}
                                <h3 className="dashboard-item-title">{section.title}</h3>
                            </div>
                        );
                    })}
                </div> {/* End dashboard-grid */}

            </div> {/* End dashboard-card */}
        </div> // End dashboard-container
    );
}; // <-- End of Dashboard component function

export default Dashboard;