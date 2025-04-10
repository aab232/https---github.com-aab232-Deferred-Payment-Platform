import React from 'react';
import './Privacy.css'; // Make sure to import the CSS file

const Privacy = () => {
  return (
    <div className="container">
      <div className="form-card">
        <h2>Data Privacy</h2>
        
        <p>
          At Meow Meow, your privacy is important to us. We collect the necessary data such as your first name, surname, email address, password (which is safely encrypted), and date of birth to ensure you're over 18. We may also collect additional information such as your phone number (which is used for multi-factor authentication), your national insurance number (to prevent fraud), and your credit score (optional). This data is securely stored in compliance with UK law on financial services and credit lending.

          You have the right to withdraw your data at any time. If you choose to delete your account, you can do so via your account settings. Please note that once you request account deletion, it will take up to 2 weeks to fully erase all traces of your data from our systems. 

          We comply with UK data protection laws, including the General Data Protection Regulation (GDPR), which ensures your data is only used for the purposes outlined in our privacy policy. If you have any questions about how your data is used or wish to access or delete your records, you can manage these settings directly in your account. 
        </p>

        <p>By submitting, you agree to our <span className="link">Privacy Policy</span>.</p>
      </div>
    </div>
  );
};

export default Privacy;