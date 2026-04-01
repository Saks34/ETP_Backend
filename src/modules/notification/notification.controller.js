const { Notification } = require('./notification.model');

async function getNotifications(req, res) {
  try {
    const userId = req.user.sub;
    const notifs = await Notification.find({ userId })
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();
    return res.status(200).json(notifs);
  } catch (err) {
    return res.status(500).json({ message: 'Internal server error' });
  }
}

async function markAsRead(req, res) {
  try {
    const { id } = req.params;
    const userId = req.user.sub;
    await Notification.updateOne({ _id: id, userId }, { read: true });
    return res.status(200).json({ ok: true });
  } catch (err) {
    return res.status(500).json({ message: 'Internal server error' });
  }
}

async function markAllAsRead(req, res) {
  try {
    const userId = req.user.sub;
    await Notification.updateMany({ userId, read: false }, { read: true });
    return res.status(200).json({ ok: true });
  } catch (err) {
    return res.status(500).json({ message: 'Internal server error' });
  }
}

async function deleteNotification(req, res) {
  try {
    const { id } = req.params;
    const userId = req.user.sub;
    await Notification.deleteOne({ _id: id, userId });
    return res.status(200).json({ ok: true });
  } catch (err) {
    return res.status(500).json({ message: 'Internal server error' });
  }
}

module.exports = { getNotifications, markAsRead, markAllAsRead, deleteNotification };
