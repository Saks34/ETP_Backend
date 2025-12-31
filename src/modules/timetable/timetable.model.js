const mongoose = require('mongoose');

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

const TimetableSchema = new mongoose.Schema(
  {
    institutionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Institution', required: true, index: true },
    day: { type: String, enum: DAYS, required: true, index: true },
    startTime: { type: String, required: true }, // HH:mm
    endTime: { type: String, required: true },   // HH:mm
    startMinutes: { type: Number, required: true, index: true },
    endMinutes: { type: Number, required: true, index: true },
    subject: { type: String, required: true, trim: true },
    batch: { type: mongoose.Schema.Types.ObjectId, ref: 'Batch', required: true, index: true },
    teacher: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    liveClassId: { type: mongoose.Schema.Types.ObjectId, ref: 'LiveClass', required: false, index: true },
    status: { type: String, enum: ['Scheduled', 'Live', 'Completed', 'Cancelled'], default: 'Scheduled', index: true },
  },
  { timestamps: true }
);

function toMinutes(hhmm) {
  const match = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(hhmm);
  if (!match) return null;
  const h = parseInt(match[1], 10);
  const m = parseInt(match[2], 10);
  return h * 60 + m;
}

TimetableSchema.pre('validate', function () {
  const s = toMinutes(this.startTime);
  const e = toMinutes(this.endTime);
  if (s == null || e == null || s >= e) {
    throw new Error('Invalid startTime/endTime');
  }
  this.startMinutes = s;
  this.endMinutes = e;
});

const Timetable = mongoose.model('Timetable', TimetableSchema);

module.exports = { Timetable, DAYS };
