import React from 'react';
import { useNavigate } from 'react-router-dom';

const Home = () => {
  const navigate = useNavigate();

  return (
    <div style={{ textAlign: 'center', marginTop: '50px' }}>
      <h1>Welcome to Our Financial App</h1>
      <p>Please choose an option:</p>
      <button onClick={() => navigate('/login')} style={buttonStyle}>Login</button>
      <button onClick={() => navigate('/register')} style={buttonStyle}>Register</button>
    </div>
  );
};

const buttonStyle = {
  margin: '10px',
  padding: '10px 20px',
  fontSize: '16px',
  cursor: 'pointer',
};

export default Home;