const { Analytics } = require('./analytics.model');
const { LiveClass } = require('../liveClass/liveclass.model');
const { Timetable } = require('../timetable/timetable.model');

async function getLiveClassAnalytics(req, res) {
    try {
        const { id } = req.params; // liveClassId

        const live = await LiveClass.findById(id);
        if (!live) return res.status(404).json({ message: 'LiveClass not found' });

        // Scope check
        if (req.user.role !== 'SuperAdmin' && req.user.institutionId) {
            if (String(live.institutionId) !== String(req.user.institutionId)) {
                return res.status(403).json({ message: 'Forbidden' });
            }
        }

        let analytics = await Analytics.findOne({ liveClassId: id });

        // Create if doesn't exist
        if (!analytics) {
            analytics = await Analytics.create({
                institutionId: live.institutionId,
                liveClassId: id
            });
        }

        return res.status(200).json(analytics);
    } catch (err) {
        console.error('getLiveClassAnalytics error:', err);
        return res.status(500).json({ message: 'Failed to fetch analytics' });
    }
}

async function getTeacherStats(req, res) {
    try {
        const teacherId = req.user.sub;
        const institutionId = req.user.institutionId;

        // Get all timetables for this teacher
        const timetables = await Timetable.find({
            teacher: teacherId,
            institutionId
        });

        const timetableIds = timetables.map(t => t._id);

        // Get all live classes for these timetables
        const liveClasses = await LiveClass.find({
            timetableId: { $in: timetableIds }
        });

        const liveClassIds = liveClasses.map(lc => lc._id);

        // Get analytics for these classes
        const analyticsData = await Analytics.find({
            liveClassId: { $in: liveClassIds }
        });

        const stats = {
            totalClasses: liveClasses.length,
            completedClasses: liveClasses.filter(lc => lc.status === 'Completed').length,
            liveClasses: liveClasses.filter(lc => lc.status === 'Live').length,
            totalViews: analyticsData.reduce((sum, a) => sum + (a.totalViews || 0), 0),
            avgPeakViewers: analyticsData.length > 0
                ? Math.round(analyticsData.reduce((sum, a) => sum + (a.peakViewers || 0), 0) / analyticsData.length)
                : 0,
            totalChatMessages: analyticsData.reduce((sum, a) => sum + (a.totalChatMessages || 0), 0)
        };

        return res.status(200).json(stats);
    } catch (err) {
        console.error('getTeacherStats error:', err);
        return res.status(500).json({ message: 'Failed to fetch teacher stats' });
    }
}

async function getAdminStats(req, res) {
    try {
        const institutionId = req.user.institutionId;

        if (!institutionId) {
            return res.status(400).json({ message: 'Institution ID required' });
        }

        const liveClasses = await LiveClass.find({ institutionId });
        const liveClassIds = liveClasses.map(lc => lc._id);
        const analyticsData = await Analytics.find({
            liveClassId: { $in: liveClassIds }
        });

        const stats = {
            totalClasses: liveClasses.length,
            completedClasses: liveClasses.filter(lc => lc.status === 'Completed').length,
            liveClasses: liveClasses.filter(lc => lc.status === 'Live').length,
            scheduledClasses: liveClasses.filter(lc => lc.status === 'Scheduled').length,
            totalViews: analyticsData.reduce((sum, a) => sum + (a.totalViews || 0), 0),
            avgPeakViewers: analyticsData.length > 0
                ? Math.round(analyticsData.reduce((sum, a) => sum + (a.peakViewers || 0), 0) / analyticsData.length)
                : 0,
            totalChatMessages: analyticsData.reduce((sum, a) => sum + (a.totalChatMessages || 0), 0)
        };

        return res.status(200).json(stats);
    } catch (err) {
        console.error('getAdminStats error:', err);
        return res.status(500).json({ message: 'Failed to fetch admin stats' });
    }
}

async function recordHeartbeat(req, res) {
    try {
        const { classId, duration } = req.body;
        const userId = req.user.sub;

        // Validation
        if (!classId || !duration) {
            return res.status(400).json({ message: 'classId and duration are required' });
        }

        const durationNum = parseInt(duration, 10);
        if (isNaN(durationNum) || durationNum <= 0 || durationNum > 60) {
            return res.status(400).json({
                message: 'duration must be a number between 1 and 60 seconds'
            });
        }

        // Load LiveClass for institution scope check
        const live = await LiveClass.findById(classId);
        if (!live) {
            return res.status(404).json({ message: 'LiveClass not found' });
        }

        // Scope check
        if (req.user.role !== 'SuperAdmin') {
            if (!req.user.institutionId || String(live.institutionId) !== String(req.user.institutionId)) {
                return res.status(403).json({ message: 'Forbidden' });
            }
        }

        // Find or create analytics document
        let analytics = await Analytics.findOne({ liveClassId: classId });
        if (!analytics) {
            analytics = await Analytics.create({
                institutionId: live.institutionId,
                liveClassId: classId
            });
        }

        // Find user's watch time entry or create new one
        let userEntry = analytics.watchTimeByUser.find(
            entry => String(entry.userId) === String(userId)
        );

        if (!userEntry) {
            // First heartbeat from this user
            analytics.watchTimeByUser.push({
                userId,
                watchTimeSeconds: durationNum,
                lastHeartbeat: new Date()
            });
            analytics.uniqueViewers = analytics.watchTimeByUser.length;
        } else {
            // Update existing user entry
            userEntry.watchTimeSeconds += durationNum;
            userEntry.lastHeartbeat = new Date();
        }

        // Update total watch time
        analytics.totalWatchTimeSeconds += durationNum;

        // Recalculate average watch time
        if (analytics.uniqueViewers > 0) {
            analytics.avgWatchTimeSeconds = Math.round(
                analytics.totalWatchTimeSeconds / analytics.uniqueViewers
            );
        }

        analytics.lastUpdated = new Date();
        await analytics.save();

        // Get user's total watch time for response
        const updatedUserEntry = analytics.watchTimeByUser.find(
            entry => String(entry.userId) === String(userId)
        );

        return res.status(200).json({
            ok: true,
            totalWatchTime: updatedUserEntry?.watchTimeSeconds || 0
        });
    } catch (err) {
        console.error('recordHeartbeat error:', err);
        return res.status(500).json({ message: 'Failed to record heartbeat' });
    }
}

async function getClassWatchTimeStats(req, res) {
    try {
        const { classId } = req.params;

        // Load LiveClass for institution scope check
        const live = await LiveClass.findById(classId);
        if (!live) {
            return res.status(404).json({ message: 'LiveClass not found' });
        }

        // Scope check
        if (req.user.role !== 'SuperAdmin') {
            if (!req.user.institutionId || String(live.institutionId) !== String(req.user.institutionId)) {
                return res.status(403).json({ message: 'Forbidden' });
            }
        }

        const analytics = await Analytics.findOne({ liveClassId: classId })
            .populate('watchTimeByUser.userId', 'name email');

        if (!analytics) {
            return res.status(200).json({
                totalWatchTimeSeconds: 0,
                avgWatchTimeSeconds: 0,
                uniqueViewers: 0,
                topViewers: []
            });
        }

        // Sort by watch time descending and get top 10
        const topViewers = analytics.watchTimeByUser
            .map(entry => ({
                userId: entry.userId?._id,
                userName: entry.userId?.name || 'Unknown',
                userEmail: entry.userId?.email,
                watchTimeSeconds: entry.watchTimeSeconds,
                lastHeartbeat: entry.lastHeartbeat
            }))
            .sort((a, b) => b.watchTimeSeconds - a.watchTimeSeconds)
            .slice(0, 10);

        return res.status(200).json({
            totalWatchTimeSeconds: analytics.totalWatchTimeSeconds,
            avgWatchTimeSeconds: analytics.avgWatchTimeSeconds,
            uniqueViewers: analytics.uniqueViewers,
            topViewers
        });
    } catch (err) {
        console.error('getClassWatchTimeStats error:', err);
        return res.status(500).json({ message: 'Failed to fetch watch time stats' });
    }
}

module.exports = { getLiveClassAnalytics, getTeacherStats, getAdminStats, recordHeartbeat, getClassWatchTimeStats };
