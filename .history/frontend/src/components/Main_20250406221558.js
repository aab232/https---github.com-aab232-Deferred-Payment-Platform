import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import './Main.css'; // Make sure you have this CSS file styled appropriately

const Main = () => {
    const [products, setProducts] = useState([]);
    const [filteredProducts, setFilteredProducts] = useState([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [sortOption, setSortOption] = useState('');
    const [priceRange, setPriceRange] = useState([0, 2000]); // Initial max price
    const [selectedProduct, setSelectedProduct] = useState(null);
    const [loading, setLoading] = useState(true); // Added loading state
    const [error, setError] = useState(null); // Added error state
    const [visibleProducts, setVisibleProducts] = useState(9); // For "Load More"
    const navigate = useNavigate();

    // --- Data Fetching ---
    useEffect(() => {
        const fetchProducts = async () => {
            setLoading(true); // Start loading
            setError(null); // Reset error
            try {
                const response = await axios.get('http://localhost:5000/api/products');
                // Ensure the response structure is correct
                if (response.data && Array.isArray(response.data.products)) {
                    // Clean price data for reliable sorting/filtering if needed upfront
                    // Although current filtering does it on-the-fly, which is also fine.
                    const fetchedProducts = response.data.products.map(p => ({
                        ...p,
                        // Store numeric price for easier processing later if desired
                        numericPrice: parseFloat(String(p.price).replace(/[^0-9.]/g, '')) || 0
                    }));
                    setProducts(fetchedProducts);
                    setFilteredProducts(fetchedProducts); // Initialize filtered list
                } else {
                    console.error('Unexpected response structure:', response.data);
                    setError('Could not load products. Unexpected data format received.');
                    setProducts([]);
                    setFilteredProducts([]);
                }
            } catch (error) {
                console.error('Error fetching products:', error);
                setError(`Failed to fetch products: ${error.message}. Is the backend server running?`);
                setProducts([]);
                setFilteredProducts([]);
            } finally {
                setLoading(false); // Stop loading regardless of success or error
            }
        };
        fetchProducts();
    }, []); // Empty dependency array means this runs once on mount

    // --- Filtering and Sorting Logic ---
    useEffect(() => {
        let updatedProducts = products.filter(product =>
            product.title.toLowerCase().includes(searchTerm.toLowerCase()) &&
            product.numericPrice >= priceRange[0] &&
            product.numericPrice <= priceRange[1]
        );

        if (sortOption === 'price-asc') {
            updatedProducts.sort((a, b) => a.numericPrice - b.numericPrice);
        } else if (sortOption === 'price-desc') {
            updatedProducts.sort((a, b) => b.numericPrice - a.numericPrice);
        } else if (sortOption === 'name') {
            updatedProducts.sort((a, b) => a.title.localeCompare(b.title));
        }

        setFilteredProducts(updatedProducts);
        setVisibleProducts(9); // Reset visible count when filters change
    }, [searchTerm, sortOption, priceRange, products]); // Re-run when these change

    // --- Handlers ---
    const handleShowMore = () => {
        setVisibleProducts(prevVisible => prevVisible + 9); // Show 9 more products
    };

    const openModal = (product) => {
        setSelectedProduct(product);
    };

    const closeModal = () => {
        setSelectedProduct(null);
    };

    // --- Rendering ---
    return (
        <div className="main-container">
            {/* --- Navigation --- */}
            <nav className="taskbar">
                {/* Add your navigation links here using navigate */}
                <span className="tab" onClick={() => navigate('/dashboard')}>My Dashboard</span>
                {/* ... other tabs ... */}
                <span className="tab logout" onClick={() => navigate('/login')}>Logout</span>
            </nav>

            <h1>Currys PC World - Laptops</h1>

            {/* --- Filter Controls --- */}
            <div className="filters">
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
                <div className="price-filter">
                    <label htmlFor="priceRange">Max Price: £{priceRange[1]}</label>
                    <input
                        id="priceRange"
                        type="range"
                        min="0"
                        max="2000" // Adjust max based on your typical product prices
                        step="50"
                        value={priceRange[1]}
                        onChange={(e) => setPriceRange([0, Number(e.target.value)])}
                        aria-label="Maximum price"
                    />
                </div>
            </div>

            {/* --- Content Area --- */}
            <div className="content-area">
                {loading && <p className="loading-message">Loading products...</p>}

                {error && <p className="error-message">{error}</p>}

                {!loading && !error && (
                    <>
                        {/* --- Product Grid --- */}
                        <div className="products-container">
                            {filteredProducts.length > 0 ? (
                                filteredProducts.slice(0, visibleProducts).map((product, index) => (
                                    <div key={index} className="product-card" onClick={() => openModal(product)} role="button" tabIndex="0" aria-label={`View details for ${product.title}`}>
                                        {/* Removed img tag as API doesn't provide it */}
                                        {/* You could add a placeholder div here if needed */}
                                        {/* <div className="product-image-placeholder">No Image</div> */}
                                        <h3 className="product-title">{product.title}</h3>
                                        <p className="product-price">{product.price}</p> {/* Display original price string */}
                                        {/* Add a direct link/button if desired */}
                                        <a
                                            href={product.link}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="product-view-link"
                                            onClick={(e) => e.stopPropagation()} // Prevent card click when clicking link
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
            {selectedProduct && (
                <div className="modal-backdrop" onClick={closeModal}> {/* Close on backdrop click */}
                    <div className="modal-content" onClick={(e) => e.stopPropagation()}> {/* Prevent closing when clicking inside modal */}
                        <button className="close-button" onClick={closeModal} aria-label="Close modal">×</button>
                        {/* <div className="modal-image-placeholder">No Image Available</div> */}
                        <h2>{selectedProduct.title}</h2>
                        <p className="modal-price">{selectedProduct.price}</p>
                        <p>View this product directly on the retailer's website:</p>
                        <a
                            href={selectedProduct.link}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="modal-external-link-button" // Style as a button
                        >
                            View on Currys
                        </a>
                        {/* Removed "Add to Cart" and "Buy Now" unless you implement cart functionality */}
                    </div>
                </div>
            )}
        </div>
    );
};