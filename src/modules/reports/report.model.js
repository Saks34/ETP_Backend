const mongoose = require('mongoose');

const ReportSchema = new mongoose.Schema(
    {
        institutionId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Institution',
            required: true,
            index: true
        },
        liveClassId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'LiveClass',
            required: true,
            index: true
        },
        reporterId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
            index: true
        },
        reportedUserId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
            index: true
        },
        messageId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'ChatMessage',
            required: false,
            index: true
        },
        reason: {
            type: String,
            required: true,
            enum: ['harassment', 'spam', 'inappropriate', 'other']
        },
        description: {
            type: String,
            required: false,
            trim: true,
            maxlength: 500
        },
        status: {
            type: String,
            enum: ['open', 'reviewed', 'resolved'],
            default: 'open',
            index: true
        },
        reviewedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: false
        },
        reviewedAt: {
            type: Date,
            required: false
        }
    },
    { timestamps: true }
);

// Compound indexes for common queries
ReportSchema.index({ institutionId: 1, status: 1, createdAt: -1 });
ReportSchema.index({ institutionId: 1, liveClassId: 1, createdAt: -1 });

const Report = mongoose.model('Report', ReportSchema);

module.exports = { Report };
