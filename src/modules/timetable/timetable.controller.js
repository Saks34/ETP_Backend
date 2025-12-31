const { Timetable } = require('./timetable.model');
const { Institution } = require('../institution/institution.model');
const { LiveClass } = require('./liveclass.model');
const { createNotification } = require('../notification/notification.service');

function getInstitutionContext(req) {
  const actor = req.user;
  if (!actor) return { error: { code: 401, message: 'Unauthorized' } };
  if (actor.role === 'SuperAdmin') {
    const institutionId = req.body.institutionId || req.params.institutionId || req.query.institutionId;
    if (!institutionId) return { error: { code: 400, message: 'institutionId is required for SuperAdmin' } };
    return { institutionId };
  }
  if (!actor.institutionId) return { error: { code: 400, message: 'Institution context required' } };
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

async function createSlot(req, res) {
  try {
    const { institutionId, error } = getInstitutionContext(req);
    if (error) return res.status(error.code).json({ message: error.message });

    const { day, startTime, endTime, subject, batch, teacher } = req.body || {};
    if (!day || !startTime || !endTime || !subject || !batch || !teacher) {
      return res.status(400).json({ message: 'day, startTime, endTime, subject, batch, teacher are required' });
    }

    const inst = await Institution.findById(institutionId);
    if (!inst) return res.status(404).json({ message: 'Institution not found' });

    // Create a temp doc to compute minutes via pre-validate hook
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
    if (clash) return res.status(409).json({ message: 'Clash detected for teacher or batch' });

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

    // Auto-create LiveClass for the slot with default status = Scheduled
    const live = await LiveClass.create({
      institutionId,
      timetableId: slot._id,
      status: 'Scheduled',
      streamInfo: {},
    });

    // Link back to timetable
    slot.liveClassId = live._id;
    await slot.save();

    return res.status(201).json({ slot, liveClass: live });
  } catch (err) {
    console.error('createSlot error:', err);
    return res.status(500).json({ message: 'Failed to create slot', error: err.message });
  }
}

async function updateSlot(req, res) {
  try {
    const { institutionId, error } = getInstitutionContext(req);
    if (error) return res.status(error.code).json({ message: error.message });

    const { id } = req.params;
    const existing = await Timetable.findById(id);
    if (!existing) return res.status(404).json({ message: 'Slot not found' });
    if (String(existing.institutionId) !== String(institutionId)) {
      return res.status(403).json({ message: 'Forbidden: cross-institution access' });
    }

    const prev = {
      day: existing.day,
      startTime: existing.startTime,
      endTime: existing.endTime,
      teacher: existing.teacher,
    };

    const updates = { ...req.body };
    // If time or day/teacher/batch changed, recompute minutes and check clash
    let candidate = { ...existing.toObject(), ...updates };

    // Use a temporary doc to validate and compute minutes
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
    if (clash) return res.status(409).json({ message: 'Clash detected for teacher or batch' });

    existing.day = temp.day;
    existing.startTime = temp.startTime;
    existing.endTime = temp.endTime;
    existing.startMinutes = temp.startMinutes;
    existing.endMinutes = temp.endMinutes;
    if (updates.subject !== undefined) existing.subject = updates.subject;
    if (updates.batch !== undefined) existing.batch = updates.batch;
    if (updates.teacher !== undefined) existing.teacher = updates.teacher;

    await existing.save();

    // Create reschedule notifications when time/day changes or teacher is reassigned
    const timeChanged = prev.day !== existing.day || prev.startTime !== existing.startTime || prev.endTime !== existing.endTime;
    const teacherChanged = prev.teacher !== existing.teacher;

    if (timeChanged || teacherChanged) {
      const title = 'Class Rescheduled';
      const message = `Class ${existing.subject} for ${existing.batch} has been rescheduled to ${existing.day} ${existing.startTime}-${existing.endTime}`;

      // Notify current assigned teacher
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

      // Optionally notify previous teacher if reassigned
      if (teacherChanged && prev.teacher) {
        await createNotification({
          institutionId,
          userId: prev.teacher,
          type: 'ClassRescheduled',
          title: 'Class Reassignment',
          message: `Your class ${existing.subject} for ${existing.batch} has been reassigned`,
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

    return res.status(200).json({ slot: existing });
  } catch (err) {
    console.error('updateSlot error:', err);
    return res.status(500).json({ message: 'Failed to update slot', error: err.message });
  }
}

async function deleteSlot(req, res) {
  try {
    const { institutionId, error } = getInstitutionContext(req);
    if (error) return res.status(error.code).json({ message: error.message });

    const { id } = req.params;
    const existing = await Timetable.findById(id);
    if (!existing) return res.status(404).json({ message: 'Slot not found' });
    if (String(existing.institutionId) !== String(institutionId)) {
      return res.status(403).json({ message: 'Forbidden: cross-institution access' });
    }

    await existing.deleteOne();
    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('deleteSlot error:', err);
    return res.status(500).json({ message: 'Failed to delete slot', error: err.message });
  }
}

function dayNameFromDate(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return null;
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  return days[d.getDay()];
}

async function listAll(req, res) {
  try {
    const { institutionId, error } = getInstitutionContext(req);
    if (error) return res.status(error.code).json({ message: error.message });

    // RBAC: Only admins and superadmin can list all
    const role = req.user && req.user.role;
    if (!['InstitutionAdmin', 'AcademicAdmin', 'SuperAdmin'].includes(role)) {
      return res.status(403).json({ message: 'Forbidden' });
    }

    const { date } = req.query || {};
    const day = dayNameFromDate(date);
    const filter = { institutionId };
    if (day) filter.day = day;

    const slots = await Timetable.find(filter)
      .populate('teacher', 'name email')
      .populate('batch', 'name')
      .sort({ startMinutes: 1, endMinutes: 1 });
    return res.status(200).json({ slots });
  } catch (err) {
    return res.status(500).json({ message: 'Failed to fetch timetable' });
  }
}

async function listByTeacher(req, res) {
  try {
    const { institutionId, error } = getInstitutionContext(req);
    if (error) return res.status(error.code).json({ message: error.message });

    const role = req.user && req.user.role;
    const { teacherId: qTeacherId, date } = req.query || {};

    let teacherId = qTeacherId;
    if (role === 'Teacher') {
      // Teachers can only view their own timetable
      teacherId = req.user && req.user.sub;
    }

    if (!teacherId && ['InstitutionAdmin', 'AcademicAdmin', 'SuperAdmin'].includes(role) === false) {
      return res.status(400).json({ message: 'teacherId is required' });
    }

    const day = dayNameFromDate(date);
    const filter = { institutionId };
    if (teacherId) filter.teacher = teacherId;
    if (day) filter.day = day;

    console.log('[Controller] listByTeacher:', {
      queryTeacher: qTeacherId,
      userRole: role,
      userId: req.user && req.user.sub,
      resolvedTeacherId: teacherId,
      dateParam: date,
      resolvedDay: day,
      filter
    });

    const slots = await Timetable.find(filter)
      .populate('teacher', 'name email')
      .populate('batch', 'name')
      .sort({ startMinutes: 1, endMinutes: 1 });
    return res.status(200).json({ slots });
  } catch (err) {
    return res.status(500).json({ message: 'Failed to fetch timetable' });
  }
}

async function listByBatch(req, res) {
  try {
    const { institutionId, error } = getInstitutionContext(req);
    if (error) return res.status(error.code).json({ message: error.message });

    const role = req.user && req.user.role;
    const { batchId, date } = req.query || {};

    // Students can only view batch timetables; require batchId param for students
    if (role === 'Student' && !batchId) {
      return res.status(400).json({ message: 'batchId is required for students' });
    }

    const day = dayNameFromDate(date);
    const filter = { institutionId };
    if (batchId) filter.batch = batchId;
    if (day) filter.day = day;

    // If role is Student and batchId provided, returns only that batch
    // If admin roles, can view all or filtered by batchId
    const slots = await Timetable.find(filter)
      .populate('teacher', 'name email')
      .populate('batch', 'name')
      .sort({ startMinutes: 1, endMinutes: 1 });
    return res.status(200).json({ slots });
  } catch (err) {
    return res.status(500).json({ message: 'Failed to fetch timetable' });
  }
}

module.exports = { createSlot, updateSlot, deleteSlot, listAll, listByTeacher, listByBatch };
