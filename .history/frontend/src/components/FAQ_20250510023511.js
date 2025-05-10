import React from 'react';
import { useNavigate } from 'react-router-dom';
import './FAQ.css';
import BackButton from './BackButton';

// an array of question and answer objects for the faq section
const faqData = [
  {
    question: 'What is this platform?',
    answer: 'This platform is a service that allows you to shop online with flexible payments. We aim to make living simple and accessible.',
  },
  {
    question: 'How does this work?',
    answer: 'You can start by signing up for an account. Once logged in, you can browse for your favourite items and request a small loan to help you pay for it. Pay upfront or in instalments - our platform handles the rest.',
  },
  {
    question: 'Is it safe to use?',
    answer: 'Yes, security is our top priority. We use industry-standard encryption (like SSL) to protect your personal and financial information. We do not share your sensitive data without your consent. Please refer to our Privacy Policy for more details.',
  },
  {
    question: 'How do I create an account?',
    answer: 'Click on the "Register" or "Sign Up" button usually found on the login page or homepage. You\'ll need to provide some basic information like your email address and create a password. Follow the on-screen instructions to complete the process.',
  },
  {
    question: 'How is my personal data used?',
    answer: 'We use your data primarily to provide and improve our services, process transactions and communicate with you. We are committed to protecting your privacy. You can find detailed information in our Privacy Policy.',
  },
  {
    question: 'Who can I contact for support?',
    answer: 'If you have any questions or encounter issues, please visit our Contact Us page or email our support team using the form provided. We aim to respond as quickly as possible.',
  },
  // add more faq items here as needed
];

// defines the faq functional component
const FAQ = () => {
  // initialises the usenavigate hook for navigation
  const navigate = useNavigate();

  // function to handle the 'back' button click
  // it navigates the user to the previous page in their browser history
  const handleBack = () => {
    navigate(-1); // navigates one step back in the browser's history stack
  };

  // jsx for rendering the faq page
  return (
    // main container for the faq page, likely provides general layout and styling
    <div className="container faq-page-container">
      <BackButton /> {/* renders the reusable back button component */}
      {/* a styled card element to contain the faq content */}
      <div className="faq-card">
        <h2>Frequently Asked Questions</h2> {/* main title for the faq section */}
        {/* container for the list of faq items */}
        <div className="faq-list">
          {/* maps over the faqdata array to render each question and answer pair */}
          {faqData.map((item, index) => (
            // each faq item is a div, keyed by its index for react's rendering efficiency
            <div key={index} className="faq-item">
              {/* displays the faq question */}
              <h3 className="faq-question">{item.question}</h3>
              {/* displays the faq answer */}
              <p className="faq-answer">{item.answer}</p>
            </div>
          ))}
        </div>
        {/* button to navigate back, uses the handleback function */}
        <button onClick={handleBack} className="btn faq-back-btn">
          Back
        </button>
      </div>
    </div>
  );
};

// exports the faq component to make it available for use in other parts of the application
export default FAQ;