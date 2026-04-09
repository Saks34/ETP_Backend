const { connectDB } = require('../../config/db');
const { connectMongo } = require('../database/mongo');

const dbMiddleware = async (req, res, next) => {
  try {
    // Both functions handle internal state to avoid re-connecting if already connected
    await connectDB();
    await connectMongo();
    next();
  } catch (err) {
    console.error('Database connection middleware error:', err);
    res.status(503).json({
      status: 'error',
      message: 'Database connection failed. Please try again later.'
    });
  }
};

module.exports = dbMiddleware;
