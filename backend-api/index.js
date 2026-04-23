require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const connectDB = require('./db');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());
app.use('/invoices', express.static(path.join(__dirname, 'invoices')));

app.get('/', (req, res) => {
  res.send('FreelanceFlow Backend API is running');
});

app.use('/api', connectDB.ensureConnected);

app.use('/api/auth', require('./routes/auth'));
app.use('/api/clients', require('./routes/clients'));
app.use('/api/projects', require('./routes/projects'));
app.use('/api/tasks', require('./routes/tasks'));
app.use('/api/timelogs', require('./routes/timelogs'));
app.use('/api/invoices', require('./routes/invoices'));
app.use('/api/sample-data', require('./routes/sampleData'));

app.use((err, req, res, next) => {
  console.error('Unhandled API error:', err);
  res.status(500).json({ msg: err.message || 'Unexpected server error.' });
});

if (process.env.NODE_ENV !== 'production') {
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });

  connectDB().catch((err) => {
    console.error('Initial database connection failed:', err.message);
    console.error('The API will keep running and retry MongoDB on the next API request.');
  });
}

module.exports = app;
