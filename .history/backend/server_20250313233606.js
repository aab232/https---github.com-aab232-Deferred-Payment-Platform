const express = require('express');
const mysql = require('mysql2');
const bcrypt = require('bcryptjs');
const cors = require('cors');

const app = express();
app.use(express.json());
app.use(cors());

// MySQL Connection
const db = mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: '353txRQ8',
    database: 'dpp_db',
});

db.connect(err => {
    if (err) throw err;
    console.log("MySQL Connected...");
});

// Helper: Validate password strength
const isValidPassword = (password) => {
    const regex = /^(?=.*[0-9].*[0-9])(?=.*[!@#$%^&*])[A-Za-z0-9!@#$%^&*]{8,}$/;
    return regex.test(password);
};

// Helper: Calculate age
const getAge = (dob) => {
    const birthDate = new Date(dob);
    const today = new Date();
    const age = today.getFullYear() - birthDate.getFullYear();
    return age - (today < new Date(today.getFullYear(), birthDate.getMonth(), birthDate.getDate()));
};

// ➤ Register Endpoint
app.post('/register', async (req, res) => {
    try {
        const { firstName, surname, email, password, mobileNumber, niNumber, dob } = req.body;

        if (!firstName || !surname || !email || !password || !niNumber || !dob) {
            return res.status(400).json({ message: "All required fields must be filled." });
        }

        if (getAge(dob) < 18) {
            return res.status(400).json({ message: "You must be at least 18 years old." });
        }

        if (!isValidPassword(password)) {
            return res.status(400).json({ message: "Password must be 8+ characters, 2 numbers, and 1 special character." });
        }

        const [existingUser] = await db.promise().query("SELECT * FROM users WHERE email = ?", [email]);
        if (existingUser.length > 0) {
            return res.status(400).json({ message: "Email already registered." });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        await db.promise().query(
            "INSERT INTO users (firstName, surname, email, password, mobileNumber, niNumber, dob) VALUES (?, ?, ?, ?, ?, ?, ?)",
            [firstName, surname, email, hashedPassword, mobileNumber, niNumber, dob]
        );

        res.status(201).json({ message: "Registration successful!" });
    } catch (error) {
        console.error("Registration error:", error);
        res.status(500).json({ message: "Internal Server Error" });
    }
});

// ➤ Login Endpoint
app.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        const [user] = await db.promise().query("SELECT * FROM users WHERE email = ?", [email]);
        if (user.length === 0) {
            return res.status(400).json({ message: "Invalid credentials." });
        }

        const isMatch = await bcrypt.compare(password, user[0].password);
        if (!isMatch) {
            return res.status(400).json({ message: "Invalid credentials." });
        }

        res.status(200).json({ message: "Login successful!" });
    } catch (error) {
        console.error("Login error:", error);
        res.status(500).json({ message: "Internal Server Error" });
    }
});

const PORT = 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));