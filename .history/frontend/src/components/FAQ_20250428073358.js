import React from 'react';
import { useNavigate } from 'react-router-dom';
import './FAQ.css';
import BackButton from './BackButton';

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
      <BackButton />
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