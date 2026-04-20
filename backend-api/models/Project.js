const mongoose = require('mongoose');

const projectSchema = new mongoose.Schema({
  client: { type: mongoose.Schema.Types.ObjectId, ref: 'Client', required: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  name: { type: String, required: true },
  status: { type: String, enum: ['active', 'completed', 'on_hold'], default: 'active' },
  budget: { type: Number, default: 0 },
});

module.exports = mongoose.model('Project', projectSchema);
