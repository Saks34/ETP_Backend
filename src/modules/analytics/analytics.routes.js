const express = require('express');
const router = express.Router();
const { auth, requireRoles } = require('../auth/auth.middleware');
const { getLiveClassAnalytics, getTeacherStats, getAdminStats } = require('./analytics.controller');

router.get('/live-class/:id', auth, getLiveClassAnalytics);
router.get('/teacher', auth, requireRoles('Teacher'), getTeacherStats);
router.get('/admin', auth, requireRoles('InstitutionAdmin', 'AcademicAdmin', 'SuperAdmin'), getAdminStats);

module.exports = router;
