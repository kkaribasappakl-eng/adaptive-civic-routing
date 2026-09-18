const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const path = require('path');
const healthRoutes = require('./routes/healthRoutes');
const systemRoutes = require('./routes/systemRoutes');
const gisRoutes = require('./routes/gisRoutes');
const jurisdictionRoutes = require('./routes/jurisdictionRoutes');
const complaintRoutes = require('./routes/complaintRoutes');
const routingRoutes = require('./routes/routingRoutes');
const slaRoutes = require('./routes/slaRoutes');
const { notFoundHandler, errorHandler } = require('./middleware/errorMiddleware');

const app = express();

// Security headers with Helmet (configured to allow cross-origin image loading for uploads)
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" }
}));

// CORS configuration restricted to frontend URL
const allowedOrigin = process.env.CLIENT_URL || 'http://localhost:5173';
app.use(cors({
  origin: allowedOrigin,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
}));

// Request Logging
if (process.env.NODE_ENV !== 'test') {
  app.use(morgan('dev'));
}

// Static serving for uploaded photo evidence
app.use('/uploads', express.static(path.resolve(__dirname, '../uploads')));

// JSON & URL-encoded request body parsing with size limits
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// Core API Routes
app.use('/api', healthRoutes);
app.use('/api/system', systemRoutes);
app.use('/api/gis', gisRoutes);
app.use('/api/jurisdictions', jurisdictionRoutes);
app.use('/api/complaints', complaintRoutes);
app.use('/api/routing', routingRoutes);
app.use('/api/sla', slaRoutes);

// Root informational endpoint
app.get('/', (req, res) => {
  res.status(200).json({
    project: 'Adaptive Civic Routing Intelligence System',
    subProblem: 'Routing',
    stage: 5,
    status: 'online',
    endpoints: {
      health: '/api/health',
      database: '/api/system/database',
      gisTest: '/api/gis/test?lat=12.2958&lng=76.6394',
      jurisdictions: '/api/jurisdictions/versions',
      complaints: '/api/complaints',
      routing: '/api/routing/decisions'
    }
  });
});

// Centralized error handling
app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;
