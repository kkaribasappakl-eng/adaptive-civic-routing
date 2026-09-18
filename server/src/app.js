const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const healthRoutes = require('./routes/healthRoutes');
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

// Base API Routes
app.use('/api', healthRoutes);

// Root informational endpoint
app.get('/', (req, res) => {
  res.status(200).json({
    project: 'Adaptive Civic Routing Intelligence System',
    subProblem: 'Routing',
    stage: 1,
    status: 'online',
    healthCheck: '/api/health'
  });
});

// Centralized error handling
app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;
