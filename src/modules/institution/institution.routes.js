const express = require('express');
const { registerInstitution, addStaff, updateUserRole, bulkAddStaff, downloadBulkExport, listStaff, deleteStaff, updateStaff, getInstitutionDashboard } = require('./institution.controller');
const { auth, requireRoles } = require('../auth/auth.middleware');

const router = express.Router();

/**
 * @swagger
 * /api/v1/institution/dashboard:
 *   get:
 *     summary: Get high-level institution dashboard stats
 *     tags: [Institution]
 */
router.get(
  '/dashboard',
  auth,
  requireRoles('InstitutionAdmin', 'AcademicAdmin', 'SuperAdmin'),
  getInstitutionDashboard
);

// Public registration of an institution (bootstraps an InstitutionAdmin)
router.post('/register', registerInstitution);

// List staff within an institution (InstitutionAdmin, AcademicAdmin, SuperAdmin)
router.get(
  '/staff',
  auth,
  requireRoles('InstitutionAdmin', 'AcademicAdmin', 'SuperAdmin'),
  listStaff
);

// Add staff within an institution (InstitutionAdmin, AcademicAdmin, SuperAdmin)
router.post(
  '/staff',
  auth,
  requireRoles('InstitutionAdmin', 'AcademicAdmin', 'SuperAdmin'),
  addStaff
);

// Update a user's role within the same institution (InstitutionAdmin, AcademicAdmin, SuperAdmin)
router.patch(
  '/staff/:userId/role',
  auth,
  requireRoles('InstitutionAdmin', 'AcademicAdmin', 'SuperAdmin'),
  updateUserRole
);

// Update staff details within an institution (InstitutionAdmin, AcademicAdmin, SuperAdmin)
router.patch(
  '/staff/:userId',
  auth,
  requireRoles('InstitutionAdmin', 'AcademicAdmin', 'SuperAdmin'),
  updateStaff
);

// Delete staff within an institution (InstitutionAdmin, AcademicAdmin, SuperAdmin)
router.delete(
  '/staff/:userId',
  auth,
  requireRoles('InstitutionAdmin', 'AcademicAdmin', 'SuperAdmin'),
  deleteStaff
);

// Bulk add staff (InstitutionAdmin only)
router.post(
  '/bulk-staff',
  auth,
  requireRoles('InstitutionAdmin'),
  bulkAddStaff
);

// One-time CSV export for the last bulk create (InstitutionAdmin only)
router.get(
  '/bulk-staff/export',
  auth,
  requireRoles('InstitutionAdmin'),
  downloadBulkExport
);

module.exports = router;
