/**
 * Zero-Dependency In-Memory Rate Limiting Middleware
 * Protects public unauthenticated civic endpoints from automated abuse
 * without requiring external infrastructure (Redis/Memcached).
 */

const createRateLimiter = (options = {}) => {
  const windowMs = options.windowMs || 60 * 1000; // default 1 minute
  const max = options.max || 60; // default 60 requests per window
  const message = options.message || 'Too many requests from this IP. Please try again later.';
  const hits = new Map();

  const limiter = (req, res, next) => {
    // In test environment, allow bypassing unless explicitly testing rate limits
    if (process.env.DISABLE_RATE_LIMITS === 'true') {
      return next();
    }

    const clientIp = req.ip ||
                     req.socket?.remoteAddress ||
                     req.connection?.remoteAddress ||
                     'unknown';

    const now = Date.now();
    let clientRecord = hits.get(clientIp);

    if (!clientRecord) {
      clientRecord = { count: 1, resetTime: now + windowMs };
      hits.set(clientIp, clientRecord);
    } else if (now > clientRecord.resetTime) {
      clientRecord.count = 1;
      clientRecord.resetTime = now + windowMs;
    } else {
      clientRecord.count += 1;
    }

    const remaining = Math.max(0, max - clientRecord.count);
    const resetSeconds = Math.ceil(Math.max(0, clientRecord.resetTime - now) / 1000);

    res.setHeader('X-RateLimit-Limit', max);
    res.setHeader('X-RateLimit-Remaining', remaining);
    res.setHeader('X-RateLimit-Reset', resetSeconds);

    if (clientRecord.count > max) {
      res.setHeader('Retry-After', resetSeconds);
      return res.status(429).json({
        success: false,
        code: 'RATE_LIMIT_EXCEEDED',
        error: message,
        retryAfterSeconds: resetSeconds
      });
    }

    next();
  };

  limiter.reset = () => hits.clear();
  limiter.resetIp = (ip) => hits.delete(ip);
  limiter.getHits = () => hits;

  return limiter;
};

// Standard production rate limiters for civic endpoints
const publicIntakeLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  max: 60,
  message: 'Public complaint submission rate limit exceeded. Please slow down.'
});

const aiClassifyLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  max: 30,
  message: 'AI classification rate limit reached. Manual category selection remains available.'
});

const gisProbeLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  max: 120,
  message: 'GIS coordinate test rate limit exceeded. Please wait a moment.'
});

module.exports = {
  createRateLimiter,
  publicIntakeLimiter,
  aiClassifyLimiter,
  gisProbeLimiter
};
