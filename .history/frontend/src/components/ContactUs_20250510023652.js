import React, { useState } from 'react';
import './ContactUs.css';
import BackButton from './BackButton';

// defines the contactus functional component
const ContactUs = () => {
  // state to manage the values of the form input fields
  const [formData, setFormData] = useState({ // initial state for form data
    name: '',    // user's name
    email: '',   // user's email address
    subject: '', // subject of the message
    message: '', // the message content
  });
  // state to control the visibility of the submission confirmation message
  const [isSubmitted, setIsSubmitted] = useState(false);

  // handles changes in any of the form input fields
  const handleChange = (e) => {
    const { name, value } = e.target; // destructures 'name' and 'value' from the event target (the input field)
    // updates the formdata state using the previous state
    setFormData(prevState => ({
      ...prevState, // spreads the existing state
      [name]: value, // updates the specific field (identified by 'name') with the new 'value'
    }));
  };

  // handles the submission of the contact form
  const handleSubmit = (e) => {
    e.preventDefault(); // prevents the default browser behavior for form submission (page reload)
    console.log('Form Data Submitted:', formData); // logs the submitted form data to the console (for debugging/prototype)

    // shows a confirmation message to the user
    setIsSubmitted(true);
    // clears the form fields after submission by resetting the formdata state
    setFormData({ name: '', email: '', subject: '', message: '' });

    // hides the confirmation message after a few seconds (5000 milliseconds = 5 seconds)
    setTimeout(() => setIsSubmitted(false), 5000);
  };

  // jsx for rendering the contact us page
  return (
    <div className="container">
      <BackButton />
      <div className="form-card">
        <h2>Contact Us</h2>

        <p>
          Your questions and feedback are important to us! Once you submit your query using the form below, our dedicated support team will review the details. We aim to process and respond to your provided email address as quickly as possible, typically within 1-2 business days.
        </p>

        {isSubmitted && (
          <p style={{ color: #6b212e, fontWeight: 'bold' }}>
            Thank you! Your message has been sent successfully.
          </p>
        )}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
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

          <div className="form-group">
            <label htmlFor="message">Your Message:</label>
            <textarea
              id="message"
              name="message"
              rows="5"
              value={formData.message}
              onChange={handleChange}
              required
              placeholder="Please type your question or feedback here..."
            ></textarea>
          </div>

          <button type="submit" className="btn">
            Send Message
          </button>
        </form>

      </div>
    </div>
  );
};

// exports the contactus component to make it available for import in other files
export default ContactUs;