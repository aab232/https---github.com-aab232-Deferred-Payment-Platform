import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import BackButton from './BackButton';
import './SpendingLimit.css'; // We'll create this CSS file later

// Assuming authenticatedFetch is in a shared utils file or defined here
// For now, let's copy it here for self-containment, but ideally, it's imported
async function authenticatedFetch(url, options = {}) {
    const token = localStorage.getItem('authToken');
    const headers = { 'Content-Type': 'application/json', ...options.headers };
    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    } else {
        console.warn("Auth token missing for API call to", url);
        return { ok: false, status: 401, json: async () => ({ success: false, message: "Authentication token missing." }), text: async () => "Authentication token missing." };
    }
    try {
        const apiUrl = process.env.REACT_APP_API_BASE_URL || 'http://localhost:5000';
        const response = await fetch(`${apiUrl}${url}`, { ...options, headers });
        return response;
    } catch (error) {
        console.error(`API Fetch Error for ${url}:`, error);
        return { ok: false, status: 503, json: async () => ({ success: false, message: "Network error or server unavailable." }), text: async () => (error.message || "Network error or server unavailable.") };
    }
}

const SpendingLimit = () => {
    const navigate = useNavigate();
    const [overallCreditLimit, setOverallCreditLimit] = useState(null);
    const [currentSpendingLimit, setCurrentSpendingLimit] = useState(null);
    const [newLimitInput, setNewLimitInput] = useState('');
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [message, setMessage] = useState({ text: '', type: '' }); // type: 'success' or 'error'

    // Fetch current limits when component mounts
    const fetchLimits = useCallback(async () => {
        setIsLoading(true);
        setMessage({ text: '', type: '' });
        try {
            const response = await authenticatedFetch('/api/spending-limit'); // GET request
            const data = await response.json();

            if (response.ok && data.success) {
                setOverallCreditLimit(parseFloat(data.overallCreditLimit));
                setCurrentSpendingLimit(data.currentSpendingLimit !== null ? parseFloat(data.currentSpendingLimit) : null);
                // Initialize input with current spending limit if set, otherwise empty
                setNewLimitInput(data.currentSpendingLimit !== null ? parseFloat(data.currentSpendingLimit).toFixed(2) : '');
            } else {
                throw new Error(data.message || 'Failed to load spending limits.');
            }
        } catch (error) {
            console.error("Error fetching spending limits:", error);
            setMessage({ text: error.message, type: 'error' });
            if (error.response && (error.response.status === 401 || error.response.status === 403)) {
                navigate('/login');
            }
        } finally {
            setIsLoading(false);
        }
    }, [navigate]);

    useEffect(() => {
        fetchLimits();
    }, [fetchLimits]);

    const handleInputChange = (e) => {
        const value = e.target.value;
        // Allow only numbers and up to two decimal places
        if (/^\d*\.?\d{0,2}$/.test(value) || value === '') {
            setNewLimitInput(value);
            setMessage({ text: '', type: '' }); // Clear message on input change
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setMessage({ text: '', type: '' });
        const newLimit = parseFloat(newLimitInput);

        if (isNaN(newLimit) || newLimit < 0) {
            setMessage({ text: 'Please enter a valid, non-negative spending limit.', type: 'error' });
            return;
        }
        if (overallCreditLimit !== null && newLimit > overallCreditLimit) {
            setMessage({ text: `Spending limit cannot exceed your overall credit limit of £${overallCreditLimit.toFixed(2)}.`, type: 'error' });
            return;
        }
        // If user enters 0, it means they want to remove the limit (or set it to 0)
        // If they clear the input, it's also like removing/setting to null

        setIsSaving(true);
        try {
            const response = await authenticatedFetch('/api/spending-limit', {
                method: 'POST',
                body: JSON.stringify({
                    // Send null if input is empty or effectively zero to "remove" limit, else send the number
                    spendingLimit: newLimitInput === '' || newLimit === 0 ? null : newLimit
                })
            });
            const data = await response.json();

            if (response.ok && data.success) {
                setCurrentSpendingLimit(data.newSpendingLimit !== null ? parseFloat(data.newSpendingLimit) : null);
                setNewLimitInput(data.newSpendingLimit !== null ? parseFloat(data.newSpendingLimit).toFixed(2) : ''); // Update input to reflect saved value
                setMessage({ text: data.message || 'Spending limit updated successfully!', type: 'success' });
            } else {
                throw new Error(data.message || 'Failed to update spending limit.');
            }
        } catch (error) {
            console.error("Error saving spending limit:", error);
            setMessage({ text: error.message, type: 'error' });
        } finally {
            setIsSaving(false);
        }
    };

    const handleRemoveLimit = async () => {
        if (currentSpendingLimit === null) {
            setMessage({ text: 'No spending limit is currently set.', type: 'info' });
            return;
        }
        setNewLimitInput(''); // Visually clear it
        // Then call submit which will send null to the backend
        // Need to construct a synthetic event or call the logic directly
        const newLimit = null; // Representing removal

        setIsSaving(true);
        setMessage({ text: '', type: '' });
        try {
            const response = await authenticatedFetch('/api/spending-limit', {
                method: 'POST',
                body: JSON.stringify({ spendingLimit: newLimit }) // Send null
            });
            const data = await response.json();

            if (response.ok && data.success) {
                setCurrentSpendingLimit(null);
                setNewLimitInput('');
                setMessage({ text: data.message || 'Spending limit removed successfully!', type: 'success' });
            } else {
                throw new Error(data.message || 'Failed to remove spending limit.');
            }
        } catch (error) {
            console.error("Error removing spending limit:", error);
            setMessage({ text: error.message, type: 'error' });
        } finally {
            setIsSaving(false);
        }
    }

    if (isLoading) {
        return (
            <div className="container spending-limit-container">
                <div className="form-card">
                    <BackButton />
                    <h2>Set Monthly Spending Limit</h2>
                    <p className="loading-message">Loading your limits...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="container spending-limit-container">
            <div className="form-card">
                <BackButton />
                <h2 style={{ textAlign: 'center', marginBottom: '20px' }}>Set Monthly Spending Limit</h2>

                <div className="current-limits-info">
                    <p>Your Overall Credit Limit:
                        <strong> £{overallCreditLimit !== null ? overallCreditLimit.toFixed(2) : 'Not Assessed'}</strong>
                    </p>
                    <p>Current Monthly Spending Limit:
                        <strong> {currentSpendingLimit !== null ? `£${currentSpendingLimit.toFixed(2)}` : 'Not Set'}</strong>
                    </p>
                    {currentSpendingLimit !== null && overallCreditLimit !== null &&
                        <p className="limit-info-note">
                            This month, you can spend up to £{currentSpendingLimit.toFixed(2)} using BNPL.
                            Your overall approved credit line is £{overallCreditLimit.toFixed(2)}.
                        </p>
                    }
                </div>

                <form onSubmit={handleSubmit} className="spending-limit-form">
                    <label htmlFor="spendingLimitInput">
                        Set New Monthly Limit (£):
                    </label>
                    <input
                        type="text" // Using text to allow better control over decimal input format
                        id="spendingLimitInput"
                        value={newLimitInput}
                        onChange={handleInputChange}
                        placeholder={overallCreditLimit !== null ? `Max £${overallCreditLimit.toFixed(2)}` : "Enter amount"}
                        disabled={isSaving || overallCreditLimit === null}
                        className="form-input"
                    />
                    {overallCreditLimit === null && (
                        <p className="error-message small-text">
                            Your overall credit limit must be assessed before setting a spending limit.
                        </p>
                    )}
                    <div className="button-group">
                        <button
                            type="submit"
                            className="btn action-button"
                            disabled={isSaving || overallCreditLimit === null || newLimitInput === (currentSpendingLimit !== null ? currentSpendingLimit.toFixed(2) : '')}
                        >
                            {isSaving ? 'Saving...' : 'Set/Update Limit'}
                        </button>
                        {currentSpendingLimit !== null && (
                            <button
                                type="button"
                                onClick={handleRemoveLimit}
                                className="btn remove-button"
                                disabled={isSaving}
                            >
                                {isSaving ? 'Removing...' : 'Remove Limit'}
                            </button>
                        )}
                    </div>
                </form>

                {message.text && (
                    <p className={`message ${message.type}`} style={{ marginTop: '20px', textAlign: 'center' }}>
                        {message.text}
                    </p>
                )}

                <p style={{ marginTop: '30px', textAlign: 'center' }}>
                    <span
                        onClick={() => navigate('/dashboard')}
                        style={{ cursor: 'pointer', color: 'blue', textDecoration: 'underline' }}
                    >
                        Back to Dashboard
                    </span>
                </p>
            </div>
        </div>
    );
};

export default SpendingLimit;