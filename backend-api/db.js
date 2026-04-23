const mongoose = require('mongoose');

mongoose.set('bufferCommands', false);

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
    const atlasUri = process.env.MONGO_URI;

    if (atlasUri) {
      try {
        await mongoose.connect(atlasUri, {
          serverSelectionTimeoutMS: 3000,
          connectTimeoutMS: 3000,
        });
        console.log('MongoDB connected (Atlas)');
        return mongoose.connection;
      } catch (err) {
        console.warn('Atlas connection failed:', err.message);
        if (mongoose.connection.readyState !== 0) {
          await mongoose.disconnect().catch(() => {});
        }
        if (process.env.NODE_ENV === 'production') {
          throw err;
        }
        usingDevStore = true;
        console.log('Using local JSON dev database fallback.');
        return null;
      }
    } else if (process.env.NODE_ENV === 'production') {
      throw new Error('MONGO_URI is required in production.');
    }

    usingDevStore = true;
    console.log('Using local JSON dev database fallback.');
    return null;
  })();

  try {
    return await connectionPromise;
  } catch (err) {
    connectionPromise = null;
    throw err;
  }
};

connectDB.ensureConnected = async (req, res, next) => {
  try {
    await connectDB();
    req.useDevStore = usingDevStore;
    next();
  } catch (err) {
    console.error('Database unavailable:', err.message);
    res.status(503).json({
      msg: 'Database unavailable. Check your MONGO_URI and MongoDB network access, then restart the API.',
      detail: process.env.NODE_ENV === 'production' ? undefined : err.message,
    });
  }
};

connectDB.isUsingDevStore = () => usingDevStore;

module.exports = connectDB;
