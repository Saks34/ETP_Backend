const mongoose = require('mongoose');
const dns = require('dns');

// Force use of Google DNS to resolve MongoDB SRV records if default DNS fails
try {
  dns.setServers(['8.8.8.8', '8.8.4.4']);
} catch (e) {
  console.warn('Could not set DNS servers, using system defaults.');
}

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
  });

  return mongoose.connection;
};

const closeDB = async () => {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.connection.close();
  }
};

module.exports = { connectDB, closeDB };
