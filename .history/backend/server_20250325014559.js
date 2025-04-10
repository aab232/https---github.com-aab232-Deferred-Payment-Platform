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

    // Hash the ni_number before storing
    const hashedNiNumber = await bcrypt.hash(ni_number, 10);

    // Ensure dob is valid and in correct format
    const formattedDOB = formatDate(date_of_birth);

    // Save the user to the database
    const newUser = {
      first_name,
      surname,
      email,
      password: hashedPassword,
      phone_number,
      ni_number: hashedNiNumber, // Store hashed ni_number
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