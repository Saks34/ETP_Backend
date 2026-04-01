const { WatchHistory } = require('./watchHistory.model');
const { redis } = require('../../config/redis');
const { logger } = require('../../utils/logger');
const catchAsync = require('../../utils/catchAsync');
const AppError = require('../../utils/AppError');
const { POINTS, VOD_COMPLETION_THRESHOLD } = require('../../config/constants');
const { awardPoints } = require('../../utils/gamification.service');

const updateWatchHistory = catchAsync(async (req, res, next) => {
  const { liveClassId, videoId, lastPosition, totalDuration } = req.body;
  const userId = req.user.sub || req.user.id;

  if (!liveClassId || !videoId) {
    return next(new AppError('liveClassId and videoId are required', 400));
  }

  // Redis Priority 5: Quick progress update (Hash per user:recording)
  const progressKey = `progress:${userId}:${videoId}`;
  await redis.set(progressKey, lastPosition || 0, 'EX', 86400); // 24h

  // Redis Priority 6: Update history sorted set
  const historyKey = `history:${userId}`;
  await redis.zadd(historyKey, Date.now(), videoId);
  await redis.zremrangebyrank(historyKey, 0, -51); // Keep last 50

  // MongoDB: Persistent store
  const existing = await WatchHistory.findOne({ userId, liveClassId });
  const wasAlreadyCompleted = existing?.isCompleted || false;

  // FIX 1: Server-side check for completion
  let isCompleted = wasAlreadyCompleted;
  if (!wasAlreadyCompleted && totalDuration > 0 && lastPosition) {
    if (lastPosition / totalDuration >= VOD_COMPLETION_THRESHOLD) {
      isCompleted = true;
    }
  }

  const doc = await WatchHistory.findOneAndUpdate(
    { userId, liveClassId },
    {
      videoId,
      lastPosition: lastPosition || 0,
      isCompleted,
      totalDuration: totalDuration || 0
    },
    { upsert: true, new: true }
  );

  // Award Points for VOD completion if triggered server-side
  if (isCompleted && !wasAlreadyCompleted) {
    await awardPoints(userId, POINTS.VOD_COMPLETION, 'vod_completion');
  }

  return res.status(200).json(doc);
});

const getWatchHistory = catchAsync(async (req, res, next) => {
  const { liveClassId } = req.params;
  const userId = req.user.sub || req.user.id;

  const doc = await WatchHistory.findOne({ userId, liveClassId }).lean();
  return res.status(200).json(doc || { lastPosition: 0, isCompleted: false });
});

const getUserWatchHistory = catchAsync(async (req, res, next) => {
  const userId = req.user.sub || req.user.id;
  
  const docs = await WatchHistory.find({ userId })
    .sort({ updatedAt: -1 })
    .populate({
      path: 'liveClassId',
      populate: { path: 'timetableId' }
    })
    .limit(50)
    .lean();
    
  return res.status(200).json(docs);
});

module.exports = { updateWatchHistory, getWatchHistory, getUserWatchHistory };
