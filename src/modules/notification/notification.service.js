const { Notification } = require('./notification.model');
const { User } = require('../auth/user.model');
const { LiveClass } = require('../liveClass/liveclass.model');
const { Timetable } = require('../timetable/timetable.model');
const logger = require('../../utils/logger');
const axios = require('axios'); // For YouTube API metadata fetch (Priority 9)

async function createNotification({ institutionId, userId, type, title, message, data = {} }) {
  if (!institutionId || !userId || !type || !title || !message) return null;
  try {
    const doc = await Notification.create({ institutionId, userId, type, title, message, data });
    return doc;
  } catch (e) {
    logger.error('createNotification error:', e);
    return null;
  }
}

async function notifyBatch({ institutionId, batchId, type, title, message, data = {} }) {
  if (!institutionId || !batchId || !type || !title || !message) return;
  try {
    const students = await User.find({ institutionId, batchId, role: 'Student' }, { _id: 1 }).lean();
    if (students.length === 0) return;

    const notifs = students.map(s => ({
      institutionId,
      userId: s._id.toString(),
      type,
      title,
      message,
      data
    }));

    await Notification.insertMany(notifs);
  } catch (e) {
    logger.error('notifyBatch error:', e);
  }
}

/**
 * Priority 3: Notify all enrolled students that a session has started.
 */
async function notifyStudentsLiveClassStarted(sessionId) {
  try {
    const live = await LiveClass.findById(sessionId);
    if (!live) return;
    const timetable = await Timetable.findById(live.timetableId);
    if (!timetable) return;

    await notifyBatch({
      institutionId: live.institutionId,
      batchId: timetable.batch,
      type: 'ClassStarted',
      title: 'Class Started',
      message: `The live class for ${live.topic || 'your subject'} has started.`,
      data: { sessionId }
    });
  } catch (e) {
    logger.error('notifyStudentsLiveClassStarted error:', e);
  }
}

/**
 * FEATURE 4: Notify students of a new poll.
 */
async function notifyStudentsNewPoll(sessionId, pollId, question) {
  try {
    const live = await LiveClass.findById(sessionId);
    if (!live) return;
    const timetable = await Timetable.findById(live.timetableId);
    if (!timetable) return;

    await notifyBatch({
      institutionId: live.institutionId,
      batchId: timetable.batch,
      type: 'NewPoll',
      title: 'New Poll Pushed',
      message: question.length > 50 ? `${question.substring(0, 50)}...` : question,
      data: { sessionId, pollId }
    });
  } catch (e) {
    logger.error('notifyStudentsNewPoll error:', e);
  }
}

/**
 * FEATURE 4: Notify students of new notes/resources.
 */
async function notifyStudentsNewNotes(batchId, institutionId, title) {
  try {
    await notifyBatch({
      institutionId,
      batchId,
      type: 'NewNotes',
      title: 'New Resources Added',
      message: `New notes "${title}" have been uploaded for your batch.`,
      data: { batchId }
    });
  } catch (e) {
    logger.error('notifyStudentsNewNotes error:', e);
  }
}

/**
 * Priority 3: Notify all enrolled students that a new recording is available.
 */
async function notifyStudentsRecordingReady(sessionId) {
  try {
    const live = await LiveClass.findById(sessionId);
    if (!live) return;
    const timetable = await Timetable.findById(live.timetableId);
    if (!timetable) return;

    await notifyBatch({
      institutionId: live.institutionId,
      batchId: timetable.batch,
      type: 'RecordingAvailable',
      title: 'Recording Ready',
      message: `The recording for ${live.topic || 'your subject'} is now available.`,
      data: { sessionId }
    });
  } catch (e) {
    logger.error('notifyStudentsRecordingReady error:', e);
  }
}

/**
 * Priority 9: Fetch and update VOD metadata (thumbnail, duration) from YouTube.
 */
async function fetchAndUpdateVODMetadata(sessionId, videoId) {
  if (!videoId || !sessionId) return;
  try {
    const API_KEY = process.env.YOUTUBE_API_KEY;
    if (!API_KEY) {
      logger.warn('YOUTUBE_API_KEY not found in env. Metadata fetch skipped.');
      return;
    }

    const { data } = await axios.get('https://www.googleapis.com/youtube/v3/videos', {
      params: {
        id: videoId,
        key: API_KEY,
        part: 'snippet,contentDetails'
      }
    });

    if (data.items && data.items.length > 0) {
      const item = data.items[0];
      const duration = item.contentDetails?.duration || ''; // ISO 8601 format like PT1H2M10S
      const thumbnail = item.snippet?.thumbnails?.high?.url || item.snippet?.thumbnails?.default?.url;
      
      // Update LiveClass
      await LiveClass.updateOne(
        { _id: sessionId, 'recordings.youtubeVideoId': videoId },
        { 
          $set: { 
            'recordings.$.duration': duration,
            'recordings.$.thumbnail': thumbnail,
            'recordings.$.metadataFetchedAt': new Date()
          } 
        }
      );
      
      logger.info(`Updated VOD metadata for class ${sessionId}, video ${videoId}`);
    } else {
      logger.warn(`No YouTube metadata found for video ${videoId}`);
    }
  } catch (e) {
    logger.error('fetchAndUpdateVODMetadata error:', e.message);
  }
}

module.exports = {
  createNotification,
  notifyBatch,
  notifyStudentsLiveClassStarted,
  notifyStudentsRecordingReady,
  notifyStudentsNewPoll,
  notifyStudentsNewNotes,
  fetchAndUpdateVODMetadata
};
