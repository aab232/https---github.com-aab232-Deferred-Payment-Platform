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

// Registration Route
app.post('/register', async (req, res) => {
    try {
        const { first_name, surname, email, password, phone_number, ni_number, date_of_birth, credit_score } = req.body;

        // Check for required fields
        if (!first_name || !surname || !email || !password || !date_of_birth) {
            return res.status(400).json({ success: false, message: 'All required fields must be filled.' });
        }

        // Hash password before storing
        const hashedPassword = await bcrypt.hash(password, 10);

        // Ensure dob is valid and in correct format
        const formattedDOB = formatDate(date_of_birth);

        // Save the user to the database
        const newUser = {
            first_name,
            surname,
            email,
            password: hashedPassword,
            phone_number,
            ni_number,
            date_of_birth: formattedDOB,
            credit_score
        };

        // Save to database (MySQL example)
        const sql = 'INSERT INTO users SET ?';
        db.query(sql, newUser, (err, result) => {
            if (err) {
                console.error('Database Error:', err);
                return res.status(500).json({ success: false, message: 'Internal server error' });
            }
            res.status(201).json({ success: true, message: 'Registration successful!' });
        });
    } catch (error) {
        console.error('Server Error:', error);
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

// Login Route
app.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        // Check for User
        db.query('SELECT * FROM users WHERE email = ?', [email], async (err, results) => {
            if (err) {
                console.error('Database Error:', err);
                return res.status(500).json({ message: 'Internal server error.' });
            }

            if (results.length === 0) {
                return res.status(401).json({ success: false, message: 'Invalid credentials.' });
            }

            const user = results[0];

            // Compare Password
            const isMatch = await bcrypt.compare(password, user.password);
            if (!isMatch) {
                return res.status(401).json({ success: false, message: 'Invalid credentials.' });
            }

            // Create JWT token
            const token = jwt.sign({ id: user.user_id, email: user.email }, 'your-secret-key', { expiresIn: '1h' });

            // Send success response with token
            res.status(200).json({ success: true, message: 'Login successful!', token });
        });

    } catch (error) {
        console.error('❌ Login error:', error);
        res.status(500).json({ success: false, message: 'Server error. Try again later.' });
    }
});

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