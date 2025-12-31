const express = require('express');
const { registerInstitution, addStaff, updateUserRole, bulkAddStaff, downloadBulkExport, listStaff } = require('./institution.controller');
const { auth, requireRoles } = require('../auth/auth.middleware');

const router = express.Router();

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
