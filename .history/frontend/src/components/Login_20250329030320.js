import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useNavigate, useLocation } from 'react-router-dom';
import './Form.css';

const Login = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const navigate = useNavigate();
  const location = useLocation();

  // Pre-fill email and password if they are passed from Register
  useEffect(() => {
    if (location?.state?.email) {
      setEmail(location.state.email);
      setPassword(location.state.password);
    }
  }, [location]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const response = await axios.post('http://localhost:5000/login', { email, password });

      if (response.data.success) {
        const { role } = response.data.user; // Get the user's role
        localStorage.setItem('userRole', role); // Store role in localStorage

        // Redirect based on role
        if (role === 'admin') {
          navigate('/admin-dashboard');
        } else if (role === 'contractor') {
          navigate('/contractor-dashboard');
        } else if (role === 'data_engineer') {
          navigate('/data-engineer-dashboard');
        } else {
          navigate('/main'); // Default for customers
        }
      } else {
        alert('Invalid credentials. Please try again.');
      }
    } catch (error) {
      alert('Login failed. Please check your credentials.');
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
            autoComplete="username" // Correct autocomplete for email
          />
          <input
            type="password"
            placeholder="Password (8+ chars, 2 numbers, 1 special)"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="current-password" // Correct autocomplete for password
          />
          <button type="submit" className="btn">Login</button>
        </form>
        <p>Don't have an account? <span onClick={() => navigate('/register')} className="link">Register</span></p>
      </div>
    </div>
  );
};

export default Login;