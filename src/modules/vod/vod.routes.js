const express = require('express');
const { updateProgress, getProgress, getHistory } = require('./vod.controller');
const { auth, institutionGuard } = require('../auth/auth.middleware');

const router = express.Router();

// All require authentication & institution scoping
router.post('/progress', auth, institutionGuard, updateProgress);
router.get('/progress/:recordingId', auth, institutionGuard, getProgress);
router.get('/history', auth, institutionGuard, getHistory);

module.exports = router;
