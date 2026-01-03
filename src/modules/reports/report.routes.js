const express = require('express');
const router = express.Router();
const { auth, requireRoles } = require('../auth/auth.middleware');
const {
    submitReport,
    getAllReports,
    getMyReports,
    resolveReport
} = require('./report.controller');

// Submit a report (Student, Moderator, Teacher)
router.post(
    '/',
    auth,
    requireRoles('Student', 'Moderator', 'Teacher', 'InstitutionAdmin', 'AcademicAdmin', 'SuperAdmin'),
    submitReport
);

// Get my reports (Student, Moderator, Teacher)
router.get(
    '/',
    auth,
    requireRoles('Student', 'Moderator', 'Teacher', 'InstitutionAdmin', 'AcademicAdmin', 'SuperAdmin'),
    getMyReports
);

// Get all reports - Admin only
router.get(
    '/admin',
    auth,
    requireRoles('InstitutionAdmin', 'AcademicAdmin', 'SuperAdmin'),
    getAllReports
);

// Resolve/update a report - Admin only
router.patch(
    '/:id',
    auth,
    requireRoles('InstitutionAdmin', 'AcademicAdmin', 'SuperAdmin'),
    resolveReport
);

module.exports = router;
