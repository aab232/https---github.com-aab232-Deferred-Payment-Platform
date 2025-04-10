const jwt = require('jsonwebtoken');

const authMiddleware = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ message: 'Unauthorized: No token provided.' });
  }

  jwt.verify(token, 'yourSecretKey', (err, decoded) => {
    if (err) {
      console.error('Token verification error:', err);
      return res.status(401).json({ message: 'Unauthorized: Invalid token.' });
    }
    req.user = decoded;
    next();
  });
};

module.exports = authMiddleware;