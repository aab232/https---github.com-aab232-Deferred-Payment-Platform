import React, { useState } from "react";
import axios from "axios";
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
    });

    const handleChange = (e) => {
        setFormData({ ...formData, [e.target.name]: e.target.value });
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
                {Object.keys(formData).map((field) => (
                    <input
                        key={field}
                        type={field === "password" ? "password" : "text"}
                        name={field}
                        placeholder={field}
                        value={formData[field]}
                        onChange={handleChange}
                        required={field !== "phoneNumber"}
                    />
                ))}
                <button type="submit">Register</button>
            </form>
        </div>
    );
};

export default Register;