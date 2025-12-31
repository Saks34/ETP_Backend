const mongoose = require('mongoose');

const NoteSchema = new mongoose.Schema(
  {
    institutionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Institution', required: true, index: true },
    subjectId: { type: String, required: true, index: true },
    batchId: { type: String, required: true, index: true },
    teacherId: { type: String, required: true, index: true },
    liveClassId: { type: mongoose.Schema.Types.ObjectId, ref: 'LiveClass', required: false, index: true },
    title: { type: String, required: true, trim: true },
    // Legacy fields kept for compatibility
    fileUrl: { type: String, required: false, trim: true },
    fileType: { type: String, enum: ['pdf', 'image', 'doc'], required: false, index: true },
    // Cloudinary fields (preferred)
    secureUrl: { type: String, required: false, trim: true },
    publicId: { type: String, required: false, index: true },
    resourceType: { type: String, required: false, index: true },
  },
  { timestamps: true }
);

const Note = mongoose.model('Note', NoteSchema);

module.exports = { Note };
