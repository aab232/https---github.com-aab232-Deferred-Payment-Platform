const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const puppeteer = require('puppeteer'); // Puppeteer for web scraping

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
const formatDate = (date) => {
    if (!date) {
        throw new Error('Invalid date provided'); // Handle missing date
    }
    const [year, month, day] = date.split('-'); // Split 'YYYY-MM-DD'
    return `${day}-${month}-${year}`; // Convert to 'DD-MM-YYYY'
};

// JWT Authentication Middleware
const authenticateUser = (req, res, next) => {
    const token = req.headers['authorization'];

    if (!token) {
        return res.status(401).json({ message: 'No token provided.' });
    }

    jwt.verify(token, 'your-secret-key', (err, decoded) => {
        if (err) {
            return res.status(403).json({ message: 'Failed to authenticate token.' });
        }
        req.user = decoded;
        next();
    });
};

// Web Scraping Function
const scrapeLaptops = async () => {
    const browser = await puppeteer.launch({ headless: true });
    const page = await browser.newPage();

    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');
    await page.goto('https://www.argos.co.uk/browse/technology/laptops-and-pcs/laptops/c:30049/', {
        waitUntil: 'networkidle2'
    });

    const laptops = await page.evaluate(() => {
        const items = [];
        document.querySelectorAll('.ProductCard').forEach(element => {
            const title = element.querySelector('.ProductCard__Title')?.innerText || 'No title';
            const price = element.querySelector('.ProductCard__Price')?.innerText || 'Price unavailable';
            const link = element.querySelector('a')?.href || '#';
            const img = element.querySelector('.ProductCard__Image img')?.src || 'https://via.placeholder.com/150';
            const description = element.querySelector('.ProductCard__Description')?.innerText || 'No description available';

            items.push({ title, price, link, img, description });
        });

        return items;
    });

    await browser.close();
    return laptops;
};

// API Route to Get Scraped Products with Sorting & Filtering
app.get('/api/products', async (req, res) => {
    try {
        let products = await scrapeLaptops();

        // Sorting (asc or desc)
        if (req.query.sort === 'asc' || req.query.sort === 'desc') {
            products = products.sort((a, b) => {
                const priceA = parseFloat(a.price.replace(/[^0-9.]/g, '')) || 0;
                const priceB = parseFloat(b.price.replace(/[^0-9.]/g, '')) || 0;
                return req.query.sort === 'asc' ? priceA - priceB : priceB - priceA;
            });
        }

        // Filtering by keyword
        if (req.query.filter) {
            const keyword = req.query.filter.toLowerCase();
            products = products.filter(product => product.title.toLowerCase().includes(keyword));
        }

        res.status(200).json({ success: true, products });
    } catch (error) {
        console.error('❌ Error fetching products:', error);
        res.status(500).json({ success: false, message: 'Error fetching products.' });
    }
});

// Registration Route
app.post('/register', async (req, res) => {
    try {
        const { first_name, surname, email, password, phone_number, ni_number, date_of_birth, credit_score } = req.body;

        if (!first_name || !surname || !email || !password || !date_of_birth) {
            return res.status(400).json({ success: false, message: 'All required fields must be filled.' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        const formattedDOB = formatDate(date_of_birth);

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

        db.query('SELECT * FROM users WHERE email = ?', [email], async (err, results) => {
            if (err) {
                console.error('Database Error:', err);
                return res.status(500).json({ message: 'Internal server error.' });
            }

            if (results.length === 0) {
                return res.status(401).json({ success: false, message: 'Invalid credentials.' });
            }

            const user = results[0];
            const isMatch = await bcrypt.compare(password, user.password);
            if (!isMatch) {
                return res.status(401).json({ success: false, message: 'Invalid credentials.' });
            }

            const token = jwt.sign({ id: user.user_id, email: user.email }, 'your-secret-key', { expiresIn: '1h' });
            res.status(200).json({ success: true, message: 'Login successful!', token });
        });

    } catch (error) {
        console.error('❌ Login error:', error);
        res.status(500).json({ success: false, message: 'Server error. Try again later.' });
    }
});

app.listen(PORT, () => {
    console.log(`🚀 Server is running on port ${PORT}`);
});