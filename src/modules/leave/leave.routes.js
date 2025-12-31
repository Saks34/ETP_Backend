const express = require('express');
const { applyLeave } = require('./leave.controller');
const { auth, requireRoles } = require('../auth/auth.middleware');

const router = express.Router();

// Apply leave (Teachers can apply for themselves; Admins can apply for teachers in their institution)
router.post(
  '/',
  auth,
  requireRoles('Teacher', 'InstitutionAdmin', 'AcademicAdmin', 'SuperAdmin'),
  applyLeave
);

module.exports = router;
