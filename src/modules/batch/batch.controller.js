const mongoose = require('mongoose');
const { ObjectId } = mongoose.Types;
const Batch = require('./batch.model');
const User = require('../auth/user.model');
const catchAsync = require('../../utils/catchAsync');
const AppError = require('../../utils/AppError');
const sendResponse = require('../../utils/response');


function getInstitutionContext(req) {
    const actor = req.user;
    if (!actor) throw new AppError('Unauthorized', 401);

    // Prefer context set by institutionGuard
    let contextId = req.institutionId || req.body?.institutionId || req.params.institutionId || req.query.institutionId;

    if (actor.role === 'SuperAdmin') {
        if (!contextId) throw new AppError('institutionId is required for SuperAdmin', 400);
        return { institutionId: contextId };
    }

    // For other roles, use their own institutionId if not provided or to enforce isolation
    const institutionId = actor.institutionId || contextId;
    if (!institutionId) throw new AppError('Institution context required', 400);
    return { institutionId: String(institutionId).trim() };
}

const createBatch = catchAsync(async (req, res, next) => {
    const { institutionId } = getInstitutionContext(req);
    const { name, academicYear, subjects, description } = req.body || {};

    if (!name) return next(new AppError('name is required', 400));

    const batch = await Batch.create({
        institutionId,
        name: name.trim(),
        academicYear,
        subjects: subjects || [],
        description,
        studentCount: 0,
    });

    return sendResponse(res, 201, { batch }, 'Batch created successfully');
});

const listBatches = catchAsync(async (req, res, next) => {
    const { institutionId } = getInstitutionContext(req);
    
    if (!institutionId) {
        return next(new AppError('No institution context found for batch listing', 400));
    }

    try {
        // Normalize to string then to ObjectId if valid, else keep as is (Mongoose will handle or fail)
        const queryId = mongoose.Types.ObjectId.isValid(institutionId) 
            ? new ObjectId(String(institutionId)) 
            : institutionId;

        const rawBatches = await Batch.find({ institutionId: queryId })
            .sort({ createdAt: -1 })
            .lean();

        // Attach live studentCount for each batch
        const batches = await Promise.all(
            rawBatches.map(async (batch) => {
                try {
                    // Using the User model to count documents
                    const studentCount = await User.countDocuments({ 
                        batchId: batch._id, 
                        role: 'Student' 
                    });
                    return { ...batch, studentCount };
                } catch (err) {
                    console.error(`Error counting students for batch ${batch._id}:`, err);
                    return { ...batch, studentCount: 0 };
                }
            })
        );

        return sendResponse(res, 200, { batches });
    } catch (error) {
        console.error('CRITICAL: listBatches failed:', error);
        return next(error);
    }
});

const getBatch = catchAsync(async (req, res, next) => {
    const { institutionId } = getInstitutionContext(req);
    const { id } = req.params;

    const batch = await Batch.findById(id);
    if (!batch) return next(new AppError('Batch not found', 404));
    if (String(batch.institutionId) !== String(institutionId)) {
        return next(new AppError('Forbidden: cross-institution access', 403));
    }

    return sendResponse(res, 200, { batch });
});

const updateBatch = catchAsync(async (req, res, next) => {
    const { institutionId } = getInstitutionContext(req);
    const { id } = req.params;
    const { name, academicYear, subjects, description } = req.body || {};

    const batch = await Batch.findById(id);
    if (!batch) return next(new AppError('Batch not found', 404));
    if (String(batch.institutionId) !== String(institutionId)) {
        return next(new AppError('Forbidden: cross-institution access', 403));
    }

    if (name) batch.name = name.trim();
    if (academicYear !== undefined) batch.academicYear = academicYear;
    if (subjects !== undefined) batch.subjects = subjects;
    if (description !== undefined) batch.description = description;

    await batch.save();
    return sendResponse(res, 200, { batch }, 'Batch updated successfully');
});

const deleteBatch = catchAsync(async (req, res, next) => {
    const { institutionId } = getInstitutionContext(req);
    const { id } = req.params;

    const batch = await Batch.findById(id);
    if (!batch) return next(new AppError('Batch not found', 404));
    if (String(batch.institutionId) !== String(institutionId)) {
        return next(new AppError('Forbidden: cross-institution access', 403));
    }

    const studentCount = await User.countDocuments({
        institutionId,
        batchId: id,
        role: 'Student'
    });

    if (studentCount > 0) {
        return next(new AppError(`Cannot delete batch with ${studentCount} assigned students. Please reassign students first.`, 400));
    }

    await batch.deleteOne();
    return sendResponse(res, 200, null, 'Batch deleted successfully');
});

const assignStudentsToBatch = catchAsync(async (req, res, next) => {
    const { institutionId } = getInstitutionContext(req);
    const { id } = req.params;
    const { studentIds } = req.body || {};

    if (!Array.isArray(studentIds) || studentIds.length === 0) {
        return next(new AppError('studentIds must be a non-empty array', 400));
    }

    const batch = await Batch.findById(id);
    if (!batch) return next(new AppError('Batch not found', 404));
    if (String(batch.institutionId) !== String(institutionId)) {
        return next(new AppError('Forbidden: cross-institution access', 403));
    }

    const result = await User.updateMany(
        { _id: { $in: studentIds }, institutionId, role: 'Student' },
        { $set: { batchId: id } }
    );

    return sendResponse(res, 200, { modifiedCount: result.modifiedCount }, `Successfully moved ${result.modifiedCount} students to batch ${batch.name}`);
});

const getBatchAnalytics = catchAsync(async (req, res, next) => {
    const { institutionId } = getInstitutionContext(req);
    const { id } = req.params;

    // Models required for deep analytics
    const { Timetable } = require('../timetable/timetable.model');
    const { LiveClass } = require('../liveClass/liveclass.model');
    const { Poll } = require('../liveClass/poll.model');
    const { Analytics } = require('../analytics/analytics.model');

    const batchId = new ObjectId(String(id));

    // 1. Core data
    const studentCount = await User.countDocuments({ batchId: id, role: 'Student' });
    
    // Find all classes tied to this batch's timetables
    const schedules = await Timetable.find({ batchId: id }).select('_id');
    const scheduleIds = schedules.map(s => s._id);
    const liveClasses = await LiveClass.find({ timetableId: { $in: scheduleIds } }).select('_id');
    const classIds = liveClasses.map(lc => lc._id);

    // 2. Attendance & Watch Time
    const classStats = await Analytics.aggregate([
        { $match: { liveClassId: { $in: classIds } } },
        { 
            $group: { 
                _id: null, 
                totalUniqueViewers: { $sum: '$uniqueViewers' },
                totalWatchTime: { $sum: '$totalWatchTimeSeconds' },
                avgPeakViewers: { $avg: '$peakViewers' },
                classCount: { $count: {} }
            } 
        }
    ]);

    const stats = classStats[0] || { totalUniqueViewers: 0, totalWatchTime: 0, avgPeakViewers: 0, classCount: 0 };
    const avgAttendancePercent = (studentCount > 0 && stats.classCount > 0) 
        ? (stats.totalUniqueViewers / (studentCount * stats.classCount)) * 100 
        : 0;

    // 3. Poll Performance
    const pollStats = await Poll.aggregate([
        { $match: { liveClassId: { $in: classIds } } },
        {
            $group: {
                _id: null,
                totalPolls: { $count: {} },
                totalVotes: { $sum: { $sum: '$results.count' } }
            }
        }
    ]);

    const polls = pollStats[0] || { totalPolls: 0, totalVotes: 0 };
    const avgPollParticipation = (studentCount > 0 && polls.totalPolls > 0)
        ? (polls.totalVotes / (studentCount * polls.totalPolls)) * 100
        : 0;

    return sendResponse(res, 200, {
        summary: {
            studentCount,
            liveClassesHeld: classIds.length,
            totalPollsHeld: polls.totalPolls
        },
        engagement: {
            avgAttendance: Math.round(avgAttendancePercent * 100) / 100, // 2 decimal places
            avgPollParticipation: Math.round(avgPollParticipation * 100) / 100,
            avgWatchTimeMinutes: Math.round((stats.totalWatchTime / (studentCount * (stats.classCount || 1)) / 60))
        },
        raw: {
            totalWatchTimeSeconds: stats.totalWatchTime,
            totalVotesCast: polls.totalVotes
        }
    });
});

module.exports = {
    createBatch,
    listBatches,
    getBatch,
    updateBatch,
    deleteBatch,
    assignStudentsToBatch,
    getBatchAnalytics
};
