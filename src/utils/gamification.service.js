const { User } = require('../modules/auth/user.model');
const { logger } = require('./logger');
const { redis } = require('../config/redis');

/**
 * Award learning points and check for badge thresholds
 * @param {string} studentId 
 * @param {number} points 
 * @param {string} reason 'live_class', 'vod_completion', 'poll_answer'
 */
async function awardPoints(studentId, points, reason) {
  try {
    const user = await User.findById(studentId);
    if (!user || user.role !== 'Student') return;

    user.learningPoints += points;
    
    if (reason === 'live_class') {
      user.stats.classCount += 1;
      // First Class
      if (user.stats.classCount === 1 && !user.badges.find(b => b.name === 'First Class')) {
        user.badges.push({ name: 'First Class' });
      }
      // Regular Learner
      if (user.stats.classCount === 10 && !user.badges.find(b => b.name === 'Regular Learner')) {
        user.badges.push({ name: 'Regular Learner' });
      }
    } else if (reason === 'poll_answer') {
      user.stats.pollCount += 1;
      // Active Participant
      if (user.stats.pollCount === 5 && !user.badges.find(b => b.name === 'Active Participant')) {
        user.badges.push({ name: 'Active Participant' });
      }
      // Poll Pro
      if (user.stats.pollCount === 15 && !user.badges.find(b => b.name === 'Poll Pro')) {
        user.badges.push({ name: 'Poll Pro' });
      }
    } else if (reason === 'vod_completion') {
      user.stats.vodCount += 1;
      // VOD Explorer
      if (user.stats.vodCount === 5 && !user.badges.find(b => b.name === 'VOD Explorer')) {
        user.badges.push({ name: 'VOD Explorer' });
      }
      // Movie Buff
      if (user.stats.vodCount === 20 && !user.badges.find(b => b.name === 'Movie Buff')) {
        user.badges.push({ name: 'Movie Buff' });
      }
    }

    await user.save();
    
    // Update Redis sorted set for leaderboard
    if (user.batchId) {
      const lbKey = `leaderboard:batch:${user.batchId}`;
      await redis.zadd(lbKey, user.learningPoints, studentId);
    }

    logger.info(`Awarded ${points} LPs to student ${studentId} for ${reason}`);
  } catch (error) {
    logger.error('Error in awardPoints:', error);
  }
}

module.exports = { awardPoints };
