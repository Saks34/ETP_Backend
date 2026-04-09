const mongoose = require('mongoose');

const AssignmentSchema = new mongoose.Schema(
  {
    institutionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Institution', required: true, index: true },
    batchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Batch', required: true, index: true },
    teacherId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    title: { type: String, required: true },
    description: { type: String },
    dueDate: { type: Date, required: true },
    attachmentUrl: { type: String }, // Optional file URL
    attachmentType: { type: String }, // Optional file type
  },
  { timestamps: true }
);

const SubmissionSchema = new mongoose.Schema(
  {
    assignmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Assignment', required: true, index: true },
    studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    fileUrl: { type: String, required: true },
    fileType: { type: String },
    status: { type: String, enum: ['on-time', 'late'], default: 'on-time' },
    grade: { type: String }, // e.g., 'A', '95/100', etc.
    feedback: { type: String },
    gradedAt: { type: Date },
    gradedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

// Prevent multiple submissions per assignment (optional, but a good practice)
SubmissionSchema.index({ assignmentId: 1, studentId: 1 }, { unique: true });

const Assignment = mongoose.model('Assignment', AssignmentSchema);
const Submission = mongoose.model('Submission', SubmissionSchema);

module.exports = { Assignment, Submission };
