const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');
const bcrypt = require('bcrypt');

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

// Password Validator
const isValidPassword = (password) => {
    const passwordRegex = /^(?=.*\d.*\d)(?=.*[!@#$%^&*]).{8,}$/;
    return passwordRegex.test(password);
};

// Function to convert date from DD/MM/YYYY to YYYY-MM-DD
function formatDate(date) {
    const [day, month, year] = date.split('/');
    return `${year}-${month}-${day}`;
}

// Registration Route
app.post('/register', async (req, res) => {
    try {
        const { firstName, surname, email, password, phone_number, niNumber, date_of_birth, credit_score } = req.body;

        // Check Age (18+)
        const birthDate = new Date(formatDate(date_of_birth)); // Format the date
        const age = new Date().getFullYear() - birthDate.getFullYear();
        if (age < 18) {
            return res.status(400).json({ message: 'You must be 18 or older to register.' });
        }

        // Check for Existing Email
        db.query('SELECT * FROM users WHERE email = ?', [email], async (err, results) => {
            if (results.length > 0) {
                return res.status(400).json({ message: 'Email already registered.' });
            }

            // Validate Password
            if (!isValidPassword(password)) {
                return res.status(400).json({ message: 'Password must be at least 8 characters long, with 2 numbers and 1 special character.' });
            }

            // Hash Password
            const hashedPassword = await bcrypt.hash(password, 10);

            // Insert User into Database
            const sql = 'INSERT INTO users (first_name, surname, email, password, phone_number, ni_number, date_of_birth, credit_score) VALUES (?, ?, ?, ?, ?, ?, ?, ?)';
            const values = [firstName, surname, email, hashedPassword, phone_number, niNumber, formatDate(date_of_birth), credit_score || null];  // Format the date before inserting

            db.query(sql, values, (err, result) => {
                if (err) {
                    console.error('❌ Registration error:', err);
                    return res.status(500).json({ message: 'Server error. Try again later.' });
                }

                console.log('✅ User registered successfully:', result);
                res.status(201).json({ message: 'Registration successful!' });
            });
        });

    } catch (error) {
        console.error('❌ Server error:', error);
        res.status(500).json({ message: 'Server error. Try again later.' });
    }
});

// Login Route
app.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        // Check for User
        db.query('SELECT * FROM users WHERE email = ?', [email], async (err, results) => {
            if (results.length === 0) {
                return res.status(401).json({ message: 'Invalid credentials.' });
            }

            const user = results[0];

            // Compare Password
            const isMatch = await bcrypt.compare(password, user.password);
            if (!isMatch) {
                return res.status(401).json({ message: 'Invalid credentials.' });
            }

            res.status(200).json({ message: 'Login successful!' });
        });

    } catch (error) {
        console.error('❌ Login error:', error);
        res.status(500).json({ message: 'Server error. Try again later.' });
    }
});

// Start Server
app.listen(PORT, () => console.log(`🚀 Server running on http://localhost:${PORT}`));