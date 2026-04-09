const { Queue, Worker } = require('bullmq');
const { redis } = require('../config/redis');
const { ChatMessage } = require('../modules/liveClass/chatMessage.model');
const { LiveClass } = require('../modules/liveClass/liveclass.model');

const moderationQueue = new Queue('moderation-queue', { 
    connection: redis 
});

// Optional: A worker to process approved messages if we want to handle the approval asynchronously
// For now, the worker is mostly to just log or handle the 'approve' and 'reject' actions, 
// but if the UI interacts with the queue to "complete" jobs, BullMQ is tricky for human-in-the-loop.
// Alternatively, we can let the worker save the flagged message to DB and a Moderator reviews the DB.
// But as strictly requested, putting it directly to `moderation-queue`.

// A simple worker that does NOT auto-process unless we specifically resume or it's just for stats.
// We will pause the worker initially so messages stay in the queue for human review.
const moderationWorker = new Worker('moderation-queue', async (job) => {
    // If we want a human to approve/reject, this worker shouldn't automatically process them
    // unless the job data dictates action:
    if (job.data.action === 'approve') {
        const { messageData } = job.data;
        // Save to DB and emit to Socket
        // It's handled by controller directly
    }
}, { 
    connection: redis, 
    autorun: false 
}); // Do not autorun, we want human review

module.exports = { moderationQueue, moderationWorker };
