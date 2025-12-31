const mongoose = require('mongoose');

const CommentSchema = new mongoose.Schema(
    {
        institutionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Institution', required: true, index: true },
        liveClassId: { type: mongoose.Schema.Types.ObjectId, ref: 'LiveClass', required: true, index: true },
        user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
        text: { type: String, required: true, trim: true },
        isDeleted: { type: Boolean, default: false },
        deletedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    },
    { timestamps: true }
);

const Comment = mongoose.model('Comment', CommentSchema);

module.exports = { Comment };
