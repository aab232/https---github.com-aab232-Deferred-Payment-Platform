import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import './Main.css'; // Ensure this path is correct

// --- Mock Data ---
const mockProducts = [
    // Adding unique IDs for keys
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
// --- ----------------- ---


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
    } catch (error) {
        console.error(`API Error ${url}:`, error);
        return { ok: false, status: 503, json: async () => ({ success: false, message: "Network error." }) };
    }
}
// --- ---------------------------- ---


// --- Main Component ---
const Main = () => {
    // Linter directive to ignore unused 'setProducts' when using mock data
    // eslint-disable-next-line no-unused-vars
    const [products, setProducts] = useState(mockProducts); // 'products' IS used
    const [filteredProducts, setFilteredProducts] = useState(mockProducts);
    const [searchTerm, setSearchTerm] = useState('');
    const [sortOption, setSortOption] = useState('');
    const [priceRange, setPriceRange] = useState([0, 2000]);
    const [visibleProducts, setVisibleProducts] = useState(9);
    const [selectedProduct, setSelectedProduct] = useState(null);
    const [assessmentLoading, setAssessmentLoading] = useState(false);
    const [assessmentResult, setAssessmentResult] = useState(null);
    const [selectedTerm, setSelectedTerm] = useState(null);
    const [orderLoading, setOrderLoading] = useState(false);
    const navigate = useNavigate(); // Hook for navigation

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
        setVisibleProducts(9);
    }, [searchTerm, sortOption, priceRange, products]);

    // Event Handlers
    const handleShowMore = () => setVisibleProducts(prev => prev + 9);
    const openModal = (product) => { setSelectedProduct(product); setAssessmentLoading(false); setAssessmentResult(null); setSelectedTerm(null); setOrderLoading(false); };
    const closeModal = () => setSelectedProduct(null);

    // BNPL Assessment API Call
    const handleBnplAssessment = async () => {
        if (!selectedProduct) return;
        setAssessmentLoading(true); setAssessmentResult(null); setSelectedTerm(null); setOrderLoading(false);
        const response = await authenticatedFetch('/api/assess_credit', { method: 'POST', body: JSON.stringify({ requested_loan_amount: selectedProduct.numericPrice, requested_loan_term: null }) });
        let resultData; try { resultData = await response.json(); } catch (e) { resultData = { success: false, message: "Invalid response." }; }
        setAssessmentLoading(false);
        if (response.ok && resultData.success) setAssessmentResult({ ...resultData, success: true });
        else { setAssessmentResult({ success: false, message: resultData.message || 'Failed.' }); if(response.status === 401) navigate('/login'); }
    };

    // Confirm BNPL Order API Call
    const handleProceedWithBnpl = async () => {
        if (!assessmentResult?.success || !selectedTerm || !selectedProduct || orderLoading) return;
        setOrderLoading(true);
        const response = await authenticatedFetch('/api/confirm_bnpl_order', { method: 'POST', body: JSON.stringify({ product: { id: selectedProduct.id, title: selectedProduct.title, numericPrice: selectedProduct.numericPrice }, term: selectedTerm, assessmentId: assessmentResult.assessmentId }) });
        let resultData; try { resultData = await response.json(); } catch (e) { resultData = { success: false, message: "Invalid response." }; }
        setOrderLoading(false);
        if (response.ok && resultData.success) { alert(`Order confirmed (ID: ${resultData.orderId})!`); closeModal(); }
        else { alert(`Order failed: ${resultData.message || 'Try again.'}`); }
    };

    // --- RETURN JSX ---
    return (
        <div className="main-container">
            {/* --- Navigation Taskbar --- */}
            <nav className="taskbar">
                 {/* --- FIXED: Use navigate directly --- */}
                <span className="tab" onClick={() => navigate('/dashboard')}>Dashboard</span>
                <span className="tab" onClick={() => navigate('/settings')}>Settings</span>
                <span className="tab" onClick={() => navigate('/education')}>Education</span>
                <span className="tab" onClick={() => navigate('/privacy')}>Privacy</span>
                <span className="tab" onClick={() => navigate('/contact')}>Contact</span>
                <span className="tab" onClick={() => navigate('/faq')}>FAQ</span>
                <span className="tab logout" onClick={() => { localStorage.removeItem('authToken'); navigate('/login'); }}>Logout</span>
                 {/* --- ----------------------------- --- */}
            </nav>

            <h1>Available Products</h1>

            {/* --- Filter/Sort Controls --- */}
            <div className="controls filters">
                 <input type="text" placeholder="Search..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} aria-label="Search products"/>
                 <select value={sortOption} onChange={(e) => setSortOption(e.target.value)} aria-label="Sort products"> <option value="">Sort By</option> <option value="price-asc">Price Low-High</option> <option value="price-desc">Price High-Low</option> <option value="name">Name A-Z</option> </select>
                 <div className="price-filter"> <label htmlFor="priceRange">Max Price: £{priceRange[1]}</label> <input id="priceRange" type="range" min="0" max="2000" step="50" value={priceRange[1]} onChange={(e) => setPriceRange([0, Number(e.target.value)])} aria-label="Maximum price"/> </div>
            </div>

            {/* --- Product Display Area --- */}
            <div className="content-area">
                <div className="products-container">
                    {filteredProducts?.length > 0 ? ( // Check if array has items
                        filteredProducts.slice(0, visibleProducts).map((product, index) => (
                            product ? ( // Check individual product exists
                                <div key={product.id || `prod-${index}`} className="product-card" onClick={() => openModal(product)} role="button" tabIndex="0" aria-label={`Details for ${product.title}`}>
                                    <h3 className="product-title">{product.title}</h3>
                                    <p className="product-price">{product.price}</p>
                                </div>
                            ) : null
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
                        <button className="close-button" onClick={closeModal} aria-label="Close modal">×</button>
                        <h2>{selectedProduct.title}</h2>
                        <p className="modal-price">{selectedProduct.price}</p>

                        {/* BNPL Section */}
                        <div className="bnpl-section">
                            <button className="modal-action-button bnpl-button" onClick={handleBnplAssessment} disabled={assessmentLoading || orderLoading}> {assessmentLoading ? 'Assessing...' : 'Buy Now, Pay Later?'} </button>
                            {/* Feedback Area */}
                            {assessmentLoading && <p className="assessment-status">Checking eligibility...</p>}
                            {orderLoading && <p className="assessment-status">Confirming order...</p>}
                            {assessmentResult && !assessmentResult.success && <p className="assessment-error">Error: {assessmentResult.message}</p>}
                            {/* Success Result Area */}
                            {assessmentResult && assessmentResult.success && (
                                <div className="assessment-results">
                                    <h4>Assessment Result:</h4>
                                    {(assessmentResult.entitlements?.limit >= selectedProduct.numericPrice) ? (
                                        <> {/* Approved */}
                                            <p className="assessment-approved">✅ Approved! Pay £{selectedProduct.numericPrice.toFixed(2)} over:</p>
                                            <div className="term-selection">
                                                 {(assessmentResult.entitlements.terms?.length > 0) ? (
                                                    assessmentResult.entitlements.terms.map(term => ( <button key={term} className={`term-button ${selectedTerm === term ? 'selected' : ''}`} onClick={() => setSelectedTerm(term)}> {term} months </button> ))
                                                 ) : ( <p>No terms available.</p> )}
                                            </div>
                                            {(assessmentResult.entitlements.terms?.length > 0) && ( <button className="modal-action-button proceed-button" onClick={handleProceedWithBnpl} disabled={!selectedTerm || orderLoading}> {orderLoading ? "Processing..." : "Confirm Purchase"} </button> )}
                                        </>
                                    ) : (
                                         <p className="assessment-partial">ℹ️ Limit £{(assessmentResult.entitlements?.limit ?? 0).toFixed(2)} is less than price £{selectedProduct.numericPrice.toFixed(2)}.</p>
                                    )}
                                    <p className="assessment-note">(Tier: {assessmentResult.entitlements?.tier ?? 'N/A'}. <span className="link-lookalike" onClick={() => { closeModal(); navigate('/dashboard'); }}>View Dashboard</span>)</p>
                                </div>
                            )} {/* End Success Area */}
                        </div> {/* End bnpl-section */}

                        {/* Optional Add to Basket */}
                        <button className="modal-action-button add-basket-button" style={{marginTop: '15px'}} disabled={assessmentLoading || orderLoading}> Add to Basket </button>

                    </div> {/* End modal-content */}
                </div> {/* End modal-backdrop */}
            )} {/* End Modal Render */}
        </div> // End main-container
    );
};

export default Main;