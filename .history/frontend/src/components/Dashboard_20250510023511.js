import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import './Dashboard.css';
import BackButton from './BackButton';

// --- authenticated fetch helper ---
// (this is a shared helper function, assuming its functionality is understood from other files)
async function authenticatedFetch(url, options = {}) {
    const token = localStorage.getItem('authToken');
    const headers = { 'Content-Type': 'application/json', ...options.headers };
    if (token) { headers['Authorization'] = `Bearer ${token}`; }
    else { return { ok: false, status: 401, json: async () => ({ success: false, message: 'Auth token missing.' }) }; } // updated from previous
    try { const apiUrl = process.env.REACT_APP_API_BASE_URL || 'http://localhost:5000'; const response = await fetch(`${apiUrl}${url}`, { ...options, headers }); return response; }
    catch (error) { console.error(`API Error ${url}:`, error); return { ok: false, status: 503, json: async () => ({ success: false, message: 'Network error.' }) }; } // updated from previous
}
// --- ------------------------------------------------------------- ---


// --- dashboard sections configuration ---
// an array of objects defining the sections/tools available on the dashboard
// each object contains a title, an optional path for navigation (or an id for specific actions), and an icon
const dashboardSections = [
    { title: 'Get Credit Estimate', id: 'run-estimate', icon: '📊' }, // section to run a credit estimate
    { title: 'My Credit History', path: '/credit-history', icon: '📄'}, // section to view credit history
    { title: 'Make Repayments', path: '/repayments', icon: '💳'}, // section for making repayments
    { title: 'Set Spending Limit', path: '/spending-limit', icon: '⚙️'}, // section to set a spending limit
    { title: 'Buffer Bag', path: '/buffer-bag', icon: '🛍️'}, // section for buffer bag feature
    { title: 'Link/Manage Bank Account', path: '/link-account', icon: '🔗'}, // section to link bank accounts
];
// --- ------------------------------------ ---


// defines the dashboard react component
const Dashboard = () => {
    // react-router hook for programmatic navigation
    const navigate = useNavigate();

    // --- state for estimate/simulated assessment ---
    // state to track if the credit estimate is currently loading
    const [estimateLoading, setEstimateLoading] = useState(false);
    // state to store the result of the credit estimate
    const [estimateResult, setEstimateResult] = useState(null);
    // --- ----------------------------------------- ---

    // --- state/effect for current stored entitlements ---
    // state to store the user's current credit entitlements, initially in a 'loading' status
    const [currentEntitlements, setCurrentEntitlements] = useState({ status: 'loading' });
    // useeffect hook to fetch current entitlements when the component mounts or navigate function changes
    useEffect(() => {
        let isMounted = true; // flag to track if the component is still mounted, to prevent state updates on unmounted component
        // async function to fetch the current entitlements from the backend
        const fetchCurrentEntitlements = async () => {
            console.log('Fetching current entitlements on mount...');
            // sets status explicitly at the start of the fetch attempt
            if(isMounted) setCurrentEntitlements({ status: 'loading' }); // update status to 'loading'

            // api call to get current entitlements
            const response = await authenticatedFetch('/api/current_entitlements');
            if (!isMounted) return; // if component unmounted during fetch, exit to avoid errors

            let resultData; // variable to hold parsed response data
            try {
                resultData = await response.json(); // attempt to parse json response
            } catch (e) { // catch parsing errors
                console.error('Failed parsing entitlements JSON:', e);
                resultData = { success: false, message: 'Invalid server response.' }; // fallback error data
            }

            // if the api call was successful and data indicates success
            if (response.ok && resultData.success) {
                console.log('Received current entitlements:', resultData.entitlements);
                setCurrentEntitlements(resultData.entitlements); // update entitlements state
            } else { // if api call failed or data indicates failure
                 console.error('Failed to fetch current entitlements:', resultData);
                 setCurrentEntitlements({ status: 'error', message: resultData.message || 'Failed to load status' }); // set error state
                 // if the error is due to authentication/authorization, redirect to login
                 if (response.status === 401 || response.status === 403) {
                    console.log('Auth error fetching entitlements, navigating to login.');
                    navigate('/login'); // navigate to login page
                 }
            }
        };
        fetchCurrentEntitlements(); // call the fetch function
        // cleanup function for the effect: runs when the component unmounts
        return () => { isMounted = false; console.log('Entitlements fetch effect cleanup.'); };
     // dependency array for useeffect
    }, [navigate]); // includes navigate because it's used in the error handling path
    // --- -------------------------------------------- ---


    // --- handler for simulated assessment button click ---
    // async function to handle the 'get credit estimate' (simulated assessment) action
    const handleSimulatedAssessment = async () => {
        console.log('Running SIMULATED assessment...');
        setEstimateLoading(true); // set loading state for estimate
        setEstimateResult(null); // clear previous estimate result

        // api call to the backend for a simulated credit assessment
        const response = await authenticatedFetch('/api/assess_credit_simulated', { method: 'POST' });
        let resultData; // variable for parsed response
        try {
            resultData = await response.json(); // parse json response
        } catch (e) { // catch parsing errors
            resultData = {success: false, message: 'Invalid server response'}; // fallback error
        }

        setEstimateLoading(false); // reset estimate loading state

        // if api call successful and data indicates success
        if (response.ok && resultData.success) {
             console.log('Simulated assessment success:', resultData);
             setEstimateResult({ ...resultData, success: true }); // update estimate result state
        } else { // if api call failed or data indicates failure
             console.error('Simulated assessment failed:', resultData);
             setEstimateResult({ success: false, message: resultData.message || 'Estimate failed.' }); // set error state
             // if authentication/authorisation error, redirect to login
             if (response.status === 401 || response.status === 403) navigate('/login');
        }
    };
    // --- --------------------------------------------- ---

    // --- simple navigation handler ---
    // a general handler for navigating to different paths, used by dashboard items
    const handleNavigate = (path) => {
        if (path) navigate(path); // if path is provided, navigate to it
        else console.warn('Navigation attempted with no path for item.'); // log warning if path is missing
    };
    // --- ------------------------- ---


    // --- return jsx ---
    // jsx for rendering the dashboard ui
    return (
        // main container for the dashboard page
        <div className="dashboard-container">
            <BackButton /> {/* back navigation button component */}
            {/* styled card containing the dashboard content */}
            <div className="dashboard-card">
                <h2 className="dashboard-heading">Your Dashboard</h2> {/* main heading */}
                <p className="dashboard-welcome">Welcome back!</p> {/* welcome message */}

                {/* section 1: display current stored credit status */}
                <div className="current-status-section">
                     <h4>Current Credit Status</h4>
                     {/* conditional rendering based on the status of currententitlements */}
                     {currentEntitlements.status === 'loading' && <p>Loading status...</p>}
                     {currentEntitlements.status === 'error' && <p className="assessment-error">Could not load status: {currentEntitlements.message}</p>}
                     {currentEntitlements.status === 'unassessed' && <p>A credit assessment has not been completed yet. Try the estimate below.</p>}
                     {currentEntitlements.status === 'assessed' && ( // if assessed, display limit, tier, and terms
                         <div>
                             <p>Latest Limit: <strong>£{(currentEntitlements.limit ?? 0).toFixed(2)}</strong> (Tier: {currentEntitlements.tier ?? 'N/A'})</p>
                             <p>Available Terms: {(currentEntitlements.terms ?? []).join(', ') || 'None Available'}</p>
                         </div>
                     )}
                </div>

                {/* section 2: display results of the credit estimate */}
                <div className="estimate-results-area">
                     {/* conditionally render estimate status or results */}
                     {estimateLoading && <p className="assessment-status">Calculating estimate...</p>}
                     {estimateResult && !estimateResult.success && ( // if estimate resulted in an error
                         <p className="assessment-error estimate-display">Estimate Error: {estimateResult.message}</p>
                     )}
                     {estimateResult && estimateResult.success && ( // if estimate was successful
                         <div className="assessment-results estimate-display">
                             <h4>Estimated Entitlements (Based on Profile):</h4>
                             <p>Est. Limit: <strong>£{(estimateResult.entitlements?.limit ?? 0).toFixed(2)}</strong></p>
                             <p>Est. Tier: {estimateResult.entitlements?.tier ?? 'N/A'}</p>
                             <p>Est. Terms: {(estimateResult.entitlements?.terms ?? []).join(', ')}</p>
                             <p className="assessment-note">(This is only an estimate. Actual approval depends on live assessment during checkout).</p>
                         </div>
                     )}
                </div>

                {/* section 3: grid for dashboard tools/actions */}
                <h3 className="dashboard-section-heading">Account Tools</h3>
                {/* container for the grid of dashboard items */}
                <div className="dashboard-grid">
                    {/* map over the dashboardsections array to render each item */}
                    {dashboardSections.map((section) => {
                        // determine the action for the item: either run estimate or navigate to a path
                        const action = section.id === 'run-estimate' ? handleSimulatedAssessment : () => handleNavigate(section.path);
                        // determine if the item should be disabled (only for 'run-estimate' while it's loading)
                        const isDisabled = section.id === 'run-estimate' && estimateLoading;

                        // return jsx for each dashboard item
                        return (
                            <div
                                key={section.path || section.id} // unique key for react
                                className={`dashboard-item ${isDisabled ? 'disabled' : ''}`} // dynamic class for disabled state
                                onClick={!isDisabled && action ? action : undefined} // click handler if not disabled
                                role="button" tabIndex={isDisabled ? -1 : 0} // accessibility attributes
                                onKeyPress={(e) => { if (e.key === 'Enter' && !isDisabled && action) { action(); } }} // allow activation with enter key
                                aria-label={section.title} title={section.title} aria-disabled={isDisabled} // accessibility
                            >
                                {/* display icon if provided in config */}
                                {section.icon && <span className="dashboard-item-icon" aria-hidden="true">{section.icon}</span>}
                                <h3 className="dashboard-item-title">{section.title}</h3> {/* item title */}
                            </div>
                        );
                    })}
                </div>

            </div> {/* end of dashboard-card */}
        </div>
    );
};

// export the dashboard component for use in other parts of the application
export default Dashboard;