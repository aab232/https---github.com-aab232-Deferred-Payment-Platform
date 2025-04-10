import React, { useState } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import bcrypt from 'bcryptjs'; // Import bcrypt
import './Form.css';

const Register = () => {
  const [formData, setFormData] = useState({
    first_name: '',
    surname: '',
    email: '',
    password: '',
    phone_number: '',
    ni_number: '',
    date_of_birth: '',
    credit_score: '', // New field for credit score
  });

  const navigate = useNavigate();

  // Function to format the date to YYYY-MM-DD
  const formatDateForBackend = (date) => {
    const [day, month, year] = date.split('-'); // Split 'DD-MM-YYYY'
    return `${year}-${month}-${day}`; // Convert to 'YYYY-MM-DD'
  };

  // Capitalize the first letter of first_name and surname
  const capitalize = (str) => str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();

  // Handle input change
  const handleChange = (e) => {
    const { name, value } = e.target;

    // Capitalize first_name and surname when user types
    const updatedValue = (name === 'first_name' || name === 'surname') ? capitalize(value) : value;

    setFormData({ ...formData, [name]: updatedValue });
  };

  // Handle form submission
  const handleSubmit = async (e) => {
    e.preventDefault();

    try {
      // Format the date before sending it to the backend
      const formattedDate = formatDateForBackend(formData.date_of_birth);

      // Hash the password
      const hashedPassword = await bcrypt.hash(formData.password, 10);

      // Create an object to send to the backend
      const dataToSend = {
        ...formData,
        date_of_birth: formattedDate,
        password: hashedPassword, // Send the hashed password
      };

      // Remove the credit score field if it's empty (optional field)
      if (dataToSend.credit_score === '') {
        delete dataToSend.credit_score;
      }

      const response = await axios.post('http://localhost:5000/register', dataToSend);
      alert(response.data.message);
      if (response.data.success) navigate('/login'); // Redirect on successful registration
    } catch (error) {
      console.error('Registration error:', error);
      alert('Registration failed. Please try again.');
    }
  };

  return (
    <div className="container">
      <div className="form-card">
        <h2>Register</h2>
        <form onSubmit={handleSubmit}>
          <input
            type="text"
            name="first_name"
            placeholder="First Name"
            value={formData.first_name}
            onChange={handleChange}
            required
          />
          <input
            type="text"
            name="surname"
            placeholder="Last Name"
            value={formData.surname}
            onChange={handleChange}
            required
          />
          <input
            type="email"
            name="email"
            placeholder="Email Address"
            value={formData.email}
            onChange={handleChange}
            required
          />
          <input
            type="password"
            name="password"
            placeholder="Password (8+ chars, 2 numbers, 1 special)"
            value={formData.password}
            onChange={handleChange}
            required
          />
          <input
            type="text"
            name="phone_number"
            placeholder="Phone Number (Optional)"
            value={formData.phone_number}
            onChange={handleChange}
            maxLength={15}
          />
          <input
            type="date"
            name="date_of_birth"
            placeholder="Date of Birth"
            value={formData.date_of_birth}
            onChange={handleChange}
            required
          />
          <input
            type="text"
            name="ni_number"
            placeholder="National Insurance Number"
            value={formData.ni_number}
            onChange={handleChange}
            required
          />
          <input
            type="number"
            name="credit_score"
            placeholder="Credit Score (Optional)"
            value={formData.credit_score}
            onChange={handleChange}
            min="300"
            max="999"
          />
          <button type="submit" className="btn">Register</button>
        </form>
        <p>Already have an account? <span onClick={() => navigate('/login')} className="link">Login</span></p>
      </div>
    </div>
  );
};

export default Register;