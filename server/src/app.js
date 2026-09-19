const path = require('path');
if (process.env.NODE_ENV !== 'production' || process.env.LOAD_DOTENV === 'true') {
  require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
}
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const cookieParser = require('cookie-parser');
const healthRoutes = require('./routes/healthRoutes');
const authRoutes = require('./routes/authRoutes');
const systemRoutes = require('./routes/systemRoutes');
const gisRoutes = require('./routes/gisRoutes');
const jurisdictionRoutes = require('./routes/jurisdictionRoutes');
const complaintRoutes = require('./routes/complaintRoutes');
const routingRoutes = require('./routes/routingRoutes');
const slaRoutes = require('./routes/slaRoutes');
const notificationRoutes = require('./routes/notificationRoutes');
const reviewRoutes = require('./routes/reviewRoutes');
const analyticsRoutes = require('./routes/analyticsRoutes');
const auditRoutes = require('./routes/auditRoutes');
const { notFoundHandler, errorHandler } = require('./middleware/errorMiddleware');
const { publicIntakeLimiter, aiClassifyLimiter, gisProbeLimiter } = require('./middleware/rateLimitMiddleware');

const app = express();

/**
 * Safely parse and validate the TRUST_PROXY environment configuration.
 * 
 * Safe Default:
 * - Unset, empty, or false => false (proxy trust disabled, safe for local development)
 * 
 * Production Deployments:
 * - Explicit hop count (e.g. 1 for standard single reverse proxy like Render, Nginx, AWS ALB)
 * - Specific subnet keywords ('loopback', 'linklocal', 'uniquelocal') or IP lists
 * - 'true' supported for compatibility testing only
 * - Invalid/dangerous strings safely fall back to false
 */
const parseTrustProxy = (val) => {
  if (val === undefined || val === null || val === '') {
    return false;
  }

  if (typeof val === 'boolean') {
    return val;
  }

  if (typeof val === 'number') {
    return val >= 0 ? val : false;
  }

  const str = String(val).trim();

  if (str.toLowerCase() === 'false' || str === '0') {
    return false;
  }
  if (str.toLowerCase() === 'true') {
    return true;
  }

  if (/^\d+$/.test(str)) {
    return parseInt(str, 10);
  }

  const allowedKeywords = ['loopback', 'linklocal', 'uniquelocal'];
  if (allowedKeywords.includes(str.toLowerCase())) {
    return str.toLowerCase();
  }

  if (str.includes(',')) {
    const parts = str.split(',').map(s => s.trim()).filter(Boolean);
    const isValid = parts.every(p => /^([0-9a-fA-F:.]+(\/\d+)?|\w+)$/.test(p));
    if (isValid && parts.length > 0) {
      return parts;
    }
  }

  if (/^[0-9a-fA-F:.]+(\/\d+)?$/.test(str)) {
    return str;
  }

  console.warn(`⚠️ [SECURITY WARNING] Invalid TRUST_PROXY configuration "${str}". Safely falling back to false.`);
  return false;
};

// Validated reverse proxy trust setting
const trustProxyVal = parseTrustProxy(process.env.TRUST_PROXY);
app.set('trust proxy', trustProxyVal);

// Security headers with Helmet (configured to allow cross-origin image loading for uploads)
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" }
}));

// Multi-origin CORS parser supporting comma-separated list and trailing-slash stripping
const parseAllowedOrigins = (originInput) => {
  const envVal = originInput !== undefined ? originInput : (process.env.CLIENT_URL || 'http://localhost:5173');
  if (Array.isArray(envVal)) {
    return envVal.map(o => String(o).trim().replace(/\/+$/, '')).filter(Boolean);
  }
  return String(envVal)
    .split(',')
    .map(o => o.trim().replace(/\/+$/, ''))
    .filter(Boolean);
};

const allowedOrigins = parseAllowedOrigins();
app.use(cors({
  origin: (origin, callback) => {
    // Allow non-browser requests or same-origin requests where origin header is absent
    if (!origin) return callback(null, true);
    const normalized = origin.replace(/\/+$/, '');
    if (allowedOrigins.includes(normalized) || allowedOrigins.includes('*')) {
      return callback(null, true);
    }
    return callback(new Error(`Origin '${origin}' not permitted by CORS policy`));
  },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
}));

// Request Logging
if (process.env.NODE_ENV !== 'test') {
  app.use(morgan('dev'));
}

// Cookie parser for HttpOnly JWT tokens
app.use(cookieParser());

// Static serving for uploaded photo evidence
app.use('/uploads', express.static(path.resolve(__dirname, '../uploads')));

// JSON & URL-encoded request body parsing with size limits
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// Apply production rate limiters on public intake & probe routes
app.use('/api/gis/test', gisProbeLimiter);
app.use('/api/complaints/classify', aiClassifyLimiter);
app.use('/api/complaints', publicIntakeLimiter);

// Core API Routes
app.use('/api', healthRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/system', systemRoutes);
app.use('/api/gis', gisRoutes);
app.use('/api/jurisdictions', jurisdictionRoutes);
app.use('/api/complaints', complaintRoutes);
app.use('/api/routing', routingRoutes);
app.use('/api/sla', slaRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/reviews', reviewRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/audit', auditRoutes);

// Root informational endpoint
app.get('/', (req, res) => {
  res.status(200).json({
    project: 'Adaptive Civic Routing Intelligence System',
    subProblem: 'Routing',
    stage: 15,
    status: 'production-ready',
    environment: process.env.NODE_ENV || 'development',
    endpoints: {
      health: '/api/health',
      liveness: '/api/health/live',
      readiness: '/api/health/ready',
      database: '/api/system/database',
      gisTest: '/api/gis/test?lat=12.2958&lng=76.6394',
      jurisdictions: '/api/jurisdictions/versions',
      complaints: '/api/complaints',
      routing: '/api/routing/decisions',
      sla: '/api/sla/overview',
      notifications: '/api/notifications',
      reviews: '/api/reviews',
      analytics: '/api/analytics/overview',
      audit: '/api/audit'
    }
  });
});

// Centralized error handling
app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;
module.exports.parseAllowedOrigins = parseAllowedOrigins;
module.exports.parseTrustProxy = parseTrustProxy;
