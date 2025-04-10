import React, { useState } from 'react';
import axios from 'axios';
import './Register.css';

const Register = () => {
    const [formData, setFormData] = useState({
        firstName: '',
        surname: '',
        email: '',
        password: '',
        mobile: '',
        niNumber: '',
        dob: '',
        countryCode: '+44',
    });

    const countries = [
        { code: '+44', name: 'UK' },
        { code: '+1', name: 'USA' },
        { code: '+61', name: 'Australia' },
        { code: '+33', name: 'France' },
        { code: '+49', name: 'Germany' },
    ];

    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData({
            ...formData,
            [name]: value,
        });
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            const response = await axios.post('http://localhost:5000/register', formData);
            alert(response.data.message);
        } catch (error) {
            alert(error.response?.data?.message || 'Registration failed.');
        }
    };

    return (
        <div className="register-container">
            <h2>Register</h2>
            <form onSubmit={handleSubmit}>
                <label>First Name:</label>
                <input type="text" name="firstName" value={formData.firstName} onChange={handleChange} required />

                <label>Surname:</label>
                <input type="text" name="surname" value={formData.surname} onChange={handleChange} required />

                <label>Email:</label>
                <input type="email" name="email" value={formData.email} onChange={handleChange} required />

                <label>Password:</label>
                <input type="password" name="password" value={formData.password} onChange={handleChange} required />

                <label>Phone Number:</label>
                <select name="countryCode" value={formData.countryCode} onChange={handleChange}>
                    {countries.map((c) => (
                        <option key={c.code} value={c.code}>
                            {c.name} ({c.code})
                        </option>
                    ))}
                </select>
                <input
                    type="text"
                    name="mobile"
                    value={formData.mobile}
                    onChange={handleChange}
                    maxLength="15"
                    placeholder="Enter mobile (optional)"
                />

                <label>National Insurance Number:</label>
                <input type="text" name="niNumber" value={formData.niNumber} onChange={handleChange} required />

                <label>Date of Birth:</label>
                <input type="date" name="dob" value={formData.dob} onChange={handleChange} required />

                <button type="submit">Register</button>
            </form>
        </div>
    );
};

export default Register;