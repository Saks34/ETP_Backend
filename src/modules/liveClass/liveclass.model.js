const mongoose = require('mongoose');

const LiveClassSchema = new mongoose.Schema(
  {
    institutionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Institution', required: true, index: true },
    timetableId: { type: mongoose.Schema.Types.ObjectId, ref: 'Timetable', required: true, unique: true, index: true },
    title: { type: String }, // Custom class title
    status: { type: String, enum: ['Scheduled', 'Live', 'Completed', 'Cancelled'], default: 'Scheduled', index: true },
    streamInfo: { type: Object, default: {} }, // Contains YouTube broadcastId, streamId, etc.

    // New fields for VOD and controls
    chatEnabled: { type: Boolean, default: true },
    actualStartTime: { type: Date },
    actualEndTime: { type: Date },

    // Studio Dashboard - Moderation Settings
    moderation: {
      slowMode: { type: Number, default: 0 }, // Seconds (0 = off)
      subscribersOnly: { type: Boolean, default: false },
      blockLinks: { type: Boolean, default: false },
      blockedWords: [{ type: String }]
    },

    // Studio Dashboard - Analytics Snapshot
    analytics: {
      peakViewers: { type: Number, default: 0 },
      totalViews: { type: Number, default: 0 },
      totalLikes: { type: Number, default: 0 },
      totalChatMessages: { type: Number, default: 0 }
    },

    recordings: [
      {
        youtubeVideoId: { type: String },
        title: { type: String },
        duration: { type: String },
        publishedAt: { type: Date },
        url: { type: String }
      }
    ]
  },
  { timestamps: true }
);

const LiveClass = mongoose.model('LiveClass', LiveClassSchema);

module.exports = { LiveClass };
