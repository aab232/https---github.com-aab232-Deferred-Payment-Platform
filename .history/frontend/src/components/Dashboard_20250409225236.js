import React from 'react';
import { useNavigate } from 'react-router-dom';
import './Dashboard.css'; // Import the specific CSS for this component

// Define the dashboard sections with their titles and target routes
const dashboardSections = [
  {
    title: 'Get Your Credit Assessment',
    path: '/credit-assessment', // Example route - Define these in your Router
    icon: '📊', // Optional: Add icons later if desired
  },
  {
    title: 'My Credit Report',
    path: '/credit-report',
    icon: '📄',
  },
  {
    title: 'Make Repayments',
    path: '/repayments',
    icon: '💳',
  },
  {
    title: 'Set Spending Limit',
    path: '/spending-limit',
    icon: '⚙️',
  },
  {
    title: 'Buffer Bag', // Assuming this is a feature name
    path: '/buffer-bag',
    icon: '🛍️',
  },
  {
    title: 'Link & Manage Platforms',
    path: '/linked-platforms',
    icon: '🔗',
  },
];

const Dashboard = () => {
  const navigate = useNavigate();

  const handleNavigate = (path) => {
    navigate(path);
  };

  return (
    <div className="dashboard-container"> {/* Specific container */}
      <div className="dashboard-card"> {/* Card holding the content */}
        <h2 className="dashboard-heading">Your Dashboard</h2>
        <p className="dashboard-welcome">Welcome back! Manage your account below.</p>

        <div className="dashboard-grid"> {/* Grid layout for sections */}
          {dashboardSections.map((section) => (
            <div
              key={section.path}
              className="dashboard-item" // Style for each clickable section
              onClick={() => handleNavigate(section.path)}
              role="button" // Indicate it's interactive
              tabIndex={0} // Make it focusable
              onKeyPress={(e) => e.key === 'Enter' && handleNavigate(section.path)} // Basic keyboard nav
            >
               {/* Optional Icon placeholder */}
               {/* <span className="dashboard-item-icon">{section.icon}</span> */}
              <h3 className="dashboard-item-title">{section.title}</h3>
            </div>
          ))}
        </div>
         {/* Optional: Add a logout or settings button if needed */}
         {/* <button className="btn dashboard-logout-btn">Logout</button> */}
      </div>
    </div>
  );
};

export default Dashboard;