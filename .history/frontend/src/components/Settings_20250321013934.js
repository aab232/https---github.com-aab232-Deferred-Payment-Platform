import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import './Settings.css';

const Settings = () => {
  const navigate = useNavigate();
  const [activeSection, setActiveSection] = useState('personalDetails');

  // State for personal details
  const [details, setDetails] = useState({
    email: '',
    phone_number: '',
    credit_score: '',
    bank_account: '',
  });

  // State for password update
  const [passwords, setPasswords] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });

  // Handle input changes
  const handleChange = (e, section) => {
    const { name, value } = e.target;
    if (section === 'details') {
      setDetails({ ...details, [name]: value });
    } else if (section === 'passwords') {
      setPasswords({ ...passwords, [name]: value });
    }
  };

  // Submit updated personal details
  const updatePersonalDetails = async () => {
    try {
      const response = await axios.put('http://localhost:5000/update-details', details);
      alert(response.data.message);
    } catch (error) {
      alert('Error updating details.');
    }
  };

  // Update password
  const updatePassword = async () => {
    if (passwords.newPassword !== passwords.confirmPassword) {
      alert('New passwords do not match.');
      return;
    }
    try {
      const response = await axios.put('http://localhost:5000/update-password', passwords);
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

  return (
    <div className="settings-container">
      <h1>User Settings</h1>
      <div className="menu">
        <button onClick={() => setActiveSection('personalDetails')}>Change Personal Details</button>
        <button onClick={() => setActiveSection('privacySecurity')}>Privacy & Security</button>
        <button onClick={deleteAccount} className="danger">Delete Account</button>
      </div>

      {activeSection === 'personalDetails' && (
        <div className="section">
          <h2>Change Personal Details</h2>
          <input type="email" name="email" placeholder="Update Email" value={details.email} onChange={(e) => handleChange(e, 'details')} />
          <input type="text" name="phone_number" placeholder="Update Phone Number" value={details.phone_number} onChange={(e) => handleChange(e, 'details')} />
          <input type="number" name="credit_score" placeholder="Update Credit Score" value={details.credit_score} onChange={(e) => handleChange(e, 'details')} />
          <input type="text" name="bank_account" placeholder="Update Bank Details" value={details.bank_account_link} onChange={(e) => handleChange(e, 'details')} />
          <button onClick={updatePersonalDetails}>Save Changes</button>
        </div>
      )}

      {activeSection === 'privacySecurity' && (
        <div className="section">
          <h2>Privacy & Security</h2>
          <input type="password" name="currentPassword" placeholder="Current Password" value={passwords.currentPassword} onChange={(e) => handleChange(e, 'passwords')} />
          <input type="password" name="newPassword" placeholder="New Password" value={passwords.newPassword} onChange={(e) => handleChange(e, 'passwords')} />
          <input type="password" name="confirmPassword" placeholder="Confirm New Password" value={passwords.confirmPassword} onChange={(e) => handleChange(e, 'passwords')} />
          <button onClick={updatePassword}>Change Password</button>
          <p className="info">🔒 2FA Setup and account verification coming soon.</p>
        </div>
      )}
    </div>
  );
};

export default Settings;