const express = require('express');
const { createBatch, listBatches, getBatch, updateBatch, deleteBatch, assignStudentsToBatch, getBatchAnalytics } = require('./batch.controller');
const { auth, requireRoles, institutionGuard } = require('../auth/auth.middleware');
const { validate, batchValidation } = require('../../middleware/validator');

const router = express.Router();

// List all batches for institution
router.get(
    '/',
    auth,
    institutionGuard,
    requireRoles('InstitutionAdmin', 'AcademicAdmin', 'Teacher', 'Student', 'SuperAdmin'),
    listBatches
);

// Get single batch
router.get(
    '/:id',
    auth,
    institutionGuard,
    requireRoles('InstitutionAdmin', 'AcademicAdmin', 'Teacher', 'Student', 'SuperAdmin'),
    getBatch
);

// Create batch
router.post(
    '/',
    auth,
    institutionGuard,
    requireRoles('InstitutionAdmin', 'AcademicAdmin', 'SuperAdmin'),
    validate(batchValidation.create),
    createBatch
);

// Assign students to batch
router.post(
    '/:id/assign-students',
    auth,
    institutionGuard,
    requireRoles('InstitutionAdmin', 'AcademicAdmin', 'SuperAdmin'),
    validate(batchValidation.studentAssignment),
    assignStudentsToBatch
);

// Get batch analytics
router.get(
    '/:id/analytics',
    auth,
    institutionGuard,
    requireRoles('InstitutionAdmin', 'AcademicAdmin', 'Teacher', 'SuperAdmin'),
    getBatchAnalytics
);

// Update batch
router.patch(
    '/:id',
    auth,
    institutionGuard,
    requireRoles('InstitutionAdmin', 'AcademicAdmin', 'SuperAdmin'),
    updateBatch
);

// Delete batch
router.delete(
    '/:id',
    auth,
    institutionGuard,
    requireRoles('InstitutionAdmin', 'AcademicAdmin', 'SuperAdmin'),
    deleteBatch
);

module.exports = router;
