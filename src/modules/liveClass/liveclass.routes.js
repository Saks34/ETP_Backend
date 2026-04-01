const express = require('express');
const { scheduleLiveClass, getTeacherStreamKey, getJoinLink, getLiveClass, getOrCreateByTimetable, endLiveClass, checkStreamStatus, updateModeration, getModeration, updateAnalytics, updateClassDetails, getLiveClassQuestions, getBatchRecordings, getLiveClassSummary, retrySummary } = require('./liveclass.controller');
const { auth, requireRoles, institutionGuard } = require('../auth/auth.middleware');
const { validate, liveClassValidation } = require('../../middleware/validator');

const router = express.Router();

// Apply institutionGuard to all routes in this router
router.use(auth, institutionGuard);

// Teacher: View/Copy stream key (read-only)
router.get(
  '/:id/stream-key',
  requireRoles('Teacher', 'InstitutionAdmin', 'AcademicAdmin', 'SuperAdmin'),
  getTeacherStreamKey
);

// Student/Moderator: Get join live stream link
router.get(
  '/:id/join',
  requireRoles('Student', 'Moderator', 'Teacher', 'InstitutionAdmin', 'AcademicAdmin', 'SuperAdmin'),
  getJoinLink
);

// Batch: Get all recordings for a specific batch
router.get(
  '/batch/:batchId/recordings',
  requireRoles('Student', 'Teacher', 'Moderator', 'InstitutionAdmin', 'AcademicAdmin', 'SuperAdmin'),
  getBatchRecordings
);

// Get Live Class by Timetable ID (Get or Create) - Teacher/Admin
router.get(
  '/by-timetable/:timetableId',
  requireRoles('Teacher', 'Moderator', 'InstitutionAdmin', 'AcademicAdmin', 'SuperAdmin'),
  getOrCreateByTimetable
);

// Get specific Live Class (standard fetch)
router.get(
  '/:id',
  requireRoles('Teacher', 'Moderator', 'Student', 'InstitutionAdmin', 'AcademicAdmin', 'SuperAdmin'),
  getLiveClass
);

// Get Live Class Q&A
router.get(
  '/:id/questions',
  requireRoles('Teacher', 'Moderator', 'Student', 'InstitutionAdmin', 'AcademicAdmin', 'SuperAdmin'),
  getLiveClassQuestions
);

// Schedule a YouTube live stream for a LiveClass (platform-owned channel)
router.post(
  '/:id/schedule',
  requireRoles('SuperAdmin', 'InstitutionAdmin', 'AcademicAdmin', 'Teacher'),
  validate(liveClassValidation.schedule),
  scheduleLiveClass
);

// End a YouTube live stream
router.post(
  '/:id/end',
  requireRoles('SuperAdmin', 'InstitutionAdmin', 'AcademicAdmin', 'Teacher'),
  endLiveClass
);

// Check stream status (polls YouTube API)
router.get(
  '/:id/status',
  requireRoles('Teacher', 'InstitutionAdmin', 'AcademicAdmin', 'SuperAdmin'),
  checkStreamStatus
);

// Studio: Update Moderation Settings
router.patch(
  '/:id/moderation',
  requireRoles('Teacher', 'InstitutionAdmin', 'AcademicAdmin', 'SuperAdmin'),
  validate(liveClassValidation.moderation),
  updateModeration
);

// Studio: Get Moderation Settings
router.get(
  '/:id/moderation',
  requireRoles('Teacher', 'InstitutionAdmin', 'AcademicAdmin', 'SuperAdmin'),
  getModeration
);

// Studio: Update Analytics (Snapshot)
router.patch(
  '/:id/analytics',
  requireRoles('Teacher', 'InstitutionAdmin', 'AcademicAdmin', 'SuperAdmin'),
  updateAnalytics
);

// Studio: Update Class Details (Title, etc.)
router.patch(
  '/:id/details',
  requireRoles('Teacher', 'InstitutionAdmin', 'AcademicAdmin', 'SuperAdmin'),
  validate(liveClassValidation.details),
  updateClassDetails
);

router.get(
  '/:id/summary',
  requireRoles('Student', 'Teacher', 'Moderator', 'InstitutionAdmin', 'AcademicAdmin', 'SuperAdmin'),
  getLiveClassSummary
);

router.post(
  '/:id/summary/retry',
  requireRoles('Teacher', 'InstitutionAdmin', 'AcademicAdmin', 'SuperAdmin'),
  retrySummary
);

module.exports = router;
