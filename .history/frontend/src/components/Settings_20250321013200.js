import React, { useState } from 'react';
import axios from 'axios';
import './Settings.css';

const Settings = () => {
  const [activeSection, setActiveSection] = useState('');
  const [oldEmail, setOldEmail] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [oldPhone, setOldPhone] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [oldCredit, setOldCredit] = useState('');
  const [newCredit, setNewCredit] = useState('');
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Handles form submissions for all updates
  const handleUpdate = async (type, oldValue, newValue) => {
    try {
      const response = await axios.post('http://localhost:5000/update-details', {
        type,
        oldValue,
        newValue,
      });

      if (response.data.success) {
        setSuccess(`${type} updated successfully!`);
        setError('');
      } else {
        throw new Error(response.data.message || 'Update failed.');
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Error updating details.');
      setSuccess('');
    }
  };

  return (
    <div className="settings-container">
      <h2>Settings</h2>

      {error && <div className="error-msg">{error}</div>}
      {success && <div className="success-msg">{success}</div>}

      <div className="settings-menu">
        <button onClick={() => setActiveSection(activeSection === 'personal' ? '' : 'personal')}>
          Change Personal Details
        </button>
        {activeSection === 'personal' && (
          <div className="dropdown">
            {/* Update Email */}
            <div className="input-group">
              <label>Old Email:</label>
              <input type="email" value={oldEmail} onChange={(e) => setOldEmail(e.target.value)} />
              <label>New Email:</label>
              <input type="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} />
              <button onClick={() => handleUpdate('email', oldEmail, newEmail)}>Update Email</button>
            </div>

            {/* Update Phone */}
            <div className="input-group">
              <label>Old Phone:</label>
              <input value={oldPhone} onChange={(e) => setOldPhone(e.target.value)} />
              <label>New Phone:</label>
              <input value={newPhone} onChange={(e) => setNewPhone(e.target.value)} />
              <button onClick={() => handleUpdate('phone_number', oldPhone, newPhone)}>Update Phone</button>
            </div>

            {/* Update Credit Score */}
            <div className="input-group">
              <label>Old Credit Score:</label>
              <input value={oldCredit} onChange={(e) => setOldCredit(e.target.value)} />
              <label>New Credit Score:</label>
              <input value={newCredit} onChange={(e) => setNewCredit(e.target.value)} />
              <button onClick={() => handleUpdate('credit_score', oldCredit, newCredit)}>Update Credit Score</button>
            </div>
          </div>
        )}

        <button onClick={() => setActiveSection(activeSection === 'security' ? '' : 'security')}>
          Privacy & Security
        </button>
        {activeSection === 'security' && (
          <div className="dropdown">
            {/* Update Password */}
            <div className="input-group">
              <label>Old Password:</label>
              <input type="password" value={oldPassword} onChange={(e) => setOldPassword(e.target.value)} />
              <label>New Password:</label>
              <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
              <button onClick={() => handleUpdate('password', oldPassword, newPassword)}>Update Password</button>
            </div>
          </div>
        )}

        <button onClick={() => handleUpdate('delete_account', '', '')}>
          Delete Account
        </button>
      </div>
    </div>
  );
};

export default Settings;