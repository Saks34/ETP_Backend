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

const app = express();

// CORS configuration
const allowedOrigin = process.env.CORS_ORIGIN || '*';
const corsOptions = {
  origin: allowedOrigin === '*' ? true : allowedOrigin,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
};

app.use(cors(corsOptions));
app.use(express.json({ limit: '1mb' }));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/institutions', institutionRoutes);
app.use('/api/timetables', timetableRoutes);
app.use('/api/leaves', leaveRoutes);
app.use('/api/live-classes', liveClassRoutes);
app.use('/api/uploads', uploadRoutes);
app.use('/api/notes', notesRoutes);
app.use('/api/batches', batchRoutes);

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
