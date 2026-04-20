const mongoose = require('mongoose');

const connectDB = async () => {
  const atlasUri = process.env.MONGO_URI;

  // Try Atlas first
  if (atlasUri) {
    try {
      await mongoose.connect(atlasUri, {
        serverSelectionTimeoutMS: 5000,
        connectTimeoutMS: 5000,
      });
      console.log('MongoDB connected (Atlas)');
      return;
    } catch (err) {
      console.warn('Atlas connection failed:', err.message);
      console.log('Falling back to in-memory MongoDB...');
    }
  }

  // Fallback: in-memory MongoDB via mongodb-memory-server
  try {
    const { MongoMemoryServer } = require('mongodb-memory-server');
    const mongod = await MongoMemoryServer.create();
    const memUri = mongod.getUri();
    await mongoose.connect(memUri);
    console.log('MongoDB connected (in-memory fallback)');
    console.log('⚠  Data will not persist across server restarts.');
  } catch (memErr) {
    console.error('In-memory MongoDB also failed:', memErr.message);
    console.log('Server will continue running. API calls requiring DB will fail.');
  }
};

module.exports = connectDB;
