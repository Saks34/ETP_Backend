const mongoose = require('mongoose');

const NotificationSchema = new mongoose.Schema(
  {
    institutionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Institution', required: true, index: true },
    // Using string to align with current timetable.teacher representation. Can be switched to ObjectId later.
    userId: { type: String, required: true, index: true },
    type: { type: String, enum: ['ClassCancelled', 'ClassRescheduled'], required: true, index: true },
    title: { type: String, required: true },
    message: { type: String, required: true },
    data: { type: Object, default: {} },
    read: { type: Boolean, default: false, index: true },
  },
  { timestamps: true }
);

const Notification = mongoose.model('Notification', NotificationSchema);

module.exports = { Notification };
