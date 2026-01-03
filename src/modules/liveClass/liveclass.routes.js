const express = require('express');
const { scheduleLiveClass, getTeacherStreamKey, getJoinLink, getLiveClass, getOrCreateByTimetable, endLiveClass, checkStreamStatus, updateModeration, getModeration, updateAnalytics } = require('./liveclass.controller');
const { auth, requireRoles } = require('../auth/auth.middleware');

const router = express.Router();

// Teacher: View/Copy stream key (read-only)
router.get(
  '/:id/stream-key',
  auth,
  requireRoles('Teacher', 'InstitutionAdmin', 'AcademicAdmin', 'SuperAdmin'),
  getTeacherStreamKey
);

// Student: Get join live stream link
router.get(
  '/:id/join',
  auth,
  requireRoles('Student', 'Teacher', 'InstitutionAdmin', 'AcademicAdmin', 'SuperAdmin'),
  getJoinLink
);

// Get Live Class by Timetable ID (Get or Create) - Teacher/Admin
router.get(
  '/by-timetable/:timetableId',
  auth,
  requireRoles('Teacher', 'InstitutionAdmin', 'AcademicAdmin', 'SuperAdmin'),
  getOrCreateByTimetable
);

// Get specific Live Class (standard fetch)
router.get(
  '/:id',
  auth,
  requireRoles('Teacher', 'Student', 'InstitutionAdmin', 'AcademicAdmin', 'SuperAdmin'),
  getLiveClass
);

// Schedule a YouTube live stream for a LiveClass (platform-owned channel)
router.post(
  '/:id/schedule',
  auth,
  requireRoles('SuperAdmin', 'InstitutionAdmin', 'AcademicAdmin', 'Teacher'),
  scheduleLiveClass
);

// End a YouTube live stream
router.post(
  '/:id/end',
  auth,
  requireRoles('SuperAdmin', 'InstitutionAdmin', 'AcademicAdmin', 'Teacher'),
  endLiveClass
);

// Check stream status (polls YouTube API)
router.get(
  '/:id/status',
  auth,
  requireRoles('Teacher', 'InstitutionAdmin', 'AcademicAdmin', 'SuperAdmin'),
  checkStreamStatus
);

// Studio: Update Moderation Settings
router.patch(
  '/:id/moderation',
  auth,
  requireRoles('Teacher', 'InstitutionAdmin', 'AcademicAdmin', 'SuperAdmin'),
  updateModeration
);

// Studio: Get Moderation Settings
router.get(
  '/:id/moderation',
  auth,
  requireRoles('Teacher', 'InstitutionAdmin', 'AcademicAdmin', 'SuperAdmin'),
  getModeration
);

// Studio: Update Analytics (Snapshot)
router.patch(
  '/:id/analytics',
  auth,
  requireRoles('Teacher', 'InstitutionAdmin', 'AcademicAdmin', 'SuperAdmin'),
  updateAnalytics
);

// Studio: Update Class Details (Title, etc.)
router.patch(
  '/:id/details',
  auth,
  requireRoles('Teacher', 'InstitutionAdmin', 'AcademicAdmin', 'SuperAdmin'),
  require('./liveclass.controller').updateClassDetails
);

module.exports = router;
