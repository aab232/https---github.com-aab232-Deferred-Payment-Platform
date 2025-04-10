const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken'); // JWT for authentication

const app = express();
const PORT = 5000;

// Middleware
app.use(cors());
app.use(express.json());

// MySQL Connection
const db = mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: '353txRQ8',
    database: 'dpp_db'
});

db.connect((err) => {
    if (err) {
        console.error('❌ MySQL connection error:', err);
    } else {
        console.log('✅ MySQL connected successfully!');
    }
});

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});

// Password Validator
const isValidPassword = (password) => {
    const passwordRegex = /^(?=.*\d.*\d)(?=.*[!@#$%^&*]).{8,}$/;
    return passwordRegex.test(password);
};

// Function to convert date from DD/MM/YYYY to YYYY-MM-DD
const formatDate = (date) => {
    if (!date) {
        throw new Error('Invalid date provided'); // Handle missing date
    }
    const [year, month, day] = date.split('-'); // Split 'YYYY-MM-DD'
    return `${day}-${month}-${year}`; // Convert to 'DD-MM-YYYY'
}

// JWT Authentication Middleware
const authenticateUser = (req, res, next) => {
    const token = req.headers['authorization']; // Token from header

    if (!token) {
        return res.status(401).json({ message: 'No token provided.' });
    }

    jwt.verify(token, 'your-secret-key', (err, decoded) => {
        if (err) {
            return res.status(403).json({ message: 'Failed to authenticate token.' });
        }
        req.user = decoded; // Attach the decoded user object to the request
        next();
    });
};

// Update User Details Route
app.put('/update-details', authenticateUser, async (req, res) => {
    const { email, phone_number, credit_score, bank_account } = req.body;

    // Validate the input: Ensure at least one field is provided for updating
    if (!email && !phone_number && !credit_score && !bank_account) {
        return res.status(400).json({ message: 'Please provide at least one field to update.' });
    }

    let updateQuery = 'UPDATE users SET ';
    let updateValues = [];

    // Dynamically build the SQL query for the provided fields
    if (email) {
        updateQuery += 'email = ?, ';
        updateValues.push(email);
    }
    if (phone_number) {
        updateQuery += 'phone_number = ?, ';
        updateValues.push(phone_number);
    }
    if (credit_score) {
        updateQuery += 'credit_score = ?, ';
        updateValues.push(credit_score);
    }
    if (bank_account) {
        updateQuery += 'bank_account = ?, ';
        updateValues.push(bank_account);
    }

    // Remove the trailing comma and space
    updateQuery = updateQuery.slice(0, -2);

    // Use the user ID from the authenticated user to update their details
    updateQuery += ' WHERE user_id = ?';
    updateValues.push(req.user.id); // Assuming you get user ID from session or token

    // Execute the query
    db.query(updateQuery, updateValues, (err, result) => {
        if (err) {
            console.error('❌ Error updating details:', err);
            return res.status(500).json({ message: 'Updating details failed.' });
        }

        res.status(200).json({ message: 'Details updated successfully.' });
    });
});

// Update Password Route
app.put('/update-password', authenticateUser, async (req, res) => {
    const { currentPassword, newPassword } = req.body;

    // Validate new password
    if (!isValidPassword(newPassword)) {
        return res.status(400).json({ message: 'Password must contain at least 8 characters, two digits, and one special character.' });
    }

    // Check if current password is correct
    db.query('SELECT password FROM users WHERE user_id = ?', [req.user.id], async (err, results) => {
        if (err) {
            console.error('❌ Error checking current password:', err);
            return res.status(500).json({ message: 'Error checking current password.' });
        }

        const user = results[0];
        const isMatch = await bcrypt.compare(currentPassword, user.password);

        if (!isMatch) {
            return res.status(401).json({ message: 'Incorrect current password.' });
        }

        // Hash the new password and update it
        const hashedPassword = await bcrypt.hash(newPassword, 10);
        db.query('UPDATE users SET password = ? WHERE user_id = ?', [hashedPassword, req.user.id], (err) => {
            if (err) {
                console.error('❌ Error updating password:', err);
                return res.status(500).json({ message: 'Error updating password.' });
            }

            res.status(200).json({ message: 'Password updated successfully.' });
        });
    });
});