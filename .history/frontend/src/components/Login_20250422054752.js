import React, { useState } from 'react';
import axios from 'axios'; // Assuming you are using axios
import { useNavigate } from 'react-router-dom';
import './Form.css';

const Login = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(''); // State for displaying errors
  const [loading, setLoading] = useState(false); // State for loading indicator
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(''); // Clear previous errors
    setLoading(true); // Set loading state

    try {
      // Define API base URL (optional but good practice)
      const apiUrl = process.env.REACT_APP_API_BASE_URL || 'http://localhost:5000';
      const response = await axios.post(`${apiUrl}/login`, { email, password });

      // --- Check success AND token existence ---
      if (response.data.success && response.data.token) {
        console.log("Login successful, received token:", response.data.token); // Log received token
        // --- !!! STORE THE TOKEN !!! ---
        localStorage.setItem('authToken', response.data.token);
        console.log("Token stored in localStorage.");
        // --- ----------------------- ---
        navigate('/main');
      } else {
        // Handle cases where backend might theoretically respond success:true but no token
        console.error("Login success reported, but no token received.", response.data);
        setError(response.data.message || 'Login failed: Invalid server response.');
      }
    } catch (error) {
        console.error('Login Axios Error:', error);
        if (error.response) {
            // Server responded with a status code outside 2xx range
            console.error("Error data:", error.response.data);
            console.error("Error status:", error.response.status);
            setError(error.response.data.message || `Login failed (${error.response.status})`);
        } else if (error.request) {
             // Request was made but no response received
             console.error("Error request:", error.request);
             setError('Login failed: Could not connect to server. Please try again later.');
        } else {
            // Something else happened setting up the request
            console.error('Error message:', error.message);
            setError(`Login failed: ${error.message}`);
        }
    } finally {
         setLoading(false); // Reset loading state whether success or fail
    }
  };

  return (
    <div className="container">
      <div className="form-card">
        <h2>Login</h2>
        <form onSubmit={handleSubmit}>
          <input
            type="email"
            placeholder="Email Address"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            disabled={loading} // Disable input while loading
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            disabled={loading} // Disable input while loading
          />
          {/* Display error message */}
          {error && <p className="error-message">{error}</p>}
          <button type="submit" className="btn" disabled={loading}>
              {loading ? 'Logging in...' : 'Login'} {/* Show loading text */}
          </button>
        </form>
        <p>Don't have an account? <span onClick={() => navigate('/register')} className="link">Register</span></p>
      </div>
    </div>
  );
};

export default Login;