const { Queue, Worker } = require('bullmq');
const { redisConfig } = require('../config/redis');
const { logger } = require('../utils/logger');
const notificationService = require('../modules/notification/notification.service');
const youtubeService = require('../modules/liveClass/youtube.service');
const geminiService = require('../services/gemini.service');
const { LiveClass } = require('../modules/liveClass/liveclass.model');
const { Attendance } = require('../modules/liveClass/attendance.model');
const { awardPoints } = require('../utils/gamification.service');
const { redis } = require('../config/redis');
const { ATTENDANCE_THRESHOLD, POINTS } = require('../config/constants');

// Initialize the notification queue
const notificationQueue = new Queue('notifications', {
  connection: redis
});

// Worker to process notification jobs
const notificationWorker = new Worker('notifications', async (job) => {
  logger.info(`Processing notification job: ${job.id} | Type: ${job.name}`);
  
  try {
    const { type, data } = job.data;

    switch (type) {
      case 'session:live':
        // Notify all enrolled students that a session has started
        await notificationService.notifyStudentsLiveClassStarted(data.sessionId);
        break;

      case 'recording:ready':
        // Notify all enrolled students that a new recording is available
        await notificationService.notifyStudentsRecordingReady(data.sessionId);
        break;

      case 'fetch:vod:metadata':
        // Fetch and update VOD metadata (thumbnail, duration)
        // Priority 9: Worker updates the recording entry in MongoDB once fetched
        await notificationService.fetchAndUpdateVODMetadata(data.sessionId, data.youtubeId);
        break;

      case 'summarize-class':
        // FEATURE 1: AI Class Summarization
        await processClassSummarization(data.liveClassId, data.broadcastId);
        break;

      case 'process-attendance':
        // FEATURE 3: Automatic Attendance Marking
        await processAttendance(data.liveClassId);
        break;

      default:
        logger.warn(`Unknown notification job type: ${type}`);
    }
  } catch (error) {
    logger.error(`Error processing job ${job.id}:`, error);
    throw error; // Let BullMQ handle retries
  }
}, {
  connection: redis,
  concurrency: 5
});

notificationWorker.on('completed', (job) => {
  logger.info(`Notification job ${job.id} completed`);
});

notificationWorker.on('failed', (job, err) => {
  logger.error(`Notification job ${job.id} failed:`, err);
});

async function processClassSummarization(liveClassId, broadcastId) {
  logger.info(`Generating summary for class ${liveClassId}...`);
  try {
    const liveClass = await LiveClass.findById(liveClassId);
    if (!liveClass) return;

    liveClass.summary.status = 'processing';
    await liveClass.save();

    const transcript = await youtubeService.getVideoTranscript(broadcastId);
    if (!transcript) {
      // If no transcript yet, throw error to trigger retry (BullMQ handles retry)
      throw new Error(`Transcript not ready for video ${broadcastId}`);
    }

    const summaryData = await geminiService.summarizeTranscript(transcript);
    
    liveClass.summary = {
      ...summaryData,
      generatedAt: new Date(),
      status: 'completed'
    };
    await liveClass.save();
    logger.info(`Summary generated successfully for class ${liveClassId}`);
  } catch (error) {
    logger.error(`Error in processClassSummarization for ${liveClassId}:`, error.message);
    const liveClass = await LiveClass.findById(liveClassId);
    if (liveClass) {
      liveClass.summary.status = 'failed';
      await liveClass.save();
    }
    throw error; // Let BullMQ retry
  }
}

async function processAttendance(liveClassId) {
  logger.info(`Processing attendance for class ${liveClassId}...`);
  try {
    const liveClass = await LiveClass.findById(liveClassId);
    if (!liveClass || !liveClass.actualStartTime || !liveClass.actualEndTime) {
      logger.warn(`Cannot process attendance for ${liveClassId}: missing start/end times`);
      return;
    }

    const classDuration = Math.floor((liveClass.actualEndTime.getTime() - liveClass.actualStartTime.getTime()) / 1000);
    if (classDuration <= 0) return;

    const threshold = ATTENDANCE_THRESHOLD;
    const pattern = `attendance:${liveClassId}:*`;
    const keys = await redis.keys(pattern);
    
    const records = [];
    for (const key of keys) {
      const studentId = key.split(':').pop();
      const studentDuration = parseInt(await redis.hget(key, 'totalDuration') || '0', 10);
      const percentage = (studentDuration / classDuration) * 100;
      const status = (studentDuration / classDuration) >= threshold ? 'present' : 'absent';
      
      records.push({
        studentId,
        status,
        duration: studentDuration,
        percentage: Math.min(100, Math.round(percentage))
      });

      // FEATURE 4: Award Points for being present
      if (status === 'present') {
        await awardPoints(studentId, POINTS.LIVE_CLASS_ATTENDANCE, 'live_class');
      }
    }

    if (records.length > 0) {
      const populatedClass = await liveClass.populate('timetableId');
      await Attendance.create({
        liveClassId,
        batchId: populatedClass.timetableId.batch,
        date: liveClass.actualStartTime,
        records
      });
    }

    // Cleanup Redis
    if (keys.length > 0) {
      await redis.del(...keys);
    }
    logger.info(`Attendance processed for class ${liveClassId}: ${records.length} records`);
  } catch (error) {
    logger.error(`Error in processAttendance for ${liveClassId}:`, error);
    throw error;
  }
}

module.exports = {
  notificationQueue
};
