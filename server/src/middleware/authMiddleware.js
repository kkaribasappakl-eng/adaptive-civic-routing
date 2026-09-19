const { verifyToken } = require('../services/authService');
const { pool } = require('../config/db');

/**
 * Extracts authentication token from either HttpOnly cookie or Authorization Bearer header
 */
const extractToken = (req) => {
  if (req.cookies && req.cookies.token) {
    return req.cookies.token;
  }
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.substring(7).trim();
  }
  return null;
};

/**
 * Mandatory Authentication Middleware
 * Validates JWT, verifies active status in PostgreSQL, and attaches req.user.
 * Returns 401 Unauthorized for unauthenticated requests.
 */
const requireAuth = async (req, res, next) => {
  const token = extractToken(req);

  if (!token) {
    return res.status(401).json({
      success: false,
      error: 'Authentication required. No token provided.'
    });
  }

  try {
    const decoded = verifyToken(token);
    
    // Verify user exists and is active in database
    const userRes = await pool.query(
      'SELECT id, full_name, email, role, is_active FROM users WHERE id = $1;',
      [decoded.id]
    );

    if (userRes.rows.length === 0) {
      return res.status(401).json({
        success: false,
        error: 'User account not found.'
      });
    }

    const user = userRes.rows[0];

    if (!user.is_active) {
      return res.status(403).json({
        success: false,
        error: 'User account is deactivated.'
      });
    }

    req.user = {
      id: user.id,
      fullName: user.full_name,
      email: user.email,
      role: user.role
    };

    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        error: 'Authentication token has expired. Please log in again.'
      });
    }
    return res.status(401).json({
      success: false,
      error: 'Invalid authentication token.'
    });
  }
};

/**
 * Role-Based Authorization Middleware
 * Verifies authenticated user has one of the required roles.
 * Returns 403 Forbidden if user lacks necessary permission.
 */
const requireRole = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required.'
      });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        error: `Forbidden: Access requires one of [${allowedRoles.join(', ')}]. Current role is '${req.user.role}'.`
      });
    }

    next();
  };
};

/**
 * Optional Authentication Middleware
 * Attaches req.user if a valid token is provided, but does not reject unauthenticated calls.
 */
const optionalAuth = async (req, res, next) => {
  const token = extractToken(req);
  if (!token) {
    req.user = null;
    return next();
  }

  try {
    const decoded = verifyToken(token);
    const userRes = await pool.query(
      'SELECT id, full_name, email, role, is_active FROM users WHERE id = $1;',
      [decoded.id]
    );
    if (userRes.rows.length > 0 && userRes.rows[0].is_active) {
      const user = userRes.rows[0];
      req.user = {
        id: user.id,
        fullName: user.full_name,
        email: user.email,
        role: user.role
      };
    } else {
      req.user = null;
    }
  } catch (err) {
    req.user = null;
  }
  next();
};

/**
 * In-Memory Failed Login Rate Limiter
 * Blocks IP after 5 consecutive failed login attempts within 5 minutes.
 */
const failedLoginAttempts = new Map();
const RATE_LIMIT_WINDOW_MS = 5 * 60 * 1000;
const MAX_FAILED_ATTEMPTS = 5;

const loginRateLimiter = (req, res, next) => {
  const clientIp = req.headers['x-forwarded-for']?.split(',')[0].trim() || req.ip || req.connection.remoteAddress || 'unknown';
  const record = failedLoginAttempts.get(clientIp);
  const now = Date.now();

  if (record) {
    if (now - record.firstAttempt < RATE_LIMIT_WINDOW_MS) {
      if (record.count >= MAX_FAILED_ATTEMPTS) {
        const retryAfter = Math.ceil((RATE_LIMIT_WINDOW_MS - (now - record.firstAttempt)) / 1000);
        return res.status(429).json({
          success: false,
          code: 'RATE_LIMIT_EXCEEDED',
          error: `Too many failed login attempts. Please try again after ${retryAfter} seconds.`
        });
      }
    } else {
      // Window expired, reset
      failedLoginAttempts.delete(clientIp);
    }
  }

  // Intercept response to record failure
  const originalJson = res.json.bind(res);
  res.json = (data) => {
    if (res.statusCode === 401) {
      const current = failedLoginAttempts.get(clientIp);
      if (current) {
        current.count++;
      } else {
        failedLoginAttempts.set(clientIp, { count: 1, firstAttempt: Date.now() });
      }
    } else if (res.statusCode === 200) {
      // Reset on success
      failedLoginAttempts.delete(clientIp);
    }
    return originalJson(data);
  };

  next();
};

const resetRateLimiter = (ip = null) => {
  if (ip) {
    failedLoginAttempts.delete(ip);
  } else {
    failedLoginAttempts.clear();
  }
};

module.exports = {
  extractToken,
  requireAuth,
  requireRole,
  optionalAuth,
  loginRateLimiter,
  resetRateLimiter
};
