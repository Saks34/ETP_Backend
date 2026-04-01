const express = require('express');
const { getNotifications, markAsRead, markAllAsRead, deleteNotification } = require('./notification.controller');
const { auth } = require('../auth/auth.middleware');

const router = express.Router();

router.get('/', auth, getNotifications);
router.patch('/read-all', auth, markAllAsRead);
router.patch('/:id/read', auth, markAsRead);
router.delete('/:id', auth, deleteNotification);

module.exports = router;
