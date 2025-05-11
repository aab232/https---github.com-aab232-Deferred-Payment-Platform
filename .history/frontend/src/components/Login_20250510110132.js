import React, { useState } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import './Form.css';

// login functional component
const Login = () => {
  // state for email input field
  const [email, setEmail] = useState('');
  // state for password input field
  const [password, setPassword] = useState('');
  // state for displaying login error messages to user
  const [error, setError] = useState('');
  // state to indicate if login request is currently processing
  const [loading, setLoading] = useState(false);
  // initialises navigate function from react-router
  const navigate = useNavigate();

  // handles form submission when user attempts to log in
  const handleSubmit = async (e) => {
    e.preventDefault(); // prevents default browser form submission (page reload)
    setError(''); // clears any previous error messages
    setLoading(true); // sets loading state to true to indicate processing

    try {
      // defines base url for api, using environment variable or defaulting to localhost:5000
      const apiUrl = process.env.REACT_APP_API_BASE_URL || 'http://localhost:5000';
      // makes a post request to login endpoint with email and password using axios
      const response = await axios.post(`${apiUrl}/login`, { email, password });

      // checks if login was successful and a token was received from backend
      if (response.data.success && response.data.token) {
        console.log('Login successful, received token:', response.data.token); // debug log
        // stores the authentication token in local storage
        localStorage.setItem('authToken', response.data.token);
        console.log('Token stored in localStorage.'); // debug log
        // navigates user to main page upon successful login and token storage
        navigate('/main');
      } else {
        // handles cases where backend reports success but no token is provided
        console.error('Login success reported, but no token received.', response.data); // debug log
        setError(response.data.message || 'Login failed: Invalid server response.'); // sets an error message
      }
    } catch (error) { // catches errors from api request
        console.error('Login Axios Error:', error); // debug log for entire error object
        if (error.response) { // if error has a response (server responds with an error status)
            console.error('Error data:', error.response.data); // debug log for server error data
            console.error('Error status:', error.response.status); // debug log for server error status
            // sets error message using message from server response or a generic one with status
            setError(error.response.data.message || `Login failed (${error.response.status})`);
        } else if (error.request) { // if request was made but no response was received (network error)
             console.error('Error request:', error.request); // debug log for request object
             setError('Login failed: Could not connect to server. Please try again later.'); // sets a network error message
        } else { // for other errors that occurred setting up request
            console.error('Error message:', error.message); // debug log for error message
            setError(`Login failed: ${error.message}`); // sets error message using caught error's message
        }
    } finally {
         setLoading(false); // resets loading state regardless of login success or failure
    }
  };

  // jsx for rendering login page ui
  return (
    // main container for page, likely provides overall layout and background
    <div className="container">
      {/* styled card for login form */}
      <div className="form-card">
        <h2>Login</h2> {/* page title */}
        {/* login form element with submit handler */}
        <form onSubmit={handleSubmit}>
          {/* email input field */}
          <input
            type="email" // html5 input type for email validation
            placeholder="Email Address" // placeholder text
            value={email} // binds input value to email state
            onChange={(e) => setEmail(e.target.value)} // updates email state on change
            required // html5 attribute making field mandatory
            disabled={loading} // disables input field while login request is loading
          />
          {/* password input field */}
          <input
            type="password" // html5 input type for password (masks input)
            placeholder="Password" // placeholder text
            value={password} // binds input value to password state
            onChange={(e) => setPassword(e.target.value)} // updates password state on change
            required // mandatory field
            disabled={loading} // disables input while loading
          />
          {/* displays login error message if 'error' state is set */}
          {error && <p className="error-message">{error}</p>}
          {/* submit button for login form */}
          <button type="submit" className="btn" disabled={loading}>
              {/* dynamic button text based on loading state */}
              {loading ? 'Logging in...' : 'Login'}
          </button>
        </form>
        {/* paragraph with a link to registration page */}
        <p>Don't have an account? <span onClick={() => navigate('/register')} className="link">Register</span></p>
      </div>
    </div>
  );
};

// exports login component for use in other parts of application
export default Login;