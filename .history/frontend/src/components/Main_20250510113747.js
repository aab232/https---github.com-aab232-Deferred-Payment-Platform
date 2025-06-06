import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import './Main.css';

// products for display on main page
const mockProducts = [
    { id: "prodA", title: "Lenovo Pilates XC", price: "£1499.99", link: "#product-a", numericPrice: 1499.99 },
    { id: "prodB", title: "Acer Aluminium II", price: "£849.00", link: "#product-b", numericPrice: 849.00 },
    { id: "prodC", title: "HP 17-cp3001na", price: "£199.50", link: "#product-c", numericPrice: 199.50 },
    { id: "prodD", title: "SAMSUNG Galaxy Book 4", price: "£999.00", link: "#product-d", numericPrice: 999.00 },
    { id: "prodE", title: "Macbook Pro Light", price: "£1799.00", link: "#product-e", numericPrice: 1799.00 },
    { id: "prodF", title: "UltraBook fc00441na", price: "£1199.00", link: "#product-f", numericPrice: 1199.00 },
    { id: "prodG", title: "Hasta DELL Vista", price: "£200.00", link: "#product-g", numericPrice: 200.00 },
    { id: "prodH", title: "Acer Inspire", price: "£89.00", link: "#h", numericPrice: 89.00 },
    { id: "prodI", title: "ASUS VivoBook 15 M1502YA", price: "£650.00", link: "#i", numericPrice: 650.00 },
    { id: "prodJ", title: "DELL INSPION 16 5640", price: "£750.00", link: "#j", numericPrice: 750.00 },
    { id: "prodK", title: "i7010 No HD Laptop", price: "£7.99", link: "#k", numericPrice: 7.99 },
    { id: "prodL", title: "Jumper Pro 15.6 Inch HD Laptop", price: "£1350.00", link: "#l", numericPrice: 1350.00 },
    { id: "prodM", title: "HP 14 Inch Laptop - Intel Core i5, 8GB", price: "£349.00", link: "#m", numericPrice: 349.00 },
    { id: "prodN", title: "Microsoft Surface Laptop 4 i7-1185G7 Notebook", price: "£1867.91", link: "#n", numericPrice: 1867.91 },
    { id: "prodO", title: "DELL XPS 16 Laptop", price: "£1799.00", link: "#o", numericPrice: 1799.00 },
];
// --- ------------------------------------ ---


// --- helper function for authenticated API calls ---
async function authenticatedFetch(url, options = {}) {
    // assuming JWT token is stored in localStorage after login
    const token = localStorage.getItem('authToken'); // or get token from context/state management
    const headers = {
        'Content-Type': 'application/json',
        ...options.headers,
    };

    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    } else {
        console.warn("No auth token found for API call to", url);
        return {
            ok: false, status: 401,
            json: async () => ({ success: false, message: "Authentication token missing." })
        };
    }

    try {
        const apiUrl = process.env.REACT_APP_API_BASE_URL || 'http://localhost:5000'; // backend URL
        const fullUrl = `${apiUrl}${url}`;
        const response = await fetch(fullUrl, { ...options, headers });
        return response; // return the raw response
    } catch (error) {
        console.error(`API Fetch Error for ${url}:`, error);
        return { // simulate fetch error response
            ok: false, status: 503,
            json: async () => ({ success: false, message: "Network error or server unavailable." })
        };
    }
}
// --- ------------------------------------------- ---


// --- main component ---
const Main = () => {
    // --- state variables ---
    const products = useState(mockProducts);
    const [filteredProducts, setFilteredProducts] = useState(mockProducts);
    const [searchTerm, setSearchTerm] = useState('');
    const [sortOption, setSortOption] = useState('');
    const [priceRange, setPriceRange] = useState([0, 2000]);
    const [visibleProducts, setVisibleProducts] = useState(9);
    const productsToShowIncrement = 9;

    // modal & BNPL state
    const [selectedProduct, setSelectedProduct] = useState(null);
    const [assessmentLoading, setAssessmentLoading] = useState(false);
    const [assessmentResult, setAssessmentResult] = useState(null);
    const [selectedTerm, setSelectedTerm] = useState(null);
    const [orderLoading, setOrderLoading] = useState(false);

    const navigate = useNavigate();

    // --- effect for filtering and sorting ---
    useEffect(() => {
        let updatedProducts = products.filter(product =>
            product.title.toLowerCase().includes(searchTerm.toLowerCase()) &&
            product.numericPrice >= priceRange[0] &&
            product.numericPrice <= priceRange[1]
        );
        // apply product sorting 
        if (sortOption === 'price-asc') updatedProducts.sort((a, b) => a.numericPrice - b.numericPrice);
        else if (sortOption === 'price-desc') updatedProducts.sort((a, b) => b.numericPrice - a.numericPrice);
        else if (sortOption === 'name') updatedProducts.sort((a, b) => a.title.localeCompare(b.title));

        setFilteredProducts(updatedProducts);
        setVisibleProducts(9);
    }, [searchTerm, sortOption, priceRange, products]);

   const handleShowMore = () => {
        setVisibleProducts(prevVisibleProducts => {
            // calculate new count, but don't exceed the total number of filtered products
            const newCount = prevVisibleProducts + productsToShowIncrement;
            return Math.min(newCount, filteredProducts.length); // ensure it doesn't go past the end
        });
    };

    const openModal = (product) => {
        setSelectedProduct(product);
        setAssessmentLoading(false);
        setAssessmentResult(null);
        setSelectedTerm(null);
        setOrderLoading(false);
    };

    const closeModal = () => {
        setSelectedProduct(null);
    };

    // handle BNPL assessment button click
    const handleBnplAssessment = async () => {
        if (!selectedProduct) return;
        setAssessmentLoading(true); setAssessmentResult(null); setSelectedTerm(null); setOrderLoading(false);

        const response = await authenticatedFetch('/api/assess_credit', {
            method: 'POST',
            body: JSON.stringify({
                requested_loan_amount: selectedProduct.numericPrice,
                requested_loan_term: null // term chosen after assessment
            }),
        });
        // check response status before calling json()
        let resultData;
        try {
             resultData = await response.json();
        } catch (e) {
             console.error("Failed to parse assessment JSON response:", e);
             resultData = { success: false, message: "Received invalid response from server." };
        }


        setAssessmentLoading(false);
        if (response.ok && resultData.success) {
             setAssessmentResult({ ...resultData, success: true });
        } else {
             console.error("Assessment API call failed:", resultData);
             setAssessmentResult({ success: false, message: resultData.message || 'Assessment failed.' });
             // handle specific status codes if needed
             if(response.status === 401) {
                navigate('/login');
             }
        }
    };

    // handle confirm BNPL order button click
    const handleProceedWithBnpl = async () => {
        if (!assessmentResult?.success || !selectedTerm || !selectedProduct || orderLoading) {
             let alert = "Cannot proceed: "; if (!selectedTerm) alert += "Select term. ";
             console.error("Proceed conditions not met:", { assessmentResult, selectedTerm, selectedProduct, orderLoading });
             alert("Cannot proceed. Ensure term is selected."); 
             
        return;
        }

        console.log(`Confirming order: Product=${selectedProduct.title}, Term=${selectedTerm}, AssessID=${assessmentResult.assessmentId}`);
        setOrderLoading(true);

        const response = await authenticatedFetch('/api/confirm_bnpl_order', {
            method: 'POST',
            body: JSON.stringify({
                product: {id: selectedProduct.id || null,
                    title: selectedProduct.title,
                    numericPrice: selectedProduct.numericPrice
                }, 
                
                term: selectedTerm,
                assessmentId: assessmentResult.assessmentId,
            }),
        });
        // check response status before calling json()
        let resultData;
        try {
             resultData = await response.json();
        } catch(e) {
            console.error("Failed to parse order confirmation JSON response:", e);
            resultData = { success: false, message: "Received invalid response from server." };
        }

        setOrderLoading(false);
        if (response.ok && resultData.success) {
            alert(`Order confirmed (ID: ${resultData.orderId})!`);
            closeModal();
            navigate('/dashboard');
        } else {
            console.error("Order Confirmation API call failed:", resultData);
            alert(`Order could not be confirmed: ${resultData.message || 'Please try again.'}`);
        }
    };


    // jsx for rendering
    return (
        <div className="main-container">
            {/* --- navigation taskbar --- */}
            <nav className="taskbar">
                <span className="tab" onClick={() => navigate('/dashboard')}>Dashboard</span>
                <span className="tab" onClick={() => navigate('/settings')}>Settings</span>
                <span className="tab" onClick={() => navigate('/education')}>Education</span>
                <span className="tab" onClick={() => navigate('/privacy')}>Privacy</span>
                <span className="tab" onClick={() => navigate('/contact')}>Contact</span>
                <span className="tab" onClick={() => navigate('/faq')}>FAQ</span>
                <span className="tab logout" onClick={() => { localStorage.removeItem('authToken'); navigate('/login'); }}>Logout</span>
            </nav>

            <h1>Available Products</h1>

            {/* --- filter/sort controls --- */}
            <div className="controls filters">
                <input
                    type="text"
                    placeholder="Search..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    aria-label="Search products"
                 />
                <select value={sortOption} onChange={(e) => setSortOption(e.target.value)} aria-label="Sort products">
                    <option value="">Sort By</option>
                    <option value="price-asc">Price Low-High</option>
                    <option value="price-desc">Price High-Low</option>
                    <option value="name">Name A-Z</option>
                </select>
                <div className="price-filter">
                    <label htmlFor="priceRange">Max Price: £{priceRange[1]}</label>
                    <input
                        id="priceRange" type="range" min="0" max="2000" step="50"
                        value={priceRange[1]} onChange={(e) => setPriceRange([0, Number(e.target.value)])}
                        aria-label="Maximum price"
                    />
                </div>
            </div>

            {/* --- product display area --- */}
            <div className="content-area">
                <div className="products-container">
                    {/* check if filteredProducts is not empty */}
                    {filteredProducts && filteredProducts.length > 0 ? (
                        filteredProducts.slice(0, visibleProducts).map((product, index) => (
                            // added fallback key and check if product exists
                            product ? (
                                <div
                                    key={product.id || `prod-${index}`} // use product ID if available
                                    className="product-card"
                                    onClick={() => openModal(product)}
                                    role="button"
                                    tabIndex="0"
                                    aria-label={`View details for ${product.title}`}
                                >
                                    <h3 className="product-title">{product.title}</h3>
                                    <p className="product-price">{product.price}</p>
                                </div>
                            ) : null // render nothing if product is somehow null/undefined
                        ))
                    ) : (
                        // message when no products match filters
                        <p>No products match your criteria.</p>
                    )}
                </div>
                {/* --- load more button --- */}
                {filteredProducts.length > visibleProducts && (
                    <button onClick={handleShowMore} className="load-more-button" disabled={visibleProducts >= filteredProducts.length}>
                        Load More
                    </button>
                )}
            </div>

            {/* --- product detail modal --- */}
            {/* render modal only if selectedProduct is not null */}
            {selectedProduct && (
                <div className="product-modal-backdrop" onClick={closeModal}> {/* Click backdrop to close */}
                    <div className="modal-content" onClick={(e) => e.stopPropagation()}> {/* Prevent closing when clicking content */}
                        <button className="close-button" onClick={closeModal} aria-label="Close modal">×</button>
                        <h2>{selectedProduct.title}</h2>
                        <p className="modal-price">{selectedProduct.price}</p>

                        {/* --- BNPL assessment section --- */}
                        <div className="bnpl-section">
                            <button className="modal-action-button bnpl-button" onClick={handleBnplAssessment} disabled={assessmentLoading || orderLoading}>
                                {assessmentLoading ? 'Assessing...' : 'Buy Now, Pay Later'}
                            </button>

                            {/* assessment feedback */}
                            {assessmentLoading && <p className="assessment-status">Checking eligibility...</p>}
                            {orderLoading && <p className="assessment-status">Confirming your order...</p>}
                            {assessmentResult && !assessmentResult.success && (
                                <p className="assessment-error">Error: {assessmentResult.message}</p>
                            )}

                            {/* success result */}
                            {assessmentResult && assessmentResult.success && (
                                <div className="assessment-results">
                                    <h4>Assessment Result:</h4>
                                    {assessmentResult.entitlements && (assessmentResult.entitlements.limit >= selectedProduct.numericPrice) ? ( // checks entitlements exist
                                        <>
                                            <p className="assessment-approved">✅ Approved! You can pay £{selectedProduct.numericPrice.toFixed(2)} over:</p>
                                            <div className="term-selection">
                                                {/* checks terms exist and is an array */}
                                                {(assessmentResult.entitlements.terms && Array.isArray(assessmentResult.entitlements.terms) && assessmentResult.entitlements.terms.length > 0) ? (
                                                    assessmentResult.entitlements.terms.map(term => (
                                                        <button
                                                            key={term}
                                                            className={`term-button ${selectedTerm === term ? 'selected' : ''}`}
                                                            onClick={() => setSelectedTerm(term)}
                                                        >
                                                            {term} months
                                                        </button>
                                                    ))
                                                ) : (
                                                     <p>No payment terms available.</p>
                                                )}
                                            </div>
                                            {/* enables button only if terms available AND one is selected */}
                                            {(assessmentResult.entitlements.terms?.length > 0) && (
                                                <button
                                                    className="modal-action-button proceed-button"
                                                    onClick={handleProceedWithBnpl}
                                                    disabled={!selectedTerm || orderLoading}
                                                >
                                                    {orderLoading ? "Processing..." : "Confirm Purchase"}
                                                </button>
                                            )}
                                        </>
                                    ) : ( // case where limit < price
                                        <p className="assessment-partial">
                                            ℹ️ Your approved limit is £{(assessmentResult.entitlements?.limit ?? 0).toFixed(2)}, which is less than the product price (£{selectedProduct.numericPrice.toFixed(2)}).
                                        </p>
                                    )}
                                     <p className="assessment-note">
                                        (Your Tier: {assessmentResult.entitlements?.tier ?? 'N/A'}. <span className="link-lookalike" onClick={() => { closeModal(); navigate('/dashboard'); }}>View Dashboard</span>)
                                    </p>
                                </div>
                            )}
                        </div>

                         {/* add to basket button */}
                        <button className="modal-action-button add-basket-button" style={{marginTop: '15px'}} disabled={assessmentLoading || orderLoading}>
                            Add to Basket
                        </button>

                    </div>
                </div>
            )}
        </div>
    );
};

export default Main;