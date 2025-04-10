import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
// Assuming your CSS file is named Main.css and in the same directory
import './Main.css';

const Main = () => {
    // --- State Variables ---
    const [products, setProducts] = useState([]); // Raw data from API
    const [filteredProducts, setFilteredProducts] = useState([]); // Data after filtering/sorting
    const [searchTerm, setSearchTerm] = useState('');
    const [sortOption, setSortOption] = useState('');
    const [priceRange, setPriceRange] = useState([0, 2000]); // [min, max] - Keeping max dynamic
    const [selectedProduct, setSelectedProduct] = useState(null); // For the modal
    const [loading, setLoading] = useState(true); // Track loading state
    const [error, setError] = useState(null); // Track fetch errors
    const [visibleProducts, setVisibleProducts] = useState(9); // How many products to show initially/load more
    const navigate = useNavigate();

    // --- Effect for Data Fetching ---
    useEffect(() => {
        const fetchProducts = async () => {
            setLoading(true);
            setError(null);
            try {
                const response = await axios.get('http://localhost:5000/api/products');
                if (response.data && Array.isArray(response.data.products)) {
                    const fetchedProducts = response.data.products.map(p => ({
                        ...p,
                        // Ensure price is treated as a number for reliable sorting/filtering
                        numericPrice: parseFloat(String(p.price).replace(/[^0-9.]/g, '')) || 0
                    }));
                    setProducts(fetchedProducts);
                    setFilteredProducts(fetchedProducts); // Initially show all products
                } else {
                    console.error('Unexpected response structure:', response.data);
                    setError('Could not load products. Unexpected data format received.');
                    setProducts([]);
                    setFilteredProducts([]);
                }
            } catch (err) {
                console.error('Error fetching products:', err);
                setError(`Failed to fetch products: ${err.message}. Is the backend server running?`);
                setProducts([]);
                setFilteredProducts([]);
            } finally {
                setLoading(false); // Done loading
            }
        };
        fetchProducts();
    }, []); // Run only once on component mount

    // --- Effect for Filtering and Sorting ---
    useEffect(() => {
        let updatedProducts = products.filter(product =>
            product.title.toLowerCase().includes(searchTerm.toLowerCase()) &&
            product.numericPrice >= priceRange[0] &&
            product.numericPrice <= priceRange[1]
        );

        // Apply sorting
        if (sortOption === 'price-asc') {
            updatedProducts.sort((a, b) => a.numericPrice - b.numericPrice);
        } else if (sortOption === 'price-desc') {
            updatedProducts.sort((a, b) => b.numericPrice - a.numericPrice);
        } else if (sortOption === 'name') {
            updatedProducts.sort((a, b) => a.title.localeCompare(b.title));
        }

        setFilteredProducts(updatedProducts);
        setVisibleProducts(9); // Reset visible count when filters/sort change
    }, [searchTerm, sortOption, priceRange, products]); // Re-run when these dependencies change

    // --- Event Handlers ---
    const handleShowMore = () => {
        setVisibleProducts(prevVisible => prevVisible + 9); // Increase count
    };

    const openModal = (product) => {
        setSelectedProduct(product);
    };

    const closeModal = () => {
        setSelectedProduct(null);
    };

    // --- Render Logic ---
    return (
        <div className="main-container">
            {/* --- Navigation Taskbar --- */}
            <nav className="taskbar">
                <span className="tab" onClick={() => navigate('/dashboard')}>My Dashboard</span>
                <span className="tab" onClick={() => navigate('/settings')}>Settings</span>
                <span className="tab" onClick={() => navigate('/education')}>Education Centre</span>
                <span className="tab" onClick={() => navigate('/privacy')}>Data Privacy</span>
                <span className="tab" onClick={() => navigate('/contact')}>Contact Us</span>
                <span className="tab" onClick={() => navigate('/faq')}>FAQ</span>
                <span className="tab logout" onClick={() => navigate('/login')}>Logout</span>
            </nav>

            {/* --- Page Title --- */}
            <h1>Currys PC World - Laptops</h1>

            {/* --- Filter/Sort Controls --- */}
            {/* Using your 'controls' class for margins */}
            <div className="controls filters"> {/* Added 'filters' for potential specific styling */}
                <input
                    type="text"
                    placeholder="Search by name..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    aria-label="Search products by name"
                />
                <select value={sortOption} onChange={(e) => setSortOption(e.target.value)} aria-label="Sort products">
                    <option value="">Sort By</option>
                    <option value="price-asc">Price: Low to High</option>
                    <option value="price-desc">Price: High to Low</option>
                    <option value="name">Name: A-Z</option>
                </select>
                <div className="price-filter"> {/* Wrapper for price range */}
                    <label htmlFor="priceRange">Max Price: £{priceRange[1]}</label>
                    <input
                        id="priceRange"
                        type="range"
                        min="0"
                        max="2000" // Adjust max as needed
                        step="50"
                        value={priceRange[1]}
                        onChange={(e) => setPriceRange([0, Number(e.target.value)])}
                        aria-label="Maximum price filter"
                    />
                </div>
            </div>

            {/* --- Loading/Error/Product Display Area --- */}
            <div className="content-area"> {/* Optional wrapper */}
                {loading && <p className="loading-message">Loading products...</p>}

                {error && <p className="error-message">{error}</p>}

                {!loading && !error && (
                    <>
                        {/* --- Product Grid --- */}
                        <div className="products-container">
                            {filteredProducts.length > 0 ? (
                                filteredProducts.slice(0, visibleProducts).map((product, index) => (
                                    // Using your 'product-card' class
                                    <div
                                        key={index} // Use a unique ID from DB if available, otherwise index is okay if list doesn't reorder drastically
                                        className="product-card"
                                        onClick={() => openModal(product)}
                                        role="button"
                                        tabIndex="0"
                                        aria-label={`View details for ${product.title}`}
                                    >
                                        {/* No img tag since API doesn't provide it */}
                                        <h3 className="product-title">{product.title}</h3>
                                        <p className="product-price">{product.price}</p> {/* Display original price string */}
                                        {/* Optional: Add direct link on card */}
                                        <a
                                            href={product.link}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="product-view-link" // Needs styling in Main.css
                                            onClick={(e) => e.stopPropagation()} // Prevent card click when link is clicked
                                        >
                                            View on Currys
                                        </a>
                                    </div>
                                ))
                            ) : (
                                <p>No products match your criteria.</p>
                            )}
                        </div>

                        {/* --- Load More Button --- */}
                        {filteredProducts.length > visibleProducts && (
                            <button onClick={handleShowMore} className="load-more-button">
                                Load More
                            </button>
                        )}
                    </>
                )}
            </div>

            {/* --- Product Detail Modal --- */}
            {/* Using your 'product-modal' for backdrop and 'modal-content' for the box */}
            {selectedProduct && (
                <div className="product-modal" onClick={closeModal}> {/* Backdrop */}
                    <div className="modal-content" onClick={(e) => e.stopPropagation()}> {/* Content Box */}
                        {/* Using your 'close-button' class */}
                        <span className="close-button" onClick={closeModal} role="button" aria-label="Close modal">×</span>

                        {/* Modal Details */}
                        <h2>{selectedProduct.title}</h2>
                        <p className="modal-price">{selectedProduct.price}</p> {/* Add specific style if needed */}
                        {/* Using your 'buttons' wrapper class */}
                        <div className="buttons">
                            <a
                                href={selectedProduct.link}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="modal-action-button" // Style this like a button
                            >
                                View on Currys
                            </a>
                            {/* Removed Add to Cart/Buy Now */}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Main;