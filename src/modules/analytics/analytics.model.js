const mongoose = require('mongoose');

const AnalyticsSchema = new mongoose.Schema(
    {
        institutionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Institution', required: true, index: true },
        liveClassId: { type: mongoose.Schema.Types.ObjectId, ref: 'LiveClass', required: true, unique: true, index: true },

        // Aggregate metrics
        totalViews: { type: Number, default: 0 },
        peakViewers: { type: Number, default: 0 },
        avgWatchTimeSeconds: { type: Number, default: 0 },
        totalChatMessages: { type: Number, default: 0 },

        // Watch time analytics (heartbeat-based)
        totalWatchTimeSeconds: { type: Number, default: 0 },
        uniqueViewers: { type: Number, default: 0 },
        watchTimeByUser: [
            {
                userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
                watchTimeSeconds: { type: Number, default: 0 },
                lastHeartbeat: { type: Date }
            }
        ],

        // Snapshots for graphs (e.g. viewer count every 5 mins)
        viewerCountHistory: [
            {
                ts: { type: Date, default: Date.now },
                count: { type: Number, default: 0 }
            }
        ],

        lastUpdated: { type: Date, default: Date.now }
    },
    { timestamps: true }
);

const Analytics = mongoose.model('Analytics', AnalyticsSchema);

module.exports = { Analytics };
