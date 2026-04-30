require('dotenv').config();
const express = require('express');
const cors = require('cors');
const connectDB = require('./db');

const app = express();
const PORT = process.env.PORT || 5000;

app.disable('x-powered-by');
app.use(cors());
app.use(express.json());

app.get('/', (req, res) => {
  res.send('FreelanceFlow Backend API is running');
});

app.get('/api/health', async (req, res) => {
  try {
    await connectDB();
  } catch (err) {
    const status = connectDB.getStatus();
    return res.status(503).json({
      ok: false,
      service: 'freelance-flow-api',
      environment: process.env.NODE_ENV || 'development',
      db: {
        state: status.state,
        usingDevStore: status.usingDevStore,
        hasMongoUri: status.hasMongoUri,
      },
      error: process.env.NODE_ENV === 'production' ? undefined : err.message,
    });
  }

  const status = connectDB.getStatus();
  return res.status(200).json({
    ok: true,
    service: 'freelance-flow-api',
    environment: process.env.NODE_ENV || 'development',
    db: {
      state: status.state,
      usingDevStore: status.usingDevStore,
      hasMongoUri: status.hasMongoUri,
    },
  });
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

if (process.env.NODE_ENV === 'production') {
  connectDB().catch((err) => {
    console.error('MongoDB warmup failed:', err.message);
  });
}

module.exports = app;
