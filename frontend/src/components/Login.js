import React, { useState } from "react";
import axios from "axios";
import "./Login.css"; // Import the CSS for Login page

const Login = () => {
    const [formData, setFormData] = useState({
        email: "",
        password: "",
    });

    const handleChange = (e) => {
        setFormData({ ...formData, [e.target.name]: e.target.value });
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            const response = await axios.post("http://localhost:5000/login", formData);
            alert(response.data.message);
        } catch (error) {
            alert(error.response?.data.message || "Login failed.");
        }
    };

    return (
        <div className="container">
            <h2>Login</h2>
            <form onSubmit={handleSubmit}>
                {Object.keys(formData).map((field) => (
                    <input
                        key={field}
                        type={field === "password" ? "password" : "text"}
                        name={field}
                        placeholder={field}
                        value={formData[field]}
                        onChange={handleChange}
                        required
                    />
                ))}
                <button type="submit">Login</button>
            </form>
        </div>
    );
};

export default Login;