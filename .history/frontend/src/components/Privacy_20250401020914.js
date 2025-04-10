import React from 'react';
import './Privacy.css'; // Make sure to import the CSS file

const Privacy = () => {
  return (
    <div className="container">
      <div className="form-card">
        <h2>Data Privacy</h2>
        
        <p>At ₍^. .^₎⟆, your privacy is super important to us. We only collect necessary data, such as your first name, surname, email address, password (which is securely encrypted), date of birth, and other details required to assess your eligibility for financial services, such as your credit score, monthly or yearly income, payment history, and more. We also collect additional data like your phone number for multi-factor authentication and national insurance number for anti-fraud measures. All data is securely stored in accordance with UK law regarding financial services and credit lending. You have the right to withdraw your data at any time, and you can do this by choosing to delete your account, found in the account settings. Please note that it will take up to 2 weeks to completely erase all traces of your data from our systems after an account deletion request.</p>

        <p>We take your data protection seriously and comply with UK data protection laws, including the General Data Protection Regulation (GDPR). This ensures that your data is only used for the purposes outlined in our privacy policy. If you have any questions about how your data is used, or if you wish to access or delete your records, you can do so through your account settings. Additionally, you can use the button below to request a copy of your data sent to your email. If you opt out, we will take all necessary steps to ensure your data is erased from our records within 2 weeks.</p>

        <p>When registering an account, you agree to our <span className="link">Privacy Policy</span>.</p>
        <button class="request-data-btn">Request Data</button>
      </div>
    </div>
  );
};

export default Privacy;