import React, { useState } from "react";
import axios from "axios";
import { PatternFormat } from "react-number-format";  // Use PatternFormat instead
import "./Register.css";

const Register = () => {
    const [formData, setFormData] = useState({
        firstName: "",
        surname: "",
        email: "",
        password: "",
        mobileNumber: "",
        niNumber: "",
        date_of_birth: "",
        credit_score: "",
    });

    const handleChange = (e) => {
        // Handle normal inputs
        if (e.target.name !== "date_of_birth") {
            setFormData({ ...formData, [e.target.name]: e.target.value });
        }
    };

    const handleDateChange = (values) => {
        // Correctly update the state with formattedValue
        setFormData({ ...formData, date_of_birth: values.formattedValue });
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            const response = await axios.post("http://localhost:5000/register", formData);
            alert(response.data.message);
        } catch (error) {
            alert(error.response?.data.message || "Registration failed.");
        }
    };

    return (
        <div className="form-container">
            <h2>Register</h2>
            <form onSubmit={handleSubmit}>
                <input
                    type="text"
                    name="firstName"
                    placeholder="First Name"
                    value={formData.firstName}
                    onChange={handleChange}
                    required
                />
                <input
                    type="text"
                    name="surname"
                    placeholder="Surname"
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
                    placeholder="Password (at least 8 characters)"
                    value={formData.password}
                    onChange={handleChange}
                    required
                />
                <input
                    type="text"
                    name="mobileNumber"
                    placeholder="Mobile Number"
                    value={formData.mobileNumber}
                    onChange={handleChange}
                    required
                />
                <input
                    type="text"
                    name="niNumber"
                    placeholder="National Insurance Number"
                    value={formData.niNumber}
                    onChange={handleChange}
                    required
                />
                {/* Use PatternFormat instead of NumericFormat for date */}
                <PatternFormat
                    format="##/##/####"   // Define the pattern for DD/MM/YYYY
                    mask="_"
                    name="date_of_birth"
                    placeholder="Date of Birth (DD/MM/YYYY)"
                    value={formData.date_of_birth}
                    onValueChange={handleDateChange}
                    required
                />
                <input
                    type="text"
                    name="credit_score"
                    placeholder="Credit Score (optional)"
                    value={formData.credit_score}
                    onChange={handleChange}
                />
                <button type="submit">Register</button>
            </form>
        </div>
    );
};

export default Register;