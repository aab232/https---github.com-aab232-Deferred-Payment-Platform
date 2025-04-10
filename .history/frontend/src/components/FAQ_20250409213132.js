import React from 'react';
import { useNavigate } from 'react-router-dom';
import './FAQ.css'; // Import the specific CSS for this component

// Example FAQ Data - Replace with your actual FAQs
const faqData = [
  {
    question: 'What is [Your App Name]?',
    answer: '[Your App Name] is a service that allows you to [briefly explain the main purpose, e.g., manage tasks, shop online with flexible payments, connect with professionals]. We aim to make [mention the benefit] simple and accessible.',
  },
  {
    question: 'How does [Your App Name] work?',
    answer: 'You can start by signing up for an account. Once logged in, you can [explain the core workflow, e.g., browse items, add them to your cart, choose our payment option at checkout / create a new project, assign tasks / browse profiles, send connection requests]. Our platform handles the rest, providing a seamless experience.',
  },
  {
    question: 'Is it safe to use [Your App Name]?',
    answer: 'Yes, security is our top priority. We use industry-standard encryption (like SSL) to protect your personal and financial information. We do not share your sensitive data without your consent. Please refer to our Privacy Policy for more details.',
  },
  {
    question: 'Are there any fees associated with using the service?',
    answer: 'For basic usage, [Your App Name] is free. However, certain premium features or specific transaction types [e.g., late payment fees for financing, subscription tiers] may involve costs. All fees are clearly disclosed before you confirm any transaction or subscription.',
  },
  {
    question: 'How do I create an account?',
    answer: 'Click on the "Register" or "Sign Up" button usually found on the login page or homepage. You\'ll need to provide some basic information like your email address and create a password. Follow the on-screen instructions to complete the process.',
  },
  {
    question: 'I forgot my password. What should I do?',
    answer: 'On the login page, click the "Forgot Password?" link. Enter the email address associated with your account, and we will send you instructions on how to reset your password.',
  },
  {
    question: 'How is my personal data used?',
    answer: 'We use your data primarily to provide and improve our services, process transactions, and communicate with you. We are committed to protecting your privacy. You can find detailed information in our Privacy Policy.',
  },
  {
    question: 'Who can I contact for support?',
    answer: 'If you have any questions or encounter issues, please visit our Contact Us page or email our support team at [Your Support Email Address]. We aim to respond as quickly as possible.',
  },
];

const FAQ = () => {
  const navigate = useNavigate();

  // Function to go back to the previous page or a specific route
  const handleBack = () => {
    navigate(-1); // Goes back one step in history
    // Or navigate('/main'); // Or navigate to a specific known route like '/main'
  };

  return (
    <div className="container faq-page-container"> {/* Added specific class */}
      <div className="faq-card"> {/* Use a specific class for the card */}
        <h2>Frequently Asked Questions</h2>
        <div className="faq-list">
          {faqData.map((item, index) => (
            <div key={index} className="faq-item">
              <h3 className="faq-question">{item.question}</h3>
              <p className="faq-answer">{item.answer}</p>
            </div>
          ))}
        </div>
        <button onClick={handleBack} className="btn faq-back-btn">
          Back
        </button>
      </div>
    </div>
  );
};

export default FAQ;