import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import './Repayments.css';
import BackButton from './BackButton';

// --- authenticated fetch helper ---
async function authenticatedFetch(url, options = {}) {
    const token = localStorage.getItem('authToken');
    const headers = { 'Content-Type': 'application/json', ...options.headers };
    if (token) { headers['Authorization'] = `Bearer ${token}`; }
    else { console.warn('Auth token missing for', url); return { ok: false, status: 401, json: async () => ({ success: false, message: 'Auth token missing.' }) }; }
    try {
        const apiUrl = process.env.REACT_APP_API_BASE_URL || 'http://localhost:5000';
        const response = await fetch(`${apiUrl}${url}`, { ...options, headers });
        return response;
    } catch (error) {
        console.error(`API Error ${url}:`, error);
        return { ok: false, status: 503, json: async () => ({ success: false, message: 'Network error.' }) };
    }
}
// --- ------------------------------------------------------- ---

// defines the repayments react component for managing and making payments on active orders
const Repayments = () => {
    // state to store list of active orders fetched from backend
    const [activeOrders, setActiveOrders] = useState([]);
    // state to track loading status while fetching orders
    const [loading, setLoading] = useState(true);
    // state to store any error message encountered during data fetching or payment processing
    const [error, setError] = useState(null);
    // state to manage repayment amounts entered by user for each order (object with order_id as key)
    const [repaymentAmounts, setRepaymentAmounts] = useState({});
    // state to track which order's payment is currently being processed (stores order_id or null)
    const [processingPayment, setProcessingPayment] = useState(null);
    // state to store result (success/error message) of a payment attempt for each order
    const [paymentResult, setPaymentResult] = useState({});

    // react-router hook for programmatic navigation
    const navigate = useNavigate();

    // async function to fetch active orders from backend
    const fetchOrders = useCallback(async (isMountedRef) => {
        setLoading(true); setError(null); // set loading true and clear previous errors
        console.log('Fetching active orders...'); // existing log for debugging
        // api call to backend endpoint that returns active orders
        const response = await authenticatedFetch('/api/active_orders');
        // check if component is still mounted after await to avoid state update errors
        if (!isMountedRef.current) return;

        let resultData; // variable to hold parsed json response
        try {
            resultData = await response.json(); // attempt to parse json
        } catch(e) { // catch json parsing errors
            resultData = {success: false, message: 'Invalid response fetching orders.'}; // fallback error data
        }

        // if api call was successful and backend reports success
        if (response.ok && resultData.success) {
            setActiveOrders(resultData.activeOrders || []); // update active orders state, default to empty array
            const initialAmounts = {}; // object to initialise repayment amount inputs
            // iterate over fetched orders to initialise an empty input string for each
            (resultData.activeOrders || []).forEach(order => {
                 initialAmounts[order.order_id] = ''; // initialise amount inputs for each order
            });
            setRepaymentAmounts(initialAmounts); // set initial state for repayment amount inputs
            console.log('Fetched active orders:', resultData.activeOrders); // existing log
        } else { // if api call failed or backend reported failure
            setError(resultData.message || 'Failed to load active orders.'); // set error message
            // if error is due to authentication/authorisation, redirect to login
            if (response.status === 401 || response.status === 403) navigate('/login');
        }
        setLoading(false); // set loading to false as fetch process is complete
    }, [navigate]); // dependency array for usecallback, includes navigate as it's used in error path

    // useeffect hook to fetch active orders when component mounts
    // also runs if fetchorders function itself changes (due to its dependencies)
    useEffect(() => {
        const isMountedRef = { current: true }; // ref to track mount status of component
        fetchOrders(isMountedRef); // call fetchorders, passing mount status ref
        // cleanup function for useeffect: runs when component unmounts
        return () => { isMountedRef.current = false; }; // sets ref to false to prevent state updates on unmounted component
    }, [fetchOrders]); // dependency for useeffect

    // handles changes in repayment amount input field for a specific order
    const handleAmountChange = (orderId, value) => {
        // regex to allow numbers, an optional decimal point, and further digits (basic numeric input)
        if (/^\d*\.?\d*$/.test(value)) {
             // updates repaymentamounts state using previous state, for specific orderid
             setRepaymentAmounts(prev => ({ ...prev, [orderId]: value }));
             // clears any previous payment result message for this order when amount is edited
             setPaymentResult(prev => ({...prev, [orderId]: null}));
        }
    };

    // handles submission of a repayment for a specific order
    const handleRepaymentSubmit = async (orderId) => {
        console.log(`Attempting repayment for Order ID: ${orderId}, Amount Entered: ${repaymentAmounts[orderId]}`); // existing log
        const amountStr = repaymentAmounts[orderId]; // get amount string from state
        const amount = parseFloat(amountStr); // convert to number for validation
        const order = activeOrders.find(o => o.order_id === orderId); // find corresponding order object

        // performs frontend validation for repayment amount
        if (!order || isNaN(amount) || amount <= 0 || amount > order.remaining_balance) {
             // determines specific error message based on validation failure
             const message = !order ? 'Order data error.' : (isNaN(amount) || amount <= 0 ? 'Enter a valid payment amount.' : 'Amount exceeds remaining balance.');
             // sets payment result state with error for this order
             setPaymentResult(prev => ({...prev, [orderId]: { success: false, message: message } }));
             return; // exit if validation fails
        }

        setProcessingPayment(orderId); // sets state to indicate this order's payment is processing
        setPaymentResult(prev => ({...prev, [orderId]: null})); // clears previous payment result for this order

        // makes authenticated api call to backend to process repayment
        const response = await authenticatedFetch('/api/make_repayment', {
            method: 'POST', // http post method
            body: JSON.stringify({ order_id: orderId, repayment_amount: amount }), // sends order id and numeric amount
        });

        let resultData; // for parsed json response
        try {
            resultData = await response.json(); // attempt to parse
        } catch (e) { // catch parsing errors
            resultData = { success: false, message: 'Invalid server response.' }; // fallback error
        }

        setProcessingPayment(null); // resets processing payment state as this specific one is done

        // if api call was successful and backend confirms success
        if (response.ok && resultData.success) {
            setPaymentResult(prev => ({...prev, [orderId]: { success: true, message: 'Payment successful!' }})); // set success message
            console.log('Repayment successful, re-fetching active orders...'); // existing log
            // re-fetches active orders to update list
            const isMountedRef = { current: true }; // ref for async state update safety
            await fetchOrders(isMountedRef); // call fetchorders
        } else { // if api call failed or backend reported failure
            setPaymentResult(prev => ({...prev, [orderId]: { success: false, message: resultData.message || 'Repayment failed.' }})); // set error message
            // if authentication/authorisation error, redirect to login
            if (response.status === 401 || response.status === 403) navigate('/login');
        }
    };

    // helper function to format a date string into a more readable display format
    const formatDisplayDate = (dateString) => {
        if (!dateString) return 'N/A'; // return 'n/a' if date string is missing
        try {
            // appends time and timezone to prevent issues with local date interpretation
            const dateObj = new Date(dateString + 'T00:00:00Z'); // assume date string is yyyy-mm-dd utc
            if (isNaN(dateObj.getTime())) return 'Invalid Date'; // check for invalid date after parsing
            // formatting options for tolocaledatestring
            const options = { year: 'numeric', month: 'short', day: 'numeric' }; // e.g. "dec 15, 2024"
            return dateObj.toLocaleDateString(undefined, options); // use browser's default locale
        } catch (e) { // catch any errors during date formatting
             console.error('Error formatting date string:', dateString, e);
             return dateString; // return original string if formatting fails
        }
    };
    // --- ----------------------------------------------------------------------- ---

     // helper function to format a numeric value as currency (gbp)
    const formatCurrency = (value) => `£${(Number(value) || 0).toFixed(2)}`; // prefixes with £, formats to 2 decimal places


    // jsx for rendering repayments page ui
    return (
        // main container for page
        <div className="container repayment-container">
            <BackButton /> {/* back navigation button */}
            {/* styled card for content */}
            <div className="form-card repayment-card">
                <h2>Make Repayments</h2> {/* page title */}

                {/* conditional rendering: display loading message while fetching orders */}
                {loading && <p className="loading-message">Loading active orders...</p>}
                {/* conditional rendering: display error message if an error occurred */}
                {error && <p className="error-message" style={{textAlign:'center'}}>{error}</p>}

                {/* conditional rendering: display message if no active orders */}
                {!loading && !error && activeOrders.length === 0 && (
                    <p style={{textAlign: 'center', marginTop: '20px'}}>No active BNPL orders require repayment at this time.</p>
                )}

                {/* conditional rendering: display list of active orders if data loaded successfully and orders exist */}
                {!loading && !error && activeOrders.length > 0 && (
                    // container for list of order items
                    <div className="order-list">
                        {/* map over activeorders array to render each order item */}
                        {activeOrders.map(order => (
                            // each order item div, keyed by unique order_id
                            <div key={order.order_id} className="order-item">
                                <h3>{order.product_title || 'Unknown Product'}</h3> {/* product title */}
                                <p>Ordered: {formatDisplayDate(order.order_timestamp)}</p> {/* formatted order date */}
                                <p>Loan Amount: {formatCurrency(order.loan_amount)}</p> {/* formatted loan amount */}
                                <p className="remaining-balance">Remaining: {formatCurrency(order.remaining_balance)}</p> {/* formatted remaining balance */}
                                <p>Term: {order.selected_term_months || 'N/A'} months</p> {/* payment term */}
                                <p>Next Due: {formatDisplayDate(order.next_payment_due_date)}</p> {/* formatted next due date */}

                                {/* section for repayment action (input and button) */}
                                <div className="repayment-action">
                                     <input
                                        type="number" // input for repayment amount
                                        placeholder="£ Pay Amount" // placeholder text
                                        value={repaymentAmounts[order.order_id] || ''} // controlled input value from state
                                        onChange={(e) => handleAmountChange(order.order_id, e.target.value)} // updates state on change
                                        disabled={processingPayment === order.order_id} // disable if this order's payment is processing
                                        min="0.01" step="0.01" // html5 validation
                                        max={(order.remaining_balance ?? 0).toFixed(2)} // max amount is remaining balance
                                        aria-label={`Repayment amount for ${order.product_title}`} // accessibility
                                        className="repayment-input" // css class for styling
                                    />
                                    <button
                                        onClick={() => handleRepaymentSubmit(order.order_id)} // handles repayment submission
                                        // button disabled if any payment is processing, or input is invalid/empty
                                        disabled={
                                            processingPayment !== null ||
                                            !repaymentAmounts[order.order_id] ||
                                            parseFloat(repaymentAmounts[order.order_id]) <= 0
                                        }
                                        className="btn repayment-button" // css class for styling
                                    >
                                        {/* dynamic button text: 'processing...' if this order's payment is loading, else 'pay' */}
                                        {processingPayment === order.order_id ? 'Processing...' : 'Pay'}
                                    </button>
                                </div>
                                 {/* display payment result message (success/error) */}
                                 {paymentResult[order.order_id] && (
                                     <p className={paymentResult[order.order_id].success ? 'payment-success' : 'payment-error'}>
                                         {paymentResult[order.order_id].message}
                                     </p>
                                 )}
                            </div>
                        ))}
                    </div>
                )}

                {/* button to navigate back to dashboard */}
                <button onClick={() => navigate('/dashboard')} className="btn back-button" style={{marginTop: '30px'}}>
                     Back to Dashboard
                </button>
            </div>
        </div>
    );
};

// exports repayments component for use in other parts of application
export default Repayments;