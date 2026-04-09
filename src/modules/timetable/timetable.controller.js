const { Timetable } = require('./timetable.model');
const { Institution } = require('../institution/institution.model');
const { LiveClass } = require('../liveClass/liveclass.model');
const Batch = require('../batch/batch.model');
const { createNotification } = require('../notification/notification.service');
const catchAsync = require('../../utils/catchAsync');
const AppError = require('../../utils/AppError');
const sendResponse = require('../../utils/response');

function getInstitutionContext(req) {
  const actor = req.user;
  if (!actor) throw new AppError('Unauthorized', 401);
  if (actor.role === 'SuperAdmin') {
    const institutionId = req.body?.institutionId || req.params.institutionId || req.query.institutionId;
    if (!institutionId) throw new AppError('institutionId is required for SuperAdmin', 400);
    return { institutionId };
  }
  if (!actor.institutionId) throw new AppError('Institution context required', 400);
  return { institutionId: actor.institutionId };
}

function buildClashFilter({ institutionId, day, startMinutes, endMinutes, teacher, batch, excludeId }) {
  const overlap = { $expr: { $and: [{ $lt: ['$startMinutes', endMinutes] }, { $gt: ['$endMinutes', startMinutes] }] } };
  const base = { institutionId, day };
  const teacherOrBatch = { $or: [{ teacher }, { batch }] };
  const filter = { ...base, ...teacherOrBatch, ...overlap };
  if (excludeId) filter._id = { $ne: excludeId };
  return filter;
}

const createSlot = catchAsync(async (req, res, next) => {
  const { institutionId } = getInstitutionContext(req);

  const { day, startTime, endTime, subject, batch, teacher } = req.body || {};
  if (!day || !startTime || !endTime || !subject || !batch || !teacher) {
    return next(new AppError('day, startTime, endTime, subject, batch, teacher are required', 400));
  }

  const inst = await Institution.findById(institutionId);
  if (!inst) return next(new AppError('Institution not found', 404));

  const temp = new Timetable({ institutionId, day, startTime, endTime, subject, batch, teacher });
  await temp.validate();

  const clash = await Timetable.findOne(buildClashFilter({
    institutionId,
    day,
    startMinutes: temp.startMinutes,
    endMinutes: temp.endMinutes,
    teacher,
    batch,
  }));
  if (clash) return next(new AppError('Clash detected for teacher or batch', 409));

  const slot = await Timetable.create({
    institutionId,
    day,
    startTime,
    endTime,
    subject,
    batch,
    teacher,
    startMinutes: temp.startMinutes,
    endMinutes: temp.endMinutes,
  });

  const live = await LiveClass.create({
    institutionId,
    timetableId: slot._id,
    status: 'Scheduled',
    streamInfo: {},
  });

  slot.liveClassId = live._id;
  await slot.save();

  return sendResponse(res, 201, { slot, liveClass: live });
});

const updateSlot = catchAsync(async (req, res, next) => {
  const { institutionId } = getInstitutionContext(req);

  const { id } = req.params;
  const existing = await Timetable.findById(id);
  if (!existing) return next(new AppError('Slot not found', 404));
  if (String(existing.institutionId) !== String(institutionId)) {
    return next(new AppError('Forbidden: cross-institution access', 403));
  }

  const prev = {
    day: existing.day,
    startTime: existing.startTime,
    endTime: existing.endTime,
    teacher: existing.teacher,
  };

  const updates = { ...req.body };
  let candidate = { ...existing.toObject(), ...updates };
  const temp = new Timetable(candidate);
  await temp.validate();

  const clash = await Timetable.findOne(buildClashFilter({
    institutionId,
    day: temp.day,
    startMinutes: temp.startMinutes,
    endMinutes: temp.endMinutes,
    teacher: temp.teacher,
    batch: temp.batch,
    excludeId: existing._id,
  }));
  if (clash) return next(new AppError('Clash detected for teacher or batch', 409));

  existing.day = temp.day;
  existing.startTime = temp.startTime;
  existing.endTime = temp.endTime;
  existing.startMinutes = temp.startMinutes;
  existing.endMinutes = temp.endMinutes;
  if (updates.subject !== undefined) existing.subject = updates.subject;
  if (updates.batch !== undefined) existing.batch = updates.batch;
  if (updates.teacher !== undefined) existing.teacher = updates.teacher;

  await existing.save();

  const timeChanged = prev.day !== existing.day || prev.startTime !== existing.startTime || prev.endTime !== existing.endTime;
  const teacherChanged = prev.teacher !== existing.teacher;

  if (timeChanged || teacherChanged) {
    const batchDoc = await Batch.findById(existing.batch);
    const batchName = batchDoc ? batchDoc.name : existing.batch;

    const title = 'Class Rescheduled';
    const message = `Class ${existing.subject} for ${batchName} has been rescheduled to ${existing.day} ${existing.startTime}-${existing.endTime}`;

    await createNotification({
      institutionId,
      userId: existing.teacher,
      type: 'ClassRescheduled',
      title,
      message,
      data: {
        timetableId: String(existing._id),
        liveClassId: existing.liveClassId ? String(existing.liveClassId) : undefined,
        previous: prev,
        current: {
          day: existing.day,
          startTime: existing.startTime,
          endTime: existing.endTime,
          teacher: existing.teacher,
        },
      },
    });

    if (teacherChanged && prev.teacher) {
      await createNotification({
        institutionId,
        userId: prev.teacher,
        type: 'ClassRescheduled',
        title: 'Class Reassignment',
        message: `Your class ${existing.subject} for ${batchName} has been reassigned`,
        data: {
          timetableId: String(existing._id),
          previous: prev,
          current: {
            day: existing.day,
            startTime: existing.startTime,
            endTime: existing.endTime,
            teacher: existing.teacher,
          },
        },
      });
    }
  }

  return sendResponse(res, 200, { slot: existing });
});

const deleteSlot = catchAsync(async (req, res, next) => {
  const { institutionId } = getInstitutionContext(req);

  const { id } = req.params;
  const existing = await Timetable.findById(id);
  if (!existing) return next(new AppError('Slot not found', 404));
  if (String(existing.institutionId) !== String(institutionId)) {
    return next(new AppError('Forbidden: cross-institution access', 403));
  }

  await existing.deleteOne();
  return sendResponse(res, 200, { success: true }, 'Slot deleted');
});

function dayNameFromDate(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return null;
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  return days[d.getDay()];
}

const listAll = catchAsync(async (req, res, next) => {
  const { institutionId } = getInstitutionContext(req);

  const role = req.user && req.user.role;
  if (!['InstitutionAdmin', 'AcademicAdmin', 'SuperAdmin'].includes(role)) {
    return next(new AppError('Forbidden', 403));
  }

  const { date } = req.query || {};
  const day = dayNameFromDate(date);
  const filter = { institutionId };
  if (day) filter.day = day;

  const slots = await Timetable.find(filter)
    .populate('teacher', 'name email')
    .populate('batch', 'name')
    .populate('liveClassId', 'status streamInfo')
    .sort({ startMinutes: 1, endMinutes: 1 });

  const enrichedSlots = slots.map(slot => {
    const slotObj = slot.toObject();
    if (slotObj.liveClassId) {
      slotObj.liveClass = slotObj.liveClassId;
      slotObj.status = slotObj.liveClassId.status || 'Scheduled';
    }
    return slotObj;
  });

  return sendResponse(res, 200, { slots: enrichedSlots });
});

const listByTeacher = catchAsync(async (req, res, next) => {
  const { institutionId } = getInstitutionContext(req);

  const role = req.user && req.user.role;
  const { teacherId: qTeacherId, date } = req.query || {};

  let teacherId = qTeacherId;
  if (role === 'Teacher') {
    teacherId = req.user && (req.user.sub || req.user.id);
  }

  if (!teacherId && ['InstitutionAdmin', 'AcademicAdmin', 'SuperAdmin'].includes(role) === false) {
    return next(new AppError('teacherId is required', 400));
  }

  const day = dayNameFromDate(date);
  const filter = { institutionId };
  if (teacherId) filter.teacher = teacherId;
  if (day) filter.day = day;

  const slots = await Timetable.find(filter)
    .populate('teacher', 'name email')
    .populate('batch', 'name')
    .populate('liveClassId', 'status streamInfo')
    .sort({ startMinutes: 1, endMinutes: 1 });

  const enrichedSlots = slots.map(slot => {
    const slotObj = slot.toObject();
    if (slotObj.liveClassId) {
      slotObj.liveClass = slotObj.liveClassId;
      slotObj.status = slotObj.liveClassId.status || 'Scheduled';
    }
    return slotObj;
  });

  return sendResponse(res, 200, { slots: enrichedSlots });
});

const listByBatch = catchAsync(async (req, res, next) => {
  const { institutionId } = getInstitutionContext(req);

  const role = req.user && req.user.role;
  const { batchId, date } = req.query || {};

  if (role === 'Student' && !batchId) {
    return next(new AppError('batchId is required for students', 400));
  }

  const day = dayNameFromDate(date);
  const filter = { institutionId };
  if (batchId) filter.batch = batchId;
  if (day) filter.day = day;

  const slots = await Timetable.find(filter)
    .populate('teacher', 'name email')
    .populate('batch', 'name')
    .populate('liveClassId', 'status streamInfo')
    .sort({ startMinutes: 1, endMinutes: 1 });

  const enrichedSlots = slots.map(slot => {
    const slotObj = slot.toObject();
    if (slotObj.liveClassId) {
      slotObj.liveClass = slotObj.liveClassId;
      slotObj.status = slotObj.liveClassId.status || 'Scheduled';
    }
    return slotObj;
  });

  return sendResponse(res, 200, { slots: enrichedSlots });
});

const bulkAddTimetable = catchAsync(async (req, res, next) => {
  const { institutionId } = getInstitutionContext(req);
  const { slots } = req.body || {};

  if (!Array.isArray(slots) || slots.length === 0) {
    return next(new AppError('slots array is required', 400));
  }

  const results = {
    created: 0,
    failed: 0,
    clashes: [],
    errors: [],
  };

  const dayNames = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

  for (const s of slots) {
    try {
      const { day, startTime, endTime, subject, batch, teacher } = s;
      if (!day || !startTime || !endTime || !subject || !batch || !teacher) {
        results.failed++;
        results.errors.push({ slot: s, reason: 'Missing required fields' });
        continue;
      }

      if (!dayNames.includes(day)) {
        results.failed++;
        results.errors.push({ slot: s, reason: 'Invalid day' });
        continue;
      }

      const temp = new Timetable({ institutionId, day, startTime, endTime, subject, batch, teacher });
      await temp.validate(); // This calculates startMinutes and endMinutes

      const clash = await Timetable.findOne(buildClashFilter({
        institutionId,
        day,
        startMinutes: temp.startMinutes,
        endMinutes: temp.endMinutes,
        teacher,
        batch,
      }));

      if (clash) {
        results.failed++;
        results.clashes.push({ slot: s, reason: 'Clash detected' });
        continue;
      }

      const slot = await Timetable.create({
        institutionId,
        day,
        startTime,
        endTime,
        subject,
        batch,
        teacher,
        startMinutes: temp.startMinutes,
        endMinutes: temp.endMinutes,
      });

      const live = await LiveClass.create({
        institutionId,
        timetableId: slot._id,
        status: 'Scheduled',
        streamInfo: {},
      });

      slot.liveClassId = live._id;
      await slot.save();
      results.created++;
    } catch (err) {
      results.failed++;
      results.errors.push({ slot: s, reason: err.message });
    }
  }

  return sendResponse(res, 201, results, `Successfully processed ${slots.length} slots`);
});

const downloadTimetableSample = (req, res) => {
  const headers = ['Day', 'StartTime', 'EndTime', 'Subject', 'BatchId', 'TeacherId'];
  const sampleRow = ['Monday', '09:00', '10:00', 'Mathematics', '65f... (Batch ID)', '65f... (Teacher ID)'];

  const csvLines = [headers.join(','), sampleRow.join(',')];
  const csv = csvLines.join('\n');

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="timetable_sample.csv"');
  return res.status(200).send(csv);
};

module.exports = { 
  createSlot, 
  updateSlot, 
  deleteSlot, 
  listAll, 
  listByTeacher, 
  listByBatch,
  bulkAddTimetable,
  downloadTimetableSample
};
