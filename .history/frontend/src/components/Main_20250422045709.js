import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import './Main.css';

// Mock Data (Keep)
const mockProducts = [/* ... */];

// Authenticated Fetch Helper (Keep)
async function authenticatedFetch(url, options = {}) { /* ... */ }

const Main = () => {
    // State Variables (Keep existing states)
    const [products, setProducts] = useState(mockProducts);
    const [filteredProducts, setFilteredProducts] = useState(mockProducts);
    const [searchTerm, setSearchTerm] = useState('');
    const [sortOption, setSortOption] = useState('');
    const [priceRange, setPriceRange] = useState([0, 2000]);
    const [selectedProduct, setSelectedProduct] = useState(null);
    const [visibleProducts, setVisibleProducts] = useState(9);
    const navigate = useNavigate();

    // BNPL Assessment State (Keep)
    const [assessmentLoading, setAssessmentLoading] = useState(false);
    const [assessmentResult, setAssessmentResult] = useState(null); // Stores { entitlements: {...}, success: true, assessmentId: XXX } or { message: "...", success: false }
    const [selectedTerm, setSelectedTerm] = useState(null);

    // Effect for Filtering/Sorting (Keep)
    useEffect(() => { /* ... */ }, [searchTerm, sortOption, priceRange, products]);

    // handleShowMore (Keep)
    const handleShowMore = () => { /* ... */ };

    // openModal (Keep)
    const openModal = (product) => { /* ... Reset states ... */ };

    // closeModal (Keep)
    const closeModal = () => { /* ... Reset states ... */ };

    // handleBnplAssessment (Keep - Ensure it saves assessmentId in assessmentResult)
    const handleBnplAssessment = async () => {
        if (!selectedProduct) return;
        setAssessmentLoading(true); setAssessmentResult(null); setSelectedTerm(null);

        const response = await authenticatedFetch('/api/assess_credit', {
            method: 'POST',
            body: JSON.stringify({
                requested_loan_amount: selectedProduct.numericPrice,
                requested_loan_term: null // Term chosen *after* assessment in this flow
            }),
        });
        const resultData = await response.json();
        setAssessmentLoading(false);

        if (response.ok && resultData.success) {
             console.log("Assessment success:", resultData);
             // ** IMPORTANT: Store assessmentId along with entitlements **
             setAssessmentResult({
                success: true,
                entitlements: resultData.entitlements,
                assessmentId: resultData.assessmentId // Capture the assessment ID
             });
        } else {
            console.error("Assessment fail:", resultData);
            setAssessmentResult({ success: false, message: resultData.message || 'Assessment failed.' });
        }
    };

    // --- handleProceedWithBnpl (UPDATED to call new endpoint) ---
    const handleProceedWithBnpl = async () => {
        if (!assessmentResult?.success || !selectedTerm || !selectedProduct) {
            console.error("Cannot proceed: Invalid state.");
            // Optionally show a user-friendly message
            return;
        }

        console.log(`Attempting to confirm order: User=${/* get user ID? */""}, Product=${selectedProduct.title}, Term=${selectedTerm}, AssessmentID=${assessmentResult.assessmentId}`);
        // Show loading indicator maybe? setLoading(true) ...

        try {
             const response = await authenticatedFetch('/api/confirm_bnpl_order', {
                 method: 'POST',
                 body: JSON.stringify({
                     product: { // Send necessary product details
                         title: selectedProduct.title,
                         numericPrice: selectedProduct.numericPrice
                         // Add product ID if available/needed by backend
                     },
                     term: selectedTerm, // Send the selected term
                     assessmentId: assessmentResult.assessmentId // Send the assessment ID
                 }),
             });

             const resultData = await response.json();
             // setLoading(false);

             if (response.ok && resultData.success) {
                 console.log("Order Confirmed:", resultData);
                 // Show success message to user
                 alert(`Order confirmed successfully (Order ID: ${resultData.orderId})! You can view details in your dashboard.`);
                 // Navigate away or close modal
                 closeModal();
                 navigate('/dashboard'); // Example: navigate to dashboard
             } else {
                 console.error("Order Confirmation Failed:", resultData);
                 // Show error message to user based on resultData.message
                 alert(`Order could not be confirmed: ${resultData.message || 'Please try again.'}`);
             }
        } catch (error) {
             console.error("Error during order confirmation fetch:", error);
             // setLoading(false);
             alert("An error occurred while confirming your order. Please try again later.");
        }
    };
    // --- -------------------------------------------------------- ---


    // --- RETURN JSX (Modal part is key change) ---
    return (
        <div className="main-container">
            <nav className="taskbar">{/* ... */}</nav>
            <h1>Available Products</h1>
            <div className="controls filters">{/* ... */}</div>
            <div className="content-area">
                <div className="products-container">
                    {filteredProducts.slice(0, visibleProducts).map((product, index) => (
                         <div key={product.link || index} className="product-card" onClick={() => openModal(product)}>{/* ... title, price ... */}</div>
                    ))}
                </div>
                {/* Load More Button */}
                {filteredProducts.length > visibleProducts && ( <button onClick={handleShowMore} className="load-more-button"> Load More </button> )}
            </div>

            {/* Product Detail Modal (with updated BNPL section) */}
            {selectedProduct && (
                <div className="product-modal-backdrop" onClick={closeModal}>
                    <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                        <span className="close-button" onClick={closeModal}>×</span>
                        <h2>{selectedProduct.title}</h2>
                        <p className="modal-price">{selectedProduct.price}</p>

                        <div className="bnpl-section">
                            {/* BNPL Button - Triggers assessment */}
                            <button className="modal-action-button bnpl-button" onClick={handleBnplAssessment} disabled={assessmentLoading}>
                                {assessmentLoading ? 'Assessing...' : 'Buy Now, Pay Later?'}
                            </button>

                            {/* Assessment Feedback Area */}
                            {assessmentLoading && <p className="assessment-status">Checking eligibility...</p>}
                            {assessmentResult && !assessmentResult.success && <p className="assessment-error">Error: {assessmentResult.message}</p>}

                            {/* Success Result & Term Selection */}
                            {assessmentResult && assessmentResult.success && (
                                <div className="assessment-results">
                                    <h4>Assessment Result:</h4>
                                    {assessmentResult.entitlements.limit >= selectedProduct.numericPrice ? (
                                        <>
                                            <p className="assessment-approved">✅ Approved for BNPL up to £{assessmentResult.entitlements.limit.toFixed(2)}!</p>
                                            <p>Pay £{selectedProduct.numericPrice.toFixed(2)} over:</p>
                                            <div className="term-selection">
                                                {assessmentResult.entitlements.terms.map(term => (
                                                    <button key={term} className={`term-button ${selectedTerm === term ? 'selected' : ''}`} onClick={() => setSelectedTerm(term)}> {term} months </button>
                                                ))}
                                            </div>
                                            <button className="modal-action-button proceed-button" onClick={handleProceedWithBnpl} disabled={!selectedTerm}> Confirm & Proceed </button>
                                        </>
                                    ) : (
                                        <p className="assessment-partial">ℹ️ Your approved limit is £{assessmentResult.entitlements.limit.toFixed(2)}, which is less than the product price (£{selectedProduct.numericPrice.toFixed(2)}).</p>
                                    )}
                                    <p className="assessment-note"> (Details available in <span className="link-lookalike" onClick={() => { closeModal(); navigate('/dashboard'); }}>My Dashboard</span>)</p>
                                </div>
                            )}
                        </div> {/* End bnpl-section */}

                         {/* Optional Add to Basket Button */}
                        <button className="modal-action-button add-basket-button" style={{marginTop: '15px'}}>Add to Basket</button>

                    </div>
                </div>
            )} {/* End Modal */}
        </div> // End main-container
    );
};

export default Main;