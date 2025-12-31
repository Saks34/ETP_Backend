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

module.exports = { getLiveClassAnalytics, getTeacherStats, getAdminStats };
