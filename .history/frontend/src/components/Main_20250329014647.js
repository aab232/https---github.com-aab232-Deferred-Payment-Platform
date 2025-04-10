import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import './Main.css';
import axios from 'axios';

const Main = () => {
  const [products, setProducts] = useState([]);
  const [userRole, setUserRole] = useState(null); // State for user role
  const navigate = useNavigate();

  const handleLogout = () => {
    localStorage.removeItem('authToken'); // Remove token on logout
    navigate('/login'); // Redirect to login page
  };

  // Check the user's role and permissions on component mount
  useEffect(() => {
    const fetchUserRole = async () => {
      const token = localStorage.getItem('authToken'); // Get token from local storage

      if (token) {
        try {
          const response = await axios.post('http://localhost:5000/verify-token', { token });

          if (response.data.success) {
            setUserRole(response.data.role); // Set the user role based on server response
          } else {
            console.error('Failed to verify token or user role.');
          }
        } catch (error) {
          console.error('Error verifying token:', error);
        }
      } else {
        console.error('No token found.');
        navigate('/login'); // Redirect to login if no token is found
      }
    };

    fetchUserRole();
  }, [navigate]);

  useEffect(() => {
    const fetchProducts = async () => {
      try {
        const response = await axios.get('http://localhost:5000/api/products');
        console.log('Fetched products:', response.data); // Log the response to inspect it
        if (Array.isArray(response.data.products)) {
          setProducts(response.data.products); // Extract products array from the response
        } else {
          console.error('Invalid product data:', response.data);
        }
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

      {userRole && (
        <div>
          <h3>User Role: {userRole}</h3> {/* Display user role for debugging */}
          <p>Welcome, {userRole}!</p>
        </div>
      )}

      <div className="products-container">
        {Array.isArray(products) && products.length > 0 ? (
          products.slice(0, 9).map((product, index) => (
            <div key={index} className="product-card">
              <img src={product.img} alt={product.name} />
              <h3>{product.name}</h3>
              <p>{product.price}</p>
              <button>Add to Cart</button>
            </div>
          ))
        ) : (
          <p>No products available at this moment.</p>
        )}
      </div>

      {/* Add additional features for different roles */}
      {userRole === 'admin' && (
        <div>
          <h3>Admin Features</h3>
          <p>You can manage the entire system, view analytics, and manage users.</p>
        </div>
      )}
      {userRole === 'contractor' && (
        <div>
          <h3>Contractor Features</h3>
          <p>You have permissions to view and update contracts.</p>
        </div>
      )}
      {userRole === 'data_engineer' && (
        <div>
          <h3>Data Engineer Features</h3>
          <p>You can manage and analyze product data and perform system maintenance.</p>
        </div>
      )}
    </div>
  );
};

export default Main;