const mongoose = require('mongoose');

const ChatMessageSchema = new mongoose.Schema(
  {
    institutionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Institution', required: true, index: true },
    liveClassId: { type: mongoose.Schema.Types.ObjectId, ref: 'LiveClass', required: true, index: true },
    type: { type: String, enum: ['message', 'system'], default: 'message', index: true },
    text: { type: String, default: '' },
    senderId: { type: String },
    senderName: { type: String },
    role: { type: String },
    ts: { type: Date, default: Date.now, index: true },
  },
  { timestamps: true }
);

const ChatMessage = mongoose.model('ChatMessage', ChatMessageSchema);

module.exports = { ChatMessage };
