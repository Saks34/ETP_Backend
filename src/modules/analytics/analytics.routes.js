const express = require('express');
const router = express.Router();
const { auth, requireRoles } = require('../auth/auth.middleware');
const {
    getLiveClassAnalytics,
    getTeacherStats,
    getAdminStats,
    recordHeartbeat,
    getClassWatchTimeStats
} = require('./analytics.controller');

router.get('/live-class/:id', auth, getLiveClassAnalytics);
router.get('/teacher', auth, requireRoles('Teacher'), getTeacherStats);
router.get('/admin', auth, requireRoles('InstitutionAdmin', 'AcademicAdmin', 'SuperAdmin'), getAdminStats);

// Watch time analytics
router.post('/heartbeat', auth, requireRoles('Student'), recordHeartbeat);
router.get('/watch-time/:classId', auth, requireRoles('Teacher', 'InstitutionAdmin', 'AcademicAdmin', 'SuperAdmin'), getClassWatchTimeStats);

module.exports = router;
