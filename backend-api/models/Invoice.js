const mongoose = require('mongoose');

const invoiceSchema = new mongoose.Schema({
  client: { type: mongoose.Schema.Types.ObjectId, ref: 'Client', required: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  date: { type: Date, default: Date.now },
  startDate: { type: Date },
  endDate: { type: Date },
  timeLogs: [{ type: mongoose.Schema.Types.ObjectId, ref: 'TimeLog' }],
  total: { type: Number, required: true },
  totalMinutes: { type: Number, default: 0 },
  totalHours: { type: Number, default: 0 },
  pdfUrl: { type: String },
  status: { type: String, enum: ['pending', 'paid'], default: 'pending' },
}, { timestamps: true });

module.exports = mongoose.model('Invoice', invoiceSchema);
