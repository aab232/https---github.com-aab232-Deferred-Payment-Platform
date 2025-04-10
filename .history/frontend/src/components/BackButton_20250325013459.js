import React from 'react';
import { useNavigate } from 'react-router-dom';
import './BackButton.css'; // For custom styling

const BackButton = () => {
  const navigate = useNavigate();

  return (
    <button
      className="back-btn"
      onClick={() => navigate(-1)} // This goes to the previous page
    >
      &lt; Back
    </button>
  );
};

export default BackButton;