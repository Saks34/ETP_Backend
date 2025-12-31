const mongoose = require('mongoose');

const LiveClassSchema = new mongoose.Schema(
  {
    institutionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Institution', required: true, index: true },
    timetableId: { type: mongoose.Schema.Types.ObjectId, ref: 'Timetable', required: true, unique: true, index: true },
    status: { type: String, enum: ['Scheduled', 'Live', 'Completed', 'Cancelled'], default: 'Scheduled', index: true },
    streamInfo: { type: Object, default: {} },
  },
  { timestamps: true }
);

const LiveClass = mongoose.model('LiveClass', LiveClassSchema);

module.exports = { LiveClass };
