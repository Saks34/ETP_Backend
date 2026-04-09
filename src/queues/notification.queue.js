const { Queue, Worker } = require('bullmq');
const { redisConfig } = require('../config/redis');
const { logger } = require('../utils/logger');
const notificationService = require('../modules/notification/notification.service');
const youtubeService = require('../modules/liveClass/youtube.service');
const geminiService = require('../services/gemini.service');
const { LiveClass } = require('../modules/liveClass/liveclass.model');
const { Attendance } = require('../modules/liveClass/attendance.model');
const { ChatMessage } = require('../modules/liveClass/chatMessage.model');
const { LiveClassQuestion } = require('../modules/liveClass/liveclassQuestion.model');
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
        await processClassSummarization(job);
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

async function processClassSummarization(job) {
  const { liveClassId, broadcastId } = job.data.data;
  const retryCount = job.data.retryCount || 0;
  const MAX_RETRIES = 5;
  const RETRY_DELAY = 30 * 60 * 1000; // 30 minutes

  logger.info(`Generating summary for class ${liveClassId} (Attempt ${retryCount+1}/6)...`);
  
  try {
    const liveClass = await LiveClass.findById(liveClassId);
    if (!liveClass) return;

    liveClass.summary = liveClass.summary || { status: 'pending' };
    liveClass.summary.status = 'processing';
    await liveClass.save();

    // 1. Try to get YouTube Transcript
    let transcript = '';
    try {
      transcript = await youtubeService.getVideoTranscript(broadcastId);
    } catch (e) {
      logger.warn(`YouTube transcript fetch attempt ${retryCount+1} failed: ${e.message}`);
    }

    // 2. Decide: Retry, Fallback, or Proceed?
    if (!transcript && retryCount < MAX_RETRIES) {
      logger.info(`Transcript not ready for ${broadcastId}. Re-scheduling in 30 mins (Retry ${retryCount+1}/${MAX_RETRIES})...`);
      
      // Add the job back to the queue with a delay
      await notificationQueue.add('summarize-class', {
        ...job.data,
        retryCount: retryCount + 1
      }, {
        delay: RETRY_DELAY
      });

      // Mark current status as pending so UI shows it's still waiting
      liveClass.summary.status = 'pending';
      await liveClass.save();
      return; // Finish current job successfully (it will be picked up by the new delayed job)
    }

    // If we reach here, we either have a transcript OR we hit max retries
    if (!transcript) {
      logger.warn(`Max retries reached for transcript ${broadcastId}. Falling back to Chat/Q&A data only.`);
    }

    // 3. Fetch Chat and Q&A as fallback/supplement
    const [messages, questions] = await Promise.all([
      ChatMessage.find({ liveClassId, type: 'message' }).sort({ ts: 1 }).lean(),
      LiveClassQuestion.find({ liveClassId, isDeleted: false }).sort({ ts: 1 }).lean()
    ]);

    let enrichmentText = '';
    if (messages.length > 0) {
      enrichmentText += '\n\n--- LIVE CHAT HISTORY ---\n';
      enrichmentText += messages.map(m => `[${m.role}] ${m.senderName}: ${m.text}`).join('\n');
    }
    if (questions.length > 0) {
      enrichmentText += '\n\n--- Q&A SESSION ---\n';
      enrichmentText += questions.map(q => `Question: ${q.text} (Asked by ${q.senderName})\nAnswer: ${q.answerText || 'Not answered'}`).join('\n');
    }

    // Combine or choose source
    const context = transcript ? `${transcript}\n\nREINFORCED CONTEXT FROM CHAT:${enrichmentText}` : enrichmentText;

    if (!context || context.trim().length < 50) {
      logger.error(`No context found for class ${liveClassId} after ${retryCount} retries.`);
      liveClass.summary.status = 'failed';
      await liveClass.save();
      return;
    }

    // 4. Summarize with Gemini
    const summaryData = await geminiService.summarizeTranscript(context);
    const chapterSummaries = Array.isArray(summaryData.chapterSummaries) ? summaryData.chapterSummaries : [];

    liveClass.summary = {
      title: liveClass.title,
      summary: chapterSummaries.join('\n\n'),
      keyTakeaways: summaryData.keyTakeaways || [],
      chapters: chapterSummaries.map((content, index) => ({
        title: `Chapter ${index + 1}`,
        start_time: '',
        content
      })),
      generatedAt: new Date(),
      status: 'completed'
    };
    await liveClass.save();
    logger.info(`Summary generated successfully for class ${liveClassId}`);
  } catch (error) {
    logger.error(`Error in processClassSummarization for ${liveClassId}:`, error.message);
    const liveClass = await LiveClass.findById(liveClassId);
    if (liveClass) {
      liveClass.summary = liveClass.summary || {};
      liveClass.summary.status = 'failed';
      await liveClass.save();
    }
    // We don't throw here to avoid BullMQ retrying the ALREADY re-added job
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
