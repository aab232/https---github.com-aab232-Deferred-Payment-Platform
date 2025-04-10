import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import './Main.css';
import axios from 'axios';

const Main = () => {
  const [products, setProducts] = useState([]);
  const navigate = useNavigate();

  const handleLogout = () => {
    navigate('/login'); // Redirect to login page
  };

  useEffect(() => {
    const fetchProducts = async () => {
      try {
        const response = await axios.get('http://localhost:5000/api/products');
        setProducts(response.data);
      } catch (error) {
        console.error('Error fetching products:', error);
      }
    };

    fetchProducts();
  }, []);

  return (
    <div className="main-container">
      <nav className="taskbar">
        <span className="tab" onClick={() => navigate('/dashboard')}>My Dashboard</span>
        <span className="tab" onClick={() => navigate('/settings')}>Settings</span>
        <span className="tab" onClick={() => navigate('/education')}>Education Centre</span>
        <span className="tab" onClick={() => navigate('/privacy')}>Data Privacy</span>
        <span className="tab logout" onClick={handleLogout}>Logout</span>
      </nav>

      <h1>Welcome to Your Dashboard</h1>
      <p>Explore your data and manage your account seamlessly.</p>

      <div className="products-container">
        {products.length === 0 ? (
          <p>Loading products...</p> // Show loading message if no products are available
        ) : (
          products.slice(0, 9).map((product, index) => (
            <div key={index} className="product-card">
              <img src={product.img} alt={product.name} />
              <h3>{product.name}</h3>
              <p>{product.price}</p>
              <button>Add to Cart</button>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default Main;