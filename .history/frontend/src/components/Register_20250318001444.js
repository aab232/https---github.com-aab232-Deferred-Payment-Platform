import React, { useState } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import './Form.css';

const Register = () => {
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    password: '',
    phoneNumber: '',
    niNumber: '',
    dob: '',
  });
  const navigate = useNavigate();

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData({ ...formData, [name]: value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    console.log(formData);
    try {
      const response = await axios.post('http://localhost:5000/register', formData);
      alert(response.data.message);
      if (response.data.success) navigate('/login'); // Redirect on successful registration
    } catch (error) {
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
            value={formData.firstName}
            onChange={handleChange}
            required
          />
          <input
            type="text"
            name="surname"
            placeholder="Last Name"
            value={formData.lastName}
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
            value={formData.phoneNumber}
            onChange={handleChange}
            maxLength={15}
          />
          <input
            type="text"
            name="ni_number"
            placeholder="National Insurance Number"
            value={formData.niNumber}
            onChange={handleChange}
            required
          />
          <input
            type="date"
            name="date_of_birth"
            placeholder="Date of Birth"
            value={formData.dob}
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