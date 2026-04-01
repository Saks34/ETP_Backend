const express = require('express');
const { updateWatchHistory, getWatchHistory, getUserWatchHistory } = require('./watchHistory.controller');
const { auth, institutionGuard } = require('../auth/auth.middleware');
const { vodUpdateLimiter } = require('../../middleware/rateLimiter');

const router = express.Router();

// All require authentication & institution scoping
router.post('/update', auth, institutionGuard, vodUpdateLimiter, updateWatchHistory);
router.get('/me', auth, institutionGuard, getUserWatchHistory);
router.get('/:liveClassId', auth, institutionGuard, getWatchHistory);

module.exports = router;
