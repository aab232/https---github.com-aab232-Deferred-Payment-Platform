import React from 'react';
import { useNavigate } from 'react-router-dom';
import './Home.css';

const Home = () => {
  const navigate = useNavigate();

  return (
    <div className="container">
      <div className="card">
        <h1>Welcome to Our Financial App</h1>
        <p>Your journey to smarter finances starts here!</p>
        <div className="button-group">
          <button onClick={() => navigate('/login')} className="btn">Login</button>
          <button onClick={() => navigate('/register')} className="btn">Register</button>
        </div>
      </div>
    </div>
  );
};

export default Home;