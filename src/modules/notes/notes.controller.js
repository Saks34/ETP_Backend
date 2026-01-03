// Notes module refactored to native MongoDB driver (reference implementation)
// Other modules may still use Mongoose for now. Do NOT change API contracts.
const { getDB, ObjectId } = require('../../database/mongo');
const Collections = require('../../database/collections');
const { deleteByPublicId } = require('../../services/cloudinary.service');

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

async function createNote(req, res) {
  try {
    const { institutionId, error } = getInstitutionContext(req);
    if (error) return res.status(error.code).json({ message: error.message });

    const role = req.user && req.user.role;
    if (!['Teacher', 'InstitutionAdmin', 'AcademicAdmin', 'SuperAdmin'].includes(role)) {
      return res.status(403).json({ message: 'Forbidden' });
    }

    const { title, fileUrl, fileType, secureUrl, publicId, resourceType, subjectId, batchId, teacherId, liveClassId } = req.body || {};
    if (!title) return res.status(400).json({ message: 'title is required' });
    // Accept either legacy URL fields or Cloudinary fields
    const hasLegacy = !!(fileUrl && fileType);
    const hasCloud = !!(secureUrl && publicId && resourceType);
    if (!hasLegacy && !hasCloud) {
      return res.status(400).json({ message: 'Provide either fileUrl+fileType or secureUrl+publicId+resourceType' });
    }

    if (!subjectId && !liveClassId) {
      return res.status(400).json({ message: 'Either subjectId or liveClassId is required' });
    }

    // If provided, validate liveClass belongs to same institution
    if (liveClassId) {
      const db = getDB();
      const live = await db.collection(Collections.TF_LIVE_CLASSES).findOne({ _id: new ObjectId(liveClassId) }, { projection: { institutionId: 1 } });
      if (!live) return res.status(404).json({ message: 'LiveClass not found' });
      if (String(live.institutionId) !== String(institutionId)) {
        return res.status(403).json({ message: 'Forbidden: cross-institution access' });
      }
    }

    // Determine teacherId: default to current user if Teacher
    let uploaderTeacherId = teacherId;
    if (role === 'Teacher') {
      uploaderTeacherId = req.user && req.user.sub;
    }
    if (!uploaderTeacherId) return res.status(400).json({ message: 'teacherId is required' });

    if (!batchId) return res.status(400).json({ message: 'batchId is required' });
    if (hasLegacy) {
      if (!['pdf', 'image', 'doc'].includes(fileType)) {
        return res.status(400).json({ message: 'fileType must be one of pdf,image,doc' });
      }
    }

    const now = new Date();
    const payload = {
      // Stored with ObjectId for institution scoping
      institutionId: new ObjectId(institutionId),
      subjectId: subjectId || null,
      batchId,
      teacherId: uploaderTeacherId,
      liveClassId: liveClassId ? new ObjectId(liveClassId) : null,
      title,
      createdAt: now,
      updatedAt: now,
    };
    if (hasLegacy) {
      payload.fileUrl = fileUrl;
      payload.fileType = fileType;
    }
    if (hasCloud) {
      payload.secureUrl = secureUrl;
      payload.publicId = publicId;
      payload.resourceType = resourceType;
    }
    const db = getDB();
    const { insertedId } = await db.collection(Collections.TF_NOTES).insertOne(payload);
    const note = await db.collection(Collections.TF_NOTES).findOne({ _id: insertedId });
    return res.status(201).json({ note });
  } catch (err) {
    return res.status(500).json({ message: 'Failed to create note' });
  }
}

async function listNotes(req, res) {
  try {
    const { institutionId, error } = getInstitutionContext(req);
    if (error) return res.status(error.code).json({ message: error.message });

    const role = req.user && req.user.role;
    const userId = req.user && req.user.sub;

    const { batchId, subjectId, teacherId, liveClassId } = req.query || {};

    const db = getDB();
    const filter = { institutionId: new ObjectId(institutionId) };

    if (role === 'Student') {
      if (!batchId) return res.status(400).json({ message: 'batchId is required for students' });
      filter.batchId = batchId;
    } else if (role === 'Teacher') {
      // Teachers see their own uploads; optional further filters apply
      filter.teacherId = userId;
      if (batchId) filter.batchId = batchId;
    } else if (['InstitutionAdmin', 'AcademicAdmin', 'SuperAdmin'].includes(role)) {
      // Admins can view all; optional filters
      if (batchId) filter.batchId = batchId;
      if (teacherId) filter.teacherId = teacherId;
    } else {
      return res.status(403).json({ message: 'Forbidden' });
    }

    if (subjectId) filter.subjectId = subjectId;
    if (liveClassId) filter.liveClassId = new ObjectId(liveClassId);

    const notes = await db
      .collection(Collections.TF_NOTES)
      .find(filter)
      .sort({ createdAt: -1 })
      .toArray();
    return res.status(200).json({ notes });
  } catch (err) {
    console.error('listNotes error:', err);
    return res.status(500).json({ message: 'Failed to fetch notes', error: err.message });
  }
}

module.exports = { createNote, listNotes };

async function listNotesByBatchStudent(req, res) {
  try {
    const { institutionId, error } = getInstitutionContext(req);
    if (error) return res.status(error.code).json({ message: error.message });

    const role = req.user && req.user.role;
    if (!['Student', 'Teacher', 'InstitutionAdmin', 'AcademicAdmin', 'SuperAdmin'].includes(role)) {
      return res.status(403).json({ message: 'Forbidden' });
    }

    const { batchId } = req.query || {};
    if (!batchId) return res.status(400).json({ message: 'batchId is required' });

    const db = getDB();
    const pipeline = [
      { $match: { institutionId: new ObjectId(institutionId), batchId } },
      {
        $lookup: {
          from: Collections.TF_LIVE_CLASSES,
          localField: 'liveClassId',
          foreignField: '_id',
          as: 'liveClass',
        },
      },
      { $addFields: { classDate: { $ifNull: [{ $arrayElemAt: ['$liveClass.createdAt', 0] }, '$createdAt'] } } },
      { $sort: { classDate: -1 } },
      { $project: { liveClass: 0 } },
    ];

    const notes = await db.collection(Collections.TF_NOTES).aggregate(pipeline).toArray();
    return res.status(200).json({ notes });
  } catch (err) {
    return res.status(500).json({ message: 'Failed to fetch notes' });
  }
}

async function listNotesBySubjectStudent(req, res) {
  try {
    const { institutionId, error } = getInstitutionContext(req);
    if (error) return res.status(error.code).json({ message: error.message });

    const role = req.user && req.user.role;
    if (!['Student', 'Teacher', 'InstitutionAdmin', 'AcademicAdmin', 'SuperAdmin'].includes(role)) {
      return res.status(403).json({ message: 'Forbidden' });
    }

    const { batchId, subjectId } = req.query || {};
    if (!batchId || !subjectId) return res.status(400).json({ message: 'batchId and subjectId are required' });

    const db = getDB();
    const pipeline = [
      { $match: { institutionId: new ObjectId(institutionId), batchId, subjectId } },
      {
        $lookup: {
          from: Collections.TF_LIVE_CLASSES,
          localField: 'liveClassId',
          foreignField: '_id',
          as: 'liveClass',
        },
      },
      { $addFields: { classDate: { $ifNull: [{ $arrayElemAt: ['$liveClass.createdAt', 0] }, '$createdAt'] } } },
      { $sort: { classDate: -1 } },
      { $project: { liveClass: 0 } },
    ];

    const notes = await db.collection(Collections.TF_NOTES).aggregate(pipeline).toArray();
    return res.status(200).json({ notes });
  } catch (err) {
    return res.status(500).json({ message: 'Failed to fetch notes' });
  }
}

async function listNotesByClassStudent(req, res) {
  try {
    const { institutionId, error } = getInstitutionContext(req);
    if (error) return res.status(error.code).json({ message: error.message });

    const role = req.user && req.user.role;
    if (!['Student', 'Teacher', 'InstitutionAdmin', 'AcademicAdmin', 'SuperAdmin'].includes(role)) {
      return res.status(403).json({ message: 'Forbidden' });
    }

    const { batchId, liveClassId } = req.query || {};
    if (!batchId || !liveClassId) return res.status(400).json({ message: 'batchId and liveClassId are required' });

    const db = getDB();
    const pipeline = [
      { $match: { institutionId: new ObjectId(institutionId), batchId, liveClassId: new ObjectId(liveClassId) } },
      {
        $lookup: {
          from: Collections.TF_LIVE_CLASSES,
          localField: 'liveClassId',
          foreignField: '_id',
          as: 'liveClass',
        },
      },
      { $addFields: { classDate: { $ifNull: [{ $arrayElemAt: ['$liveClass.createdAt', 0] }, '$createdAt'] } } },
      { $sort: { classDate: -1 } },
      { $project: { liveClass: 0 } },
    ];

    const notes = await db.collection(Collections.TF_NOTES).aggregate(pipeline).toArray();
    return res.status(200).json({ notes });
  } catch (err) {
    return res.status(500).json({ message: 'Failed to fetch notes' });
  }
}

module.exports.listNotesByBatchStudent = listNotesByBatchStudent;
module.exports.listNotesBySubjectStudent = listNotesBySubjectStudent;
module.exports.listNotesByClassStudent = listNotesByClassStudent;

async function deleteNote(req, res) {
  try {
    const { institutionId, error } = getInstitutionContext(req);
    if (error) return res.status(error.code).json({ message: error.message });

    const role = req.user && req.user.role;
    const userId = req.user && req.user.sub;
    const { id } = req.params;
    if (!id) return res.status(400).json({ message: 'id is required' });

    const db = getDB();
    const note = await db.collection(Collections.TF_NOTES).findOne({ _id: new ObjectId(id) });
    if (!note) return res.status(404).json({ message: 'Note not found' });
    if (String(note.institutionId) !== String(institutionId)) {
      return res.status(403).json({ message: 'Forbidden' });
    }

    if (role === 'Teacher') {
      if (String(note.teacherId) !== String(userId)) {
        return res.status(403).json({ message: 'Forbidden' });
      }
    } else if (!['InstitutionAdmin', 'AcademicAdmin', 'SuperAdmin'].includes(role)) {
      return res.status(403).json({ message: 'Forbidden' });
    }

    // Delete Cloudinary asset if present
    if (note.publicId) {
      try {
        await deleteByPublicId(note.publicId, note.resourceType || 'image');
      } catch (e) {
        // ignore delete errors to allow DB cleanup
      }
    }

    await db.collection(Collections.TF_NOTES).deleteOne({ _id: new ObjectId(id) });
    return res.status(200).json({ ok: true });
  } catch (err) {
    return res.status(500).json({ message: 'Failed to delete note' });
  }
}

module.exports.deleteNote = deleteNote;
