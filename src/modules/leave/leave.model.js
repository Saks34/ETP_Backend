const mongoose = require('mongoose');

const LeaveSchema = new mongoose.Schema(
  {
    institutionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Institution', required: true, index: true },
    teacherId: { type: String, required: true, index: true },
    date: { type: Date, required: true, index: true },
    slot: {
      startTime: { type: String }, // optional HH:mm
      endTime: { type: String },   // optional HH:mm
    },
    reason: { type: String, default: '' },
  },
  { timestamps: true }
);

const Leave = mongoose.model('Leave', LeaveSchema);

module.exports = { Leave };
