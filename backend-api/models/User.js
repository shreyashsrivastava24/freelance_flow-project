const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  name: { type: String },
  tier: { type: String, default: 'free' }, // Unlimited for free app
});

module.exports = mongoose.model('User', userSchema);

