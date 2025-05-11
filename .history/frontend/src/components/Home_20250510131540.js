import React from 'react';
import { useNavigate } from 'react-router-dom';
import './Home.css';

// defines the home functional component, which serves as the landing page
const Home = () => {
  // initialises the usenavigate hook to get the navigate function
  const navigate = useNavigate();

  // jsx for rendering the home page ui
  return (
    // main container for the page, likely providing overall layout and background
    <div className="container">
      {/* a styled card element to hold the primary content of the home page */}
      <div className="card">
        <h1>First time here?</h1> {/* main heading/welcome message */}
        <p>Your growth journey to smarter finances starts here!</p> {/* introductory paragraph */}
        {/* a group container for the action buttons */}
        <div className="button-group">
          {/* button to navigate to the login page */}
          <button onClick={() => navigate('/login')} className="btn">Login</button>
          {/* button to navigate to the registration page */}
          <button onClick={() => navigate('/register')} className="btn">Register</button>
        </div>
      </div>
    </div>
  );
};

// exports the home component to make it available for use in other parts of the application
export default Home;