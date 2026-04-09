const { Attendance } = require('./attendance.model');
const { LiveClass } = require('./liveclass.model');
const { Timetable } = require('../timetable/timetable.model');
const User = require('../auth/user.model');
const { redis } = require('../../config/redis');
const catchAsync = require('../../utils/catchAsync');
const AppError = require('../../utils/AppError');
const sendResponse = require('../../utils/response');
const { ATTENDANCE_THRESHOLD } = require('../../config/constants');

const getAttendance = catchAsync(async (req, res, next) => {
  const { classId } = req.params;
  
  const liveClass = await LiveClass.findById(classId).populate('timetableId');
  if (!liveClass) {
    return next(new AppError('LiveClass not found', 404));
  }

  // Check institution scope
  if (req.user && req.user.role !== 'SuperAdmin') {
    if (!req.user.institutionId || String(req.user.institutionId) !== String(liveClass.institutionId)) {
      return next(new AppError('Forbidden: cross-institution access', 403));
    }
  }

  // 1. Check if finalized attendance exists
  const attendance = await Attendance.findOne({ liveClassId: classId }).populate('records.studentId', 'name email avatarUrl');
  if (attendance) {
    return sendResponse(res, 200, {
      status: 'finalized',
      date: attendance.date,
      records: attendance.records
    });
  }

  // 2. Class might be live or just ended but BullMQ hasn't processed
  const startTime = liveClass.actualStartTime || liveClass.createdAt; // fallback if somehow missing
  const currentTime = new Date();
  const elapsedTime = Math.floor((currentTime.getTime() - startTime.getTime()) / 1000); // in seconds

  const batchId = liveClass.timetableId?.batch;
  if (!batchId) {
    return next(new AppError('Linked batch not found', 404));
  }

  // Fetch all students in batch
  const students = await User.find({ role: 'Student', batchId, isStatus: true }).select('name email avatarUrl');

  // Fetch Redis data
  const pattern = `attendance:${classId}:*`;
  const keys = await redis.keys(pattern);
  const liveDurations = {};

  for (const key of keys) {
    const studentId = key.split(':').pop();
    const totalDuration = parseInt(await redis.hget(key, 'totalDuration') || '0', 10);
    const joinTime = await redis.hget(key, 'joinTime');
    
    let currentSessionDuration = 0;
    if (joinTime) {
      currentSessionDuration = Math.floor((Date.now() - parseInt(joinTime, 10)) / 1000);
    }
    liveDurations[studentId] = totalDuration + currentSessionDuration;
  }

  const liveRecords = students.map(student => {
    const duration = liveDurations[student._id.toString()] || 0;
    const effElapsedTime = elapsedTime > 0 ? elapsedTime : 1; 
    let percentage = (duration / effElapsedTime) * 100;
    if (percentage > 100) percentage = 100;

    const status = (duration / effElapsedTime) >= ATTENDANCE_THRESHOLD ? 'present' : 'absent';
    return {
      studentId: student,
      status,
      duration,
      percentage: Math.round(percentage)
    };
  });

  return sendResponse(res, 200, {
    status: 'live',
    date: startTime,
    elapsedTime,
    records: liveRecords
  });
});

module.exports = {
  getAttendance
};
