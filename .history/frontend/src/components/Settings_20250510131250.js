import React, { useState } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import './Settings.css';
import BackButton from './BackButton';

// defines settings functional component for managing user account settings
const Settings = () => {
  // react-router hook for programmatic navigation
  const navigate = useNavigate();

  // state to track currently active main section
  const [activeSection, setActiveSection] = useState('');
  // state to track currently active sub-section within a main section (e.g., 'email', 'password')
  const [activeSubSection, setActiveSubSection] = useState('');

  // state to manage values of various form input fields for updates
  const [formData, setFormData] = useState({ // initialises form data with empty strings
    email: '',
    phone_number: '',
    credit_score: '',
    bank_account: '',
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });

  // handles changes in any form input field and updates corresponding state
  const handleChange = (e) => {
    const { name, value } = e.target; // destructures 'name' and 'value' from input event
    setFormData({ ...formData, [name]: value }); // updates formdata state
  };

  // retrieves authentication token from local storage
  const getAuthToken = () => {
    const token = localStorage.getItem('token'); // assumes token is stored with key 'token'
    console.log('Auth Token:', token); // debug log
    return token;
  };

  // async function to update a specific user detail field on backend
  const updateDetails = async (field) => {
    const token = getAuthToken(); // get auth token
    if (!token) { // if no token, alert user and redirect to login
      alert('No token found. Please log in again.');
      navigate('/login');
      return;
    }

    try {
      // makes a put request to backend to update specified field
      const response = await axios.put(
        'http://localhost:5000/update-details', // backend endpoint
        { [field]: formData[field] }, // sends field to be updated and its new value
        { headers: { Authorization: `Bearer ${token}` } } // includes auth token
      );
      alert(response.data.message); // displays message from backend
    } catch (error) { // catches errors from api request
      console.error(error); // logs detailed error
      alert('Error updating ' + field); // displays generic error to user
    }
  };

  // async function to handle password update process
  const updatePassword = async () => {
    // checks if new password and confirm password fields match
    if (formData.newPassword !== formData.confirmPassword) {
      alert('New passwords do not match.'); // alerts user if they don't match
      return; // exits function
    }

    const token = getAuthToken(); // get auth token
    if (!token) { // if no token, alert and redirect
      alert('No token found. Please log in again.');
      navigate('/login');
      return;
    }

    try {
      // makes a put request to backend to update password
      const response = await axios.put(
        'http://localhost:5000/update-password', // backend endpoint
        { // data sent to backend
          currentPassword: formData.currentPassword,
          newPassword: formData.newPassword,
        },
        { headers: { Authorization: `Bearer ${token}` } } // includes auth token
      );
      alert(response.data.message); // displays message from backend
    } catch (error) { // catches api request errors
      console.error(error); // logs detailed error
      alert('Error updating password.'); // generic error to user
    }
  };

  // async function to handle account deletion process
  const deleteAccount = async () => {
    const token = getAuthToken(); // get auth token
    if (!token) { // if no token, alert and redirect
      alert('No token found. Please log in again.');
      navigate('/login');
      return;
    }

    // displays a confirmation dialog before proceeding with account deletion
    if (
      window.confirm(
        'Are you sure to delete the account? This action is irreversible.'
      )
    ) { // if user confirms
      try {
        // makes a delete request to backend to delete account
        await axios.delete('http://localhost:5000/delete-account', {
          headers: { Authorization: `Bearer ${token}` }, // includes auth token
        });
        alert('Account deleted successfully.'); // success message
        navigate('/login'); // redirects to login page after deletion
      } catch (error) { // catches api request errors
        console.error(error); // logs detailed error
        alert('Error deleting account.'); // generic error to user
      }
    }
  };

  // handles click on a main settings section button, updating active section
  const handleSectionChange = (section) => {
    setActiveSection(section); // sets clicked section as active
    setActiveSubSection(''); // resets active sub-section when main section changes
  };

  // jsx for rendering settings page ui
  return (
    // main container for settings page
    <div className="settings-container">
      <BackButton /> {/* renders back navigation button */}
      <h1>User Settings</h1> {/* page title */}

      {/* main menu for selecting settings category */}
      <div className="menu">
        <button onClick={() => handleSectionChange('personalDetails')}>
          Change Personal Details
        </button>
        <button onClick={() => handleSectionChange('privacySecurity')}>
          Privacy & Security
        </button>
        {/* button for account deletion, styled as a danger action */}
        <button onClick={deleteAccount} className="danger">
          Delete Account
        </button>
      </div>

      {/* conditionally renders sub-menu for 'personal details' if it's active section */}
      {activeSection === 'personalDetails' && (
        <div className="dropdown">
          <button onClick={() => setActiveSubSection('email')}>
            Update Email
          </button>
          <button onClick={() => setActiveSubSection('phone_number')}>
            Update Phone Number
          </button>
          <button onClick={() => setActiveSubSection('credit_score')}>
            Update Credit Score {/* note: user updating this directly is unusual */}
          </button>
          <button onClick={() => setActiveSubSection('bank_account')}>
            Update Bank Account Details {/* note: handle bank details with extreme care */}
          </button>
        </div>
      )}

      {/* conditionally renders sub-menu for 'privacy & security' if it's active section */}
      {activeSection === 'privacySecurity' && (
        <div className="dropdown">
          <button onClick={() => setActiveSubSection('password')}>
            Change Password
          </button>
          {/* informational message about upcoming features */}
          <p className="info">🔒 2FA and account verification coming soon.</p>
        </div>
      )}

      {/* conditionally renders form section if a sub-section is active */}
      {activeSubSection && (
        <div className="section">
          {/* checks if active sub-section is not 'password' to render general update form */}
          {activeSubSection !== 'password' ? (
            <>
              {/* dynamic heading for specific detail being updated */}
              <h2>Update {activeSubSection.replace('_', ' ')}</h2>
              {/* input field for new detail value */}
              <input
                type={activeSubSection === 'email' ? 'email' : 'text'} // sets input type based on field
                name={activeSubSection} // name matches key in formdata state
                placeholder={`Enter new ${activeSubSection.replace('_', ' ')}`}
                value={formData[activeSubSection]} // controlled input
                onChange={handleChange} // updates state on change
              />
              {/* button to save changes for this specific detail */}
              <button onClick={() => updateDetails(activeSubSection)}>
                Save Changes
              </button>
            </>
          ) : (
            // specific form for changing password
            <>
              <h2>Change Password</h2>
              {/* input for current password */}
              <input
                type="password"
                name="currentPassword"
                placeholder="Current Password"
                value={formData.currentPassword}
                onChange={handleChange}
              />
              {/* input for new password */}
              <input
                type="password"
                name="newPassword"
                placeholder="New Password"
                value={formData.newPassword}
                onChange={handleChange}
              />
              {/* input to confirm new password */}
              <input
                type="password"
                name="confirmPassword"
                placeholder="Confirm New Password"
                value={formData.confirmPassword}
                onChange={handleChange}
              />
              {/* button to submit password update */}
              <button onClick={updatePassword}>Update Password</button>
            </>
          )}
        </div>
      )}
    </div>
  );
};

// exports settings component for use in other parts of application
export default Settings;