const { Report } = require('./report.model');
const { LiveClass } = require('../liveClass/liveclass.model');
const { User } = require('../auth/user.model');
const catchAsync = require('../../utils/catchAsync');
const AppError = require('../../utils/AppError');
const sendResponse = require('../../utils/response');

/**
 * Submit a new report (Student, Moderator, Teacher)
 */
const submitReport = catchAsync(async (req, res, next) => {
    const { liveClassId, reportedUserId, messageId, reason, description } = req.body;
    const reporterId = req.user.sub || req.user.id;

    if (!liveClassId || !reportedUserId || !reason) {
        return next(new AppError('liveClassId, reportedUserId, and reason are required', 400));
    }

    if (String(reporterId) === String(reportedUserId)) {
        return next(new AppError('Cannot report yourself', 400));
    }

    const live = await LiveClass.findById(liveClassId);
    if (!live) return next(new AppError('LiveClass not found', 404));

    if (req.user.role !== 'SuperAdmin') {
        if (!req.user.institutionId || String(req.user.institutionId) !== String(live.institutionId)) {
            return next(new AppError('Forbidden: cross-institution access', 403));
        }
    }

    const reportedUser = await User.findById(reportedUserId);
    if (!reportedUser) return next(new AppError('Reported user not found', 404));

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

    return sendResponse(res, 201, { reportId: report._id }, 'Report submitted successfully');
});

/**
 * Get all reports (Admin only)
 */
const getAllReports = catchAsync(async (req, res, next) => {
    const institutionId = req.user.institutionId;

    if (!institutionId && req.user.role !== 'SuperAdmin') {
        return next(new AppError('Institution ID required', 400));
    }

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

    return sendResponse(res, 200, {
        reports,
        total,
        limit: parseInt(limit, 10),
        skip: parseInt(skip, 10)
    });
});

/**
 * Get my reports (Student, Moderator, Teacher)
 */
const getMyReports = catchAsync(async (req, res, next) => {
    const reporterId = req.user.sub || req.user.id;
    const institutionId = req.user.institutionId;

    const query = { reporterId };
    if (institutionId) query.institutionId = institutionId;

    const reports = await Report.find(query)
        .sort({ createdAt: -1 })
        .populate('reportedUserId', 'name email role')
        .populate('liveClassId', 'title status')
        .lean();

    return sendResponse(res, 200, { reports });
});

/**
 * Resolve a report (Admin only)
 */
const resolveReport = catchAsync(async (req, res, next) => {
    const { id } = req.params;
    const { status } = req.body;
    const reviewerId = req.user.sub || req.user.id;

    if (!status || !['reviewed', 'resolved'].includes(status)) {
        return next(new AppError('Status must be "reviewed" or "resolved"', 400));
    }

    const report = await Report.findById(id);
    if (!report) return next(new AppError('Report not found', 404));

    if (req.user.role !== 'SuperAdmin') {
        if (!req.user.institutionId || String(req.user.institutionId) !== String(report.institutionId)) {
            return next(new AppError('Forbidden: cross-institution access', 403));
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

    return sendResponse(res, 200, { report: updated }, 'Report updated successfully');
});

module.exports = {
    submitReport,
    getAllReports,
    getMyReports,
    resolveReport
};
