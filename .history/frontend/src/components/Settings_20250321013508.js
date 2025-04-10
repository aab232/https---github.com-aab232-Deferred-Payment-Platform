import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import './Settings.css';

const Settings = () => {
  const navigate = useNavigate();

  // Track which section and subsection are active
  const [activeSection, setActiveSection] = useState('');
  const [activeSubSection, setActiveSubSection] = useState('');

  // Store form data for user updates
  const [formData, setFormData] = useState({
    currentEmail: '',
    newEmail: '',
    currentPhone: '',
    newPhone: '',
    currentCreditScore: '',
    newCreditScore: '',
    currentBankAccount: '',
    newBankAccount: '',
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });

  // Handle form input changes
  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData({ ...formData, [name]: value });
  };

  // Universal function to handle detail updates
  const updateDetails = async (field) => {
    const oldValue = formData[`current${field}`];
    const newValue = formData[`new${field}`];

    if (!oldValue || !newValue) {
      alert(`Please enter both current and new ${field.toLowerCase()}.`);
      return;
    }

    if (oldValue === newValue) {
      alert(`New ${field.toLowerCase()} must be different.`);
      return;
    }

    try {
      const response = await axios.put('http://localhost:5000/api/update-settings', {
        field,
        oldValue,
        newValue,
      });
      alert(response.data.message);
    } catch (error) {
      alert(`Error updating ${field.toLowerCase()}: ${error.response?.data?.message || 'Unknown error'}`);
    }
  };

  // Handle password updates
  const updatePassword = async () => {
    if (formData.newPassword !== formData.confirmPassword) {
      alert('New passwords do not match.');
      return;
    }

    try {
      const response = await axios.put('http://localhost:5000/api/update-password', {
        currentPassword: formData.currentPassword,
        newPassword: formData.newPassword,
      });
      alert(response.data.message);
    } catch (error) {
      alert(`Error updating password: ${error.response?.data?.message || 'Unknown error'}`);
    }
  };

  // Delete account
  const deleteAccount = async () => {
    if (window.confirm('Are you sure you want to delete your account? This action is irreversible.')) {
      try {
        await axios.delete('http://localhost:5000/api/delete-account');
        alert('Account deleted successfully.');
        navigate('/login');
      } catch (error) {
        alert(`Error deleting account: ${error.response?.data?.message || 'Unknown error'}`);
      }
    }
  };

  return (
    <div className="settings-container">
      <h1>User Settings</h1>

      <div className="menu">
        <button onClick={() => setActiveSection('personalDetails')}>
          Change Personal Details
        </button>
        <button onClick={() => setActiveSection('privacySecurity')}>
          Privacy & Security
        </button>
        <button onClick={deleteAccount} className="danger">
          Delete Account
        </button>
      </div>

      {/* Personal Details Dropdown */}
      {activeSection === 'personalDetails' && (
        <div className="dropdown">
          {['Email', 'Phone', 'CreditScore', 'BankAccount'].map((item) => (
            <button key={item} onClick={() => setActiveSubSection(item)}>
              Update {item.replace(/([A-Z])/g, ' $1')}
            </button>
          ))}
        </div>
      )}

      {/* Privacy & Security Dropdown */}
      {activeSection === 'privacySecurity' && (
        <div className="dropdown">
          <button onClick={() => setActiveSubSection('Password')}>Change Password</button>
          <p>🔒 2FA coming soon.</p>
        </div>
      )}

      {/* Update Forms */}
      {activeSubSection && (
        <div className="section">
          {activeSubSection === 'Password' ? (
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
          ) : (
            <>
              <h2>Update {activeSubSection.replace(/([A-Z])/g, ' $1')}</h2>
              <input
                type="text"
                name={`current${activeSubSection}`}
                placeholder={`Current ${activeSubSection.replace(/([A-Z])/g, ' $1')}`}
                value={formData[`current${activeSubSection}`]}
                onChange={handleChange}
              />
              <input
                type="text"
                name={`new${activeSubSection}`}
                placeholder={`New ${activeSubSection.replace(/([A-Z])/g, ' $1')}`}
                value={formData[`new${activeSubSection}`]}
                onChange={handleChange}
              />
              <button onClick={() => updateDetails(activeSubSection)}>Save Changes</button>
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default Settings;