const { LiveClass } = require('./liveclass.model');
const { Timetable } = require('../timetable/timetable.model');
const { getIO } = require('../../realtime/socket');
const { createLiveStream, createLiveBroadcast, bindBroadcastToStream, endLiveBroadcast, getStreamStatus: getYouTubeStreamStatus } = require('./youtube.service');
const { LiveClassQuestion } = require('./liveclassQuestion.model');
const { notificationQueue } = require('../../queues/notification.queue');
const catchAsync = require('../../utils/catchAsync');
const AppError = require('../../utils/AppError');
const sendResponse = require('../../utils/response');

const scheduleLiveClass = catchAsync(async (req, res, next) => {
  const { id } = req.params;
  const { title } = req.body || {};

  if (!id) return next(new AppError('liveClass id is required', 400));

  const live = await LiveClass.findById(id);
  if (!live) return next(new AppError('LiveClass not found', 404));

  if (req.user && req.user.role !== 'SuperAdmin') {
    if (!req.user.institutionId || String(req.user.institutionId) !== String(live.institutionId)) {
      return next(new AppError('Forbidden: cross-institution access', 403));
    }
  }

  if (live.streamInfo && live.streamInfo.broadcastId) {
    return sendResponse(res, 200, {
      id: live._id,
      status: live.status,
      streamInfo: {
        streamId: live.streamInfo.streamId,
        broadcastId: live.streamInfo.broadcastId,
        liveUrl: live.streamInfo.liveUrl,
        scheduledStartTime: live.streamInfo.scheduledStartTime,
        privacyStatus: live.streamInfo.privacyStatus,
      }
    }, 'Stream already exists');
  }

  const timetable = await Timetable.findById(live.timetableId);
  if (!timetable) return next(new AppError('Linked timetable not found', 404));

  const streamTitle = live.title || title || `${timetable.subject} - ${timetable.batch} - ${timetable.day} ${timetable.startTime}`;
  
  if (!live.title) {
    live.title = streamTitle;
    await live.save();
  }

  const scheduledStartTime = new Date();
  scheduledStartTime.setMinutes(scheduledStartTime.getMinutes() + 5);

  const stream = await createLiveStream({ title: streamTitle });
  const broadcast = await createLiveBroadcast({
    title: streamTitle,
    scheduledStartTime: scheduledStartTime.toISOString()
  });
  await bindBroadcastToStream({ broadcastId: broadcast.id, streamId: stream.id });

  live.streamInfo = {
    streamId: stream.id,
    broadcastId: broadcast.id,
    streamKey: stream?.cdn?.ingestionInfo?.streamName,
    liveUrl: broadcast?.id ? `https://www.youtube.com/watch?v=${broadcast.id}` : undefined,
    ingestionAddress: stream?.cdn?.ingestionInfo?.ingestionAddress,
    streamName: stream?.cdn?.ingestionInfo?.streamName,
    backupIngestionAddress: stream?.cdn?.ingestionInfo?.backupIngestionAddress,
    privacyStatus: broadcast?.status?.privacyStatus || 'unlisted',
    scheduledStartTime: broadcast?.snippet?.scheduledStartTime || scheduledStartTime.toISOString(),
  };

  await live.save();

  return sendResponse(res, 201, {
    id: live._id,
    status: live.status,
    streamInfo: {
      streamId: stream.id,
      broadcastId: broadcast.id,
      liveUrl: live.streamInfo.liveUrl,
      scheduledStartTime: live.streamInfo.scheduledStartTime,
      privacyStatus: live.streamInfo.privacyStatus,
    }
  }, 'Stream created successfully');
});

const getTeacherStreamKey = catchAsync(async (req, res, next) => {
  const { id } = req.params;

  const live = await LiveClass.findById(id);
  if (!live) return next(new AppError('LiveClass not found', 404));

  if (req.user && req.user.role !== 'SuperAdmin') {
    if (!req.user.institutionId || String(req.user.institutionId) !== String(live.institutionId)) {
      return next(new AppError('Forbidden: cross-institution access', 403));
    }
  }

  const timetable = await Timetable.findById(live.timetableId);
  if (!timetable) return next(new AppError('Linked timetable not found', 404));

  const isAssignedTeacher = req.user && req.user.role === 'Teacher' && String(timetable.teacher) === String(req.user.sub);
  const isAllowedAdmin = req.user && ['InstitutionAdmin', 'AcademicAdmin', 'SuperAdmin'].includes(req.user.role);

  if (!isAssignedTeacher && !isAllowedAdmin) {
    return next(new AppError('Not authorized to view stream key', 403));
  }

  const streamKey = live?.streamInfo?.streamKey || live?.streamInfo?.streamName;
  const ingestionAddress = live?.streamInfo?.ingestionAddress;

  if (!streamKey) {
    return next(new AppError('Stream key not available. Please create a stream first.', 404));
  }

  return sendResponse(res, 200, { streamKey, ingestionAddress });
});

const getJoinLink = catchAsync(async (req, res, next) => {
  const { id } = req.params;
  const live = await LiveClass.findById(id);
  if (!live) return next(new AppError('LiveClass not found', 404));

  if (req.user && req.user.role !== 'SuperAdmin') {
    if (!req.user.institutionId || String(req.user.institutionId) !== String(live.institutionId)) {
      return next(new AppError('Forbidden: cross-institution access', 403));
    }
  }

  const liveUrl = live?.streamInfo?.liveUrl || (live?.streamInfo?.broadcastId ? `https://www.youtube.com/watch?v=${live.streamInfo.broadcastId}` : undefined);
  if (!liveUrl) return next(new AppError('Join link not available', 404));

  return sendResponse(res, 200, { liveUrl });
});

const getLiveClass = catchAsync(async (req, res, next) => {
  const { id } = req.params;
  const live = await LiveClass.findById(id).populate({
    path: 'timetableId',
    populate: [
      { path: 'teacher' },
      { path: 'batch' }
    ]
  });

  if (!live) return next(new AppError('LiveClass not found', 404));

  if (req.user && req.user.role !== 'SuperAdmin') {
    if (!req.user.institutionId || String(req.user.institutionId) !== String(live.institutionId)) {
      return next(new AppError('Forbidden: cross-institution access', 403));
    }
  }

  const response = {
    _id: live._id,
    institutionId: live.institutionId,
    timetableId: live.timetableId?._id,
    status: live.status,
    streamInfo: live.streamInfo,
    subject: live.timetableId?.subject,
    batch: live.timetableId?.batch,
    teacher: live.timetableId?.teacher,
    startTime: live.timetableId?.startTime,
    endTime: live.timetableId?.endTime,
    youtubeUrl: live.streamInfo?.liveUrl,
    recordings: live.recordings || [],
    analytics: live.analytics || {},
    moderation: live.moderation || {}
  };

  return sendResponse(res, 200, response);
});

const getOrCreateByTimetable = catchAsync(async (req, res, next) => {
  const { timetableId } = req.params;
  const timetable = await Timetable.findById(timetableId);
  
  if (!timetable) return next(new AppError('Timetable not found', 404));

  if (req.user && req.user.role !== 'SuperAdmin') {
    if (!req.user.institutionId || String(req.user.institutionId) !== String(timetable.institutionId)) {
      return next(new AppError('Forbidden: cross-institution access', 403));
    }
  }

  let live = await LiveClass.findOne({ timetableId });

  if (!live) {
    live = await LiveClass.create({
      institutionId: timetable.institutionId,
      timetableId: timetable._id,
      status: 'Scheduled',
      streamInfo: {}
    });
  }

  const populated = await LiveClass.findById(live._id).populate('timetableId');

  const response = {
    _id: populated._id,
    institutionId: populated.institutionId,
    timetableId: populated.timetableId._id,
    status: populated.status,
    streamInfo: populated.streamInfo,
    subject: populated.timetableId.subject,
    batch: populated.timetableId.batch,
    startTime: populated.timetableId.startTime,
    endTime: populated.timetableId.endTime,
    teacher: populated.timetableId.teacher,
    batchId: populated.timetableId.batchId,
    subjectId: populated.timetableId.subjectId,
    analytics: populated.analytics || {},
    moderation: populated.moderation || {}
  };

  return sendResponse(res, 200, response);
});

const endLiveClass = catchAsync(async (req, res, next) => {
  const { id } = req.params;
  const live = await LiveClass.findById(id);
  if (!live) return next(new AppError('LiveClass not found', 404));

  if (req.user && req.user.role !== 'SuperAdmin') {
    if (!req.user.institutionId || String(req.user.institutionId) !== String(live.institutionId)) {
      return next(new AppError('Forbidden: cross-institution access', 403));
    }
  }

  if (live.status === 'Completed' || live.status === 'Cancelled') {
    return next(new AppError('Stream already ended', 400));
  }

  const broadcastId = live.streamInfo?.broadcastId;
  if (broadcastId) {
    try {
      await endLiveBroadcast(broadcastId);
    } catch (e) {
      // Log but don't fail, we still want to update our DB
      console.error('Failed to end YouTube broadcast:', e.message);
    }
  }

  live.status = 'Completed';
  live.actualEndTime = new Date();

  if (broadcastId) {
    live.recordings.push({
      youtubeVideoId: broadcastId,
      title: 'Recorded Class',
      url: `https://www.youtube.com/watch?v=${broadcastId}`,
      publishedAt: new Date()
    });
  }

  await live.save();

  const timetable = await Timetable.findById(live.timetableId);
  if (timetable) {
    await notificationQueue.add('recording:ready', {
      type: 'recording:ready',
      data: { sessionId: live._id }
    });

    if (broadcastId) {
      await notificationQueue.add('fetch:vod:metadata', {
        type: 'fetch:vod:metadata',
        data: { sessionId: live._id, youtubeId: broadcastId }
      });

      // FEATURE 1: AI Summarization
      await notificationQueue.add('summarize-class', {
        type: 'summarize-class',
        data: { liveClassId: live._id, broadcastId }
      }, {
        delay: 600000, // 10 minutes delay for YouTube processing
        attempts: 3,
        backoff: {
          type: 'fixed',
          delay: 600000 // 10 minutes between retries
        }
      });
    }

    // FEATURE 3: Automatic Attendance Processing
    await notificationQueue.add('process-attendance', {
      type: 'process-attendance',
      data: { liveClassId: live._id }
    });
  }

  try {
    const io = getIO();
    io.of('/live-classes').to(String(live._id)).emit('class-ended', {
      liveClassId: live._id,
      status: 'Completed'
    });
  } catch (e) {
    console.error('Socket emit error:', e);
  }

  return sendResponse(res, 200, { status: 'Completed' }, 'Stream ended successfully');
});

// 🔹 IMPROVEMENT 2: Check and update stream status from YouTube
const checkStreamStatus = catchAsync(async (req, res, next) => {
  const { id } = req.params;
  const live = await LiveClass.findById(id);
  if (!live) return next(new AppError('LiveClass not found', 404));

  // Scope check
  if (req.user && req.user.role !== 'SuperAdmin') {
    if (!req.user.institutionId || String(req.user.institutionId) !== String(live.institutionId)) {
      return next(new AppError('Forbidden', 403));
    }
  }

  const broadcastId = live.streamInfo?.broadcastId;
  if (!broadcastId) {
    return sendResponse(res, 200, {
      status: live.status,
      message: 'No broadcast created yet'
    });
  }

  // Poll YouTube API for current status
  const ytStatus = await getYouTubeStreamStatus(broadcastId);

  // Auto-update LiveClass status based on YouTube status
  if (ytStatus?.lifeCycleStatus === 'live' && live.status !== 'Live') {
    live.status = 'Live';
    if (!live.actualStartTime) live.actualStartTime = new Date();
    await live.save();

    // Emit socket event
    try {
      const io = getIO();
      io.of('/live-classes').to(String(live._id)).emit('class-live', {
        liveClassId: live._id,
        status: 'Live',
        streamInfo: live.streamInfo
      });
    } catch (e) {
      console.error('Socket emit error:', e);
    }

    // Notify Batch (Priority 3: Using BullMQ)
    const timetable = await Timetable.findById(live.timetableId);
    if (timetable) {
      await notificationQueue.add('session:live', {
        type: 'session:live',
        data: { sessionId: live._id }
      });
    }
  } else if (ytStatus?.lifeCycleStatus === 'complete' && live.status !== 'Completed') {
    live.status = 'Completed';
    live.actualEndTime = new Date();
    if (broadcastId) {
      live.recordings.push({
        youtubeVideoId: broadcastId,
        title: 'Recorded Class',
        url: `https://www.youtube.com/watch?v=${broadcastId}`,
        publishedAt: new Date()
      });
    }
    await live.save();
  }

  return sendResponse(res, 200, {
    status: live.status,
    youtubeStatus: ytStatus?.lifeCycleStatus,
    streamHealthStatus: ytStatus?.streamStatus,
    updated: true
  });
});

const updateModeration = catchAsync(async (req, res, next) => {
  const { id } = req.params;
  const { slowMode, subscribersOnly, blockLinks, blockedWords } = req.body || {};

  const live = await LiveClass.findById(id);
  if (!live) return next(new AppError('LiveClass not found', 404));

  // Scope check
  if (req.user && req.user.role !== 'SuperAdmin') {
    if (!req.user.institutionId || String(req.user.institutionId) !== String(live.institutionId)) {
      return next(new AppError('Forbidden', 403));
    }
  }

  if (slowMode !== undefined) live.moderation.slowMode = slowMode;
  if (subscribersOnly !== undefined) live.moderation.subscribersOnly = subscribersOnly;
  if (blockLinks !== undefined) live.moderation.blockLinks = blockLinks;
  if (blockedWords !== undefined) live.moderation.blockedWords = blockedWords;

  await live.save();
  return sendResponse(res, 200, live.moderation);
});

const getModeration = catchAsync(async (req, res, next) => {
  const { id } = req.params;

  const live = await LiveClass.findById(id);
  if (!live) return next(new AppError('LiveClass not found', 404));

  // Scope check
  if (req.user && req.user.role !== 'SuperAdmin') {
    if (!req.user.institutionId || String(req.user.institutionId) !== String(live.institutionId)) {
      return next(new AppError('Forbidden', 403));
    }
  }

  return sendResponse(res, 200, live.moderation || {});
});

const updateAnalytics = catchAsync(async (req, res, next) => {
  const { id } = req.params;
  const { peakViewers, totalViews, totalLikes, totalChatMessages } = req.body || {};

  const live = await LiveClass.findById(id);
  if (!live) return next(new AppError('LiveClass not found', 404));

  // Scope check
  if (req.user && req.user.role !== 'SuperAdmin') {
    if (!req.user.institutionId || String(req.user.institutionId) !== String(live.institutionId)) {
      return next(new AppError('Forbidden', 403));
    }
  }

  if (!live.analytics) live.analytics = {};
  if (peakViewers !== undefined) live.analytics.peakViewers = peakViewers;
  if (totalViews !== undefined) live.analytics.totalViews = totalViews;
  if (totalLikes !== undefined) live.analytics.totalLikes = totalLikes;
  if (totalChatMessages !== undefined) live.analytics.totalChatMessages = totalChatMessages;

  await live.save();
  return sendResponse(res, 200, live.analytics);
});

const updateClassDetails = catchAsync(async (req, res, next) => {
  const { id } = req.params;
  const { title } = req.body;

  const live = await LiveClass.findById(id);
  if (!live) return next(new AppError('LiveClass not found', 404));

  // Scope check
  if (req.user && req.user.role !== 'SuperAdmin') {
    if (!req.user.institutionId || String(req.user.institutionId) !== String(live.institutionId)) {
      return next(new AppError('Forbidden', 403));
    }
  }

  if (title) live.title = title;

  await live.save();
  return sendResponse(res, 200, { title: live.title }, 'Class details updated');
});

const getLiveClassQuestions = catchAsync(async (req, res, next) => {
  const { id } = req.params;
  const questions = await LiveClassQuestion.find({
    liveClassId: id,
    isDeleted: false
  }).sort({ ts: 1 });

  return sendResponse(res, 200, questions);
});

const getBatchRecordings = catchAsync(async (req, res, next) => {
  const { batchId } = req.params;
  const institutionId = req.user.institutionId;
  const { redis } = require('../../config/redis');

  const cacheKey = `vod:course:${batchId}:recordings`;
  const cachedData = await redis.get(cacheKey);

  if (cachedData) {
    return sendResponse(res, 200, JSON.parse(cachedData));
  }

  // Find all live classes for this batch that are completed and have recordings
  const completedClasses = await LiveClass.find({
    institutionId,
    status: 'Completed'
  })
    .populate({
      path: 'timetableId',
      match: { batch: batchId },
      populate: [
        { path: 'teacher', select: 'name' }
      ]
    })
    .sort({ actualEndTime: -1 })
    .lean();

  // Filter out those that didn't match the batchId in populate
  const batchRecordings = completedClasses.filter(c => c.timetableId && c.recordings?.length > 0);

  // Cache the result with a TTL of 5 minutes (FIX 8: Cache expensive aggregation)
  await redis.set(cacheKey, JSON.stringify(batchRecordings), 'EX', 300);

  return sendResponse(res, 200, batchRecordings);
});

const getLiveClassSummary = catchAsync(async (req, res, next) => {
  const { id } = req.params;
  const live = await LiveClass.findById(id).populate('timetableId');
  if (!live) return next(new AppError('LiveClass not found', 404));

  // Institution check
  if (req.user && req.user.role !== 'SuperAdmin') {
    const userInstitution = req.user.institutionId;
    if (!userInstitution || String(userInstitution) !== String(live.institutionId)) {
      return next(new AppError('Forbidden: cross-institution access', 403));
    }
  }

  // Enrollment check for students
  if (req.user.role === 'Student') {
    if (!live.timetableId || String(live.timetableId.batch) !== String(req.user.batchId)) {
      return next(new AppError('Forbidden: not enrolled in this batch', 403));
    }
  }

  if (live.summary && live.summary.status === 'completed') {
    return sendResponse(res, 200, live.summary);
  }

  return sendResponse(res, 200, { status: live.summary?.status || 'pending' });
});

// FIX 3: AI Summary Manual Re-trigger
const retrySummary = catchAsync(async (req, res, next) => {
  const { id } = req.params;
  const live = await LiveClass.findById(id).populate('timetableId');
  if (!live) return next(new AppError('LiveClass not found', 404));

  // Only accessible by the teacher who owns the class
  const isOwner = req.user.role === 'Teacher' && String(live.timetableId.teacher) === String(req.user.sub || req.user.id);
  const isAdmin = ['SuperAdmin', 'InstitutionAdmin', 'AcademicAdmin'].includes(req.user.role);
  
  if (!isOwner && !isAdmin) {
    return next(new AppError('Only the assigned teacher can retry the summary', 403));
  }

  // Checks if summary status is 'failed' before allowing retry
  if (live.summary && live.summary.status !== 'failed' && live.summary.status !== 'pending') {
    return next(new AppError(`Cannot retry: current status is ${live.summary.status}`, 400));
  }

  const broadcastId = live.streamInfo?.broadcastId;
  if (!broadcastId) {
    return next(new AppError('No broadcast ID found for this class', 400));
  }

  // Reset summary status to pending
  live.summary.status = 'pending';
  await live.save();

  // Re-adds the summarize-class BullMQ job with the original payload
  await notificationQueue.add('summarize-class', {
    type: 'summarize-class',
    data: { liveClassId: live._id, broadcastId }
  }, {
    attempts: 3,
    backoff: {
      type: 'fixed',
      delay: 600000 
    }
  });

  return sendResponse(res, 200, { status: 'pending' }, 'Summary retry initiated');
});

module.exports = {
  scheduleLiveClass,
  getTeacherStreamKey,
  getJoinLink,
  getLiveClass,
  getOrCreateByTimetable,
  endLiveClass,
  checkStreamStatus,
  updateModeration,
  getModeration,
  updateAnalytics,
  updateClassDetails,
  getLiveClassQuestions,
  getBatchRecordings,
  getLiveClassSummary,
  retrySummary
};
