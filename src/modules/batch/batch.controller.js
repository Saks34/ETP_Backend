const { Batch } = require('./batch.model');
const { User } = require('../auth/user.model');
const mongoose = require('mongoose');
const { ObjectId } = mongoose.Types;

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

async function createBatch(req, res) {
    try {
        const { institutionId, error } = getInstitutionContext(req);
        if (error) return res.status(error.code).json({ message: error.message });

        const { name, academicYear, subjects, description } = req.body || {};
        if (!name) return res.status(400).json({ message: 'name is required' });

        const batch = await Batch.create({
            institutionId,
            name: name.trim(),
            academicYear,
            subjects: subjects || [],
            description,
            studentCount: 0,
        });

        return res.status(201).json({ batch });
    } catch (err) {
        console.error('createBatch error:', err);
        if (err.code === 11000) {
            return res.status(409).json({ message: 'Batch name already exists for this institution' });
        }
        return res.status(500).json({ message: 'Failed to create batch', error: err.message });
    }
}

async function listBatches(req, res) {
    try {
        const { institutionId, error } = getInstitutionContext(req);
        if (error) return res.status(error.code).json({ message: error.message });

        // Use aggregation to count students dynamically
        const batches = await Batch.aggregate([
            { $match: { institutionId: new ObjectId(String(institutionId)) } },
            {
                $lookup: {
                    from: 'users',
                    let: { batchId: '$_id' },
                    pipeline: [
                        { $match: { $expr: { $and: [{ $eq: ['$batchId', '$$batchId'] }, { $eq: ['$role', 'Student'] }] } } }
                    ],
                    as: 'students'
                }
            },
            {
                $addFields: {
                    studentCount: { $size: '$students' }
                }
            },
            { $project: { students: 0 } }, // Remove heavy students array
            { $sort: { createdAt: -1 } }
        ]);

        return res.status(200).json({ batches });
    } catch (err) {
        console.error('listBatches error:', err);
        return res.status(500).json({ message: 'Failed to fetch batches', error: err.message });
    }
}

async function getBatch(req, res) {
    try {
        const { institutionId, error } = getInstitutionContext(req);
        if (error) return res.status(error.code).json({ message: error.message });

        const { id } = req.params;
        const batch = await Batch.findById(id);

        if (!batch) return res.status(404).json({ message: 'Batch not found' });
        if (String(batch.institutionId) !== String(institutionId)) {
            return res.status(403).json({ message: 'Forbidden: cross-institution access' });
        }

        return res.status(200).json({ batch });
    } catch (err) {
        console.error('getBatch error:', err);
        return res.status(500).json({ message: 'Failed to fetch batch', error: err.message });
    }
}

async function updateBatch(req, res) {
    try {
        const { institutionId, error } = getInstitutionContext(req);
        if (error) return res.status(error.code).json({ message: error.message });

        const { id } = req.params;
        const { name, academicYear, subjects, description } = req.body || {};

        const batch = await Batch.findById(id);
        if (!batch) return res.status(404).json({ message: 'Batch not found' });
        if (String(batch.institutionId) !== String(institutionId)) {
            return res.status(403).json({ message: 'Forbidden: cross-institution access' });
        }

        if (name) batch.name = name.trim();
        if (academicYear !== undefined) batch.academicYear = academicYear;
        if (subjects !== undefined) batch.subjects = subjects;
        if (description !== undefined) batch.description = description;

        await batch.save();
        return res.status(200).json({ batch });
    } catch (err) {
        console.error('updateBatch error:', err);
        if (err.code === 11000) {
            return res.status(409).json({ message: 'Batch name already exists for this institution' });
        }
        return res.status(500).json({ message: 'Failed to update batch', error: err.message });
    }
}

async function deleteBatch(req, res) {
    try {
        const { institutionId, error } = getInstitutionContext(req);
        if (error) return res.status(error.code).json({ message: error.message });

        const { id } = req.params;
        const batch = await Batch.findById(id);

        if (!batch) return res.status(404).json({ message: 'Batch not found' });
        if (String(batch.institutionId) !== String(institutionId)) {
            return res.status(403).json({ message: 'Forbidden: cross-institution access' });
        }

        // Check if batch has students
        const studentCount = await User.countDocuments({
            institutionId,
            batchId: id,
            role: 'Student'
        });

        if (studentCount > 0) {
            return res.status(400).json({
                message: `Cannot delete batch with ${studentCount} assigned students. Please reassign students first.`
            });
        }

        await batch.deleteOne();
        return res.status(200).json({ success: true, message: 'Batch deleted successfully' });
    } catch (err) {
        console.error('deleteBatch error:', err);
        return res.status(500).json({ message: 'Failed to delete batch', error: err.message });
    }
}

module.exports = {
    createBatch,
    listBatches,
    getBatch,
    updateBatch,
    deleteBatch
};
