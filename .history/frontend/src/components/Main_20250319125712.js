import React from 'react';
import { useNavigate } from 'react-router-dom';
import './Main.css';

const Main = () => {
  const navigate = useNavigate();

  return (
    <div className="main-container">
      <nav className="taskbar">
        <button onClick={() => navigate('/dashboard')}>My Dashboard</button>
        <button onClick={() => navigate('/settings')}>Settings</button>
        <button onClick={() => navigate('/education')}>Education Centre</button>
        <button onClick={() => navigate('/privacy')}>Data Privacy</button>
      </nav>
      <div className="content">
        <h1>Welcome Back!</h1>
        <p>Manage your finances with ease.</p>
      </div>
    </div>
  );
};

export default Main;