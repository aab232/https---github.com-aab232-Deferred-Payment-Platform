const jwt = require('jsonwebtoken');
// user model, used to check if the user from the token still exists
const User = require('../models/User');

// middleware function to handle authentication for protected routes
const authMiddleware = async (req, res, next) => {
  try {
    // get token from the 'authorization' header, remove 'bearer ' prefix
    const token = req.header('Authorization')?.replace('Bearer ', '');

    // if no token is present, access is denied
    if (!token) {
      return res.status(401).send({ message: 'No token found. Please log in again.' });
    }

    // verify the token's signature and decode its payload using the secret key
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // handles cases where a user might have been deleted after a token was issued
    const user = await User.findById(decoded.userId); // assuming 'userid' is in jwt payload
    if (!user) {
      return res.status(404).send({ message: 'User not found.' }); // user associated with token doesn't exist
    }

    // attach fetched user object to the request object (req.user)
    // so downstream route handlers can access the authenticated user's data
    req.user = user;
    // pass control to the next middleware or the actual route handler
    next();
  } catch (error) {
    // log any errors that occur during the authentication process
    console.error('Authentication error:', error.message);
    // if token verification fails (e.g., expired, invalid signature), send a 403 forbidden response
    return res.status(403).send({ message: 'Failed to authenticate token.' });
  }
};

// export the middleware for use in your route definitions
module.exports = authMiddleware;