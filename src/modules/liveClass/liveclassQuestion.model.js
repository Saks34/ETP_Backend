const mongoose = require('mongoose');

const LiveClassQuestionSchema = new mongoose.Schema(
  {
    institutionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Institution', required: true, index: true },
    liveClassId: { type: mongoose.Schema.Types.ObjectId, ref: 'LiveClass', required: true, index: true },
    text: { type: String, required: true },
    senderId: { type: String, required: true },
    senderName: { type: String, required: true },
    role: { type: String, required: true },
    upvotes: [{ type: String }], // List of userId who upvoted
    isAnswered: { type: Boolean, default: false },
    answerText: { type: String }, // Text reply if any
    answeredBy: { type: String }, // userId of the teacher/moderator
    answeredAt: { type: Date },
    isDeleted: { type: Boolean, default: false },
    ts: { type: Date, default: Date.now, index: true },
  },
  { timestamps: true }
);

const LiveClassQuestion = mongoose.model('LiveClassQuestion', LiveClassQuestionSchema);

module.exports = { LiveClassQuestion };
