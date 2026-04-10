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
const notificationRoutes = require('./modules/notification/notification.routes');
const watchHistoryRoutes = require('./modules/watchHistory/watchHistory.routes');
const gamificationRoutes = require('./modules/gamification/gamification.routes');
const supportRoutes = require('./modules/support/support.routes');
const securityMiddleware = require('./middleware/security');
const { apiLimiter } = require('./middleware/rateLimiter');
const bullBoardRouter = require('./realtime/bullboard');
const { requestLogger } = require('./utils/logger');
const AppError = require('./utils/AppError');
const globalErrorHandler = require('./middleware/error');
const dbMiddleware = require('./middleware/db');

const swaggerUi = require('swagger-ui-express');
const swaggerSpec = require('./config/swagger');
const { admin } = require('./config/env');
const basicAuth = require('express-basic-auth');

const app = express();
app.set('trust proxy', 1);

// Apply security middleware first
app.use(securityMiddleware);

// Ensure DB connection
app.use(dbMiddleware);

// Request logging
app.use(requestLogger);

// CORS configuration
const corsOptions = {
  origin: true,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
};

app.use(cors(corsOptions));
app.use(express.json({ limit: '1mb' }));

// Apply rate limiting to all API routes
app.use('/api', apiLimiter);

// Background Jobs Dashboard (Protected)
app.use(
  '/admin/queues',
  basicAuth({
    users: { [admin.user]: admin.pass },
    challenge: true,
  }),
  bullBoardRouter
);

// API Documentation (Protected)
app.use(
  '/api-docs',
  basicAuth({
    users: { [admin.user]: admin.pass },
    challenge: true,
  }),
  swaggerUi.serve,
  swaggerUi.setup(swaggerSpec)
);

const attendanceRoutes = require('./modules/liveClass/attendance.routes');

const assignmentRoutes = require('./modules/assignment/assignment.routes');

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/institutions', institutionRoutes);
app.use('/api/timetables', timetableRoutes);
app.use('/api/leaves', leaveRoutes);
app.use('/api/live-classes', liveClassRoutes);
app.use('/api/attendance', attendanceRoutes);
app.use('/api/assignments', assignmentRoutes);
app.use('/api/uploads', uploadRoutes);
app.use('/api/notes', notesRoutes);
app.use('/api/batches', batchRoutes);
app.use('/api/comments', commentRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/watch-history', watchHistoryRoutes);
app.use('/api/support', supportRoutes);

// FEATURE ENDPOINTS (v1)
app.use('/api/v1/students', gamificationRoutes);
app.use('/api/v1/batches', gamificationRoutes);
app.use('/api/v1/live-classes', liveClassRoutes);



// Welcome route
app.get('/', (req, res) => {
  res.status(200).json({
    message: 'Welcome to the ClassBridge API',
    version: '1.0.0',
    documentation: '/api-docs',
    status: '/health'
  });
});

// Favicon handler to prevent 404 logs
app.get('/favicon.ico', (req, res) => res.status(204).end());

// Health check route
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    env: process.env.NODE_ENV || 'development',
  });
});

// Handle undefined routes
app.use((req, res, next) => {
  next(new AppError(`Can't find ${req.originalUrl} on the ClassBridge server!`, 404));
});

// Global error handler (must be last)
app.use(globalErrorHandler);

module.exports = app;
