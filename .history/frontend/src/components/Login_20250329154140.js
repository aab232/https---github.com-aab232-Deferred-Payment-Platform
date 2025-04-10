// login.js
import React, { useState } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import './Form.css';

const Login = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const response = await axios.post('http://localhost:5000/login', { email, password });
      if (response.data.success) {
        const { role } = response.data.user;
        localStorage.setItem('userRole', role);
        switch (role) {
          case 'admin': navigate('/admin-dashboard'); break;
          case 'contractor': navigate('/contractor-dashboard'); break;
          case 'data_engineer': navigate('/data-engineer-dashboard'); break;
          default: navigate('/main');
        }
      } else {
        alert('Invalid credentials.');
      }
    } catch (error) {
      alert('Login failed. Check credentials.');
    }
  };

  return (
    <div className="container">
      <div className="form-card">
        <h2>Login</h2>
        <form onSubmit={handleSubmit}>
          <input type="email" placeholder="Email Address" value={email} onChange={(e) => setEmail(e.target.value)} required />
          <input type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          <button type="submit" className="btn">Login</button>
        </form>
      </div>
    </div>
  );
};

export default Login;