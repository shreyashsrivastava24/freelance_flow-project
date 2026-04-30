const mongoose = require('mongoose');

mongoose.set('bufferCommands', false);
mongoose.set('bufferTimeoutMS', 5000);

const CONNECTION_STATES = {
  0: 'disconnected',
  1: 'connected',
  2: 'connecting',
  3: 'disconnecting',
};

const globalMongoose = global.__freelanceFlowMongoose || {
  connection: null,
  promise: null,
  listenersAttached: false,
  lastError: null,
};

global.__freelanceFlowMongoose = globalMongoose;

let usingDevStore = false;

const getMaskedUri = (uri) => uri.replace(/:([^@]+)@/, ':****@');

const normalizeMongoUri = (value) => String(value || '')
  .trim()
  .replace(/^"(.*)"$/, '$1')
  .replace(/^'(.*)'$/, '$1');

const getReadyStateLabel = (readyState = mongoose.connection.readyState) =>
  CONNECTION_STATES[readyState] || 'unknown';

const attachConnectionListeners = () => {
  if (globalMongoose.listenersAttached) {
    return;
  }

  globalMongoose.listenersAttached = true;

  mongoose.connection.on('connected', () => {
    globalMongoose.lastError = null;
    console.log('MongoDB connected.');
  });

  mongoose.connection.on('disconnected', () => {
    console.warn('MongoDB disconnected.');
  });

  mongoose.connection.on('error', (error) => {
    globalMongoose.lastError = error.message;
    console.error('MongoDB connection error:', error.message);
  });
};

attachConnectionListeners();

const connectDB = async () => {
  if (usingDevStore) {
    return null;
  }

  if (globalMongoose.connection && mongoose.connection.readyState === 1) {
    return globalMongoose.connection;
  }

  const atlasUri = normalizeMongoUri(process.env.MONGO_URI || process.env.MONGODB_URI);

  if (!atlasUri) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('MONGO_URI is required in production.');
    }

    usingDevStore = true;
    console.log('Using local JSON dev database fallback.');
    return null;
  }

  if (!/^mongodb(\+srv)?:\/\//.test(atlasUri)) {
    throw new Error('MONGO_URI must start with mongodb:// or mongodb+srv://');
  }

  if (!globalMongoose.promise) {
    const maskedUri = getMaskedUri(atlasUri);
    console.log(`Attempting MongoDB connection with: ${maskedUri}`);
    globalMongoose.lastError = null;

    globalMongoose.promise = mongoose.connect(atlasUri, {
      serverSelectionTimeoutMS: 10000,
      connectTimeoutMS: 10000,
      socketTimeoutMS: 45000,
      maxPoolSize: 10,
    });
  }

  try {
    await globalMongoose.promise;
    globalMongoose.connection = mongoose.connection;
    return globalMongoose.connection;
  } catch (err) {
    globalMongoose.promise = null;
    globalMongoose.connection = null;
    globalMongoose.lastError = err.message;

    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect().catch(() => {});
    }

    console.error('MongoDB connection failed:', err.message);

    if (process.env.NODE_ENV === 'production') {
      throw err;
    }

    usingDevStore = true;
    console.log('Using local JSON dev database fallback.');
    return null;
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
      msg: 'Database unavailable. Verify your environment variables and MongoDB Atlas network access.',
      detail: process.env.NODE_ENV === 'production' ? undefined : err.message,
    });
  }
};

connectDB.isUsingDevStore = () => usingDevStore;

connectDB.getStatus = () => ({
  readyState: mongoose.connection.readyState,
  state: getReadyStateLabel(),
  usingDevStore,
  hasMongoUri: Boolean(normalizeMongoUri(process.env.MONGO_URI || process.env.MONGODB_URI)),
  lastError: globalMongoose.lastError,
});

module.exports = connectDB;
