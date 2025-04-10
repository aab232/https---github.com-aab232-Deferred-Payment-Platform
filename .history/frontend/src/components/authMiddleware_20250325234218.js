const jwt = require('jsonwebtoken');

const authMiddleware = (req, res, next) => {
  const authHeader = req.headers['authorization'];

  // Check if Authorization header exists and has a Bearer token
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Unauthorized: No token provided.' });
  }

  const token = authHeader.split(' ')[1]; // Extract the token after 'Bearer'

  jwt.verify(token, 'yourSecretKey', (err, decoded) => {
    if (err) {
      return res.status(401).json({ message: 'Unauthorized: Invalid token.' });
    }

    req.user = decoded; // Attach the user information (e.g., user_id) to the request object
    next();
  });
};

module.exports = authMiddleware;