import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import './Settings.css';

const Settings = () => {
  const navigate = useNavigate();

  // State management
  const [activeSection, setActiveSection] = useState('');
  const [activeSubSection, setActiveSubSection] = useState('');
  const [formData, setFormData] = useState({
    email: '',
    oldEmail: '',
    phone_number: '',
    oldPhoneNumber: '',
    credit_score: '',
    oldCreditScore: '',
    bank_account_link: '',
    oldBankAccountLink: '',
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
  const updateDetails = async (field, oldField) => {
    try {
      // Ensure old and new values are provided
      if (!formData[field] || !formData[oldField]) {
        alert(`Please provide both current and new ${field.replace('_', ' ')}`);
        return;
      }

      // Ensure the new value is different from the old value
      if (formData[field] === formData[oldField]) {
        alert(`New ${field.replace('_', ' ')} must be different.`);
        return;
      }

      // Send request to backend
      const response = await axios.put('http://localhost:5000/update-details', {
        oldValue: formData[oldField],
        newValue: formData[field],
        field,
      });

      alert(response.data.message);
    } catch (error) {
      alert(`Error updating ${field.replace('_', ' ')}: ${error.response?.data?.message || error.message}`);
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
      alert(`Error updating password: ${error.response?.data?.message || error.message}`);
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
        alert(`Error deleting account: ${error.response?.data?.message || error.message}`);
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

      {/* Change Personal Details Section */}
      {activeSection === 'personalDetails' && (
        <div className="dropdown">
          <button onClick={() => setActiveSubSection('email')}>Update Email</button>
          <button onClick={() => setActiveSubSection('phone_number')}>Update Phone Number</button>
          <button onClick={() => setActiveSubSection('credit_score')}>Update Credit Score</button>
          <button onClick={() => setActiveSubSection('bank_account_link')}>Update Bank Account Link</button>
        </div>
      )}

      {/* Privacy & Security Section */}
      {activeSection === 'privacySecurity' && (
        <div className="dropdown">
          <button onClick={() => setActiveSubSection('password')}>Change Password</button>
          <p className="info">🔒 2FA and account verification coming soon.</p>
        </div>
      )}

      {/* Input Forms */}
      {activeSubSection && (
        <div className="section">
          {activeSubSection !== 'password' ? (
            <>
              <h2>Update {activeSubSection.replace('_', ' ')}</h2>
              <input
                type="text"
                name={`old${activeSubSection.charAt(0).toUpperCase() + activeSubSection.slice(1)}`}
                placeholder={`Enter current ${activeSubSection.replace('_', ' ')}`}
                value={formData[`old${activeSubSection.charAt(0).toUpperCase() + activeSubSection.slice(1)}`]}
                onChange={handleChange}
              />
              <input
                type={activeSubSection === 'email' ? 'email' : 'text'}
                name={activeSubSection}
                placeholder={`Enter new ${activeSubSection.replace('_', ' ')}`}
                value={formData[activeSubSection]}
                onChange={handleChange}
              />
              <button onClick={() => updateDetails(activeSubSection, `old${activeSubSection.charAt(0).toUpperCase() + activeSubSection.slice(1)}`)}>
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