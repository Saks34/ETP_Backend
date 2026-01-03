const express = require('express');
const cors = require('cors');
const authRoutes = require('./modules/auth/auth.routes');
const institutionRoutes = require('./modules/institution/institution.routes');
const timetableRoutes = require('./modules/timetable/timetable.routes');
const leaveRoutes = require('./modules/leave/leave.routes');
const liveClassRoutes = require('./modules/liveClass/liveclass.routes');
const uploadRoutes = require('./modules/uploads/uploads.routes');
const notesRoutes = require('./modules/notes/notes.routes');
const batchRoutes = require('./modules/batch/batch.routes');
const commentRoutes = require('./modules/liveClass/comment.routes');
const analyticsRoutes = require('./modules/analytics/analytics.routes');
const reportRoutes = require('./modules/reports/report.routes');
const securityMiddleware = require('./middleware/security');
const { apiLimiter } = require('./middleware/rateLimiter');
const { requestLogger } = require('./utils/logger');

const app = express();

// Apply security middleware first
app.use(securityMiddleware);

// Request logging
app.use(requestLogger);

// CORS configuration
const allowedOrigin = process.env.CORS_ORIGIN || '*';
const corsOptions = {
  origin: allowedOrigin === '*' ? true : allowedOrigin,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
};

app.use(cors(corsOptions));
app.use(express.json({ limit: '1mb' }));

// Apply rate limiting to all API routes
app.use('/api', apiLimiter);

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/institutions', institutionRoutes);
app.use('/api/timetables', timetableRoutes);
app.use('/api/leaves', leaveRoutes);
app.use('/api/live-classes', liveClassRoutes);
app.use('/api/uploads', uploadRoutes);
app.use('/api/notes', notesRoutes);
app.use('/api/batches', batchRoutes);
app.use('/api/comments', commentRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/reports', reportRoutes);

// Health check route
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    env: process.env.NODE_ENV || 'development',
  });
});

module.exports = app;
