const mongoose = require('mongoose');

const AttendanceSchema = new mongoose.Schema(
  {
    liveClassId: { type: mongoose.Schema.Types.ObjectId, ref: 'LiveClass', required: true, index: true },
    batchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Batch', required: true, index: true },
    date: { type: Date, default: Date.now, required: true },
    records: [
      {
        studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
        status: { type: String, enum: ['present', 'absent'], required: true },
        duration: { type: Number, default: 0 }, // in seconds
        percentage: { type: Number, default: 0 }
      }
    ]
  },
  { timestamps: true }
);

const Attendance = mongoose.model('Attendance', AttendanceSchema);

module.exports = { Attendance };
