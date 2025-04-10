// Dashboard.js
import React from 'react';
import BackButton from './BackButton'; // Import the BackButton component
import './Dashboard.css';

const Dashboard = () => {
  return (
    <div className="dashboard-container">
      <BackButton /> {/* Add the Back button here */}
      <h1>My Dashboard</h1>
      <p>Manage your account and view your data here.</p>
    </div>
  );
};

export default Dashboard;