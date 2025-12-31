const express = require('express');
const { createSlot, updateSlot, deleteSlot, listAll, listByTeacher, listByBatch } = require('./timetable.controller');
const { auth, requireRoles } = require('../auth/auth.middleware');

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
  createSlot
);

// Update timetable slot (institution-scoped)
router.patch(
  '/:id',
  auth,
  requireRoles('InstitutionAdmin', 'AcademicAdmin', 'SuperAdmin'),
  updateSlot
);

// Delete timetable slot (institution-scoped)
router.delete(
  '/:id',
  auth,
  requireRoles('InstitutionAdmin', 'AcademicAdmin', 'SuperAdmin'),
  deleteSlot
);

module.exports = router;
