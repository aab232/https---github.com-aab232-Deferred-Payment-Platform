import React, { useState } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import './Form.css';

// defines the register functional component for user registration
const Register = () => {
  // state to manage all form input fields and their values
  const [formData, setFormData] = useState({ // initialises form data with empty strings
    first_name: '',
    surname: '',
    email: '',
    password: '',
    phone_number: '', // optional field
    ni_number: '',
    date_of_birth: '',
    credit_score: '', // new field for credit score, optional
  });

  // initialises navigate function from react-router for redirection
  const navigate = useNavigate();

  // function to format date string from 'dd-mm-yyyy' to 'yyyy-mm-dd' for backend
  const formatDateForBackend = (date) => {
    // assumes input format might be 'dd-mm-yyyy'
    if (date.includes('-') && date.length === 10 && date.split('-').length === 3) {
        // if it's already yyyy-mm-dd or another format that needs splitting based on '-'
        const parts = date.split('-');
        if (parts[0].length === 4) return date; // assumes yyyy-mm-dd
        if (parts[2].length === 4) return `${parts[2]}-${parts[1]}-${parts[0]}`; // assumes dd-mm-yyyy
    }
    return date; // return as is if not matching expected formats to be split
  };

  // utility function to capitalise first letter of a string and lowercase rest
  const capitalize = (str) => str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();

  // handles changes in any of form input fields
  const handleChange = (e) => {
    const { name, value } = e.target; // destructures 'name' and 'value' from input event

    // capitalises first_name and surname as user types
    const updatedValue = (name === 'first_name' || name === 'surname') ? capitalize(value) : value;

    // updates formdata state using previous state, dynamically updating changed field
    setFormData({ ...formData, [name]: updatedValue });
  };

  // handles submission of registration form
  const handleSubmit = async (e) => {
    e.preventDefault(); // prevents default browser form submission (page reload)

    try {
      // formats date of birth to 'yyyy-mm-dd' before sending to backend
      const formattedDate = formatDateForBackend(formData.date_of_birth);

      // creates an object with data to be sent to backend, including formatted date
      const dataToSend = {
        ...formData, // spreads all current form data
        date_of_birth: formattedDate, // overrides with formatted date
      };

      // removes credit score field from data to send if it's empty, as it's optional
      if (dataToSend.credit_score === '') {
        delete dataToSend.credit_score;
      }

      // makes a post request to register endpoint using axios
      const response = await axios.post('http://localhost:5000/register', dataToSend);
      alert(response.data.message); // displays success message from backend
      if (response.data.success) navigate('/login'); // redirects to login page on successful registration
    } catch (error) { // catches errors from api request
      console.error('Registration error:', error); // logs detailed error to console
      // displays a generic error message to user, could be improved to show backend error message if available
      alert('Registration failed. Please try again.');
    }
  };

  // jsx for rendering registration page ui
  return (
    // main container for page
    <div className="container">
      {/* styled card for registration form */}
      <div className="form-card">
        <h2>Register</h2> {/* page title */}
        {/* registration form element with submit handler */}
        <form onSubmit={handleSubmit}>
          {/* input field for first name */}
          <input
            type="text"
            name="first_name" // name attribute matches key in formdata state
            placeholder="First Name" // placeholder text
            value={formData.first_name} // controlled input, value from state
            onChange={handleChange} // updates state on change
            required // html5 validation: field is mandatory
          />
          {/* input field for surname */}
          <input
            type="text"
            name="surname"
            placeholder="Last Name"
            value={formData.surname}
            onChange={handleChange}
            required
          />
          {/* input field for email address */}
          <input
            type="email" // html5 input type for email validation
            name="email"
            placeholder="Email Address"
            value={formData.email}
            onChange={handleChange}
            required
          />
          {/* input field for password */}
          <input
            type="password" // html5 input type for password (masks input)
            name="password"
            placeholder="Password (8+ chars, 2 numbers, 1 special)" // includes hint for password criteria
            value={formData.password}
            onChange={handleChange}
            required
          />
          {/* input field for phone number (optional) */}
          <input
            type="text" // using text to allow various formats, backend validation might be needed
            name="phone_number"
            placeholder="Phone Number (Optional)"
            value={formData.phone_number}
            onChange={handleChange}
            maxLength={15} // basic length constraint
          />
          {/* input field for date of birth */}
          <input
            type="date" // html5 input type for date selection
            name="date_of_birth"
            placeholder="Date of Birth"
            value={formData.date_of_birth} // value should be in 'yyyy-mm-dd' format for date input
            onChange={handleChange}
            required
          />
          {/* input field for national insurance number */}
          <input
            type="text"
            name="ni_number"
            placeholder="National Insurance Number"
            value={formData.ni_number}
            onChange={handleChange}
            required // assumes this is a required field
          />
          {/* input field for credit score (optional) */}
          <input
            type="number" // input type for numbers
            name="credit_score"
            placeholder="Credit Score (Optional)"
            value={formData.credit_score}
            onChange={handleChange}
            min="300" // html5 validation: minimum value
            max="999" // html5 validation: maximum value (typical credit score range)
          />
          {/* submit button for registration form */}
          <button type="submit" className="btn">Register</button>
        </form>
        {/* paragraph with a link to login page for users who already have an account */}
        <p>Already have an account? <span onClick={() => navigate('/login')} className="link">Login</span></p>
      </div>
    </div>
  );
};

// exports register component for use in other parts of application
export default Register;