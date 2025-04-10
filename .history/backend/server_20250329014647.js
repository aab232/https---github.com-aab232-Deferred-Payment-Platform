const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const puppeteer = require('puppeteer'); // Puppeteer for web scraping

const app = express();
const PORT = 5000;
const JWT_SECRET = 'your-secret-key';

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

// Format date from DD/MM/YYYY to YYYY-MM-DD
const formatDate = (date) => {
    if (!date) throw new Error('Invalid date provided');
    const [year, month, day] = date.split('-');
    return `${day}-${month}-${year}`;
};

// JWT Authentication Middleware
const authenticateUser = (req, res, next) => {
    const token = req.headers['authorization'];
    if (!token) return res.status(401).json({ message: 'No token provided.' });
    
    jwt.verify(token, JWT_SECRET, (err, decoded) => {
        if (err) return res.status(403).json({ message: 'Failed to authenticate token.' });
        req.user = decoded;
        next();
    });
};

// Role-Based Access Middleware
const authorizeRoles = (...allowedRoles) => {
    return (req, res, next) => {
        if (!allowedRoles.includes(req.user.role)) {
            return res.status(403).json({ message: 'Access denied. Insufficient permissions.' });
        }
        next();
    };
};

// Get Laptops (Web Scraping Example)
app.get('/api/products', async (req, res) => {
    try {
        const products = await scrapeLaptops();
        res.status(200).json({ success: true, products });
    } catch (error) {
        console.error('❌ Error fetching products:', error);
        res.status(500).json({ success: false, message: 'Error fetching products.' });
    }
});

// Web scraping function using Puppeteer
const scrapeLaptops = async () => {
    const browser = await puppeteer.launch({ headless: true });
    const page = await browser.newPage();
    await page.goto('https://www.argos.co.uk/browse/technology/laptops-and-pcs/laptops/c:30049/', {
        waitUntil: 'networkidle2'
    });
    
    const laptops = await page.evaluate(() => {
        return Array.from(document.querySelectorAll('.ProductCard__Title')).map(element => {
            const title = element.innerText;
            const price = element.closest('.ProductCard').querySelector('.ProductCard__Price').innerText;
            const link = element.closest('.ProductCard').querySelector('a').href;
            return { title, price, link };
        });
    });

    await browser.close();
    return laptops;
};

// Registration Route
app.post('/register', async (req, res) => {
    try {
        const { first_name, surname, email, password, phone_number, ni_number, date_of_birth, credit_score, role } = req.body;
        if (!first_name || !surname || !email || !password || !date_of_birth || !role) {
            return res.status(400).json({ success: false, message: 'All required fields must be filled.' });
        }
        const hashedPassword = await bcrypt.hash(password, 10);
        const formattedDOB = formatDate(date_of_birth);

        const sql = 'INSERT INTO users SET ?';
        db.query(sql, { first_name, surname, email, password: hashedPassword, phone_number, ni_number, date_of_birth: formattedDOB, credit_score, role }, (err, result) => {
            if (err) return res.status(500).json({ success: false, message: 'Internal server error' });
            res.status(201).json({ success: true, message: 'Registration successful!' });
        });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

// Login Route with Role-Based Authentication
app.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        db.query('SELECT * FROM users WHERE email = ?', [email], async (err, results) => {
            if (err) return res.status(500).json({ message: 'Internal server error.' });
            if (results.length === 0) return res.status(401).json({ success: false, message: 'Invalid credentials.' });
            
            const user = results[0];
            const isMatch = await bcrypt.compare(password, user.password);
            if (!isMatch) return res.status(401).json({ success: false, message: 'Invalid credentials.' });
            
            const token = jwt.sign({ id: user.user_id, email: user.email, role: user.role }, JWT_SECRET, { expiresIn: '1h' });
            res.status(200).json({ success: true, message: 'Login successful!', token, role: user.role });
        });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Server error. Try again later.' });
    }
});

// Protected Routes Based on Roles
app.get('/admin', authenticateUser, authorizeRoles('admin'), (req, res) => {
    res.json({ success: true, message: 'Welcome, Admin!' });
});

app.get('/contractor', authenticateUser, authorizeRoles('admin', 'contractor'), (req, res) => {
    res.json({ success: true, message: 'Contractor access granted.' });
});

app.get('/data-engineer', authenticateUser, authorizeRoles('admin', 'data engineer'), (req, res) => {
    res.json({ success: true, message: 'Data Engineer access granted.' });
});

module.exports = app;