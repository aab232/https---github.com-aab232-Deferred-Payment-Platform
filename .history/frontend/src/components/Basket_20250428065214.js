// src/components/Basket.js
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useBasket } from '../context/BasketContext';
import './Basket.css';

const Basket = () => {
    const { basketItems, removeFromBasket, updateQuantity, itemCount } = useBasket();
    const navigate = useNavigate();

    const calculateSubtotal = () => {
        return basketItems.reduce((total, item) => total + item.numericPrice * item.quantity, 0);
    };

    return (
        <div className="container basket-container">
            <div className="form-card basket-card"> {/* Reuse styles */}
                <h2>Your Basket</h2>

                {itemCount === 0 ? (
                    <p style={{textAlign: 'center', margin: '30px 0'}}>Your basket is empty.</p>
                ) : (
                    <>
                        <div className="basket-items">
                            {basketItems.map(item => (
                                <div key={item.id} className="basket-item">
                                    <div className="item-info">
                                        <h4>{item.title}</h4>
                                        <p className="item-price">£{item.numericPrice.toFixed(2)}</p>
                                    </div>
                                    <div className="item-actions">
                                        <label htmlFor={`quantity-${item.id}`}>Qty:</label>
                                        <input
                                            id={`quantity-${item.id}`}
                                            type="number"
                                            min="1"
                                            step="1"
                                            value={item.quantity}
                                            onChange={(e) => updateQuantity(item.id, e.target.value)}
                                            className="quantity-input"
                                        />
                                        <button
                                            onClick={() => removeFromBasket(item.id)}
                                            className="remove-button"
                                            title="Remove item"
                                        >
                                            🗑️
                                        </button>
                                    </div>
                                    <p className="item-total">
                                        Subtotal: £{(item.numericPrice * item.quantity).toFixed(2)}
                                    </p>
                                </div>
                            ))}
                        </div>
                        <div className="basket-summary">
                             <p>Total Items: {itemCount}</p>
                             <h3>Total: £{calculateSubtotal().toFixed(2)}</h3>
                             {/* TODO: Add checkout button later */}
                             <button className="btn checkout-button" disabled>Proceed to Checkout (WIP)</button>
                        </div>
                    </>
                )}

                <button onClick={() => navigate('/main')} className="btn back-button" style={{marginTop: '30px'}}>
                    Continue Shopping
                </button>
            </div>
        </div>
    );
};

export default Basket;