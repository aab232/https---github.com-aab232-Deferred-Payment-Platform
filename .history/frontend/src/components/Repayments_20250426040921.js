import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import './Repayments.css'; // Ensure this CSS file exists

// --- Authenticated Fetch Helper (Should be defined or imported) ---
async function authenticatedFetch(url, options = {}) {
    const token = localStorage.getItem('authToken');
    const headers = { 'Content-Type': 'application/json', ...options.headers };
    if (token) { headers['Authorization'] = `Bearer ${token}`; }
    else { console.warn("Auth token missing for", url); return { ok: false, status: 401, json: async () => ({ success: false, message: "Auth token missing." }) }; }
    try {
        const apiUrl = process.env.REACT_APP_API_BASE_URL || 'http://localhost:5000';
        const response = await fetch(`${apiUrl}${url}`, { ...options, headers });
        return response;
    } catch (error) {
        console.error(`API Error ${url}:`, error);
        return { ok: false, status: 503, json: async () => ({ success: false, message: "Network error." }) };
    }
}
// --- ------------------------------------------------------- ---

const Repayments = () => {
    const [activeOrders, setActiveOrders] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [repaymentAmounts, setRepaymentAmounts] = useState({});
    const [processingPayment, setProcessingPayment] = useState(null);
    const [paymentResult, setPaymentResult] = useState({});

    const navigate = useNavigate();

    // Define fetchOrders using useCallback
    const fetchOrders = useCallback(async (isMountedRef) => {
        setLoading(true); setError(null);
        console.log("Fetching active orders...");
        const response = await authenticatedFetch('/api/active_orders');
        if (!isMountedRef.current) return;

        let resultData;
        try { resultData = await response.json(); }
        catch(e) { resultData = {success: false, message: "Invalid response fetching orders."};}

        if (response.ok && resultData.success) {
            setActiveOrders(resultData.activeOrders || []);
            const initialAmounts = {};
            (resultData.activeOrders || []).forEach(order => { initialAmounts[order.order_id] = ''; });
            setRepaymentAmounts(initialAmounts);
            console.log("Fetched active orders:", resultData.activeOrders);
        } else {
            setError(resultData.message || 'Failed to load active orders.');
            if (response.status === 401 || response.status === 403) navigate('/login');
        }
        setLoading(false);
    }, [navigate]);

    // Fetch active orders on component mount
    useEffect(() => {
        const isMountedRef = { current: true };
        fetchOrders(isMountedRef);
        return () => { isMountedRef.current = false; };
    }, [fetchOrders]);

    // Handle input change for repayment amount
    const handleAmountChange = (orderId, value) => {
        if (/^\d*\.?\d*$/.test(value)) {
             setRepaymentAmounts(prev => ({ ...prev, [orderId]: value }));
             setPaymentResult(prev => ({...prev, [orderId]: null}));
        }
    };

    // Handle submitting a repayment
    const handleRepaymentSubmit = async (orderId) => {
        // *** ADDED LOG BACK INSIDE THIS FUNCTION ***
        console.log(`Attempting repayment for Order ID: ${orderId}, Amount Entered: ${repaymentAmounts[orderId]}`);
        // *** ------------------------------------ ***
        const amountStr = repaymentAmounts[orderId];
        const amount = parseFloat(amountStr);
        const order = activeOrders.find(o => o.order_id === orderId);

        if (!order || isNaN(amount) || amount <= 0 || amount > order.remaining_balance) {
             const message = !order ? "Order error." : (isNaN(amount) || amount <= 0 ? "Enter valid amount." : "Amount exceeds balance.");
             setPaymentResult(prev => ({...prev, [orderId]: { success: false, message: message } }));
             return;
        }

        setProcessingPayment(orderId); setPaymentResult(prev => ({...prev, [orderId]: null}));

        const response = await authenticatedFetch('/api/make_repayment', {
            method: 'POST',
            body: JSON.stringify({ order_id: orderId, repayment_amount: amount }),
        });

        let resultData;
        try { resultData = await response.json(); }
        catch (e) { resultData = { success: false, message: "Invalid server response." }; }

        setProcessingPayment(null);

        if (response.ok && resultData.success) {
            setPaymentResult(prev => ({...prev, [orderId]: { success: true, message: `Payment successful!` }}));
            console.log("Repayment successful, re-fetching active orders...");
             const isMountedRef = { current: true }; // Need ref again
            await fetchOrders(isMountedRef); // Re-fetch data
        } else {
            setPaymentResult(prev => ({...prev, [orderId]: { success: false, message: resultData.message || 'Repayment failed.' }}));
            if (response.status === 401 || response.status === 403) navigate('/login');
        }
    };

    // --- Helper to format timestamp ---
    // *** RESTORED THIS FUNCTION ***
    const formatTimestamp = (timestamp) => {
        if (!timestamp) return 'N/A';
        try {
            // Converts timestamp (e.g., from MySQL TIMESTAMP or a date string backend sends)
            // to a user-friendly locale string (e.g., "10/26/2023, 5:15:30 PM")
            // Adjust options for different formats:
            const options = { year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true };
            return new Date(timestamp).toLocaleString(undefined, options); // Use default locale
        } catch (e) {
             console.error("Error formatting timestamp:", e);
             return timestamp; // Return original string if formatting fails
        }
    };
    // --- ---------------------------- ---

    // --- RETURN JSX ---
    return (
        <div className="container repayment-container">
            <div className="form-card repayment-card">
                <h2>Make Repayments</h2>

                {loading && <p className="loading-message">Loading active orders...</p>}
                {error && <p className="error-message">{error}</p>}

                {!loading && !error && activeOrders.length === 0 && (
                    <p style={{textAlign: 'center', marginTop: '20px'}}>You have no active BNPL orders.</p>
                )}

                {!loading && !error && activeOrders.length > 0 && (
                    <div className="order-list">
                        {activeOrders.map(order => (
                            <div key={order.order_id} className="order-item">
                                <h3>{order.product_title || 'Unknown Product'}</h3>
                                {/* Use the formatter for timestamps/dates */}
                                <p>Ordered: {formatTimestamp(order.order_timestamp)}</p>
                                <p>Loan Amount: £{(order.loan_amount ?? 0).toFixed(2)}</p>
                                <p className="remaining-balance">Remaining: £{(order.remaining_balance ?? 0).toFixed(2)}</p>
                                <p>Term: {order.selected_term_months || 'N/A'} months</p>
                                <p>Next Due: {formatTimestamp(order.next_payment_due_date)}</p>

                                <div className="repayment-action">
                                     <input
                                        type="number"
                                        placeholder="£ Pay Amount"
                                        value={repaymentAmounts[order.order_id] || ''}
                                        onChange={(e) => handleAmountChange(order.order_id, e.target.value)}
                                        disabled={processingPayment === order.order_id}
                                        min="0.01" step="0.01"
                                        max={order.remaining_balance ?? 0}
                                        aria-label={`Repayment amount for ${order.product_title}`}
                                        className="repayment-input"
                                    />
                                    <button
                                        onClick={() => handleRepaymentSubmit(order.order_id)}
                                        disabled={processingPayment !== null || !repaymentAmounts[order.order_id] || parseFloat(repaymentAmounts[order.order_id]) <= 0}
                                        className="btn repayment-button"
                                    >
                                        {processingPayment === order.order_id ? 'Processing...' : 'Pay'}
                                    </button>
                                </div>
                                 {paymentResult[order.order_id] && (
                                     <p className={paymentResult[order.order_id].success ? 'payment-success' : 'payment-error'}>
                                         {paymentResult[order.order_id].message}
                                     </p>
                                 )}
                            </div>
                        ))}
                    </div>
                )}

                <button onClick={() => navigate('/dashboard')} className="btn back-button" style={{marginTop: '30px'}}>
                     Back to Dashboard
                </button>
            </div>
        </div>
    );
};

export default Repayments;