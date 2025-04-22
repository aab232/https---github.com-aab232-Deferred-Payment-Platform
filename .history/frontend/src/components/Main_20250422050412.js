import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import './Main.css'; // Ensure this path is correct

// --- Mock Data (Replace with API call in a real application) ---
const mockProducts = [
    { id: "prodA", title: "Sample Laptop A (High End)", price: "£1499.99", link: "#product-a", numericPrice: 1499.99 },
    { id: "prodB", title: "Sample Laptop B (Mid Range)", price: "£849.00", link: "#product-b", numericPrice: 849.00 },
    { id: "prodC", title: "Sample Laptop C (Budget)", price: "£399.50", link: "#product-c", numericPrice: 399.50 },
    { id: "prodD", title: "Another Mid Range Laptop D", price: "£999.00", link: "#product-d", numericPrice: 999.00 },
    { id: "prodE", title: "Gaming Laptop E", price: "£1799.00", link: "#product-e", numericPrice: 1799.00 },
    { id: "prodF", title: "UltraBook F", price: "£1199.00", link: "#product-f", numericPrice: 1199.00 },
    { id: "prodG", title: "Basic Laptop G", price: "£299.00", link: "#product-g", numericPrice: 299.00 },
    { id: "prodH", title: "Sample H", price: "£550.00", link: "#h", numericPrice: 550.00 },
    { id: "prodI", title: "Sample I", price: "£650.00", link: "#i", numericPrice: 650.00 },
    { id: "prodJ", title: "Sample J", price: "£750.00", link: "#j", numericPrice: 750.00 },
    { id: "prodK", title: "Sample K", price: "£1350.00", link: "#k", numericPrice: 1350.00 },
];
// --- ------------------------------------ ---


// --- Helper Function for Authenticated API Calls ---
async function authenticatedFetch(url, options = {}) {
    // Assume JWT token is stored in localStorage after login
    const token = localStorage.getItem('authToken');
    const headers = {
        'Content-Type': 'application/json',
        ...options.headers, // Allow overriding headers
    };

    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    } else {
        console.warn("No auth token found for API call to", url);
        // For client-side, often better to redirect than return fake response
        // Depending on where this is called, maybe navigate('/login');
        // Returning error structure for caller to handle:
        return {
            ok: false,
            status: 401,
            json: async () => ({ success: false, message: "Authentication token missing or expired." })
        };
    }

    try {
        // Construct full URL if needed (e.g., if API is on different origin)
        const apiUrl = process.env.REACT_APP_API_BASE_URL || 'http://localhost:5000'; // Example base URL
        const fullUrl = `${apiUrl}${url}`; // Prepend base URL
        const response = await fetch(fullUrl, { ...options, headers });
        return response;
    } catch (error) {
        console.error(`API Fetch Error for ${url}:`, error);
        return {
            ok: false,
            status: 503, // Service Unavailable or Network Error
            json: async () => ({ success: false, message: "Network error or server is unreachable." })
        };
    }
}
// --- ------------------------------------------- ---


// --- Main Component ---
const Main = () => {
    // State: Products & Filtering/Sorting
    const [products, setProducts] = useState(mockProducts); // Using mock data
    const [filteredProducts, setFilteredProducts] = useState(mockProducts);
    const [searchTerm, setSearchTerm] = useState('');
    const [sortOption, setSortOption] = useState('');
    const [priceRange, setPriceRange] = useState([0, 2000]); // Max price for slider
    const [visibleProducts, setVisibleProducts] = useState(9); // Pagination

    // State: Modal & BNPL Assessment
    const [selectedProduct, setSelectedProduct] = useState(null); // Product shown in modal
    const [assessmentLoading, setAssessmentLoading] = useState(false); // For assessment API call
    const [assessmentResult, setAssessmentResult] = useState(null); // Stores {success, entitlements, assessmentId} or {success, message}
    const [selectedTerm, setSelectedTerm] = useState(null); // User's chosen repayment term
    const [orderLoading, setOrderLoading] = useState(false); // For confirm order API call

    const navigate = useNavigate();

    // Effect for Filtering and Sorting
    useEffect(() => {
        let updatedProducts = products.filter(product =>
            product.title.toLowerCase().includes(searchTerm.toLowerCase()) &&
            product.numericPrice >= priceRange[0] &&
            product.numericPrice <= priceRange[1]
        );
        if (sortOption === 'price-asc') updatedProducts.sort((a, b) => a.numericPrice - b.numericPrice);
        else if (sortOption === 'price-desc') updatedProducts.sort((a, b) => b.numericPrice - a.numericPrice);
        else if (sortOption === 'name') updatedProducts.sort((a, b) => a.title.localeCompare(b.title));
        setFilteredProducts(updatedProducts);
        setVisibleProducts(9); // Reset pagination on filter/sort change
    }, [searchTerm, sortOption, priceRange, products]);

    // Handler for showing more products
    const handleShowMore = () => setVisibleProducts(prev => prev + 9);

    // Open Modal: Set selected product and reset BNPL states
    const openModal = (product) => {
        setSelectedProduct(product);
        setAssessmentLoading(false);
        setAssessmentResult(null);
        setSelectedTerm(null);
        setOrderLoading(false);
    };

    // Close Modal: Reset selected product
    const closeModal = () => setSelectedProduct(null); // Also resets BNPL states via openModal next time

    // Handler: Trigger BNPL Assessment via Backend API
    const handleBnplAssessment = async () => {
        if (!selectedProduct) return;
        setAssessmentLoading(true); setAssessmentResult(null); setSelectedTerm(null); setOrderLoading(false);

        const response = await authenticatedFetch('/api/assess_credit', { // Uses helper
            method: 'POST',
            body: JSON.stringify({
                requested_loan_amount: selectedProduct.numericPrice,
                requested_loan_term: null // Term selected *after* assessment
            }),
        });
        const resultData = await response.json();
        setAssessmentLoading(false);

        if (response.ok && resultData.success) {
            console.log("Assessment successful:", resultData);
            setAssessmentResult({ ...resultData, success: true }); // Includes assessmentId
        } else {
            console.error("Assessment failed:", resultData);
            setAssessmentResult({ success: false, message: resultData.message || 'Assessment failed.' });
             if (response.status === 401 && resultData.needsRelink) {
                  alert("Your bank connection needs to be updated. Please re-link your account.");
                  // Optional: navigate('/link-bank'); // Redirect to linking page
             } else if (response.status === 401) {
                 alert("Session expired or invalid. Please log in again.");
                 navigate('/login');
             }
        }
    };

    // Handler: Confirm the BNPL Order via Backend API
    const handleProceedWithBnpl = async () => {
        if (!assessmentResult?.success || !selectedTerm || !selectedProduct || orderLoading) return;

        console.log(`Confirming order: Product=${selectedProduct.title}, Term=${selectedTerm}, AssessID=${assessmentResult.assessmentId}`);
        setOrderLoading(true); // Indicate processing order

        const response = await authenticatedFetch('/api/confirm_bnpl_order', { // Uses helper
            method: 'POST',
            body: JSON.stringify({
                product: { // Send relevant product info
                    id: selectedProduct.id, // If product has an ID
                    title: selectedProduct.title,
                    numericPrice: selectedProduct.numericPrice
                },
                term: selectedTerm, // The chosen term
                assessmentId: assessmentResult.assessmentId // Link to assessment
            }),
        });
        const resultData = await response.json();
        setOrderLoading(false); // Done processing

        if (response.ok && resultData.success) {
            console.log("Order Confirmed:", resultData);
            alert(`Order confirmed (ID: ${resultData.orderId})! Check your dashboard for repayment details.`);
            closeModal();
            // Optionally navigate somewhere specific, like '/my-orders' or '/dashboard'
            // navigate('/dashboard');
        } else {
            console.error("Order Confirmation Failed:", resultData);
            alert(`Order could not be confirmed: ${resultData.message || 'Please try again.'}`);
             // Keep modal open for user to retry or choose another option?
        }
    };


    // --- RETURN JSX ---
    return (
        <div className="main-container">
            {/* --- Navigation Taskbar --- */}
            <nav className="taskbar">
                <span className="tab" onClick={() => navigate('/dashboard')}>Dashboard</span>
                <span className="tab" onClick={() => navigate('/settings')}>Settings</span>
                <span className="tab" onClick={() => navigate('/education')}>Education</span>
                <span className="tab" onClick={() => navigate('/privacy')}>Privacy</span>
                <span className="tab" onClick={() => navigate('/contact')}>Contact</span>
                <span className="tab" onClick={() => navigate('/faq')}>FAQ</span>
                <span className="tab logout" onClick={() => { localStorage.removeItem('authToken'); navigate('/login'); }}>Logout</span> {/* Example Logout */}
            </nav>

            <h1>Available Products</h1>

            {/* --- Filter/Sort Controls --- */}
            <div className="controls filters">
                <input type="text" placeholder="Search..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
                <select value={sortOption} onChange={(e) => setSortOption(e.target.value)}>
                    <option value="">Sort By</option> <option value="price-asc">Price Low-High</option> <option value="price-desc">Price High-Low</option> <option value="name">Name A-Z</option>
                </select>
                <div className="price-filter">
                    <label htmlFor="priceRange">Max Price: £{priceRange[1]}</label>
                    <input id="priceRange" type="range" min="0" max="2000" step="50" value={priceRange[1]} onChange={(e) => setPriceRange([0, Number(e.target.value)])}/>
                </div>
            </div>

            {/* --- Product Display Area --- */}
            <div className="content-area">
                 <div className="products-container">
                    {filteredProducts.length > 0 ? (
                        filteredProducts.slice(0, visibleProducts).map((product, index) => (
                            <div key={product.id || index} className="product-card" onClick={() => openModal(product)} role="button" tabIndex="0" aria-label={`Details for ${product.title}`}>
                                <h3 className="product-title">{product.title}</h3>
                                <p className="product-price">{product.price}</p>
                            </div>
                        ))
                    ) : ( <p>No products match your criteria.</p> )}
                </div>
                {/* --- Load More Button --- */}
                {filteredProducts.length > visibleProducts && ( <button onClick={handleShowMore} className="load-more-button" disabled={visibleProducts >= filteredProducts.length}> Load More </button> )}
            </div>


            {/* --- Product Detail Modal --- */}
            {selectedProduct && (
                <div className="product-modal-backdrop" onClick={closeModal}>
                    <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                        <button className="close-button" onClick={closeModal} aria-label="Close modal">×</button> {/* Use button for accessibility */}
                        <h2>{selectedProduct.title}</h2>
                        <p className="modal-price">{selectedProduct.price}</p>

                        {/* --- BNPL Assessment Section --- */}
                        <div className="bnpl-section">
                             <button className="modal-action-button bnpl-button" onClick={handleBnplAssessment} disabled={assessmentLoading || orderLoading}>
                                {assessmentLoading ? 'Assessing...' : 'Buy Now, Pay Later?'}
                            </button>

                            {/* Feedback Area */}
                            {assessmentLoading && <p className="assessment-status">Checking eligibility...</p>}
                            {orderLoading && <p className="assessment-status">Confirming order...</p>}
                            {assessmentResult && !assessmentResult.success && <p className="assessment-error">Error: {assessmentResult.message}</p>}

                            {/* Success Result & Term Selection */}
                            {assessmentResult && assessmentResult.success && (
                                <div className="assessment-results">
                                    <h4>Assessment Result:</h4>
                                    {/* Check if limit covers the *selected* product */}
                                    {assessmentResult.entitlements.limit >= selectedProduct.numericPrice ? (
                                        <>
                                            <p className="assessment-approved">
                                                ✅ Approved for BNPL up to £{assessmentResult.entitlements.limit.toFixed(2)}!
                                            </p>
                                            <p>Pay today's price of £{selectedProduct.numericPrice.toFixed(2)} over:</p>
                                            <div className="term-selection">
                                                {assessmentResult.entitlements.terms && assessmentResult.entitlements.terms.length > 0 ? (
                                                    assessmentResult.entitlements.terms.map(term => (
                                                        <button key={term} className={`term-button ${selectedTerm === term ? 'selected' : ''}`} onClick={() => setSelectedTerm(term)}> {term} months </button>
                                                    ))
                                                ) : (
                                                     <p>No payment terms available for this tier.</p>
                                                )}
                                            </div>
                                            {/* Proceed button - enabled only if terms exist AND one is selected */}
                                            {assessmentResult.entitlements.terms?.length > 0 && (
                                                 <button
                                                    className="modal-action-button proceed-button"
                                                    onClick={handleProceedWithBnpl}
                                                    disabled={!selectedTerm || orderLoading} // Also disable if order is processing
                                                    title={!selectedTerm ? "Please select a payment term" : "Confirm purchase with selected term"}
                                                >
                                                     {orderLoading ? "Processing..." : "Confirm Purchase"}
                                                </button>
                                            )}
                                        </>
                                    ) : ( // Limit is less than product price
                                        <p className="assessment-partial">
                                            ℹ️ Your approved limit is £{assessmentResult.entitlements.limit.toFixed(2)}, which is less than this product's price (£{selectedProduct.numericPrice.toFixed(2)}).
                                        </p>
                                    )}
                                    <p className="assessment-note">
                                        (Tier: {assessmentResult.entitlements.tier ?? 'N/A'}. See <span className="link-lookalike" onClick={() => { closeModal(); navigate('/dashboard'); }}>Dashboard</span> for details.)
                                    </p>
                                </div>
                            )}
                        </div>

                        {/* Optional Add to Basket Button */}
                        <button className="modal-action-button add-basket-button" style={{marginTop: '15px'}} disabled={assessmentLoading || orderLoading}>
                            Add to Basket
                        </button>

                    </div> {/* End modal-content */}
                </div> {/* End product-modal-backdrop */}
            )}
        </div> // End main-container
    );
};

export default Main;