import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import './Settings.css';
import BackButton from './BackButton'; // Import the BackButton component

const Settings = () => {
  const navigate = useNavigate();

  // Active Section & Subsection Management
  const [activeSection, setActiveSection] = useState('');
  const [activeSubSection, setActiveSubSection] = useState('');

  // Form State Management
  const [formData, setFormData] = useState({
    email: '',
    phone_number: '',
    credit_score: '',
    bank_account: '',
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });

  // Handle Input Changes
  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData({ ...formData, [name]: value });
  };

  // Update Personal Details
  const updateDetails = async (field) => {
    try {
      const response = await axios.put('http://localhost:5000/update-details', {
        [field]: formData[field],
      });
      alert(response.data.message);
    } catch (error) {
      alert('Error updating ' + field);
    }
  };

  // Update Password
  const updatePassword = async () => {
    if (formData.newPassword !== formData.confirmPassword) {
      alert('New passwords do not match.');
      return;
    }
    try {
      const response = await axios.put('http://localhost:5000/update-password', {
        currentPassword: formData.currentPassword,
        newPassword: formData.newPassword,
      });
      alert(response.data.message);
    } catch (error) {
      alert('Error updating password.');
    }
  };

  // Delete Account
  const deleteAccount = async () => {
    if (window.confirm('Are you sure you want to delete your account? This action is irreversible.')) {
      try {
        await axios.delete('http://localhost:5000/delete-account');
        alert('Account deleted successfully.');
        navigate('/login');
      } catch (error) {
        alert('Error deleting account.');
      }
    }
  };

  // Reset active subsection if switching to another section
  const handleSectionChange = (section) => {
    setActiveSection(section);
    setActiveSubSection(''); // Reset the active subsection when switching sections
  };

  return (
    <div className="settings-container">
      <BackButton /> {/* Add the Back button here */}
      <h1>User Settings</h1>

      <div className="menu">
        <button onClick={() => handleSectionChange('personalDetails')}>
          Change Personal Details
        </button>
        <button onClick={() => handleSectionChange('privacySecurity')}>
          Privacy & Security
        </button>
        <button onClick={deleteAccount} className="danger">
          Delete Account
        </button>
      </div>

      {/* Change Personal Details Section */}
      {activeSection === 'personalDetails' && (
        <div className="dropdown">
          <button onClick={() => setActiveSubSection('email')}>Update Email</button>
          <button onClick={() => setActiveSubSection('phone_number')}>Update Phone Number</button>
          <button onClick={() => setActiveSubSection('credit_score')}>Update Credit Score</button>
          <button onClick={() => setActiveSubSection('bank_account')}>Update Bank Account Details</button>
        </div>
      )}

      {activeSection === 'privacySecurity' && (
        <div className="dropdown">
          <button onClick={() => setActiveSubSection('password')}>Change Password</button>
          <p className="info">🔒 2FA and account verification coming soon.</p>
        </div>
      )}

      {/* Input Forms (Display Based on Active Subsection) */}
      {activeSubSection && (
        <div className="section">
          {activeSubSection !== 'password' ? (
            <>
              <h2>Update {activeSubSection.replace('_', ' ')}</h2>
              <input
                type={activeSubSection === 'email' ? 'email' : 'text'}
                name={activeSubSection}
                placeholder={`Enter new ${activeSubSection.replace('_', ' ')}`}
                value={formData[activeSubSection]}
                onChange={handleChange}
              />
              <button onClick={() => updateDetails(activeSubSection)}>
                Save Changes
              </button>
            </>
          ) : (
            <>
              <h2>Change Password</h2>
              <input
                type="password"
                name="currentPassword"
                placeholder="Current Password"
                value={formData.currentPassword}
                onChange={handleChange}
              />
              <input
                type="password"
                name="newPassword"
                placeholder="New Password"
                value={formData.newPassword}
                onChange={handleChange}
              />
              <input
                type="password"
                name="confirmPassword"
                placeholder="Confirm New Password"
                value={formData.confirmPassword}
                onChange={handleChange}
              />
              <button onClick={updatePassword}>Update Password</button>
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default Settings;