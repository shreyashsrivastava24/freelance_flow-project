const mongoose = require('mongoose');

const taskSchema = new mongoose.Schema({
  project: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', required: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  title: { type: String, required: true },
  dueDate: { type: Date },
  completed: { type: Boolean, default: false },
}, {
  bufferCommands: false,
});



module.exports = mongoose.model('Task', taskSchema);
