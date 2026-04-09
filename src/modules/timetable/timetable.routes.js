const express = require('express');
const { createSlot, updateSlot, deleteSlot, listAll, listByTeacher, listByBatch } = require('./timetable.controller');
const { auth, requireRoles } = require('../auth/auth.middleware');
const { validate, timetableValidation } = require('../../middleware/validator');

const router = express.Router();

// Read timetable
// List all slots (admins only) with optional date filter
router.get(
  '/',
  auth,
  requireRoles('InstitutionAdmin', 'AcademicAdmin', 'SuperAdmin'),
  listAll
);

// List by teacher (teachers can only see their own; admins can query any teacher)
router.get(
  '/by-teacher',
  auth,
  listByTeacher
);

// List by batch (students restricted to provided batch; admins can query any batch)
router.get(
  '/by-batch',
  auth,
  listByBatch
);

// Create timetable slot (institution-scoped)
router.post(
  '/',
  auth,
  requireRoles('InstitutionAdmin', 'AcademicAdmin', 'SuperAdmin'),
  validate(timetableValidation.create),
  createSlot
);

// Update timetable slot (institution-scoped)
router.patch(
  '/:id',
  auth,
  requireRoles('InstitutionAdmin', 'AcademicAdmin', 'SuperAdmin'),
  validate(timetableValidation.create), // Using create rules as a baseline for patch
  updateSlot
);

// Delete timetable slot (institution-scoped)
router.delete(
  '/:id',
  auth,
  requireRoles('InstitutionAdmin', 'AcademicAdmin', 'SuperAdmin'),
  deleteSlot
);

// Bulk add timetable slots
router.post(
  '/bulk',
  auth,
  requireRoles('InstitutionAdmin', 'AcademicAdmin', 'SuperAdmin'),
  require('./timetable.controller').bulkAddTimetable
);

// Download timetable sample
router.get(
  '/sample',
  auth,
  requireRoles('InstitutionAdmin', 'AcademicAdmin', 'SuperAdmin'),
  require('./timetable.controller').downloadTimetableSample
);

module.exports = router;
