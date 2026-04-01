const { createBullBoard } = require('@bull-board/api');
const { BullMQAdapter } = require('@bull-board/api/bullMQAdapter');
const { ExpressAdapter } = require('@bull-board/express');
const basicAuth = require('express-basic-auth');
const { notificationQueue } = require('../queues/notification.queue');
const { admin } = require('../config/env');

const serverAdapter = new ExpressAdapter();
serverAdapter.setBasePath('/admin/queues');

createBullBoard({
  queues: [
    new BullMQAdapter(notificationQueue)
  ],
  serverAdapter: serverAdapter,
});

module.exports = serverAdapter.getRouter();
