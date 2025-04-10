import React from 'react';
import { useNavigate } from 'react-router-dom';
import './BackButton.css'; // Link to the back button's specific CSS file

const BackButton = () => {
  const navigate = useNavigate();

  return (
    <button className="back-button" onClick={() => navigate(-1)}>
      &lt; Back
    </button>
  );
};

export default BackButton;