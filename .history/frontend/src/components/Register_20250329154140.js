// register.js
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
    credit_score: '',
  });
  const [role, setRole] = useState('customer');
  const navigate = useNavigate();

  const capitalize = (str) => str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();

  const handleChange = (e) => {
    let { name, value } = e.target;
    if (name === 'first_name' || name === 'surname') {
      value = capitalize(value);
    } else if (name !== 'email' && name !== 'password') {
      value = value.toLowerCase();
    }
    setFormData({ ...formData, [name]: value });
  };

  const validateNI = (ni) => /^[A-Z]{2}\d{6}[A-Z]$/i.test(ni);
  const validateEmailDomain = (email) => /@([a-zA-Z0-9-]+\.)+[a-zA-Z]{2,}$/.test(email);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validateNI(formData.ni_number)) return alert('Invalid NI Number format.');
    if (!validateEmailDomain(formData.email)) return alert('Invalid email domain.');

    try {
      const response = await axios.post('http://localhost:5000/register', { ...formData, role });
      alert(response.data.message);
      if (response.data.success) navigate('/login');
    } catch (error) {
      alert('Registration failed. Try again.');
    }
  };

  return (
    <div className="container">
      <div className="form-card">
        <h2>Register</h2>
        <form onSubmit={handleSubmit}>
          <input type="text" name="first_name" placeholder="First Name" value={formData.first_name} onChange={handleChange} required />
          <input type="text" name="surname" placeholder="Last Name" value={formData.surname} onChange={handleChange} required />
          <input type="email" name="email" placeholder="Email Address" value={formData.email} onChange={handleChange} required />
          <input type="password" name="password" placeholder="Password" value={formData.password} onChange={handleChange} required />
          <input type="text" name="phone_number" placeholder="Phone Number" value={formData.phone_number} onChange={handleChange} maxLength={15} />
          <input type="text" name="ni_number" placeholder="National Insurance Number" value={formData.ni_number} onChange={handleChange} required />
          <input type="date" name="date_of_birth" placeholder="Date of Birth" value={formData.date_of_birth} onChange={handleChange} required />
          <select name="role" value={role} onChange={(e) => setRole(e.target.value)}>
            <option value="customer">Customer</option>
            <option value="admin">Admin</option>
            <option value="contractor">Contractor</option>
            <option value="data_engineer">Data Engineer</option>
          </select>
          <button type="submit" className="btn">Register</button>
        </form>
      </div>
    </div>
  );
};

export default Register;