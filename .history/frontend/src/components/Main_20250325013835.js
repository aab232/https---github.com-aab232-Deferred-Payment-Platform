import React from 'react';
import { useNavigate } from 'react-router-dom';
import './Main.css';

const Main = () => {
  const navigate = useNavigate();

  const handleLogout = () => {
    navigate('/login'); // Redirect to login page
  };

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
    </div>
  );
};

export default Main;