const mongoose = require('mongoose');

const timeLogSchema = new mongoose.Schema({
  project: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', required: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  startTime: { type: Date, required: true },
  endTime: { type: Date },
  duration: { type: Number }, // in minutes
  description: { type: String, default: '' },
  manual: { type: Boolean, default: false },
  billed: { type: Boolean, default: false },
}, {
  bufferCommands: false,
});


module.exports = mongoose.model('TimeLog', timeLogSchema);
