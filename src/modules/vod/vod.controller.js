const catchAsync = require('../../utils/catchAsync');
const sendResponse = require('../../utils/response');
const AppError = require('../../utils/AppError');
const { LiveClass } = require('../liveClass/liveclass.model');
const { redis } = require('../../config/redis');

/**
 * Update VOD playback progress in Redis
 * Key: progress:<userId>:<recordingId>
 */
const updateProgress = catchAsync(async (req, res, next) => {
  const { recordingId, progress } = req.body;
  const userId = req.user.sub;

  if (!recordingId || progress === undefined) {
    return next(new AppError('recordingId and progress are required', 400));
  }

  const key = `progress:${userId}:${recordingId}`;
  await redis.set(key, progress, 'EX', 86400); // 24h TTL

  // Also add to history (Priority 6)
  const historyKey = `history:${userId}`;
  await redis.zadd(historyKey, Date.now(), recordingId);
  // Keep only last 50 items
  await redis.zremrangebyrank(historyKey, 0, -51);

  return sendResponse(res, 200, { ok: true });
});

/**
 * Get VOD playback progress from Redis
 */
const getProgress = catchAsync(async (req, res, next) => {
  const { recordingId } = req.params;
  const userId = req.user.sub;

  const key = `progress:${userId}:${recordingId}`;
  const progress = await redis.get(key);

  return sendResponse(res, 200, { progress: progress ? parseFloat(progress) : 0 });
});

/**
 * Get Watch History from Redis Sorted Set
 */
const getHistory = catchAsync(async (req, res, next) => {
  const userId = req.user.sub;
  const historyKey = `history:${userId}`;

  // Get recording IDs in reverse chronological order
  const recordingIds = await redis.zrevrange(historyKey, 0, 49);

  if (recordingIds.length === 0) {
    return sendResponse(res, 200, []);
  }

  // Fetch details for these recordings
  const historyData = await LiveClass.find({
    'recordings.youtubeVideoId': { $in: recordingIds }
  }).populate({
    path: 'timetableId',
    populate: { path: 'subject teacher' }
  });

  return sendResponse(res, 200, historyData);
});

module.exports = { updateProgress, getProgress, getHistory };
