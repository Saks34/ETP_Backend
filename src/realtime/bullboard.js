const { createBullBoard } = require('@bull-board/api');
const { BullMQAdapter } = require('@bull-board/api/bullMQAdapter');
const { ExpressAdapter } = require('@bull-board/express');
const path = require('path');
const basicAuth = require('express-basic-auth');
const { notificationQueue } = require('../queues/notification.queue');
const { admin } = require('../config/env');

const serverAdapter = new ExpressAdapter();
serverAdapter.setBasePath('/admin/queues');

// Vercel fix: Manually point to UI assets in node_modules
// This ensures Vercel's NFT (Next.js File Tracing) includes these files in the deployment bundle
const uiPath = path.dirname(require.resolve('@bull-board/ui/package.json'));
serverAdapter.setViewsPath(path.join(uiPath, 'dist'));
serverAdapter.setStaticPath('/static', path.join(uiPath, 'dist/static'));

createBullBoard({
  queues: [
    new BullMQAdapter(notificationQueue)
  ],
  serverAdapter: serverAdapter,
});

module.exports = serverAdapter.getRouter();
