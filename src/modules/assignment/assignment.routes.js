const express = require('express');
const {
  createAssignment,
  getBatchAssignments,
  submitAssignment,
  getAssignmentSubmissions,
  getMySubmissions,
  deleteAssignment,
  gradeSubmission
} = require('./assignment.controller');
const { auth, requireRoles, institutionGuard } = require('../auth/auth.middleware');

const router = express.Router();

router.use(auth, institutionGuard);

// Create an assignment
router.post(
  '/',
  requireRoles('Teacher', 'InstitutionAdmin', 'AcademicAdmin', 'SuperAdmin'),
  createAssignment
);

// Get assignments for a batch
router.get(
  '/batch/:batchId',
  requireRoles('Teacher', 'Student', 'InstitutionAdmin', 'AcademicAdmin', 'SuperAdmin'),
  getBatchAssignments
);

// Student submits an assignment
router.post(
  '/:id/submit',
  requireRoles('Student'),
  submitAssignment
);

// Get a student's submissions for a batch
router.get(
  '/batch/:batchId/my-submissions',
  requireRoles('Student'),
  getMySubmissions
);

// Admins/Teachers get all submissions for an assignment
router.get(
  '/:id/submissions',
  requireRoles('Teacher', 'InstitutionAdmin', 'AcademicAdmin', 'SuperAdmin'),
  getAssignmentSubmissions
);

// Delete an assignment
router.delete(
  '/:id',
  requireRoles('Teacher', 'InstitutionAdmin', 'AcademicAdmin', 'SuperAdmin'),
  deleteAssignment
);

// Grade a submission
router.patch(
  '/submissions/:id/grade',
  requireRoles('Teacher', 'InstitutionAdmin', 'AcademicAdmin', 'SuperAdmin'),
  gradeSubmission
);

module.exports = router;
