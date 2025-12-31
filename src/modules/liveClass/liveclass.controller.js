const { LiveClass } = require('./liveclass.model');
const { Timetable } = require('../timetable/timetable.model');
const { createLiveStream, createLiveBroadcast, bindBroadcastToStream, endLiveBroadcast, getStreamStatus: getYouTubeStreamStatus } = require('./youtube.service');

async function scheduleLiveClass(req, res) {
  try {
    const { id } = req.params; // liveClass id
    const { title } = req.body || {};

    console.log('\n[Controller] 🎬 scheduleLiveClass called:', {
      liveClassId: id,
      customTitle: title,
      userId: req.user?._id,
      userRole: req.user?.role
    });

    if (!id) {
      console.error('[Controller] ❌ Missing liveClass ID');
      return res.status(400).json({ message: 'liveClass id is required' });
    }

    console.log('[Controller] 🔍 Looking up LiveClass...');
    const live = await LiveClass.findById(id);
    if (!live) {
      console.error('[Controller] ❌ LiveClass not found:', id);
      return res.status(404).json({ message: 'LiveClass not found' });
    }
    console.log('[Controller] ✅ LiveClass found:', {
      id: live._id,
      institutionId: live.institutionId,
      timetableId: live.timetableId,
      status: live.status,
      hasStreamInfo: !!live.streamInfo?.broadcastId
    });

    // Optional scope check: ensure any authenticated user cannot cross institutions.
    if (req.user && req.user.role !== 'SuperAdmin') {
      if (!req.user.institutionId || String(req.user.institutionId) !== String(live.institutionId)) {
        console.error('[Controller] ❌ Cross-institution access denied:', {
          userInstitution: req.user.institutionId,
          liveClassInstitution: live.institutionId
        });
        return res.status(403).json({ message: 'Forbidden: cross-institution access' });
      }
    }

    // 🔹 IMPROVEMENT 1: Prevent duplicates
    if (live.streamInfo && live.streamInfo.broadcastId) {
      console.log('[Controller] ℹ️ Stream already exists, returning existing data');
      return res.status(200).json({
        message: 'Stream already exists',
        id: live._id,
        status: live.status,
        streamInfo: {
          streamId: live.streamInfo.streamId,
          broadcastId: live.streamInfo.broadcastId,
          liveUrl: live.streamInfo.liveUrl,
          scheduledStartTime: live.streamInfo.scheduledStartTime,
          privacyStatus: live.streamInfo.privacyStatus,
        },
      });
    }

    console.log('[Controller] 🔍 Looking up Timetable...');
    const timetable = await Timetable.findById(live.timetableId);
    if (!timetable) {
      console.error('[Controller] ❌ Linked timetable not found:', live.timetableId);
      return res.status(404).json({ message: 'Linked timetable not found' });
    }
    console.log('[Controller] ✅ Timetable found:', {
      subject: timetable.subject,
      batch: timetable.batch,
      day: timetable.day,
      startTime: timetable.startTime
    });

    const streamTitle = title || `${timetable.subject} - ${timetable.batch} - ${timetable.day} ${timetable.startTime}`;
    console.log('[Controller] 📝 Stream title:', streamTitle);

    // Schedule stream to start 5 minutes from now (YouTube requires future time)
    const scheduledStartTime = new Date();
    scheduledStartTime.setMinutes(scheduledStartTime.getMinutes() + 5);
    console.log('[Controller] ⏰ Scheduled start time (5 min from now):', scheduledStartTime.toISOString());

    console.log('[Controller] 🚀 Creating YouTube assets...');
    // Create YouTube assets using platform-owned channel (via env OAuth; not exposed in response)
    const stream = await createLiveStream({ title: streamTitle });
    const broadcast = await createLiveBroadcast({
      title: streamTitle,
      scheduledStartTime: scheduledStartTime.toISOString()
    });
    await bindBroadcastToStream({ broadcastId: broadcast.id, streamId: stream.id });

    console.log('[Controller] 💾 Saving stream info to database...');
    // Persist minimal info; keep sensitive ingestion details server-side only
    live.streamInfo = {
      streamId: stream.id,
      broadcastId: broadcast.id,
      streamKey: stream?.cdn?.ingestionInfo?.streamName,
      liveUrl: broadcast?.id ? `https://www.youtube.com/watch?v=${broadcast.id}` : undefined,
      // Store sensitive ingestion info internally but do not return in response
      ingestionAddress: stream?.cdn?.ingestionInfo?.ingestionAddress,
      streamName: stream?.cdn?.ingestionInfo?.streamName,
      backupIngestionAddress: stream?.cdn?.ingestionInfo?.backupIngestionAddress,
      privacyStatus: broadcast?.status?.privacyStatus || 'unlisted',
      scheduledStartTime: broadcast?.snippet?.scheduledStartTime || scheduledStartTime.toISOString(),
    };

    await live.save();
    console.log('[Controller] ✅ Stream info saved successfully');

    const response = {
      id: live._id,
      status: live.status,
      streamInfo: {
        streamId: stream.id,
        broadcastId: broadcast.id,
        liveUrl: live.streamInfo.liveUrl,
        scheduledStartTime: live.streamInfo.scheduledStartTime,
        privacyStatus: live.streamInfo.privacyStatus,
        // Sensitive fields intentionally omitted
      },
    };
    console.log('[Controller] 🎉 Stream created successfully, sending response:', response);
    return res.status(201).json(response);
  } catch (err) {
    console.error('[Controller] ❌ scheduleLiveClass error:', {
      message: err.message,
      stack: err.stack
    });
    // Avoid leaking credential-related errors verbatim
    return res.status(500).json({ message: 'Failed to schedule live stream', error: err.message });
  }
}

async function getTeacherStreamKey(req, res) {
  try {
    const { id } = req.params; // liveClass id
    console.log('\n[Controller] 🔑 getTeacherStreamKey called:', { liveClassId: id });

    const live = await LiveClass.findById(id);
    if (!live) {
      console.error('[Controller] ❌ LiveClass not found:', id);
      return res.status(404).json({ message: 'LiveClass not found' });
    }
    console.log('[Controller] ✅ LiveClass found:', {
      id: live._id,
      hasStreamInfo: !!live.streamInfo,
      hasStreamKey: !!(live.streamInfo?.streamKey || live.streamInfo?.streamName)
    });

    // Scope check
    if (req.user && req.user.role !== 'SuperAdmin') {
      if (!req.user.institutionId || String(req.user.institutionId) !== String(live.institutionId)) {
        console.error('[Controller] ❌ Cross-institution access denied');
        return res.status(403).json({ message: 'Forbidden: cross-institution access' });
      }
    }

    const timetable = await Timetable.findById(live.timetableId);
    if (!timetable) {
      console.error('[Controller] ❌ Linked timetable not found:', live.timetableId);
      return res.status(404).json({ message: 'Linked timetable not found' });
    }

    // Only assigned teacher or admins can view the stream key
    const isAssignedTeacher = req.user && req.user.role === 'Teacher' && String(timetable.teacher) === String(req.user.sub);
    const isAllowedAdmin = req.user && ['InstitutionAdmin', 'AcademicAdmin', 'SuperAdmin'].includes(req.user.role);
    console.log('[Controller] 🔐 Permission check:', {
      userRole: req.user?.role,
      isAssignedTeacher,
      isAllowedAdmin
    });

    if (!isAssignedTeacher && !isAllowedAdmin) {
      console.error('[Controller] ❌ User not authorized to view stream key');
      return res.status(403).json({ message: 'Forbidden' });
    }

    const streamKey = live?.streamInfo?.streamKey || live?.streamInfo?.streamName; // backwards compat
    const ingestionAddress = live?.streamInfo?.ingestionAddress;

    if (!streamKey) {
      console.error('[Controller] ❌ Stream key not available - stream not created yet');
      return res.status(404).json({ message: 'Stream key not available. Please create a stream first.' });
    }

    console.log('[Controller] ✅ Returning stream key');
    // Return copy-only value; client enforces copy UI (no direct edits server-side anyway)
    return res.status(200).json({ streamKey, ingestionAddress });
  } catch (err) {
    console.error('[Controller] ❌ getTeacherStreamKey error:', {
      message: err.message,
      stack: err.stack
    });
    return res.status(500).json({ message: 'Failed to fetch stream key' });
  }
}

async function getJoinLink(req, res) {
  try {
    const { id } = req.params; // liveClass id
    const live = await LiveClass.findById(id);
    if (!live) return res.status(404).json({ message: 'LiveClass not found' });

    // Institution scope for non-superadmin
    if (req.user && req.user.role !== 'SuperAdmin') {
      if (!req.user.institutionId || String(req.user.institutionId) !== String(live.institutionId)) {
        return res.status(403).json({ message: 'Forbidden: cross-institution access' });
      }
    }

    const liveUrl = live?.streamInfo?.liveUrl || (live?.streamInfo?.broadcastId ? `https://www.youtube.com/watch?v=${live.streamInfo.broadcastId}` : undefined);
    if (!liveUrl) return res.status(404).json({ message: 'Join link not available' });

    return res.status(200).json({ liveUrl });
  } catch (err) {
    return res.status(500).json({ message: 'Failed to fetch join link' });
  }
}

async function getLiveClass(req, res) {
  try {
    const { id } = req.params;
    const live = await LiveClass.findById(id).populate({
      path: 'timetableId',
      populate: [
        { path: 'teacher' },
        { path: 'batch' }
      ]
    });

    if (!live) return res.status(404).json({ message: 'LiveClass not found' });

    // Scope check
    if (req.user && req.user.role !== 'SuperAdmin') {
      if (!req.user.institutionId || String(req.user.institutionId) !== String(live.institutionId)) {
        return res.status(403).json({ message: 'Forbidden: cross-institution access' });
      }
    }

    // Flatten response for frontend consistency
    const response = {
      _id: live._id,
      institutionId: live.institutionId,
      timetableId: live.timetableId?._id,
      status: live.status,
      streamInfo: live.streamInfo,
      // Flattened fields for easy access
      subject: live.timetableId?.subject,
      batch: live.timetableId?.batch, // Object (populated)
      teacher: live.timetableId?.teacher, // Object (populated)
      startTime: live.timetableId?.startTime,
      endTime: live.timetableId?.endTime,
      youtubeUrl: live.streamInfo?.liveUrl, // Backwards compatibility if needed
      recordings: live.recordings || []
    };

    return res.status(200).json(response);
  } catch (err) {
    console.error('getLiveClass error:', err);
    return res.status(500).json({ message: 'Failed to fetch live class' });
  }
}

async function getOrCreateByTimetable(req, res) {
  try {
    const { timetableId } = req.params;
    console.log('\n[Controller] 🔍 getOrCreateByTimetable called:', { timetableId });

    const timetable = await Timetable.findById(timetableId);
    if (!timetable) {
      console.error('[Controller] ❌ Timetable not found:', timetableId);
      return res.status(404).json({ message: 'Timetable not found' });
    }
    console.log('[Controller] ✅ Timetable found:', {
      id: timetable._id,
      subject: timetable.subject,
      batch: timetable.batch,
      institutionId: timetable.institutionId
    });

    // Scope check
    if (req.user && req.user.role !== 'SuperAdmin') {
      if (!req.user.institutionId || String(req.user.institutionId) !== String(timetable.institutionId)) {
        console.error('[Controller] ❌ Cross-institution access denied');
        return res.status(403).json({ message: 'Forbidden: cross-institution access' });
      }
    }

    let live = await LiveClass.findOne({ timetableId });
    console.log('[Controller] 🔍 LiveClass lookup result:', live ? 'Found existing' : 'Not found, will create');

    if (!live) {
      console.log('[Controller] 🆕 Creating new LiveClass...');
      live = await LiveClass.create({
        institutionId: timetable.institutionId,
        timetableId: timetable._id,
        status: 'Scheduled',
        streamInfo: {}
      });
      console.log('[Controller] ✅ LiveClass created:', live._id);
    }

    const populated = await LiveClass.findById(live._id).populate('timetableId');

    const response = {
      _id: populated._id,
      institutionId: populated.institutionId,
      timetableId: populated.timetableId._id,
      status: populated.status,
      streamInfo: populated.streamInfo,
      subject: populated.timetableId.subject,
      batch: populated.timetableId.batch,
      startTime: populated.timetableId.startTime,
      endTime: populated.timetableId.endTime,
      teacher: populated.timetableId.teacher,
      batchId: populated.timetableId.batchId,
      subjectId: populated.timetableId.subjectId
    };

    console.log('[Controller] ✅ Returning response:', { liveClassId: response._id });
    return res.status(200).json(response);

  } catch (err) {
    console.error('[Controller] ❌ getOrCreateByTimetable error:', {
      message: err.message,
      stack: err.stack
    });
    return res.status(500).json({ message: 'Failed to resolve live class' });
  }
}

async function endLiveClass(req, res) {
  try {
    const { id } = req.params;
    console.log('\n[Controller] 🛑 endLiveClass called:', {
      liveClassId: id,
      userId: req.user?._id,
      userRole: req.user?.role
    });

    console.log('[Controller] 🔍 Looking up LiveClass...');
    const live = await LiveClass.findById(id);
    if (!live) {
      console.error('[Controller] ❌ LiveClass not found:', id);
      return res.status(404).json({ message: 'LiveClass not found' });
    }
    console.log('[Controller] ✅ LiveClass found:', {
      id: live._id,
      status: live.status,
      hasBroadcastId: !!live.streamInfo?.broadcastId
    });

    // Scope check
    if (req.user && req.user.role !== 'SuperAdmin') {
      if (!req.user.institutionId || String(req.user.institutionId) !== String(live.institutionId)) {
        console.error('[Controller] ❌ Cross-institution access denied');
        return res.status(403).json({ message: 'Forbidden' });
      }
    }

    if (live.status === 'Completed' || live.status === 'Cancelled') {
      console.log('[Controller] ℹ️ Stream already ended:', live.status);
      return res.status(400).json({ message: 'Stream already ended' });
    }

    const broadcastId = live.streamInfo?.broadcastId;
    if (broadcastId) {
      try {
        console.log('[Controller] 🚀 Ending YouTube broadcast...');
        await endLiveBroadcast(broadcastId);
        console.log('[Controller] ✅ YouTube broadcast ended successfully');
      } catch (e) {
        console.error('[Controller] ⚠️ Failed to end YouTube broadcast:', e.message);
        // Continue anyway to update database status
      }
    } else {
      console.log('[Controller] ℹ️ No broadcast ID found, skipping YouTube API call');
    }

    console.log('[Controller] 💾 Updating LiveClass status to Completed...');
    live.status = 'Completed';
    live.actualEndTime = new Date();

    // Auto-save recording details from broadcast ID
    if (broadcastId) {
      live.recordings.push({
        youtubeVideoId: broadcastId,
        title: 'Recorded Class',
        url: `https://www.youtube.com/watch?v=${broadcastId}`,
        publishedAt: new Date()
      });
    }

    await live.save();
    console.log('[Controller] ✅ LiveClass status updated successfully');

    console.log('[Controller] 🎉 Stream ended successfully, sending response');
    return res.status(200).json({ message: 'Stream ended', status: 'Completed' });
  } catch (err) {
    console.error('[Controller] ❌ endLiveClass error:', {
      message: err.message,
      stack: err.stack
    });
    return res.status(500).json({ message: 'Failed to end stream' });
  }
}

// 🔹 IMPROVEMENT 2: Check and update stream status from YouTube
async function checkStreamStatus(req, res) {
  try {
    const { id } = req.params;
    const live = await LiveClass.findById(id);
    if (!live) return res.status(404).json({ message: 'LiveClass not found' });

    // Scope check
    if (req.user && req.user.role !== 'SuperAdmin') {
      if (!req.user.institutionId || String(req.user.institutionId) !== String(live.institutionId)) {
        return res.status(403).json({ message: 'Forbidden' });
      }
    }

    const broadcastId = live.streamInfo?.broadcastId;
    if (!broadcastId) {
      return res.status(200).json({
        status: live.status,
        message: 'No broadcast created yet'
      });
    }

    // Poll YouTube API for current status
    const ytStatus = await getYouTubeStreamStatus(broadcastId);

    // Auto-update LiveClass status based on YouTube status
    if (ytStatus?.lifeCycleStatus === 'live' && live.status !== 'Live') {
      live.status = 'Live';
      if (!live.actualStartTime) live.actualStartTime = new Date();
      await live.save();
    } else if (ytStatus?.lifeCycleStatus === 'complete' && live.status !== 'Completed') {
      live.status = 'Completed';
      live.actualEndTime = new Date();
      if (broadcastId) {
        live.recordings.push({
          youtubeVideoId: broadcastId,
          title: 'Recorded Class',
          url: `https://www.youtube.com/watch?v=${broadcastId}`,
          publishedAt: new Date()
        });
      }
      await live.save();
    }

    return res.status(200).json({
      status: live.status,
      youtubeStatus: ytStatus?.lifeCycleStatus,
      streamHealthStatus: ytStatus?.streamStatus,
      updated: true
    });

  } catch (err) {
    console.error('checkStreamStatus error:', err);
    return res.status(500).json({ message: 'Failed to check stream status' });
  }
}

module.exports = { scheduleLiveClass, getTeacherStreamKey, getJoinLink, getLiveClass, getOrCreateByTimetable, endLiveClass, checkStreamStatus };
