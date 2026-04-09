const mongoose = require('mongoose');

let isConnected = false;

const connectDB = async () => {
  const { url, options, dbName } = require('../src/config/env').mongoose;
  
  if (!url) {
    throw new Error('MONGODB_URI is not set');
  }

  if (isConnected) return mongoose.connection;

  mongoose.connection.on('connected', () => {
    isConnected = true;
    console.log('✅ MongoDB connected');
  });

  mongoose.connection.on('error', (err) => {
    console.error('❌ MongoDB connection error:', err);
  });

  const isProd = (process.env.NODE_ENV || 'development') === 'production';

  await mongoose.connect(url, {
    ...options,
    dbName,
    autoIndex: !isProd,
    connectTimeoutMS: 10000,
    socketTimeoutMS: 45000,
    family: 4, // Force IPv4 to avoid resolution timeouts on some networks
  });

  return mongoose.connection;
};

const closeDB = async () => {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.connection.close();
  }
};

module.exports = { connectDB, closeDB };
