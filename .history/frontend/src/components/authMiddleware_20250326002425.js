const jwt = require('jsonwebtoken');
const User = require('../models/User'); // Adjust the path to your User model

const authenticateToken = (req, res, next) => {
  const token = req.header('Authorization')?.replace('Bearer ', ''); // Extract token from Authorization header
  
  if (!token) {
    return res.status(403).json({ message: 'Access denied. No token provided.' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET); // Verify token
    req.user = decoded; // Attach the user info to the request
    next();
  } catch (error) {
    res.status(403).json({ message: 'Failed to authenticate token.' });
  }
};

module.exports = authenticateToken;