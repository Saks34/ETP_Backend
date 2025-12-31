const express = require('express');
const { createBatch, listBatches, getBatch, updateBatch, deleteBatch } = require('./batch.controller');
const { auth, requireRoles } = require('../auth/auth.middleware');

const router = express.Router();

// List all batches for institution
router.get(
    '/',
    auth,
    requireRoles('InstitutionAdmin', 'AcademicAdmin', 'Teacher', 'Student', 'SuperAdmin'),
    listBatches
);

// Get single batch
router.get(
    '/:id',
    auth,
    requireRoles('InstitutionAdmin', 'AcademicAdmin', 'Teacher', 'Student', 'SuperAdmin'),
    getBatch
);

// Create batch
router.post(
    '/',
    auth,
    requireRoles('InstitutionAdmin', 'AcademicAdmin', 'SuperAdmin'),
    createBatch
);

// Update batch
router.patch(
    '/:id',
    auth,
    requireRoles('InstitutionAdmin', 'AcademicAdmin', 'SuperAdmin'),
    updateBatch
);

// Delete batch
router.delete(
    '/:id',
    auth,
    requireRoles('InstitutionAdmin', 'AcademicAdmin', 'SuperAdmin'),
    deleteBatch
);

module.exports = router;
