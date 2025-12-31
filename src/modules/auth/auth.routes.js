const express = require('express');
const { register, login, refresh, changePassword } = require('./auth.controller');
const { auth, requireRoles } = require('./auth.middleware');

const router = express.Router();

// Public routes
router.post('/register', register);
router.post('/login', login);
router.post('/refresh', refresh);
router.post('/change-password', auth, changePassword);

// Example protected route (can be removed or adjusted later)
router.get('/me', auth, (req, res) => {
  res.status(200).json({ user: req.user });
});

// Example role-protected route
router.get('/admin-only', auth, requireRoles('SuperAdmin', 'InstitutionAdmin', 'AcademicAdmin', 'Moderator'), (req, res) => {
  res.status(200).json({ message: 'Admin access granted' });
});

module.exports = router;
