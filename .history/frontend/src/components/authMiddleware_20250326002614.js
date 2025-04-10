const jwt = require('jsonwebtoken');
const User = require('../models/User'); // Adjust this to your user model path

const authMiddleware = async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).send({ message: 'No token found. Please log in again.' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Optionally, verify if the user exists in the database
    const user = await User.findById(decoded.userId);
    if (!user) {
      return res.status(404).send({ message: 'User not found.' });
    }

    req.user = user; // Attach the user object to the request
    next(); // Proceed to the next middleware/route handler
  } catch (error) {
    console.error(error);
    return res.status(403).send({ message: 'Failed to authenticate token.' });
  }
};

module.exports = authMiddleware;