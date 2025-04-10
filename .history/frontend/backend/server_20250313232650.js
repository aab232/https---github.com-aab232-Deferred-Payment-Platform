const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const mysql = require('mysql2');

const app = express();
const port = 5000;

app.use(cors());
app.use(express.json());

const db = mysql.createConnection({
  host: 'localhost',
  user: 'root',
  password: '353txRQ8',
  database: 'dpp_db'
});

db.connect((err) => {
  if (err) throw err;
  console.log('MySQL Connected...');
});

const validatePassword = (password) => {
  const lengthCheck = password.length >= 8;
  const numberCheck = (password.match(/\d/g) || []).length >= 2;
  const specialCharCheck = /[!@#$%^&*(),.?":{}|<>]/g.test(password);
  return lengthCheck && numberCheck && specialCharCheck;
};

app.post('/register', async (req, res) => {
  const { firstName, surname, email, password, mobileNumber, niNumber, dob } = req.body;

  const age = Math.floor((new Date() - new Date(dob)) / (365.25 * 24 * 60 * 60 * 1000));
  if (age < 18) return res.status(400).json({ message: 'You must be 18 or older to register.' });

  if (!validatePassword(password)) {
    return res.status(400).json({ message: 'Password must be at least 8 characters long, with at least 2 numbers and 1 special character.' });
  }

  const [existingUser] = await db.promise().query('SELECT * FROM users WHERE email = ?', [email]);
  if (existingUser.length) return res.status(400).json({ message: 'Email already in use.' });

  const hashedPassword = await bcrypt.hash(password, 10);
  db.query('INSERT INTO users (firstName, surname, email, password, mobileNumber, niNumber, dob) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [firstName, surname, email, hashedPassword, mobileNumber, niNumber, dob],
    (err) => {
      if (err) return res.status(500).json({ message: 'Registration failed.' });
      res.status(201).json({ message: 'Registration successful.' });
    }
  );
});

app.post('/login', async (req, res) => {
  const { email, password } = req.body;
  const [user] = await db.promise().query('SELECT * FROM users WHERE email = ?', [email]);

  if (!user.length || !(await bcrypt.compare(password, user[0].password))) {
    return res.status(401).json({ message: 'Invalid credentials.' });
  }
  res.status(200).json({ message: 'Login successful.', user: { firstName: user[0].firstName, surname: user[0].surname } });
});

app.listen(port, () => console.log(`Server running on port ${port}`));