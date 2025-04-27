// src/components/Repayment.js
import React, { useState, useEffect, useCallback } from 'react'; // Added useCallback
import { useNavigate } from 'react-router-dom';
import './Repayments.css'; // We'll create this CSS file next

// --- Authenticated Fetch Helper ---
async function authenticatedFetch(url, options = {}) {
    const token = localStorage.getItem('authToken');
    const headers = { 'Content-Type': 'application/json', ...options.headers };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    else return { ok: false, status: 401, json: async () => ({ success: false, message: "Auth token missing." }) };
    try {
        const apiUrl = process.env.REACT_APP_API_BASE_URL || 'http://localhost:5000';
        const response = await fetch(`${apiUrl}${url}`, { ...options, headers });
        return response;
    }
    catch (error) {
        console.error(`API Error ${url}:`, error);
        return { ok: false, status: 503, json: async () => ({ success: false, message: "Network error." }) };
    }
}
// --- ---------------------------- ---

const Repayments = () => {
    const [activeOrders, setActiveOrders] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [repaymentAmounts, setRepaymentAmounts] = useState({});
    const [processingPayment, setProcessingPayment] = useState(null);
    const [paymentResult, setPaymentResult] = useState({});

    const navigate = useNavigate();

    // Define fetchOrders using useCallback so it can be dependency of useEffect
    const fetchOrders = useCallback(async (isMountedRef) => {
        setLoading(true); setError(null);
        console.log("Fetching active orders...");
        const response = await authenticatedFetch('/api/active_orders');
        if (!isMountedRef.current) return; // Check using the ref

        let resultData;
        try { resultData = await response.json(); }
        catch(e) { resultData = {success: false, message: "Invalid response fetching orders."};}

        if (response.ok && resultData.success) {
            setActiveOrders(resultData.activeOrders || []);
            const initialAmounts = {};
            (resultData.activeOrders || []).forEach(order => {
                 initialAmounts[order.order_id] = '';
            });
            setRepaymentAmounts(initialAmounts);
             console.log("Fetched active orders:", resultData.activeOrders);
        } else {
            setError(resultData.message || 'Failed to load active orders.');
            if (response.status === 401 || response.status === 403) navigate('/login');
        }
        setLoading(false);
    // Add navigate as dependency because it's used in error check
    }, [navigate]);

    // Fetch active orders on component mount
    useEffect(() => {
        // Use a ref to track mount status to avoid warning about navigate/fetchOrders
        // in dependency array while still preventing state updates after unmount
        const isMountedRef = { current: true };
        fetchOrders(isMountedRef); // Pass the ref
        return () => { isMountedRef.current = false; }; // Cleanup sets ref to false
    }, [fetchOrders]); // useEffect depends on fetchOrders


    const handleAmountChange = (orderId, value) => {
        if (/^\d*\.?\d*$/.test(value)) {
             setRepaymentAmounts(prev => ({ ...prev, [orderId]: value }));
             setPaymentResult(prev => ({...prev, [orderId]: null}));
        }
    };

    const handleRepaymentSubmit = async (orderId) => {
        const amount = parseFloat(repaymentAmounts[orderId]);
        const order = activeOrders.find(o => o.order_id === orderId);

        if (!order || isNaN(amount) || amount <= 0 || amount > parseFloat(order.remaining_balance)) {
             const message = !order ? "Order not found." : (isNaN(amount) || amount <= 0 ? "Invalid amount." : "Amount exceeds balance.");
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
            setPaymentResult(prev => ({...prev, [orderId]: { success: true, message: `Payment of £${amount.toFixed(2)} successful!` }}));
            // --- OPTION 2: RE-FETCH orders to update list ---
            console.log("Repayment successful, re-fetching active orders...");
             const isMountedRef = { current: true }; // Need a ref for this async operation
            fetchOrders(isMountedRef); // Call the fetch function again
             // Optional cleanup: Set ref to false after fetch completes if needed, though effect cleanup handles unmounts.
            // ---------------------------------------------
            // No need to clear input amount here as re-fetch will reset state
        } else {
            setPaymentResult(prev => ({...prev, [orderId]: { success: false, message: resultData.message || 'Repayment failed.' }}));
            if (response.status === 401 || response.status === 403) navigate('/login');
        }
    };

    // --- RETURN JSX ---
    return (
        <div className="container repayment-container"> {/* Add container class */}
            <div className="form-card repayment-card"> {/* Add form-card class */}
                <h2>Make Repayments</h2>

                {loading && <p className="loading-message">Loading active orders...</p>}
                {error && <p className="error-message">{error}</p>} {/* Use form.css error style? */}

                {!loading && !error && activeOrders.length === 0 && (
                    <p style={{textAlign: 'center', marginTop: '20px'}}>You have no active BNPL orders.</p> // Centered text
                )}

                {!loading && !error && activeOrders.length > 0 && (
                    <div className="order-list">
                        {activeOrders.map(order => (
                            <div key={order.order_id} className="order-item">
                                <h3>{order.product_title}</h3>
                                <p>Ordered: {order.order_timestamp}</p>
                                <p>Loan Amount: £{order.loan_amount.toFixed(2)}</p>
                                <p className="remaining-balance">Remaining: £{order.remaining_balance.toFixed(2)}</p>
                                <p>Term: {order.selected_term_months} months</p>
                                <p>Next Due: {order.next_payment_due_date || 'N/A'}</p>

                                <div className="repayment-action">
                                     <input
                                        type="number" // Use number input for amounts
                                        placeholder="£ Pay Amount" // Add placeholder
                                        value={repaymentAmounts[order.order_id] || ''}
                                        onChange={(e) => handleAmountChange(order.order_id, e.target.value)}
                                        disabled={processingPayment === order.order_id}
                                        min="0.01"
                                        step="0.01"
                                        max={order.remaining_balance}
                                        aria-label={`Repayment amount for order ${order.product_title}`}
                                        className="repayment-input" // Add class for styling
                                    />
                                    <button
                                        onClick={() => handleRepaymentSubmit(order.order_id)}
                                        disabled={processingPayment === order.order_id || !repaymentAmounts[order.order_id] || parseFloat(repaymentAmounts[order.order_id]) <= 0}
                                        className="btn repayment-button" // Use base .btn style + specific
                                    >
                                        {processingPayment === order.order_id ? 'Processing...' : 'Pay'} {/* Shorter Text */}
                                    </button>
                                </div>
                                 {/* Display result for this specific order */}
                                 {paymentResult[order.order_id] && (
                                     <p className={paymentResult[order.order_id].success ? 'payment-success' : 'payment-error'}> {/* Reuse styles */}
                                         {paymentResult[order.order_id].message}
                                     </p>
                                 )}
                            </div>
                        ))}
                    </div>
                )}

                <button onClick={() => navigate('/dashboard')} className="btn back-button" style={{marginTop: '30px'}}> {/* Style back button */}
                     Back to Dashboard
                </button>
            </div>
        </div>
    );
};

export default Repayments;