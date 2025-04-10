import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import './Settings.css';
import BackButton from './BackButton';

const Settings = () => {
  const navigate = useNavigate();

  const [activeSection, setActiveSection] = useState('');
  const [activeSubSection, setActiveSubSection] = useState('');

  const [formData, setFormData] = useState({
    email: '',
    phone_number: '',
    credit_score: '',
    bank_account: '',
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });

  useEffect(() => {
    // Check if token exists in localStorage
    const token = localStorage.getItem('token');
    if (!token) {
      alert('No token found. Please log in again.');
      navigate('/login');
    }
  }, [navigate]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData({ ...formData, [name]: value });
  };

  const getAuthToken = () => localStorage.getItem('token');

  const updateDetails = async (field) => {
    const token = getAuthToken();
    if (!token) {
      alert('No token found. Please log in again.');
      navigate('/login');
      return;
    }

    try {
      const response = await axios.put(
        'http://localhost:5000/update-details',
        { [field]: formData[field] },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      alert(response.data.message);
    } catch (error) {
      alert(`Error updating ${field}: ${error.response ? error.response.data.message : error.message}`);
    }
  };

  const updatePassword = async () => {
    if (formData.newPassword !== formData.confirmPassword) {
      alert('New passwords do not match.');
      return;
    }

    const token = getAuthToken();
    if (!token) {
      alert('No token found. Please log in again.');
      navigate('/login');
      return;
    }

    try {
      const response = await axios.put(
        'http://localhost:5000/update-password',
        {
          currentPassword: formData.currentPassword,
          newPassword: formData.newPassword,
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      alert(response.data.message);
    } catch (error) {
      alert('Error updating password: ' + (error.response ? error.response.data.message : error.message));
    }
  };

  const deleteAccount = async () => {
    const token = getAuthToken();
    if (!token) {
      alert('No token found. Please log in again.');
      navigate('/login');
      return;
    }

    if (
      window.confirm(
        'Are you sure you want to delete your account? This action is irreversible.'
      )
    ) {
      try {
        await axios.delete('http://localhost:5000/delete-account', {
          headers: { Authorization: `Bearer ${token}` },
        });
        alert('Account deleted successfully.');
        navigate('/login');
      } catch (error) {
        alert('Error deleting account: ' + (error.response ? error.response.data.message : error.message));
      }
    }
  };

  const handleSectionChange = (section) => {
    setActiveSection(section);
    setActiveSubSection('');
  };

  return (
    <div className="settings-container">
      <BackButton />
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

      {activeSection === 'personalDetails' && (
        <div className="dropdown">
          <button onClick={() => setActiveSubSection('email')}>
            Update Email
          </button>
          <button onClick={() => setActiveSubSection('phone_number')}>
            Update Phone Number
          </button>
          <button onClick={() => setActiveSubSection('credit_score')}>
            Update Credit Score
          </button>
          <button onClick={() => setActiveSubSection('bank_account')}>
            Update Bank Account Details
          </button>
        </div>
      )}

      {activeSection === 'privacySecurity' && (
        <div className="dropdown">
          <button onClick={() => setActiveSubSection('password')}>
            Change Password
          </button>
          <p className="info">🔒 2FA and account verification coming soon.</p>
        </div>
      )}

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