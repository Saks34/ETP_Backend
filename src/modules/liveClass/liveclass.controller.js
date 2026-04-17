const { LiveClass } = require('./liveclass.model');
const { Timetable } = require('../timetable/timetable.model');
const { getIO } = require('../../realtime/socket');
const { createLiveStream, createLiveBroadcast, bindBroadcastToStream, endLiveBroadcast, getStreamStatus: getYouTubeStreamStatus } = require('./youtube.service');
const { LiveClassQuestion } = require('./liveclassQuestion.model');
const { notificationQueue } = require('../../queues/notification.queue');
const catchAsync = require('../../utils/catchAsync');
const AppError = require('../../utils/AppError');
const sendResponse = require('../../utils/response');

function getRequestUserId(req) {
  return req?.user?.sub || req?.user?.id;
}

function ensureSummaryShape(live) {
  if (!live.summary) {
    live.summary = { status: 'pending' };
  }

  const chapters = Array.isArray(live.summary.chapters) ? live.summary.chapters : [];
  const chapterSummaries = Array.isArray(live.summary.chapterSummaries) ? live.summary.chapterSummaries : [];

  if (chapters.length === 0 && chapterSummaries.length > 0) {
    live.summary.chapters = chapterSummaries.map((content, index) => ({
      title: `Chapter ${index + 1}`,
      start_time: '',
      content
    }));
  }

  if (!Array.isArray(live.summary.chapterSummaries)) {
    live.summary.chapterSummaries = (live.summary.chapters || []).map(chapter =>
      typeof chapter === 'string' ? chapter : chapter?.content
    ).filter(Boolean);
  }

  return live.summary;
}

async function ensureLiveClassAccess(req, live, options = {}) {
  if (!live) {
    throw new AppError('LiveClass not found', 404);
  }

  const role = req.user?.role;
  const currentUserId = getRequestUserId(req);

  // Cross-institution check
  if (role !== 'SuperAdmin') {
    const userInstId = req.user?.institutionId;
    const liveInstId = live.institutionId;
    if (!userInstId || String(userInstId) !== String(liveInstId)) {
      throw new AppError('Forbidden: cross-institution access', 403);
    }
  }

  if (!role || role === 'SuperAdmin') {
    return null;
  }

  const needsTimetable =
    options.requireAssignedTeacher ||
    (options.requireStudentBatch && role === 'Student');

  if (!needsTimetable) {
    return null;
  }

  // Use already populated timetable if available, otherwise fetch it
  let timetable = live.timetableId;
  const isPopulated = timetable && typeof timetable === 'object' && (timetable.batch !== undefined || timetable._id !== undefined);
  
  if (!isPopulated) {
    timetable = await Timetable.findById(live.timetableId).select('teacher batch institutionId');
  }

  if (!timetable) {
    throw new AppError('Linked timetable not found', 404);
  }

  if (options.requireAssignedTeacher && role === 'Teacher') {
    const teacherId = timetable.teacher?._id || timetable.teacher;
    if (String(teacherId) !== String(currentUserId)) {
      throw new AppError('Forbidden: not assigned teacher', 403);
    }
  }

  if (options.requireStudentBatch && role === 'Student') {
    // Robust batch ID extraction from user session/token
    let requestBatchId = req.user?.batchId || req.user?.batch?._id || req.user?.batch;
    
    // Fallback: If token is missing batchId, look it up in DB
    if (!requestBatchId) {
      const User = require('../auth/user.model');
      const dbUser = await User.findById(currentUserId).select('batchId');
      requestBatchId = dbUser?.batchId;
    }

    // Extract batch ID from timetable (handle populated object or ID)
    const timetableBatchId = timetable.batch?._id || timetable.batch;

    if (!requestBatchId || !timetableBatchId || String(timetableBatchId) !== String(requestBatchId)) {
      // Final attempt: If the user has batches array (future-proofing/flexibility)
      const userBatches = req.user?.batches || [];
      const isInAnyBatch = userBatches.some(b => String(b?.id || b?._id || b) === String(timetableBatchId));
      
      if (!isInAnyBatch) {
        throw new AppError('Forbidden: not enrolled in this batch', 403);
      }
    }
  }

  return timetable;
}

function appendRecordingIfMissing(live, broadcastId) {
  if (!broadcastId) return;
  if (!Array.isArray(live.recordings)) {
    live.recordings = [];
  }

  const exists = live.recordings.some(recording => String(recording.youtubeVideoId) === String(broadcastId));
  if (exists) return;

  live.recordings.push({
    youtubeVideoId: broadcastId,
    title: 'Recorded Class',
    url: `https://www.youtube.com/watch?v=${broadcastId}`,
    publishedAt: new Date()
  });
}

const scheduleLiveClass = catchAsync(async (req, res, next) => {
  const { id } = req.params;
  const { title, startTime } = req.body || {};

  if (!id) return next(new AppError('liveClass id is required', 400));

  const live = await LiveClass.findById(id);
  if (!live) return next(new AppError('LiveClass not found', 404));

  await ensureLiveClassAccess(req, live, { requireAssignedTeacher: true });

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

  const timetable = await Timetable.findById(live.timetableId).populate('batch', 'name');
  if (!timetable) return next(new AppError('Linked timetable not found', 404));

  const batchName = timetable.batch?.name || String(timetable.batch);
  const streamTitle = live.title || title || `${timetable.subject} - ${batchName} - ${timetable.day} ${timetable.startTime}`;

  if (!live.title) {
    live.title = streamTitle;
    await live.save();
  }

  const scheduledStartTime = startTime ? new Date(startTime) : new Date(Date.now() + 5 * 60 * 1000);

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

  await ensureLiveClassAccess(req, live);

  const timetable = await Timetable.findById(live.timetableId);
  if (!timetable) return next(new AppError('Linked timetable not found', 404));

  const isAssignedTeacher = req.user && req.user.role === 'Teacher' && String(timetable.teacher) === String(getRequestUserId(req));
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

  await ensureLiveClassAccess(req, live, {
    requireAssignedTeacher: true,
    requireStudentBatch: true
  });

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

  await ensureLiveClassAccess(req, live, {
    requireAssignedTeacher: true,
    requireStudentBatch: true
  });

  ensureSummaryShape(live);

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
    whiteboardUrl: live.whiteboardUrl,
    recordings: live.recordings || [],
    analytics: live.analytics || {},
    moderation: live.moderation || {},
    summary: live.summary || { status: 'pending' }
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

  await ensureLiveClassAccess(req, live, { requireAssignedTeacher: true });

  if (live.status === 'Completed' || live.status === 'Cancelled') {
    return next(new AppError('Stream already ended', 400));
  }

  const broadcastId = live.streamInfo?.broadcastId;
  if (broadcastId) {
    try {
      await endLiveBroadcast(broadcastId);
    } catch (error) {
      console.error('[YouTube Service] ❌ Failed to end live broadcast:', error.response?.data || error.message);
      throw error;
    }
  }

  live.status = 'Completed';
  live.actualEndTime = new Date();
  appendRecordingIfMissing(live, broadcastId);

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
        delay: 60 * 60 * 1000, // 60 minutes delay for YouTube processing
        attempts: 3,
        backoff: {
          type: 'fixed',
          delay: 60 * 60 * 1000 // 60 minutes between retries
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

  await ensureLiveClassAccess(req, live, { requireAssignedTeacher: true });

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
    appendRecordingIfMissing(live, broadcastId);
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

  await ensureLiveClassAccess(req, live, { requireAssignedTeacher: true });

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

  await ensureLiveClassAccess(req, live, { requireAssignedTeacher: true });

  return sendResponse(res, 200, live.moderation || {});
});

const updateAnalytics = catchAsync(async (req, res, next) => {
  const { id } = req.params;
  const { peakViewers, totalViews, totalLikes, totalChatMessages } = req.body || {};

  const live = await LiveClass.findById(id);
  if (!live) return next(new AppError('LiveClass not found', 404));

  await ensureLiveClassAccess(req, live, { requireAssignedTeacher: true });

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

  await ensureLiveClassAccess(req, live, { requireAssignedTeacher: true });

  if (title) live.title = title;

  await live.save();
  return sendResponse(res, 200, { title: live.title }, 'Class details updated');
});

const getLiveClassQuestions = catchAsync(async (req, res, next) => {
  const { id } = req.params;
  const live = await LiveClass.findById(id);
  if (!live) return next(new AppError('LiveClass not found', 404));
  await ensureLiveClassAccess(req, live, {
    requireAssignedTeacher: true,
    requireStudentBatch: true
  });

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

  await ensureLiveClassAccess(req, live, {
    requireAssignedTeacher: true,
    requireStudentBatch: true
  });

  const summary = ensureSummaryShape(live);

  if (summary.status === 'completed') {
    return sendResponse(res, 200, summary);
  }

  return sendResponse(res, 200, { status: summary.status || 'pending' });
});

// FIX 3: AI Summary Manual Re-trigger
const retrySummary = catchAsync(async (req, res, next) => {
  const { id } = req.params;
  const live = await LiveClass.findById(id).populate('timetableId');
  if (!live) return next(new AppError('LiveClass not found', 404));

  // Only accessible by the teacher who owns the class
  const isOwner = req.user.role === 'Teacher' && String(live.timetableId.teacher) === String(getRequestUserId(req));
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
  ensureSummaryShape(live);
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
      delay: 60 * 60 * 1000
    }
  });

  return sendResponse(res, 200, { status: 'pending' }, 'Summary retry initiated');
});

const getCompletedClasses = catchAsync(async (req, res, next) => {
  const institutionId = req.user.institutionId;
  const filter = {
    institutionId,
    status: 'Completed',
    'recordings.0': { $exists: true }
  };

  const completedClasses = await LiveClass.find(filter)
    .populate({
      path: 'timetableId',
      populate: [
        { path: 'teacher', select: 'name' },
        { path: 'batch' }
      ]
    })
    .sort({ actualEndTime: -1 })
    .lean();

  // If teacher, filter by their own classes
  let results = completedClasses;
  if (req.user.role === 'Teacher') {
    results = completedClasses.filter(c =>
      c.timetableId && String(c.timetableId.teacher?._id || c.timetableId.teacher) === String(req.user.sub || req.user.id)
    );
  }

  return sendResponse(res, 200, results);
});

const updateWhiteboardUrl = catchAsync(async (req, res, next) => {
  const { id } = req.params;
  const { whiteboardUrl } = req.body;
  const institutionId = req.user.institutionId;

  const live = await LiveClass.findOne({ _id: id, institutionId }).populate('timetableId');
  if (!live) return next(new AppError('Live Class not found', 404));

  // Only the teacher can update the whiteboard
  if (req.user.role === 'Teacher' && String(live.timetableId.teacher) !== String(getRequestUserId(req))) {
    return next(new AppError('You are not authorized to update this class', 403));
  }

  live.whiteboardUrl = whiteboardUrl;
  await live.save();

  // Sync whiteboard URL via socket
  try {
    const io = getIO();
    io.of('/live-classes').to(String(live._id)).emit('whiteboard-updated', { whiteboardUrl });
  } catch (e) {
    console.error('Whiteboard socket emit failed:', e);
  }

  return sendResponse(res, 200, live, 'Whiteboard URL updated successfully');
});

const { moderationQueue } = require('../../queues/moderation.queue');
const { ChatMessage } = require('./chatMessage.model');

const getModerationQueue = catchAsync(async (req, res, next) => {
  const institutionId = req.user.institutionId;
  const { liveClassId } = req.params;

  // BullMQ: Get waiting jobs
  const waiting = await moderationQueue.getJobs(['waiting']);

  // Filter for this class and institution
  const filtered = waiting.filter(j =>
    String(j.data.liveClassId) === String(liveClassId) &&
    String(j.data.institutionId) === String(institutionId)
  ).map(j => ({
    jobId: j.id,
    ...j.data
  }));

  return sendResponse(res, 200, filtered);
});

const approveModerationMessage = catchAsync(async (req, res, next) => {
  const { jobId } = req.params;
  const job = await moderationQueue.getJob(jobId);
  if (!job) return next(new AppError('Moderation job not found', 404));

  const data = job.data;
  const live = await LiveClass.findById(data.liveClassId);
  if (!live) return next(new AppError('LiveClass not found', 404));
  await ensureLiveClassAccess(req, live, { requireAssignedTeacher: true });

  // Create message
  const savedMsg = await ChatMessage.create({
    institutionId: data.institutionId,
    liveClassId: data.liveClassId,
    type: 'message',
    text: data.text,
    senderId: data.senderId,
    senderName: data.senderName,
    role: data.role,
    ts: new Date(),
    isPinned: false,
    moderated: true // Flagged as moderated
  });

  // Emit to room
  const io = getIO();
  io.of('/live-classes').to(String(data.liveClassId)).emit('message', {
    id: savedMsg._id,
    liveClassId: String(data.liveClassId),
    text: savedMsg.text,
    senderId: data.senderId,
    senderName: data.senderName,
    role: data.role,
    ts: savedMsg.ts,
    isPinned: false,
    moderated: true
  });

  // Remove job from waiting
  await job.moveToCompleted('approved', req.user.id);

  return sendResponse(res, 200, null, 'Message approved and broadcasted');
});

const rejectModerationMessage = catchAsync(async (req, res, next) => {
  const { jobId } = req.params;
  const job = await moderationQueue.getJob(jobId);
  if (!job) return next(new AppError('Moderation job not found', 404));

  const live = await LiveClass.findById(job.data.liveClassId);
  if (!live) return next(new AppError('LiveClass not found', 404));
  await ensureLiveClassAccess(req, live, { requireAssignedTeacher: true });

  await job.moveToFailed(new Error('Rejected by moderator'), req.user.id);

  return sendResponse(res, 200, null, 'Message rejected');
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
  retrySummary,
  getCompletedClasses,
  updateWhiteboardUrl,
  getModerationQueue,
  approveModerationMessage,
  rejectModerationMessage
};
