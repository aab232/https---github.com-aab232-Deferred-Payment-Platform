import React, { useState } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
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
  });

  const navigate = useNavigate();

  // Function to format the date to YYYY-MM-DD
  const formatDateForBackend = (date) => {
    const [day, month, year] = date.split('-'); // Split 'DD-MM-YYYY'
    return `${year}-${month}-${day}`; // Convert to 'YYYY-MM-DD'
  };

  // Handle input change
  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData({ ...formData, [name]: value });
  };

  // Handle form submission
  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      // Format the date before sending it to the backend
      const formattedDate = formatDateForBackend(formData.date_of_birth);
      
      const response = await axios.post('http://localhost:5000/register', { ...formData, date_of_birth: formattedDate });
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
            name="first_name" // ✅ Match the state key exactly
            placeholder="First Name"
            value={formData.first_name}
            onChange={handleChange}
            required
          />
          <input
            type="text"
            name="surname" // ✅ Match the state key exactly
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
            name="phone_number" // ✅ Match the state key exactly
            placeholder="Phone Number (Optional)"
            value={formData.phone_number}
            onChange={handleChange}
            maxLength={15}
          />
          <input
            type="text"
            name="ni_number" // ✅ Match the state key exactly
            placeholder="National Insurance Number"
            value={formData.ni_number}
            onChange={handleChange}
            required
          />
          <input
            type="date"
            name="date_of_birth" // ✅ Match the state key exactly
            placeholder="Date of Birth"
            value={formData.date_of_birth}
            onChange={handleChange}
            required
          />
          <button type="submit" className="btn">Register</button>
        </form>
        <p>Already have an account? <span onClick={() => navigate('/login')} className="link">Login</span></p>
      </div>
    </div>
  );
};

export default Register;