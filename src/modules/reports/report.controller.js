const { Report } = require('./report.model');
const { LiveClass } = require('../liveClass/liveclass.model');
const { User } = require('../auth/user.model');

/**
 * Submit a new report (Student, Moderator, Teacher)
 */
async function submitReport(req, res) {
    try {
        const { liveClassId, reportedUserId, messageId, reason, description } = req.body;
        const reporterId = req.user.sub;

        // Validation
        if (!liveClassId || !reportedUserId || !reason) {
            return res.status(400).json({
                message: 'liveClassId, reportedUserId, and reason are required'
            });
        }

        // Prevent self-reporting
        if (String(reporterId) === String(reportedUserId)) {
            return res.status(400).json({ message: 'Cannot report yourself' });
        }

        // Load LiveClass to get institutionId and verify scope
        const live = await LiveClass.findById(liveClassId);
        if (!live) {
            return res.status(404).json({ message: 'LiveClass not found' });
        }

        // Institution scope check
        if (req.user.role !== 'SuperAdmin') {
            if (!req.user.institutionId || String(req.user.institutionId) !== String(live.institutionId)) {
                return res.status(403).json({ message: 'Forbidden: cross-institution access' });
            }
        }

        // Verify reported user exists
        const reportedUser = await User.findById(reportedUserId);
        if (!reportedUser) {
            return res.status(404).json({ message: 'Reported user not found' });
        }

        // Create report
        const report = await Report.create({
            institutionId: live.institutionId,
            liveClassId,
            reporterId,
            reportedUserId,
            messageId: messageId || undefined,
            reason,
            description: description || undefined,
            status: 'open'
        });

        return res.status(201).json({
            message: 'Report submitted successfully',
            reportId: report._id
        });
    } catch (err) {
        console.error('submitReport error:', err);
        return res.status(500).json({ message: 'Failed to submit report' });
    }
}

/**
 * Get all reports (Admin only)
 */
async function getAllReports(req, res) {
    try {
        const institutionId = req.user.institutionId;

        if (!institutionId && req.user.role !== 'SuperAdmin') {
            return res.status(400).json({ message: 'Institution ID required' });
        }

        // Optional filters
        const { status, liveClassId, limit = 50, skip = 0 } = req.query;

        const query = {};
        if (institutionId) query.institutionId = institutionId;
        if (status) query.status = status;
        if (liveClassId) query.liveClassId = liveClassId;

        const reports = await Report.find(query)
            .sort({ createdAt: -1 })
            .limit(parseInt(limit, 10))
            .skip(parseInt(skip, 10))
            .populate('reporterId', 'name email role')
            .populate('reportedUserId', 'name email role')
            .populate('liveClassId', 'title status')
            .populate('reviewedBy', 'name email')
            .lean();

        const total = await Report.countDocuments(query);

        return res.status(200).json({
            reports,
            total,
            limit: parseInt(limit, 10),
            skip: parseInt(skip, 10)
        });
    } catch (err) {
        console.error('getAllReports error:', err);
        return res.status(500).json({ message: 'Failed to fetch reports' });
    }
}

/**
 * Get my reports (Student, Moderator, Teacher)
 */
async function getMyReports(req, res) {
    try {
        const reporterId = req.user.sub;
        const institutionId = req.user.institutionId;

        const query = { reporterId };
        if (institutionId) query.institutionId = institutionId;

        const reports = await Report.find(query)
            .sort({ createdAt: -1 })
            .populate('reportedUserId', 'name email role')
            .populate('liveClassId', 'title status')
            .lean();

        return res.status(200).json({ reports });
    } catch (err) {
        console.error('getMyReports error:', err);
        return res.status(500).json({ message: 'Failed to fetch your reports' });
    }
}

/**
 * Resolve a report (Admin only)
 */
async function resolveReport(req, res) {
    try {
        const { id } = req.params;
        const { status } = req.body;
        const reviewerId = req.user.sub;

        if (!status || !['reviewed', 'resolved'].includes(status)) {
            return res.status(400).json({
                message: 'Status must be "reviewed" or "resolved"'
            });
        }

        const report = await Report.findById(id);
        if (!report) {
            return res.status(404).json({ message: 'Report not found' });
        }

        // Institution scope check
        if (req.user.role !== 'SuperAdmin') {
            if (!req.user.institutionId || String(req.user.institutionId) !== String(report.institutionId)) {
                return res.status(403).json({ message: 'Forbidden: cross-institution access' });
            }
        }

        report.status = status;
        report.reviewedBy = reviewerId;
        report.reviewedAt = new Date();
        await report.save();

        const updated = await Report.findById(id)
            .populate('reporterId', 'name email role')
            .populate('reportedUserId', 'name email role')
            .populate('reviewedBy', 'name email')
            .lean();

        return res.status(200).json({
            message: 'Report updated successfully',
            report: updated
        });
    } catch (err) {
        console.error('resolveReport error:', err);
        return res.status(500).json({ message: 'Failed to update report' });
    }
}

module.exports = {
    submitReport,
    getAllReports,
    getMyReports,
    resolveReport
};
