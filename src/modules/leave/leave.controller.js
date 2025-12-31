const { Leave } = require('./leave.model');
const { Timetable } = require('../timetable/timetable.model');
const { LiveClass } = require('../liveClass/liveclass.model');
const { Institution } = require('../institution/institution.model');
const { createNotification } = require('../notification/notification.service');
const { endLiveBroadcast, setBroadcastPrivacy } = require('../liveClass/youtube.service');

function getInstitutionContext(req) {
  const actor = req.user;
  if (!actor) return { error: { code: 401, message: 'Unauthorized' } };
  if (actor.role === 'SuperAdmin') {
    const institutionId = req.body.institutionId || req.params.institutionId || req.query.institutionId;
    if (!institutionId) return { error: { code: 400, message: 'institutionId is required for SuperAdmin' } };
    return { institutionId, actor };
  }
  if (!actor.institutionId) return { error: { code: 400, message: 'Institution context required' } };
  return { institutionId: actor.institutionId, actor };
}

function toMinutes(hhmm) {
  if (!hhmm) return null;
  const match = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(hhmm);
  if (!match) return null;
  const h = parseInt(match[1], 10);
  const m = parseInt(match[2], 10);
  return h * 60 + m;
}

function getDayName(date) {
  const d = new Date(date);
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  return days[d.getDay()];
}

async function applyLeave(req, res) {
  try {
    const { institutionId, actor, error } = getInstitutionContext(req);
    if (error) return res.status(error.code).json({ message: error.message });

    const { teacherId, date, slot, reason } = req.body || {};
    if (!teacherId || !date) {
      return res.status(400).json({ message: 'teacherId and date are required' });
    }

    // Teachers can only apply for themselves
    if (actor.role === 'Teacher' && actor.sub && teacherId !== actor.sub && teacherId !== actor.email && teacherId !== actor.name) {
      return res.status(403).json({ message: 'Forbidden: teachers can only apply leave for themselves' });
    }

    const inst = await Institution.findById(institutionId);
    if (!inst) return res.status(404).json({ message: 'Institution not found' });

    const leaveDate = new Date(date);
    const day = getDayName(leaveDate);

    const filter = { institutionId, day, teacher: teacherId };

    let overlapExpr = null;
    const startMinutes = slot && slot.startTime ? toMinutes(slot.startTime) : null;
    const endMinutes = slot && slot.endTime ? toMinutes(slot.endTime) : null;
    if (startMinutes != null && endMinutes != null) {
      overlapExpr = { $expr: { $and: [{ $lt: ['$startMinutes', endMinutes] }, { $gt: ['$endMinutes', startMinutes] }] } };
    }

    const timetableQuery = overlapExpr ? { ...filter, ...overlapExpr } : filter;

    const affectedSlots = await Timetable.find(timetableQuery);

    // Create leave record
    const leaveDoc = await Leave.create({
      institutionId,
      teacherId,
      date: leaveDate,
      slot: slot || {},
      reason: reason || '',
    });

    let liveUpdated = 0;
    let timetableUpdated = 0;

    if (affectedSlots.length > 0) {
      const timetableIds = affectedSlots.map((s) => s._id);

      const liveRes = await LiveClass.updateMany(
        { institutionId, timetableId: { $in: timetableIds } },
        { $set: { status: 'Cancelled' } }
      );
      liveUpdated = liveRes.modifiedCount || 0;

      const ttRes = await Timetable.updateMany(
        { _id: { $in: timetableIds } },
        { $set: { status: 'Cancelled' } }
      );
      timetableUpdated = ttRes.modifiedCount || 0;

      // Create in-app notifications for each affected slot's teacher
      for (const slotDoc of affectedSlots) {
        try {
          await createNotification({
            institutionId,
            userId: slotDoc.teacher, // expecting teacher to be a user id string
            type: 'ClassCancelled',
            title: 'Class Cancelled',
            message: `Your class ${slotDoc.subject} for ${slotDoc.batch} on ${slotDoc.day} at ${slotDoc.startTime}-${slotDoc.endTime} has been cancelled due to leave`,
            data: {
              timetableId: String(slotDoc._id),
              liveClassId: slotDoc.liveClassId ? String(slotDoc.liveClassId) : undefined,
              reason: reason || '',
              date: leaveDate.toISOString(),
            },
          });
        } catch (_) { }
      }

      // Attempt to end or hide any associated YouTube broadcasts to prevent dead join links
      try {
        const lives = await LiveClass.find({ institutionId, timetableId: { $in: timetableIds } });
        for (const live of lives) {
          const broadcastId = live?.streamInfo?.broadcastId;
          try {
            if (broadcastId) {
              try {
                await endLiveBroadcast(broadcastId);
              } catch (e) {
                // Fallback: set privacy to private if ending fails
                try { await setBroadcastPrivacy(broadcastId, 'private'); } catch (_) { }
              }
            }
          } catch (_) { }

          // Clear join link to ensure students don't see dead links
          if (live.streamInfo) {
            delete live.streamInfo.liveUrl;
            live.streamInfo.privacyStatus = 'private';
          }
          // Persist updated stream info
          try { await live.save(); } catch (_) { }
        }
      } catch (e) {
        // Safe log only; do not change cancellation outcome
        console.error('YouTube shutdown on cancellation failed:', e && e.message ? e.message : e);
      }
    }

    return res.status(201).json({
      leave: leaveDoc,
      affectedCount: affectedSlots.length,
      liveClassesCancelled: liveUpdated,
      timetablesCancelled: timetableUpdated,
      affectedSlots,
    });
  } catch (err) {
    return res.status(500).json({ message: 'Failed to apply leave' });
  }
}

module.exports = { applyLeave };
