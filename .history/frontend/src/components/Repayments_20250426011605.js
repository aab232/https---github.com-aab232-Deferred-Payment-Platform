import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import './Repayments.css'; // Assuming you have this CSS file

// --- Authenticated Fetch Helper (Should be defined or imported) ---
async function authenticatedFetch(url, options = {}) {
    const token = localStorage.getItem('authToken');
    const headers = { 'Content-Type': 'application/json', ...options.headers };
    if (token) { headers['Authorization'] = `Bearer ${token}`; }
    else { return { ok: false, status: 401, json: async () => ({ success: false, message: "Auth token missing." }) }; }
    try {
        const apiUrl = process.env.REACT_APP_API_BASE_URL || 'http://localhost:5000';
        const response = await fetch(`${apiUrl}${url}`, { ...options, headers });
        return response;
    } catch (error) {
        console.error(`API Error ${url}:`, error);
        return { ok: false, status: 503, json: async () => ({ success: false, message: "Network error." }) };
    }
}
// --- --------------------------------------------------------- ---

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
        // Reset state for potential re-fetch
        setLoading(true); setError(null);
        console.log("Fetching active orders...");
        const response = await authenticatedFetch('/api/active_orders');
        if (!isMountedRef.current) return; // Check if component is still mounted

        let resultData;
        try { resultData = await response.json(); }
        catch(e) { resultData = {success: false, message: "Invalid response fetching orders."}; }

        if (response.ok && resultData.success) {
            setActiveOrders(resultData.activeOrders || []);
            const initialAmounts = {};
            (resultData.activeOrders || []).forEach(order => {
                 initialAmounts[order.order_id] = ''; // Initialize amount inputs
            });
            setRepaymentAmounts(initialAmounts);
        } else {
            setError(resultData.message || 'Failed to load active orders.');
            if (response.status === 401 || response.status === 403) navigate('/login');
        }
        setLoading(false);
    }, [navigate]); // Include navigate dependency

    // Fetch active orders on component mount
    useEffect(() => {
        const isMountedRef = { current: true };
        fetchOrders(isMountedRef);
        return () => { isMountedRef.current = false; };
    }, [fetchOrders]); // Depend on the fetchOrders callback

    // Handle input change for repayment amount
    const handleAmountChange = (orderId, value) => {
        if (/^\d*\.?\d*$/.test(value)) { // Allow numbers and one dot
            setRepaymentAmounts(prev => ({ ...prev, [orderId]: value }));
            setPaymentResult(prev => ({...prev, [orderId]: null})); // Clear results on edit
        }
    };

    // Handle submitting a repayment
    const handleRepaymentSubmit = async (orderId) => {
        const amountStr = repaymentAmounts[orderId];
        const amount = parseFloat(amountStr); // Ensure it's a number for checks
        const order = activeOrders.find(o => o.order_id === orderId);

        // Frontend validation
        if (!order || isNaN(amount) || amount <= 0 || amount > order.remaining_balance) { // order.remaining_balance is now number
             const message = !order ? "Order error." : (isNaN(amount) || amount <= 0 ? "Enter valid amount." : "Amount exceeds balance.");
             setPaymentResult(prev => ({...prev, [orderId]: { success: false, message: message } }));
             return;
        }

        setProcessingPayment(orderId); // Set loading state for THIS button/order
        setPaymentResult(prev => ({...prev, [orderId]: null}));

        const response = await authenticatedFetch('/api/make_repayment', {
            method: 'POST',
            body: JSON.stringify({ order_id: orderId, repayment_amount: amount }),
        });

        let resultData;
        try { resultData = await response.json(); }
        catch (e) { resultData = { success: false, message: "Invalid server response." }; }

        setProcessingPayment(null); // Reset loading state for this button

        if (response.ok && resultData.success) {
            setPaymentResult(prev => ({...prev, [orderId]: { success: true, message: `Payment successful!` }}));
            // Re-fetch orders to update the list and balances
            const isMountedRef = { current: true };
            await fetchOrders(isMountedRef); // Use await if needed, although state update handles rendering
        } else {
            setPaymentResult(prev => ({...prev, [orderId]: { success: false, message: resultData.message || 'Repayment failed.' }}));
            if (response.status === 401 || response.status === 403) navigate('/login');
        }
    };

    // Helper to format timestamp
    const formatTimestamp = (timestamp) => { /* ... (keep from previous) ... */ };


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
                                <h3>{order.product_title}</h3>
                                {/* Use ?? 0 for safety before calling toFixed */}
                                <p>Original Amount: £{(order.loan_amount ?? 0).toFixed(2)}</p>
                                <p className="remaining-balance">Remaining: £{(order.remaining_balance ?? 0).toFixed(2)}</p>
                                <p>Term: {order.selected_term_months} months</p>
                                <p>Ordered: {order.order_timestamp}</p> {/* Display order date */}
                                <p>Next Due: {order.next_payment_due_date || 'N/A'}</p>

                                <div className="repayment-action">
                                     <input
                                        type="number"
                                        placeholder="£ Pay Amount"
                                        value={repaymentAmounts[order.order_id] || ''}
                                        onChange={(e) => handleAmountChange(order.order_id, e.target.value)}
                                        disabled={processingPayment === order.order_id}
                                        min="0.01" step="0.01"
                                        // Use remaining_balance which is now ensured to be a number
                                        max={(order.remaining_balance ?? 0).toFixed(2)}
                                        aria-label={`Repayment amount for ${order.product_title}`}
                                        className="repayment-input"
                                    />
                                    <button
                                        onClick={() => handleRepaymentSubmit(order.order_id)}
                                        // Check against number version of input state
                                        disabled={processingPayment === order.order_id || !repaymentAmounts[order.order_id] || parseFloat(repaymentAmounts[order.order_id]) <= 0}
                                        className="btn repayment-button"
                                    >
                                        {processingPayment === order.order_id ? 'Processing...' : 'Pay'}
                                    </button>
                                </div>
                                 {/* Display result for this specific order */}
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