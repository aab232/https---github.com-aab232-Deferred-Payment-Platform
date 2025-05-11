import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import './Main.css';

// products for display on main page
const mockProducts = [
    { id: 'prodA', title: 'Lenovo Pilates XC', price: '£1499.99', link: '#product-a', numericPrice: 1499.99 },
    { id: 'prodB', title: 'Acer Aluminium II', price: '£849.00', link: '#product-b', numericPrice: 849.00 },
    { id: 'prodC', title: 'HP 17-cp3001na', price: '£199.50', link: '#product-c', numericPrice: 199.50 },
    { id: 'prodD', title: 'SAMSUNG Galaxy Book 4', price: '£999.00', link: '#product-d', numericPrice: 999.00 },
    { id: 'prodE', title: 'Macbook Pro Light', price: '£1799.00', link: '#product-e', numericPrice: 1799.00 },
    { id: 'prodF', title: 'UltraBook fc00441na', price: '£1199.00', link: '#product-f', numericPrice: 1199.00 },
    { id: 'prodG', title: 'Hasta DELL Vista', price: '£200.00', link: '#product-g', numericPrice: 200.00 },
    { id: 'prodH', title: 'Acer Inspire', price: '£89.00', link: '#h', numericPrice: 89.00 },
    { id: 'prodI', title: 'ASUS VivoBook 15 M1502YA', price: '£650.00', link: '#i', numericPrice: 650.00 },
    { id: 'prodJ', title: 'DELL INSPION 16 5640', price: '£750.00', link: '#j', numericPrice: 750.00 },
    { id: 'prodK', title: 'i7010 No HD Laptop', price: '£7.99', link: '#k', numericPrice: 7.99 },
    // ensure all product ids are unique in a real dataset for correct keying
    { id: 'prodL', title: 'Jumper Pro 15.6 Inch HD Laptop', price: '£1350.00', link: '#l', numericPrice: 1350.00 },
    { id: 'prodM', title: 'HP 14 Inch Laptop - Intel Core i5, 8GB', price: '£349.00', link: '#m', numericPrice: 349.00 },
    { id: 'prodN', title: 'Microsoft Surface Laptop 4 i7-1185G7 Notebook', price: '£1867.91', link: '#n', numericPrice: 1867.91 },
    { id: 'prodO', title: 'DELL XPS 16 Laptop', price: '£1799.00', link: '#o', numericPrice: 1799.00 },
];
// --- ------------------------------------ ---


// --- helper function for authenticated api calls ---
// wraps native fetch to include authentication token and handle common response scenarios
async function authenticatedFetch(url, options = {}) {
    // retrieve auth token from local storage
    const token = localStorage.getItem('authToken');
    // prepare http headers, defaulting to json content type
    const headers = {
        'Content-Type': 'application/json',
        ...options.headers,
    };

    if (token) { // if token exists, add it to authorisation header
        headers['Authorization'] = `Bearer ${token}`; // http standard is 'authorization'
    } else { // if no token, log warning and return simulated unauthorised response
        console.warn('No auth token found for API call to', url);
        return {
            ok: false, status: 401,
            json: async () => ({ success: false, message: 'Authentication token missing.' })
        };
    }

    try {
        // determine base api url from environment variables or default
        const apiUrl = process.env.REACT_APP_API_BASE_URL || 'http://localhost:5000'; // backend URL
        const fullUrl = `${apiUrl}${url}`; // construct full url
        // perform fetch request
        const response = await fetch(fullUrl, { ...options, headers });
        return response; // return raw response object
    } catch (error) { // catch network errors or other issues during fetch
        console.error(`API Fetch Error for ${url}:`, error);
        // return a fetch-like response object for consistent error handling
        return {
            ok: false, status: 503,
            json: async () => ({ success: false, message: 'Network error or server unavailable.' })
        };
    }
}
// --- ------------------------------------------- ---


// --- main component ---
// defines main component, which displays products and handles bnpl (buy now, pay later) flow
const Main = () => {
    // --- state variables ---
    const productsData  = useState(mockProducts);
    // state to hold products after filtering based on search, sort, and price range
    const [filteredProducts, setFilteredProducts] = useState(mockProducts);
    // state for the search term entered by the user
    const [searchTerm, setSearchTerm] = useState('');
    // state for the selected sort option (e.g., price, name)
    const [sortOption, setSortOption] = useState('');
    // state for the price range filter, an array [minPrice, maxPrice]
    const [priceRange, setPriceRange] = useState([0, 2000]);
    // state to control how many products are currently visible on page (for "load more")
    const [visibleProducts, setVisibleProducts] = useState(9);
    // defines number of additional products to display when "load more" is clicked
    const productsToShowIncrement = 9;

    // state related to product modal and bnpl (buy now, pay later) process
    // state for the currently selected product (to display in the modal)
    const [selectedProduct, setSelectedProduct] = useState(null);
    // state to indicate if bnpl assessment is currently loading/processing
    const [assessmentLoading, setAssessmentLoading] = useState(false);
    // state to store result of bnpl assessment (success/failure, entitlements)
    const [assessmentResult, setAssessmentResult] = useState(null);
    // state for payment term selected by user (e.g., 3 months, 6 months) after assessment
    const [selectedTerm, setSelectedTerm] = useState(null);
    // state to indicate if order confirmation is currently processing
    const [orderLoading, setOrderLoading] = useState(false);

    // react-router hook for programmatic navigation
    const navigate = useNavigate();

    // --- effect for filtering and sorting products ---
    useEffect(() => {
        // starts with all products from productsdata (which currently holds mockproducts)
        let updatedProducts = productsData // uses productsData as source
            // filters products based on search term
            .filter(product =>
                product.title.toLowerCase().includes(searchTerm.toLowerCase()) &&
                // filters products based on selected price range
                product.numericPrice >= priceRange[0] &&
                product.numericPrice <= priceRange[1]
            );
        // applies sorting based on the selected sortoption
        if (sortOption === 'price-asc') updatedProducts.sort((a, b) => a.numericPrice - b.numericPrice); // sort by price: low to high
        else if (sortOption === 'price-desc') updatedProducts.sort((a, b) => b.numericPrice - a.numericPrice); // sort by price: high to low
        else if (sortOption === 'name') updatedProducts.sort((a, b) => a.title.localeCompare(b.title)); // sort by name: alphabetically

        setFilteredProducts(updatedProducts); // updates the state with the filtered and sorted products
        setVisibleProducts(productsToShowIncrement); // resets number of visible products to initial increment when filters change
    }, [searchTerm, sortOption, priceRange, productsData, productsToShowIncrement]); // dependencies for useeffect

   // handles "load more" button click to display additional products
   const handleShowMore = () => {
        setVisibleProducts(prevVisibleProducts => { // uses functional update form for setting state
            // calculates new count of visible products by adding increment
            const newCount = prevVisibleProducts + productsToShowIncrement;
            // ensures new count does not exceed total number of available filtered products
            return Math.min(newCount, filteredProducts.length);
        });
    };

    // opens product detail modal and initialises modal-specific states to default values
    const openModal = (product) => {
        setSelectedProduct(product); // sets product to be displayed in modal
        setAssessmentLoading(false); // resets assessment loading status
        setAssessmentResult(null); // clears any previous assessment result
        setSelectedTerm(null); // clears any previously selected payment term
        setOrderLoading(false); // resets order processing status
    };

    // closes product detail modal by clearing selected product state
    const closeModal = () => {
        setSelectedProduct(null); // clears product from state, hides modal
    };

    // handles bnpl assessment button click within product modal
    const handleBnplAssessment = async () => {
        if (!selectedProduct) return; // exits if no product is currently selected
        // set loading states and clear previous results
        setAssessmentLoading(true); setAssessmentResult(null); setSelectedTerm(null); setOrderLoading(false);

        // makes an authenticated api call to backend for credit assessment
        const response = await authenticatedFetch('/api/assess_credit', {
            method: 'POST', // http post method
            body: JSON.stringify({ // data sent to backend
                requested_loan_amount: selectedProduct.numericPrice, // loan amount is product price
                requested_loan_term: null // payment term will be chosen by user after successful assessment
            }),
        });
        let resultData; // variable to hold parsed json response
        try {
             resultData = await response.json(); // attempt to parse response as json
        } catch (e) { // catches errors during json parsing
             console.error('Failed to parse assessment JSON response:', e);
             resultData = { success: false, message: 'Received invalid response from server.' }; // fallback error data
        }

        setAssessmentLoading(false); // assessment process finished, reset loading state
        if (response.ok && resultData.success) { // if api call was successful and backend confirms success
             setAssessmentResult({ ...resultData, success: true }); // update assessment result state
        } else { // if api call failed or backend reported failure
             console.error('Assessment API call failed:', resultData);
             setAssessmentResult({ success: false, message: resultData.message || 'Assessment failed.' }); // set error message
             if(response.status === 401) { // if error was due to authentication
                navigate('/login'); // redirect to login page
             }
        }
    };

    // handles confirm bnpl order button click after a successful assessment and term selection
    const handleProceedWithBnpl = async () => {
        // checks if all necessary conditions are met to proceed with order
        if (!selectedProduct || !assessmentResult?.success || !selectedTerm || orderLoading) {
             let alertMessage = 'Cannot proceed: '; // base for alert message
             // append specific reasons for not proceeding
             if (!selectedProduct) alertMessage += 'No product selected. ';
             if (!assessmentResult?.success) alertMessage += 'Assessment not approved. ';
             if (!selectedTerm) alertMessage += 'Please select a payment term. ';
             console.error('Proceed conditions not met:', { assessmentResult, selectedTerm, selectedProduct, orderLoading });
             alert(alertMessage.trim()); // show an informative alert to user
        return; // exit function if conditions not met
        }

        console.log(`Confirming order: Product=${selectedProduct.title}, Term=${selectedTerm}, AssessID=${assessmentResult.assessmentId}`); // debug log
        setOrderLoading(true); // set loading state for order confirmation

        // makes an authenticated api call to backend to confirm bnpl order
        const response = await authenticatedFetch('/api/confirm_bnpl_order', {
            method: 'POST', // http post method
            body: JSON.stringify({ // data sent to backend for order confirmation
                product: { // details of product being ordered
                    id: selectedProduct.id || null, // product id
                    title: selectedProduct.title, // product title
                    numericPrice: selectedProduct.numericPrice // product price
                },
                term: selectedTerm, // payment term selected by user
                assessmentId: assessmentResult.assessmentId, // id from successful credit assessment
            }),
        });
        let resultData; // for parsed json response
        try {
             resultData = await response.json(); // attempt to parse response
        } catch(e) { // catch parsing errors
            console.error('Failed to parse order confirmation JSON response:', e);
            resultData = { success: false, message: 'Received invalid response from server.' }; // fallback
        }

        setOrderLoading(false); // reset order loading state
        if (response.ok && resultData.success) { // if order confirmed successfully on backend
            alert(`Order confirmed (ID: ${resultData.orderId})! Redirecting to dashboard.`); // success alert
            closeModal(); // close product detail modal
            navigate('/dashboard'); // navigate user to dashboard
        } else { // if order confirmation failed
            console.error('Order Confirmation API call failed:', resultData);
            alert(`Order could not be confirmed: ${resultData.message || 'Please try again.'}`); // error alert
        }
    };


    // --- return jsx ---
    // jsx for rendering main component's user interface
    return (
        <div className="main-container">
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

            <div className="content-area">
                <div className="products-container">
                    {filteredProducts && filteredProducts.length > 0 ? (
                        filteredProducts.slice(0, visibleProducts).map((product, index) => (
                            product ? (
                                <div
                                    key={product.id || `prod-fallback-${index}`}
                                    className="product-card"
                                    onClick={() => openModal(product)}
                                    role="button"
                                    tabIndex="0"
                                    aria-label={`View details for ${product.title}`}
                                >
                                    <h3 className="product-title">{product.title}</h3>
                                    <p className="product-price">{product.price}</p>
                                </div>
                            ) : null
                        ))
                    ) : (
                        <p>No products match current criteria.</p>
                    )}
                </div>
                {filteredProducts.length > visibleProducts && (
                    <button onClick={handleShowMore} className="load-more-button" disabled={visibleProducts >= filteredProducts.length}>
                        Load More
                    </button>
                )}
            </div>

            {selectedProduct && (
                <div className="product-modal-backdrop" onClick={closeModal}>
                    <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                        <button className="close-button" onClick={closeModal} aria-label="Close modal">×</button>
                        <h2>{selectedProduct.title}</h2>
                        <p className="modal-price">{selectedProduct.price}</p>

                        <div className="bnpl-section">
                            <button className="modal-action-button bnpl-button" onClick={handleBnplAssessment} disabled={assessmentLoading || orderLoading}>
                                {assessmentLoading ? 'Assessing...' : 'Buy Now, Pay Later'}
                            </button>

                            {assessmentLoading && <p className="assessment-status">Checking eligibility...</p>}
                            {orderLoading && <p className="assessment-status">Confirming order...</p>}
                            {assessmentResult && !assessmentResult.success && (
                                <p className="assessment-error">Error: {assessmentResult.message}</p>
                            )}

                            {assessmentResult && assessmentResult.success && (
                                <div className="assessment-results">
                                    <h4>Assessment Result:</h4>
                                    {assessmentResult.entitlements && (assessmentResult.entitlements.limit >= selectedProduct.numericPrice) ? (
                                        <>
                                            <p className="assessment-approved">✅ Approved! Can pay £{selectedProduct.numericPrice.toFixed(2)} over:</p>
                                            <div className="term-selection">
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
                                                     <p>No payment terms available for this amount.</p>
                                                )}
                                            </div>
                                            {(assessmentResult.entitlements.terms?.length > 0) && (
                                                <button
                                                    className="modal-action-button proceed-button"
                                                    onClick={handleProceedWithBnpl}
                                                    disabled={!selectedTerm || orderLoading}
                                                >
                                                    {orderLoading ? 'Processing...' : 'Confirm Purchase'}
                                                </button>
                                            )}
                                        </>
                                    ) : (
                                        <p className="assessment-partial">
                                            ℹ️ The approved limit is £{(assessmentResult.entitlements?.limit ?? 0).toFixed(2)}, which is less than product price (£{selectedProduct.numericPrice.toFixed(2)}).
                                        </p>
                                    )}
                                     <p className="assessment-note">
                                        (Tier: {assessmentResult.entitlements?.tier ?? 'N/A'}. <span className="link-lookalike" onClick={() => { closeModal(); navigate('/dashboard'); }}>View Dashboard</span>)
                                    </p>
                                </div>
                            )}
                        </div>

                        <button className="modal-action-button add-basket-button" style={{marginTop: '15px'}} disabled={assessmentLoading || orderLoading}>
                            Add to Basket
                        </button>

                    </div>
                </div>
            )}
        </div>
    );
};

// exports main component for use in other parts of application
export default Main;