const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  role: {
    type: String,
    enum: ['admin', 'contractor', 'data_engineer', 'customer'],
    default: 'customer',
  },
});

module.exports = mongoose.model('User', userSchema);