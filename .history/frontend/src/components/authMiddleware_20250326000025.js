const jwt = require('jsonwebtoken');

const authMiddleware = (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(403).json({ message: 'Authorization header missing or malformed.' });
    }

    const token = authHeader.split(' ')[1]; // Extract the token
    if (!token) {
      return res.status(403).json({ message: 'Token not provided.' });
    }

    jwt.verify(token, 'yourSecretKey', (err, decoded) => {
      if (err) {
        console.error('Token Verification Error:', err);
        return res.status(403).json({ message: 'Failed to authenticate token.' });
      }
      req.user = decoded; // Attach the decoded payload to the request
      next(); // Proceed to the next middleware
    });
  } catch (error) {
    console.error('Auth Middleware Error:', error);
    res.status(500).json({ message: 'Internal Server Error.' });
  }
};

module.exports = authMiddleware;