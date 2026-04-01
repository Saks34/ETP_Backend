const mongoose = require('mongoose');

const WatchHistorySchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    liveClassId: { type: mongoose.Schema.Types.ObjectId, ref: 'LiveClass', required: true, index: true },
    videoId: { type: String, required: true },
    lastPosition: { type: Number, default: 0 }, // in seconds
    isCompleted: { type: Boolean, default: false },
    totalDuration: { type: Number, default: 0 },
  },
  { timestamps: true }
);

// Unique per user + class
WatchHistorySchema.index({ userId: 1, liveClassId: 1 }, { unique: true });

const WatchHistory = mongoose.model('WatchHistory', WatchHistorySchema);

module.exports = { WatchHistory };
