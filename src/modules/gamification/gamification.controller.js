const catchAsync = require('../../utils/catchAsync');
const sendResponse = require('../../utils/response');
const AppError = require('../../utils/AppError');
const { User } = require('../auth/user.model');
const { WatchHistory } = require('../watchHistory/watchHistory.model');
const { Timetable } = require('../timetable/timetable.model');
const { LiveClass } = require('../liveClass/liveclass.model');
const { redis } = require('../../config/redis');

/**
 * Get current student's points and badges
 * GET /api/v1/students/me/points
 */
const getStudentPoints = catchAsync(async (req, res, next) => {
  const userId = req.user.sub || req.user.id;
  const user = await User.findById(userId).select('learningPoints badges stats');

  if (!user) {
    return next(new AppError('User not found', 404));
  }

  return sendResponse(res, 200, {
    learningPoints: user.learningPoints,
    badges: user.badges,
    stats: user.stats
  });
});

/**
 * Get detailed student progress report
 * GET /api/v1/students/me/progress
 */
const getStudentProgress = catchAsync(async (req, res, next) => {
  const userId = req.user.sub || req.user.id;
  const user = await User.findById(userId).lean();
  if (!user) return next(new AppError('User not found', 404));

  // 1. Live Class Attendance
  const batchScheduleIds = await Timetable.find({ batchId: user.batchId }).distinct('_id');
  const totalClassesReleased = await LiveClass.countDocuments({ timetableId: { $in: batchScheduleIds } });
  const classesAttended = user.stats?.classCount || 0;

  // 2. VOD metrics
  const completedVods = await WatchHistory.countDocuments({ userId, isCompleted: true });
  const totalVodsAvailable = await LiveClass.countDocuments({ 
    timetableId: { $in: batchScheduleIds },
    'recordings.0': { $exists: true } 
  });

  // 3. Poll Metrics
  const pollsAnswered = user.stats?.pollCount || 0;

  return sendResponse(res, 200, {
    summary: {
      points: user.learningPoints || 0,
      badgeCount: user.badges?.length || 0,
    },
    performance: {
      liveAttendancePercentage: totalClassesReleased > 0 ? Math.round((classesAttended / totalClassesReleased) * 100) : 0,
      vodCompletionPercentage: totalVodsAvailable > 0 ? Math.round((completedVods / totalVodsAvailable) * 100) : 0,
      pollParticipationRate: classesAttended > 0 ? Math.round((pollsAnswered / classesAttended) * 100) : 0
    },
    raw: {
      classesAttended,
      totalClassesReleased,
      completedVods,
      totalVodsAvailable,
      pollsAnswered
    }
  });
});

/**
 * Get batch leader board
 * GET /api/v1/batches/:id/leaderboard
 */
const getBatchLeaderboard = catchAsync(async (req, res, next) => {
  const { id: batchId } = req.params;
  const lbKey = `leaderboard:batch:${batchId}`;

  // Get top 10 from Redis sorted set
  const topIds = await redis.zrevrange(lbKey, 0, 9, 'WITHSCORES');
  
  if (topIds.length === 0) {
    return sendResponse(res, 200, [], 'Empty leaderboard');
  }

  // Format: [id1, score1, id2, score2, ...]
  const userIds = [];
  const scoresMap = {};
  for (let i = 0; i < topIds.length; i += 2) {
    const userId = topIds[i];
    userIds.push(userId);
    scoresMap[userId] = parseInt(topIds[i + 1], 10);
  }

  // Single query for all users
  const users = await User.find({ _id: { $in: userIds } }).select('name role');

  // Map results back to maintain Redis order
  const results = userIds.map(id => {
    const user = users.find(u => String(u._id) === id);
    if (!user) return null;
    return {
      userId: id,
      name: user.name,
      role: user.role,
      points: scoresMap[id]
    };
  }).filter(Boolean);

  return sendResponse(res, 200, results);
});

module.exports = { getStudentPoints, getBatchLeaderboard, getStudentProgress };
