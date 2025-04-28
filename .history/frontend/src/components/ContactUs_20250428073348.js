import React, { useState } from 'react';
import './ContactUs.css';
import BackButton from './BackButton';

const ContactUs = () => {
  // State to manage form inputs
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    subject: '',
    message: '',
  });
  const [isSubmitted, setIsSubmitted] = useState(false); // State to show confirmation

  // Handle input changes
  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prevState => ({
      ...prevState,
      [name]: value,
    }));
  };

  // Handle form submission
  const handleSubmit = (e) => {
    e.preventDefault(); // Prevent default browser submission
    // In a real application, you would send formData to your backend API here
    console.log("Form Data Submitted:", formData);

    // Show a confirmation message and clear the form (optional)
    setIsSubmitted(true);
    setFormData({ name: '', email: '', subject: '', message: '' });

    // Hide confirmation after a few seconds (optional)
    setTimeout(() => setIsSubmitted(false), 5000);
  };

  return (
    <div className="container"> {/* Uses the gradient background and centering */}
      <BackButton />
      <div className="form-card"> {/* The white card container */}
        <h2>Contact Us</h2>

        {/* Paragraph explaining query handling */}
        <p>
          Your questions and feedback are important to us! Once you submit your query using the form below, our dedicated support team will review the details. We aim to process and respond to your provided email address as quickly as possible, typically within 1-2 business days.
        </p>

        {/* Display confirmation message */}
        {isSubmitted && (
          <p style={{ color: 'pink', fontWeight: 'bold' }}>
            Thank you! Your message has been sent successfully.
          </p>
        )}

        {/* --- Contact Form --- */}
        <form onSubmit={handleSubmit}>
          {/* Form Group for Name */}
          <div className="form-group"> {/* Add a wrapper for better styling/spacing if needed */}
            <label htmlFor="name">Full Name:</label>
            <input
              type="text"
              id="name"
              name="name"
              value={formData.name}
              onChange={handleChange}
              required
              placeholder="Enter your full name"
            />
          </div>

          {/* Form Group for Email */}
          <div className="form-group">
            <label htmlFor="email">Email Address:</label>
            <input
              type="email"
              id="email"
              name="email"
              value={formData.email}
              onChange={handleChange}
              required
              placeholder="you@example.com"
            />
          </div>

          {/* Form Group for Subject */}
          <div className="form-group">
            <label htmlFor="subject">Subject:</label>
            <input
              type="text"
              id="subject"
              name="subject"
              value={formData.subject}
              onChange={handleChange}
              placeholder="e.g., Question about pricing"
            />
          </div>

          {/* Form Group for Message */}
          <div className="form-group">
            <label htmlFor="message">Your Message:</label>
            <textarea
              id="message"
              name="message"
              rows="5" // Adjust number of rows as needed
              value={formData.message}
              onChange={handleChange}
              required
              placeholder="Please type your question or feedback here..."
            ></textarea>
          </div>

          {/* Submit Button - uses .btn style */}
          <button type="submit" className="btn">
            Send Message
          </button>
        </form>
        {/* End Contact Form */}

      </div>
    </div>
  );
};

export default ContactUs;