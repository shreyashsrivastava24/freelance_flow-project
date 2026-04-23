const mongoose = require('mongoose');

// Strictly disable buffering globally to avoid 10s timeouts on Vercel
mongoose.set('bufferCommands', false);
mongoose.set('bufferTimeoutMS', 5000); // Fail faster than 10s if something does buffer

let connectionPromise = null;
let usingDevStore = false;

const connectDB = async () => {
  if (usingDevStore) {
    return null;
  }

  if (mongoose.connection.readyState === 1) {
    return mongoose.connection;
  }

  if (connectionPromise) {
    return connectionPromise;
  }

  connectionPromise = (async () => {
    // Try both common environment variable names
    const atlasUri = process.env.MONGO_URI || process.env.MONGODB_URI;

    if (atlasUri) {
      try {
        // Mask the URI for logging to help debug without leaking secrets
        const maskedUri = atlasUri.replace(/:([^@]+)@/, ':****@');
        console.log(`Attempting MongoDB connection with: ${maskedUri}`);

        await mongoose.connect(atlasUri, {
          serverSelectionTimeoutMS: 5000,
          connectTimeoutMS: 10000,
          socketTimeoutMS: 45000,
        });

        console.log('MongoDB connected (Atlas)');
        return mongoose.connection;
      } catch (err) {
        console.warn('Atlas connection failed:', err.message);
        
        if (mongoose.connection.readyState !== 0) {
          await mongoose.disconnect().catch(() => {});
        }

        if (process.env.NODE_ENV === 'production') {
          console.error('CRITICAL: Database connection failed in production.');
          throw err;
        }

        usingDevStore = true;
        console.log('Using local JSON dev database fallback.');
        return null;
      }
    } else if (process.env.NODE_ENV === 'production') {
      console.error('CRITICAL: MONGO_URI or MONGODB_URI is missing in production.');
      throw new Error('MONGO_URI is required in production.');
    }

    usingDevStore = true;
    console.log('Using local JSON dev database fallback.');
    return null;
  })();

  try {
    return await connectionPromise;
  } catch (err) {
    connectionPromise = null; // Reset for next attempt
    throw err;
  }
};

connectDB.ensureConnected = async (req, res, next) => {
  try {
    await connectDB();
    req.useDevStore = usingDevStore;
    next();
  } catch (err) {
    console.error('Database middleware error:', err.message);
    res.status(503).json({
      msg: 'Database unavailable. Please verify your MONGO_URI and MongoDB Atlas IP Whitelist (allow 0.0.0.0/0).',
      detail: process.env.NODE_ENV === 'production' ? undefined : err.message,
    });
  }
};

connectDB.isUsingDevStore = () => usingDevStore;

module.exports = connectDB;

