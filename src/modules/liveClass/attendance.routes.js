const express = require('express');
const { getAttendance } = require('./attendance.controller');
const { auth, requireRoles, institutionGuard } = require('../auth/auth.middleware');

const router = express.Router();

router.use(auth, institutionGuard);

// Get attendance for a live class (real-time or finalized)
router.get(
  '/:classId',
  requireRoles('Teacher', 'InstitutionAdmin', 'SuperAdmin', 'AcademicAdmin'),
  getAttendance
);

module.exports = router;
