const { Notification } = require('./notification.model');

async function createNotification({ institutionId, userId, type, title, message, data = {} }) {
  if (!institutionId || !userId || !type || !title || !message) return null;
  try {
    const doc = await Notification.create({ institutionId, userId, type, title, message, data });
    return doc;
  } catch (e) {
    return null;
  }
}

module.exports = { createNotification };
