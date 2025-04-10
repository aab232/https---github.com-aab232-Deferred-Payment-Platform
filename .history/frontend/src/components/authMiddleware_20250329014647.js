const jwt = require('jsonwebtoken');
const mysql = require('mysql2');

const db = mysql.createConnection({
  host: 'localhost',
  user: 'root',
  password: 'yourpassword',
  database: 'yourdatabase'
});

const authMiddleware = async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).send({ message: 'No token found. Please log in again.' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Retrieve user from MySQL database
    db.query('SELECT * FROM users WHERE id = ?', [decoded.id], (err, results) => {
      if (err || results.length === 0) {
        return res.status(404).send({ message: 'User not found.' });
      }

      req.user = results[0]; // Attach user object to request
      next();
    });
  } catch (error) {
    console.error(error);
    return res.status(403).send({ message: 'Failed to authenticate token.' });
  }
};

// Role-based access control middleware
const verifyRole = (allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).send({ message: 'Unauthorized request.' });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).send({ message: 'Forbidden: Insufficient permissions.' });
    }

    next();
  };
};

module.exports = { authMiddleware, verifyRole };