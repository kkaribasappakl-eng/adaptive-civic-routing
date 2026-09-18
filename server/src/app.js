const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const healthRoutes = require('./routes/healthRoutes');
const systemRoutes = require('./routes/systemRoutes');
const gisRoutes = require('./routes/gisRoutes');
const { notFoundHandler, errorHandler } = require('./middleware/errorMiddleware');

const app = express();

// Security headers with Helmet
app.use(helmet());

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

// JSON & URL-encoded request body parsing with size limits
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// Core API Routes
app.use('/api', healthRoutes);
app.use('/api/system', systemRoutes);
app.use('/api/gis', gisRoutes);

// Root informational endpoint
app.get('/', (req, res) => {
  res.status(200).json({
    project: 'Adaptive Civic Routing Intelligence System',
    subProblem: 'Routing',
    stage: 2,
    status: 'online',
    endpoints: {
      health: '/api/health',
      database: '/api/system/database',
      gisTest: '/api/gis/test?lat=12.2958&lng=76.6394'
    }
  });
});

// Centralized error handling
app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;
