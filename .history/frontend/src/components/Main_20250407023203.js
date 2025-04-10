import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
// No longer need: import axios from 'axios';
import './Main.css'; // Keep your existing CSS import

// --- Mock Data (Replace API Call) ---
// Define some static product data that mimics the structure your component expects.
const mockProducts = [
    {
        title: "Sample Laptop A (High End)",
        price: "£1499.99", // Price as a string, like from the API
        link: "#product-a", // Placeholder link
        numericPrice: 1499.99 // Pre-calculated numeric price
    },
    {
        title: "Sample Laptop B (Mid Range)",
        price: "£849.00",
        link: "#product-b",
        numericPrice: 849.00
    },
    {
        title: "Sample Laptop C (Budget)",
        price: "£399.50",
        link: "#product-c",
        numericPrice: 399.50
    },
    {
        title: "Another Mid Range Laptop D",
        price: "£999.00",
        link: "#product-d",
        numericPrice: 999.00
    },
    {
        title: "Gaming Laptop E",
        price: "£1799.00",
        link: "#product-e",
        numericPrice: 1799.00
    },
    {
        title: "UltraBook F",
        price: "£1199.00",
        link: "#product-f",
        numericPrice: 1199.00
    },
    {
        title: "Basic Laptop G",
        price: "£299.00",
        link: "#product-g",
        numericPrice: 299.00
    },
    // Add more mock products if needed (at least 9 to test "Load More")
    { title: "Sample H", price: "£550", link: "#h", numericPrice: 550 },
    { title: "Sample I", price: "£650", link: "#i", numericPrice: 650 },
    { title: "Sample J", price: "£750", link: "#j", numericPrice: 750 },
    { title: "Sample K", price: "£1350", link: "#k", numericPrice: 1350 },
];
// ------------------------------------

const Main = () => {
    // --- State Variables ---
    // Initialize 'products' state with the mock data directly
    const [products, setProducts] = useState(mockProducts);
    const [filteredProducts, setFilteredProducts] = useState(mockProducts); // Initially show all mock products
    const [searchTerm, setSearchTerm] = useState('');
    const [sortOption, setSortOption] = useState('');
    const [priceRange, setPriceRange] = useState([0, 2000]); // Default max price range
    const [selectedProduct, setSelectedProduct] = useState(null); // For the modal
    // Removed 'loading' and 'error' states as they were tied to API fetching
    const [visibleProducts, setVisibleProducts] = useState(9); // For "Load More"
    const navigate = useNavigate();

    // --- Removed the useEffect for Data Fetching ---
    // The data is now static mock data, loaded instantly.

    // --- Effect for Filtering and Sorting (Remains the same) ---
    // This effect now works on the 'products' state initialized with mock data
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
    }, [searchTerm, sortOption, priceRange, products]); // 'products' dependency is okay here

    // --- Event Handlers (Remain the same) ---
    const handleShowMore = () => {
        setVisibleProducts(prevVisible => prevVisible + 9);
    };

    const openModal = (product) => {
        setSelectedProduct(product);
    };

    const closeModal = () => {
        setSelectedProduct(null);
    };

    // --- Render Logic (Remove Loading/Error sections) ---
    return (
        <div className="main-container">
            {/* --- Navigation Taskbar (Remains the same) --- */}
            <nav className="taskbar">
                <span className="tab" onClick={() => navigate('/dashboard')}>My Dashboard</span>
                <span className="tab" onClick={() => navigate('/settings')}>Settings</span>
                {/* ... other tabs ... */}
                <span className="tab logout" onClick={() => navigate('/login')}>Logout</span>
            </nav>

            <h1>Product Display</h1> {/* Changed title slightly */}

            {/* --- Filter/Sort Controls (Remains the same) --- */}
            <div className="controls filters">
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
                        max="2000" // Adjust max based on mock data range if needed
                        step="50"
                        value={priceRange[1]}
                        onChange={(e) => setPriceRange([0, Number(e.target.value)])}
                        aria-label="Maximum price filter"
                    />
                </div>
            </div>

            {/* --- Product Display Area (Loading/Error states removed) --- */}
            <div className="content-area">
                 {/* No loading/error messages needed here anymore */}
                <>
                    {/* --- Product Grid (Remains the same) --- */}
                    <div className="products-container">
                        {filteredProducts.length > 0 ? (
                            filteredProducts.slice(0, visibleProducts).map((product, index) => (
                                <div
                                    key={product.link || index} // Use link as key if unique, else index
                                    className="product-card"
                                    onClick={() => openModal(product)}
                                    role="button"
                                    tabIndex="0"
                                    aria-label={`View details for ${product.title}`}
                                >
                                    <h3 className="product-title">{product.title}</h3>
                                    <p className="product-price">{product.price}</p>
                                    {/* Link now points to placeholder href from mock data */}
                                    <a
                                        href={product.link}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="product-view-link"
                                        onClick={(e) => { e.preventDefault(); e.stopPropagation(); /* Prevent default for '#' links and stop modal*/ }}
                                    >
                                        View Details {/* Changed text slightly */}
                                    </a>
                                </div>
                            ))
                        ) : (
                            // This message now shows if filters result in no matches from mock data
                            <p>No products match your criteria.</p>
                        )}
                    </div>

                    {/* --- Load More Button (Remains the same) --- */}
                    {filteredProducts.length > visibleProducts && (
                        <button onClick={handleShowMore} className="load-more-button">
                            Load More
                        </button>
                    )}
                </>
            </div>

            {/* --- Product Detail Modal (Remains the same) --- */}
            {selectedProduct && (
                <div className="product-modal" onClick={closeModal}>
                    <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                        <span className="close-button" onClick={closeModal} role="button" aria-label="Close modal">×</span>
                        <h2>{selectedProduct.title}</h2>
                        <p className="modal-price">{selectedProduct.price}</p>
                        <div className="buttons">
                            {/* Link now points to placeholder href from mock data */}
                            <a
                                href={selectedProduct.link}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="modal-action-button"
                                onClick={(e) => e.preventDefault() /* Prevent default for '#' links */}
                            >
                                View Product Page {/* Changed text slightly */}
                            </a>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Main;