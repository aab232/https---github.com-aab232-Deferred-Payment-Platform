import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import './Main.css';

const Main = () => {
  const [products, setProducts] = useState([]);
  const [filteredProducts, setFilteredProducts] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortOption, setSortOption] = useState('');
  const [priceRange, setPriceRange] = useState([0, 2000]);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    const fetchProducts = async () => {
      try {
        const response = await axios.get('http://localhost:5000/api/products');
        if (Array.isArray(response.data.products)) {
          setProducts(response.data.products);
          setFilteredProducts(response.data.products);
        }
      } catch (error) {
        console.error('Error fetching products:', error);
      }
    };
    fetchProducts();
  }, []);

  useEffect(() => {
    let updatedProducts = products.filter(product => 
      product.name.toLowerCase().includes(searchTerm.toLowerCase()) &&
      parseFloat(product.price.replace(/[^0-9.]/g, '')) >= priceRange[0] &&
      parseFloat(product.price.replace(/[^0-9.]/g, '')) <= priceRange[1]
    );

    if (sortOption === 'price-asc') {
      updatedProducts.sort((a, b) => parseFloat(a.price.replace(/[^0-9.]/g, '')) - parseFloat(b.price.replace(/[^0-9.]/g, '')));
    } else if (sortOption === 'price-desc') {
      updatedProducts.sort((a, b) => parseFloat(b.price.replace(/[^0-9.]/g, '')) - parseFloat(a.price.replace(/[^0-9.]/g, '')));
    } else if (sortOption === 'name') {
      updatedProducts.sort((a, b) => a.name.localeCompare(b.name));
    }

    setFilteredProducts(updatedProducts);
  }, [searchTerm, sortOption, priceRange, products]);

  return (
    <div className="main-container">
      <nav className="taskbar">
        <span className="tab" onClick={() => navigate('/dashboard')}>My Dashboard</span>
        <span className="tab" onClick={() => navigate('/settings')}>Settings</span>
        <span className="tab" onClick={() => navigate('/education')}>Education Centre</span>
        <span className="tab" onClick={() => navigate('/privacy')}>Data Privacy</span>
        <span className="tab" onClick={() => navigate('/contact')}>Contact Us</span>
        <span className="tab" onClick={() => navigate('/faq')}>FAQ</span>
        <span className="tab logout" onClick={() => navigate('/login')}>Logout</span>
      </nav>

      <h1>Currys'PC World - Laptops</h1>

      <div className="filters">
        <input type="text" placeholder="Search by name..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
        <select onChange={(e) => setSortOption(e.target.value)}>
          <option value="">Sort By</option>
          <option value="price-asc">Price: Low to High</option>
          <option value="price-desc">Price: High to Low</option>
          <option value="name">Name: A-Z</option>
        </select>
        <input type="range" min="0" max="2000" step="50" value={priceRange[1]} onChange={(e) => setPriceRange([0, Number(e.target.value)])} />
        <span>Max Price: £{priceRange[1]}</span>
      </div>

      <div className="products-container">
        {filteredProducts.length > 0 ? (
          filteredProducts.slice(0, 9).map((product, index) => (
            <div key={index} className="product-card" onClick={() => setSelectedProduct(product)}>
              <img src={product.img} alt={product.name} />
              <h3>{product.name}</h3>
              <p>{product.price}</p>
              <button>Add to Cart</button>
            </div>
          ))
        ) : (
          <p>No products available.</p>
        )}
      </div>

      {selectedProduct && (
        <div className="modal">
          <div className="modal-content">
            <span className="close" onClick={() => setSelectedProduct(null)}>&times;</span>
            <img src={selectedProduct.img} alt={selectedProduct.name} />
            <h2>{selectedProduct.name}</h2>
            <p>{selectedProduct.price}</p>
            <p><a href={selectedProduct.link} target="_blank" rel="noopener noreferrer">View on Argos</a></p>
            <button className="buy-now">Buy Now</button>
            <button className="add-to-cart">Add to Cart</button>
          </div>
        </div>
      )}
    </div>
  );
};

export default Main;