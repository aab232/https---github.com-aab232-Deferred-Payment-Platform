// Update User Details
app.post('/update-details', (req, res) => {
  const { type, oldValue, newValue } = req.body;

  if (!type || !oldValue || !newValue) {
    return res.status(400).json({ success: false, message: 'Missing required fields.' });
  }

  const query = `UPDATE users SET ${type} = ? WHERE ${type} = ?`;

  db.query(query, [newValue, oldValue], (err, result) => {
    if (err) {
      console.error('❌ Update error:', err);
      return res.status(500).json({ success: false, message: 'Database update failed.' });
    }
    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: `${type} not found or unchanged.` });
    }
    res.status(200).json({ success: true });
  });
});