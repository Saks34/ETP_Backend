const mongoose = require('mongoose');

const ResourceSchema = new mongoose.Schema(
  {
    // Institution-scoped access
    institutionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Institution', required: true, index: true },

    // Optional associations for simple filtering/grouping
    subjectId: { type: String, index: true },
    batchId: { type: String, index: true },
    teacherId: { type: String, index: true },
    liveClassId: { type: mongoose.Schema.Types.ObjectId, ref: 'LiveClass', index: true },

    // Resource metadata
    title: { type: String, required: true, trim: true },
    fileUrl: { type: String, required: true, trim: true },
    fileType: { type: String, enum: ['pdf', 'image', 'doc'], required: true, index: true },
  },
  { timestamps: true }
);

const Resource = mongoose.model('Resource', ResourceSchema);

module.exports = { Resource };
