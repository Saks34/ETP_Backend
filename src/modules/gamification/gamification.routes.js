const express = require('express');
const { auth, requireRoles } = require('../auth/auth.middleware');
const { getStudentPoints, getBatchLeaderboard, getStudentProgress } = require('./gamification.controller');
const { validateZod } = require('../../middleware/zodValidator');
const { z } = require('zod');

const router = express.Router();

/**
 * @swagger
 * /api/v1/gamification/me/points:
 *   get:
 *     summary: Get my points and badges
 *     tags: [Gamification]
 */
router.get('/me/points', auth, requireRoles('Student'), getStudentPoints);

/**
 * @swagger
 * /api/v1/gamification/me/progress:
 *   get:
 *     summary: Get detailed student progress report
 *     tags: [Gamification]
 */
router.get('/me/progress', auth, requireRoles('Student'), getStudentProgress);

/**
 * @swagger
 * /api/v1/gamification/{id}/leaderboard:
 *   get:
 *     summary: Get batch leaderboard
 *     tags: [Gamification]
 */
router.get('/:id/leaderboard', auth, validateZod(z.object({ params: z.object({ id: z.string().min(1) }) })), getBatchLeaderboard);

module.exports = router;
