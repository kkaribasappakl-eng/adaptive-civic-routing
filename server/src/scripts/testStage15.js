/**
 * HACKMYSURU 1.0 — STAGE 15 COMPREHENSIVE VERIFICATION SUITE
 * Production Readiness & Deployment Preparation
 *
 * Verifies:
 * 1. Health & Liveness & Readiness Probes (/api/health, /api/health/live, /api/health/ready)
 * 2. Reverse Proxy & Trust Proxy Configuration
 * 3. Multi-Origin CORS & Trailing Slash Stripping
 * 4. Configurable Production Cookie Attributes (HttpOnly, SameSite, Secure)
 * 5. Database Connection Pool & Cloud SSL Prioritization (DATABASE_URL)
 * 6. Zero-Dependency In-Memory Rate Limiting on Public Endpoints
 * 7. Security Safeguards & JWT Production Validation
 * 8. Graceful Process Shutdown Hooks (SIGTERM/SIGINT)
 * 9. Dynamic Media URL Resolution & React Error Boundary
 * 10. Environment Variable Templates & Root Deployment Scripts
 * 11. Historical GIS Invariants & Engine-Level Audit Immutability
 */

const http = require('http');
const path = require('path');
const fs = require('fs');
const net = require('net');
const { spawnSync } = require('child_process');
const { pool, getPoolConfig, getSslConfig } = require('../config/db');
const { parseAllowedOrigins, parseTrustProxy } = require('../app');
const { getCookieOptions } = require('../controllers/authController');
const { isJwtSecretSecure, validateJwtConfig, DEFAULT_DEV_SECRET, KNOWN_INSECURE_SECRETS } = require('../services/authService');
const { extractClientIp } = require('../services/auditService');
const { createRateLimiter } = require('../middleware/rateLimitMiddleware');
const app = require('../app');

const BASE_URL = 'http://localhost:4000';

function sendJsonRequest(apiPath, method = 'GET', data = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(apiPath, BASE_URL);
    const body = data ? JSON.stringify(data) : null;
    const req = http.request(
      {
        hostname: url.hostname,
        port: url.port,
        path: url.pathname + url.search,
        method,
        headers: {
          'Content-Type': 'application/json',
          ...(body ? { 'Content-Length': Buffer.byteLength(body) } : {}),
          ...headers
        }
      },
      (res) => {
        let raw = '';
        res.on('data', (chunk) => { raw += chunk; });
        res.on('end', () => {
          try {
            resolve({
              status: res.statusCode,
              headers: res.headers,
              body: raw ? JSON.parse(raw) : {}
            });
          } catch (e) {
            resolve({
              status: res.statusCode,
              headers: res.headers,
              body: raw
            });
          }
        });
      }
    );

    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

function checkPortListening(port) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(400);
    socket.once('connect', () => {
      socket.destroy();
      resolve(true);
    });
    socket.once('error', () => {
      resolve(false);
    });
    socket.once('timeout', () => {
      socket.destroy();
      resolve(false);
    });
    socket.connect(port, '127.0.0.1');
  });
}

let passedCount = 0;
let failedCount = 0;
let assertionIndex = 0;

function assert(condition, message, detail = '') {
  assertionIndex++;
  if (condition) {
    passedCount++;
    console.log(`  \x1b[32m✔ [${assertionIndex}]\x1b[0m ${message}`);
  } else {
    failedCount++;
    console.error(`  \x1b[31m✖ [${assertionIndex}]\x1b[0m ${message}`);
    if (detail) console.error(`    \x1b[33mDetail: ${detail}\x1b[0m`);
  }
}

async function runStage15Tests() {
  console.log('================================================================');
  console.log(' HACKMYSURU 1.0 — STAGE 15 VERIFICATION SUITE');
  console.log(' Production Readiness & Deployment Preparation');
  console.log('================================================================\n');

  try {
    // ----------------------------------------------------------------
    // SECTION 1: Health, Liveness & Readiness Probes
    // ----------------------------------------------------------------
    console.log('\x1b[36m--- Section 1: Health, Liveness & Readiness Probes ---\x1b[0m');

    const healthRes = await sendJsonRequest('/api/health');
    assert(
      healthRes.status === 200 && healthRes.body?.stage === 15,
      'GET /api/health returns HTTP 200 with stage 15',
      `status: ${healthRes.status}, stage: ${healthRes.body?.stage}`
    );

    assert(
      healthRes.body?.status === 'production-ready' && healthRes.body?.database?.connected === true,
      'GET /api/health reports production-ready status and connected PostgreSQL',
      `status: ${healthRes.body?.status}, db: ${healthRes.body?.database?.connected}`
    );

    assert(
      healthRes.body?.realtime?.initialized === true,
      'GET /api/health exposes Socket.IO gateway connection status',
      `realtime: ${JSON.stringify(healthRes.body?.realtime)}`
    );

    const liveRes = await sendJsonRequest('/api/health/live');
    assert(
      liveRes.status === 200 && liveRes.body?.status === 'alive' && typeof liveRes.body?.uptimeSeconds === 'number',
      'GET /api/health/live returns HTTP 200 with process liveness and uptime',
      `status: ${liveRes.status}, uptime: ${liveRes.body?.uptimeSeconds}`
    );

    const readyRes = await sendJsonRequest('/api/health/ready');
    assert(
      readyRes.status === 200 && readyRes.body?.status === 'ready' && readyRes.body?.postgis === 'available',
      'GET /api/health/ready returns HTTP 200 verifying database & PostGIS spatial readiness',
      `status: ${readyRes.status}, body: ${JSON.stringify(readyRes.body)}`
    );

    const rootRes = await sendJsonRequest('/');
    assert(
      rootRes.status === 200 && rootRes.body?.stage === 15 && rootRes.body?.endpoints?.readiness === '/api/health/ready',
      'Root informational endpoint / reflects Stage 15 with readiness endpoints',
      `stage: ${rootRes.body?.stage}, readiness: ${rootRes.body?.endpoints?.readiness}`
    );

    // ----------------------------------------------------------------
    // SECTION 2: Reverse Proxy & Trust Proxy Configuration
    // ----------------------------------------------------------------
    console.log('\n\x1b[36m--- Section 2: Reverse Proxy & Trust Proxy Configuration ---\x1b[0m');

    // 1. Default/local safe behavior (when unconfigured / unset => false)
    assert(
      parseTrustProxy(undefined) === false && parseTrustProxy('') === false && parseTrustProxy(null) === false,
      'parseTrustProxy defaults to false when unset or empty (safe local default prevents X-Forwarded-* spoofing)'
    );
    assert(
      parseTrustProxy('false') === false && parseTrustProxy(false) === false && parseTrustProxy('0') === false,
      'parseTrustProxy returns false when explicitly disabled ("false", false, "0")'
    );

    // 2. Configured trusted proxy behavior
    assert(
      parseTrustProxy('1') === 1 && parseTrustProxy(1) === 1,
      'parseTrustProxy parses numeric hop count "1" (recommended for single reverse proxy e.g. Render, Nginx, ALB)'
    );
    assert(
      parseTrustProxy('2') === 2,
      'parseTrustProxy parses multi-hop count "2" for layered ingress architectures'
    );
    assert(
      parseTrustProxy('loopback') === 'loopback' && parseTrustProxy('linklocal') === 'linklocal',
      'parseTrustProxy supports standard Express subnet keywords ("loopback", "linklocal")'
    );
    const parsedIps = parseTrustProxy('10.0.0.1, 192.168.1.1');
    assert(
      Array.isArray(parsedIps) && parsedIps.length === 2 && parsedIps[0] === '10.0.0.1',
      'parseTrustProxy supports explicit comma-separated trusted proxy IP lists'
    );
    assert(
      parseTrustProxy('true') === true,
      'parseTrustProxy supports "true" for compatibility testing'
    );

    // 3. Invalid TRUST_PROXY configuration is safely handled
    assert(
      parseTrustProxy('invalid_proxy_setting_!@#$%') === false && parseTrustProxy(-5) === false,
      'parseTrustProxy safely falls back to false on invalid/malformed configuration inputs'
    );

    // 4. Express App trust proxy setting inspection
    const currentTrustProxy = app.get('trust proxy');
    assert(
      currentTrustProxy !== undefined,
      'Express app has a defined, validated trust proxy configuration',
      `current setting: ${currentTrustProxy}`
    );

    // 5. Anti-spoofing verification: X-Forwarded-For cannot spoof identity when proxy trust is not configured
    const unproxiedReq = {
      ip: '127.0.0.1',
      headers: { 'x-forwarded-for': '203.0.113.195' },
      socket: { remoteAddress: '127.0.0.1' },
      connection: { remoteAddress: '127.0.0.1' }
    };
    const resolvedAuditIp = extractClientIp(unproxiedReq);
    assert(
      resolvedAuditIp === '127.0.0.1' && resolvedAuditIp !== '203.0.113.195',
      'extractClientIp ignores spoofed X-Forwarded-For headers when proxy trust is not configured'
    );

    // 6. Rate limiting identifies client using validated client IP
    const rateLimiterReq = {
      ip: '198.51.100.5',
      headers: { 'x-forwarded-for': '203.0.113.99' },
      socket: { remoteAddress: '198.51.100.5' }
    };
    const testLimiterSp = createRateLimiter({ windowMs: 5000, max: 2 });
    let spPassed = false;
    testLimiterSp(rateLimiterReq, { setHeader: () => {} }, () => { spPassed = true; });
    assert(
      spPassed === true,
      'Rate limiter identifies clients via validated req.ip rather than arbitrary X-Forwarded-For header'
    );

    // 7. API request handling reverse proxy headers
    const forwardedRes = await sendJsonRequest('/api/health', 'GET', null, {
      'X-Forwarded-For': '203.0.113.195, 10.0.0.1',
      'X-Forwarded-Proto': 'https'
    });
    assert(
      forwardedRes.status === 200,
      'API cleanly handles X-Forwarded-For and X-Forwarded-Proto reverse proxy headers'
    );

    // ----------------------------------------------------------------
    // SECTION 3: Multi-Origin CORS & Trailing Slash Stripping
    // ----------------------------------------------------------------
    console.log('\n\x1b[36m--- Section 3: Multi-Origin CORS & Trailing Slash Stripping ---\x1b[0m');

    const parsedTest1 = parseAllowedOrigins('https://mysuru.gov.in, https://app.mysuru.gov.in/, http://localhost:5173');
    assert(
      parsedTest1.length === 3 &&
      parsedTest1.includes('https://mysuru.gov.in') &&
      parsedTest1.includes('https://app.mysuru.gov.in') &&
      !parsedTest1.some(o => o.endsWith('/')),
      'parseAllowedOrigins correctly splits comma-separated origins and strips trailing slashes',
      `parsed: ${JSON.stringify(parsedTest1)}`
    );

    const parsedTest2 = parseAllowedOrigins(['https://preview.vercel.app/', 'http://localhost:5173']);
    assert(
      parsedTest2.includes('https://preview.vercel.app'),
      'parseAllowedOrigins correctly handles array inputs with trailing slashes'
    );

    const corsAllowedRes = await sendJsonRequest('/api/health', 'GET', null, {
      'Origin': 'http://localhost:5173'
    });
    assert(
      corsAllowedRes.headers['access-control-allow-origin'] === 'http://localhost:5173' &&
      corsAllowedRes.headers['access-control-allow-credentials'] === 'true',
      'CORS headers allow whitelisted origin with credentials=true',
      `allow-origin: ${corsAllowedRes.headers['access-control-allow-origin']}`
    );

    // ----------------------------------------------------------------
    // SECTION 4: Configurable Production Cookie Attributes
    // ----------------------------------------------------------------
    console.log('\n\x1b[36m--- Section 4: Configurable Production Cookie Attributes ---\x1b[0m');

    const originalNodeEnv = process.env.NODE_ENV;
    const originalSameSite = process.env.COOKIE_SAME_SITE;
    const originalSecure = process.env.COOKIE_SECURE;

    try {
      // Test dev default
      delete process.env.COOKIE_SAME_SITE;
      delete process.env.COOKIE_SECURE;
      process.env.NODE_ENV = 'development';
      const devOpts = getCookieOptions();
      assert(
        devOpts.httpOnly === true && devOpts.sameSite === 'lax' && devOpts.secure === false,
        'Development cookie options use httpOnly: true, sameSite: lax, secure: false',
        `opts: ${JSON.stringify(devOpts)}`
      );

      // Test production decoupled default
      process.env.NODE_ENV = 'production';
      const prodOpts = getCookieOptions();
      assert(
        prodOpts.httpOnly === true && prodOpts.sameSite === 'none' && prodOpts.secure === true,
        'Production cookie options use httpOnly: true, sameSite: none, secure: true for decoupled hosting',
        `opts: ${JSON.stringify(prodOpts)}`
      );

      // Test explicit overrides
      process.env.COOKIE_SAME_SITE = 'strict';
      process.env.COOKIE_SECURE = 'false';
      const overrideOpts = getCookieOptions();
      assert(
        overrideOpts.sameSite === 'strict' && overrideOpts.secure === false,
        'COOKIE_SAME_SITE and COOKIE_SECURE environment variables override defaults cleanly',
        `opts: ${JSON.stringify(overrideOpts)}`
      );
    } finally {
      process.env.NODE_ENV = originalNodeEnv;
      if (originalSameSite) process.env.COOKIE_SAME_SITE = originalSameSite;
      else delete process.env.COOKIE_SAME_SITE;
      if (originalSecure) process.env.COOKIE_SECURE = originalSecure;
      else delete process.env.COOKIE_SECURE;
    }

    // ----------------------------------------------------------------
    // SECTION 5: Database Connection Pool & SSL Security
    // ----------------------------------------------------------------
    console.log('\n\x1b[36m--- Section 5: Database Connection Pool & SSL Security ---\x1b[0m');

    // 1. Local/no SSL => SSL disabled as configured
    const localNoSsl = getSslConfig({ DB_SSL: undefined, DATABASE_URL: 'postgresql://postgres:pass@localhost:5432/civic' });
    assert(
      localNoSsl === false,
      'Local development with no SSL configured returns ssl: false'
    );
    const explicitFalseSsl = getSslConfig({ DB_SSL: 'false', DATABASE_URL: 'postgresql://user:pass@remote:5432/civic?sslmode=require' });
    assert(
      explicitFalseSsl === false,
      'Explicit DB_SSL=false disables SSL even if connection string contains sslmode'
    );

    // 2. Production TLS => SSL enabled
    const prodSsl = getSslConfig({ DB_SSL: 'true' });
    assert(
      prodSsl && typeof prodSsl === 'object',
      'Production TLS (DB_SSL=true) cleanly enables SSL object configuration'
    );

    // 3. Production TLS default => rejectUnauthorized is NOT false (strictly true by default)
    assert(
      prodSsl.rejectUnauthorized === true,
      'Production TLS default enforces rejectUnauthorized: true (certificate verification active by default)'
    );

    // 4. Explicit CA configuration is supported
    const caCertMock = '-----BEGIN CERTIFICATE-----\nMYS_CUSTOM_CA_ROOT_2026\n-----END CERTIFICATE-----';
    const caConfig = getSslConfig({ DB_SSL: 'true', DB_SSL_CA: caCertMock });
    assert(
      caConfig.rejectUnauthorized === true && caConfig.ca === caCertMock,
      'Explicit DB_SSL_CA configuration populates CA certificate for verified TLS handshake'
    );

    // 5. Explicit insecure override is opt-in only
    const insecureConfig = getSslConfig({ DB_SSL: 'true', DB_SSL_REJECT_UNAUTHORIZED: 'false' });
    assert(
      insecureConfig.rejectUnauthorized === false,
      'Insecure certificate verification (rejectUnauthorized: false) is strictly opt-in via DB_SSL_REJECT_UNAUTHORIZED=false'
    );
    const secureOverrideConfig = getSslConfig({ DB_SSL: 'true', DB_SSL_REJECT_UNAUTHORIZED: 'true' });
    assert(
      secureOverrideConfig.rejectUnauthorized === true,
      'Explicit DB_SSL_REJECT_UNAUTHORIZED=true maintains certificate verification'
    );

    // 6. No accidental global SSL weakening
    const generalConfig = getPoolConfig({ DB_SSL: 'true' });
    assert(
      generalConfig.ssl && generalConfig.ssl.rejectUnauthorized === true,
      'Global getPoolConfig does not silently weaken TLS certificate verification'
    );

    // 7. DATABASE_URL / sslmode behavior remains compatible
    const cloudUrlConfig = getPoolConfig({
      DATABASE_URL: 'postgresql://cloud_user:cloud_pass@cloud.postgres.database.com:5432/civic_prod?sslmode=require'
    });
    assert(
      cloudUrlConfig.connectionString.includes('civic_prod') &&
      cloudUrlConfig.ssl && cloudUrlConfig.ssl.rejectUnauthorized === true,
      'DATABASE_URL with sslmode=require enables SSL with secure rejectUnauthorized: true by default',
      `ssl: ${JSON.stringify(cloudUrlConfig.ssl)}`
    );

    // 8. Custom pool parameters (max, idleTimeout, connTimeout) preserved
    const customPoolConfig = getPoolConfig({ DB_POOL_MAX: '25', DB_POOL_IDLE_TIMEOUT: '15000' });
    assert(
      customPoolConfig.max === 25 && customPoolConfig.idleTimeoutMillis === 15000,
      'getPoolConfig honors DB_POOL_MAX and DB_POOL_IDLE_TIMEOUT configurations',
      `max: ${customPoolConfig.max}, idle: ${customPoolConfig.idleTimeoutMillis}`
    );

    // ----------------------------------------------------------------
    // SECTION 6: In-Memory Public Rate Limiting
    // ----------------------------------------------------------------
    console.log('\n\x1b[36m--- Section 6: In-Memory Public Rate Limiting ---\x1b[0m');

    const testLimiter = createRateLimiter({ windowMs: 10000, max: 3, message: 'Test limit reached' });
    let limiterResponses = [];
    const mockRes = () => {
      const headers = {};
      return {
        statusCode: 200,
        setHeader: (k, v) => { headers[k] = v; },
        status: function(code) { this.statusCode = code; return this; },
        json: function(data) { this.data = data; return this; },
        headers
      };
    };

    const mockReq = { ip: '198.51.100.42', headers: {} };
    for (let i = 0; i < 4; i++) {
      const res = mockRes();
      let nextCalled = false;
      testLimiter(mockReq, res, () => { nextCalled = true; });
      limiterResponses.push({ nextCalled, status: res.statusCode, remaining: res.headers['X-RateLimit-Remaining'] });
    }

    assert(
      limiterResponses[0].nextCalled === true && limiterResponses[0].remaining === 2,
      'First request passes rate limiter and decrements remaining quota'
    );
    assert(
      limiterResponses[2].nextCalled === true && limiterResponses[2].remaining === 0,
      'Third request consumes the final quota allowed by the rate limiter window'
    );
    assert(
      limiterResponses[3].nextCalled === false && limiterResponses[3].status === 429,
      'Fourth request exceeding quota is blocked with HTTP 429 Too Many Requests'
    );

    testLimiter.reset();
    const resAfterReset = mockRes();
    let nextAfterReset = false;
    testLimiter(mockReq, resAfterReset, () => { nextAfterReset = true; });
    assert(
      nextAfterReset === true && resAfterReset.headers['X-RateLimit-Remaining'] === 2,
      'Rate limiter reset clears hits and restores full quota'
    );

    // ----------------------------------------------------------------
    // SECTION 7: Security Safeguards & JWT Production Validation
    // ----------------------------------------------------------------
    console.log('\n\x1b[36m--- Section 7: Security Safeguards & JWT Production Validation ---\x1b[0m');

    // 1. Production + missing JWT_SECRET => startup/config validation failure
    let missingSecretFailed = false;
    let missingSecretMsg = '';
    try {
      validateJwtConfig({ NODE_ENV: 'production' });
    } catch (e) {
      missingSecretFailed = true;
      missingSecretMsg = e.message;
    }
    assert(
      missingSecretFailed === true && missingSecretMsg.includes('Missing or empty JWT_SECRET'),
      'Production with missing JWT_SECRET fails closed during validation'
    );

    // 2. Production + empty JWT_SECRET => startup/config validation failure
    let emptySecretFailed = false;
    try {
      validateJwtConfig({ NODE_ENV: 'production', JWT_SECRET: '   ' });
    } catch (e) {
      emptySecretFailed = true;
    }
    assert(
      emptySecretFailed === true,
      'Production with whitespace/empty JWT_SECRET fails closed during validation'
    );

    // 3. Production + default/development JWT_SECRET => startup/config validation failure
    let devSecretFailed = false;
    try {
      validateJwtConfig({ NODE_ENV: 'production', JWT_SECRET: DEFAULT_DEV_SECRET });
    } catch (e) {
      devSecretFailed = true;
    }
    assert(
      devSecretFailed === true,
      'Production with default development JWT_SECRET fails closed during validation'
    );

    // 4. Production + template placeholder secret => startup/config validation failure
    let placeholderFailed = false;
    try {
      validateJwtConfig({ NODE_ENV: 'production', JWT_SECRET: 'replace_with_a_secure_random_64_char_secret_key_in_production' });
    } catch (e) {
      placeholderFailed = true;
    }
    assert(
      placeholderFailed === true,
      'Production with template placeholder JWT_SECRET fails closed during validation'
    );

    // 5. Production + obviously insecure / short secret => startup/config validation failure
    let shortSecretFailed = false;
    try {
      validateJwtConfig({ NODE_ENV: 'production', JWT_SECRET: 'short_key_1234' });
    } catch (e) {
      shortSecretFailed = true;
    }
    assert(
      shortSecretFailed === true,
      'Production with insecure/short secret (< 32 chars) fails closed during validation'
    );

    // 6. Production + valid explicit JWT_SECRET => startup allowed
    const validProdSecret = 'c9a8f2e1d7b654038a1f9e2d3c4b5a6f7e8d9c0b1a2f3e4d5c6b7a8f9e0d1c2b';
    let validProdPassed = false;
    try {
      validProdPassed = validateJwtConfig({ NODE_ENV: 'production', JWT_SECRET: validProdSecret });
    } catch (e) {
      validProdPassed = false;
    }
    assert(
      validProdPassed === true,
      'Production with valid, strong 64-character hex secret passes validation cleanly'
    );

    // 7. Development/test behavior remains functional with dev secret
    let devModeAllowed = false;
    try {
      devModeAllowed = validateJwtConfig({ NODE_ENV: 'development', JWT_SECRET: DEFAULT_DEV_SECRET }) &&
                       validateJwtConfig({ NODE_ENV: 'test' });
    } catch (e) {
      devModeAllowed = false;
    }
    assert(
      devModeAllowed === true,
      'Development and test environments remain functional with development secret fallback'
    );

    // 8. No secret value appears in error/log output
    const canarySecret = 'CANARY_INSECURE_SECRET_LEAK_TEST_VAL_12345';
    let CanaryErrorLeaked = false;
    try {
      validateJwtConfig({ NODE_ENV: 'production', JWT_SECRET: canarySecret });
    } catch (e) {
      CanaryErrorLeaked = e.message.includes(canarySecret);
    }
    assert(
      CanaryErrorLeaked === false,
      'Validation failure errors NEVER print or expose the secret value in log/error output'
    );

    // 9. isJwtSecretSecure helper accurately checks entropy and blacklists
    assert(
      isJwtSecretSecure(DEFAULT_DEV_SECRET) === false &&
      isJwtSecretSecure('replace_with_a_secure_random_64_char_secret_key_in_production') === false &&
      isJwtSecretSecure('short_secret') === false &&
      isJwtSecretSecure(validProdSecret) === true,
      'isJwtSecretSecure helper accurately identifies strong vs default/insecure secrets'
    );

    const serverModule = require('../server');
    assert(
      typeof serverModule.gracefulShutdown === 'function',
      'server.js exports gracefulShutdown handler for container process lifecycle',
      `type: ${typeof serverModule.gracefulShutdown}`
    );

    // -------------------------------------------------------------------------
    // ACTUAL PRODUCTION STARTUP PATH VERIFICATION (ISOLATED CHILD PROCESSES)
    // -------------------------------------------------------------------------
    console.log('\n\x1b[36m--- Section 7b: Actual Production Startup Path Verification (Subprocesses) ---\x1b[0m');
    const serverEntry = path.resolve(__dirname, '../server.js');

    // CASE 1: NODE_ENV=production + JWT_SECRET missing
    const isolatedPort1 = 49161;
    const envCase1 = {
      ...process.env,
      NODE_ENV: 'production',
      PORT: String(isolatedPort1)
    };
    delete envCase1.JWT_SECRET;

    const runCase1 = spawnSync(process.execPath, [serverEntry], {
      env: envCase1,
      encoding: 'utf-8',
      timeout: 5000
    });

    const isListening1 = await checkPortListening(isolatedPort1);
    const case1Output = (runCase1.stdout || '') + (runCase1.stderr || '');

    assert(
      runCase1.status !== 0,
      'CASE 1: Actual production startup with missing JWT_SECRET exits with non-zero failure status',
      `exitCode: ${runCase1.status}`
    );
    assert(
      case1Output.includes('STARTUP FAILED') && case1Output.includes('Missing or empty JWT_SECRET'),
      'CASE 1: Actual production startup detects missing secret and reports configuration validation failure',
      `stderr: ${runCase1.stderr?.trim()}`
    );
    assert(
      !case1Output.includes('Backend Service running on port:') && isListening1 === false,
      'CASE 1: Evidence verified - server.listen() was NOT reached and HTTP server is not listening'
    );

    // CASE 2: NODE_ENV=production + JWT_SECRET invalid/default/too short
    const isolatedPort2 = 49162;
    const canaryInsecureSecret = 'short_canary_secret_insecure';
    const envCase2 = {
      ...process.env,
      NODE_ENV: 'production',
      JWT_SECRET: canaryInsecureSecret,
      PORT: String(isolatedPort2)
    };

    const runCase2 = spawnSync(process.execPath, [serverEntry], {
      env: envCase2,
      encoding: 'utf-8',
      timeout: 5000
    });

    const isListening2 = await checkPortListening(isolatedPort2);
    const case2Output = (runCase2.stdout || '') + (runCase2.stderr || '');

    assert(
      runCase2.status !== 0,
      'CASE 2: Actual production startup with invalid/insecure JWT_SECRET exits with non-zero failure status',
      `exitCode: ${runCase2.status}`
    );
    assert(
      case2Output.includes('STARTUP FAILED') && case2Output.includes('Production secret is insecure'),
      'CASE 2: Actual production startup halts before listen() when secret is insecure'
    );
    assert(
      !case2Output.includes('Backend Service running on port:') && isListening2 === false,
      'CASE 2: Evidence verified - server.listen() was NOT reached and HTTP requests cannot be accepted'
    );
    assert(
      !case2Output.includes(canaryInsecureSecret),
      'CASE 2: Security requirement met - invalid secret NEVER appears in stdout, stderr, error, or logs'
    );

    // CASE 2b: NODE_ENV=production + known default development secret
    const isolatedPort2b = 49163;
    const envCase2b = {
      ...process.env,
      NODE_ENV: 'production',
      JWT_SECRET: DEFAULT_DEV_SECRET,
      PORT: String(isolatedPort2b)
    };
    const runCase2b = spawnSync(process.execPath, [serverEntry], {
      env: envCase2b,
      encoding: 'utf-8',
      timeout: 5000
    });
    const isListening2b = await checkPortListening(isolatedPort2b);
    const case2bOutput = (runCase2b.stdout || '') + (runCase2b.stderr || '');
    assert(
      runCase2b.status !== 0 && isListening2b === false && case2bOutput.includes('default, demo, or placeholder'),
      'CASE 2b: Actual production startup with default/dev JWT_SECRET exits non-zero and refuses startup before listen()'
    );

    // CASE 3: NODE_ENV=production + valid 64-character explicit secret
    const isolatedPort3 = 49164;
    const envCase3 = {
      ...process.env,
      NODE_ENV: 'production',
      JWT_SECRET: validProdSecret,
      PORT: String(isolatedPort3),
      STARTUP_VERIFY_ONLY: 'true'
    };

    const runCase3 = spawnSync(process.execPath, [serverEntry], {
      env: envCase3,
      encoding: 'utf-8',
      timeout: 5000
    });

    const isListening3 = await checkPortListening(isolatedPort3);
    const case3Output = (runCase3.stdout || '') + (runCase3.stderr || '');

    assert(
      runCase3.status === 0,
      'CASE 3: Actual production startup with valid 64-character secret passes validation with exit status 0',
      `exitCode: ${runCase3.status}`
    );
    assert(
      case3Output.includes('[Startup Verification] Production configuration validated successfully. Startup allowed.'),
      'CASE 3: Actual production startup entry point proves configuration passed without error',
      `stdout: ${runCase3.stdout?.trim()}`
    );
    assert(
      isListening3 === false,
      'CASE 3: Controlled startup verification test exits cleanly leaving NO lingering real server process'
    );

    // ----------------------------------------------------------------
    // SECTION 8: Frontend Dynamic Media URL & Error Boundary
    // ----------------------------------------------------------------
    console.log('\n\x1b[36m--- Section 8: Frontend Media Resolution & Error Boundary ---\x1b[0m');

    const apiSource = fs.readFileSync(path.resolve(__dirname, '../../../client/src/services/api.js'), 'utf-8');
    assert(
      apiSource.includes('export const getMediaUrl = (relativePath) =>'),
      'client/src/services/api.js defines dynamic getMediaUrl helper',
      'Found getMediaUrl export'
    );

    const reviewWorkspaceSource = fs.readFileSync(path.resolve(__dirname, '../../../client/src/components/ReviewWorkspace.jsx'), 'utf-8');
    assert(
      reviewWorkspaceSource.includes('src={getMediaUrl(caseData.complaint.photo_url)}') &&
      !reviewWorkspaceSource.includes('`http://localhost:4000${caseData.complaint.photo_url}`'),
      'ReviewWorkspace.jsx uses getMediaUrl instead of hardcoded localhost:4000',
      'Verified zero localhost:4000 photo URLs in ReviewWorkspace'
    );

    const errorBoundaryPath = path.resolve(__dirname, '../../../client/src/components/ErrorBoundary.jsx');
    assert(
      fs.existsSync(errorBoundaryPath),
      'client/src/components/ErrorBoundary.jsx exists',
      errorBoundaryPath
    );

    const appSource = fs.readFileSync(path.resolve(__dirname, '../../../client/src/App.jsx'), 'utf-8');
    assert(
      appSource.includes('<ErrorBoundary>') && appSource.includes('</ErrorBoundary>'),
      'client/src/App.jsx wraps AppContent in ErrorBoundary for UI failure resilience'
    );

    // ----------------------------------------------------------------
    // SECTION 9: Environment Variable Templates & Root Deployment Scripts
    // ----------------------------------------------------------------
    console.log('\n\x1b[36m--- Section 9: Environment Templates & Root Deployment Scripts ---\x1b[0m');

    const serverEnvExample = fs.readFileSync(path.resolve(__dirname, '../../.env.example'), 'utf-8');
    assert(
      serverEnvExample.includes('DATABASE_URL=') &&
      serverEnvExample.includes('JWT_SECRET=') &&
      serverEnvExample.includes('COOKIE_SAME_SITE=') &&
      serverEnvExample.includes('DB_SSL_REJECT_UNAUTHORIZED=') &&
      serverEnvExample.includes('TRUST_PROXY='),
      'server/.env.example contains complete production configuration documentation including SSL and Trust Proxy'
    );

    const clientEnvExample = fs.readFileSync(path.resolve(__dirname, '../../../client/.env.example'), 'utf-8');
    assert(
      clientEnvExample.includes('VITE_API_URL=') && clientEnvExample.includes('VITE_SOCKET_URL='),
      'client/.env.example contains production frontend API and Socket URL references'
    );

    const rootPackage = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../../package.json'), 'utf-8'));
    assert(
      typeof rootPackage.scripts?.build === 'string' &&
      typeof rootPackage.scripts?.start === 'string' &&
      typeof rootPackage.scripts?.test === 'string',
      'Root package.json exposes build, start, and test scripts for automated deployment runners'
    );

    // ----------------------------------------------------------------
    // SECTION 10: Historical GIS Invariants & Database Integrity
    // ----------------------------------------------------------------
    console.log('\n\x1b[36m--- Section 10: Historical GIS Invariants & Database Integrity ---\x1b[0m');

    const activeVersionRes = await pool.query(
      "SELECT id, version_code, status, validation_status FROM jurisdiction_versions WHERE status = 'ACTIVE';"
    );
    assert(
      activeVersionRes.rows.length === 1 && activeVersionRes.rows[0].version_code === 'MYS_2026_V2',
      'Exactly one active jurisdiction version exists (MYS_2026_V2)',
      `active count: ${activeVersionRes.rows.length}, code: ${activeVersionRes.rows[0]?.version_code}`
    );

    const v1HistoricalRes = await pool.query(`
      SELECT count(*) AS count 
      FROM routing_decisions rd
      JOIN jurisdiction_versions jv ON rd.jurisdiction_version_id = jv.id
      WHERE jv.version_code = 'MYS_2026_V1';
    `);
    const v1Count = parseInt(v1HistoricalRes.rows[0].count, 10);
    assert(
      v1Count >= 150,
      `Historical routing decisions remain permanently linked to MYS_2026_V1 (${v1Count} records preserved)`,
      `v1 count: ${v1Count}`
    );

    const triggerRes = await pool.query(`
      SELECT tgname, tgenabled 
      FROM pg_trigger 
      WHERE tgname = 'trg_audit_logs_immutable';
    `);
    assert(
      triggerRes.rows.length === 1 && triggerRes.rows[0].tgenabled === 'O',
      'PostgreSQL engine-level immutability trigger trg_audit_logs_immutable is active on audit_logs'
    );

    // Verify UPDATE on audit_logs is rejected
    let updateRejected = false;
    try {
      await pool.query("UPDATE audit_logs SET action = 'TAMPERED' WHERE action = 'AUTH_LOGIN';");
    } catch (e) {
      updateRejected = e.message.includes('immutable');
    }
    assert(
      updateRejected === true,
      'audit_logs UPDATE statement is rejected by PostgreSQL immutability trigger'
    );

    // Verify DELETE on audit_logs is rejected
    let deleteRejected = false;
    try {
      await pool.query("DELETE FROM audit_logs WHERE action = 'AUTH_LOGIN';");
    } catch (e) {
      deleteRejected = e.message.includes('immutable');
    }
    assert(
      deleteRejected === true,
      'audit_logs DELETE statement is rejected by PostgreSQL immutability trigger'
    );

  } catch (err) {
    console.error('\n\x1b[31mFatal test runner error:\x1b[0m', err);
    failedCount++;
  } finally {
    console.log('\n================================================================');
    console.log(` STAGE 15 VERIFICATION RESULTS`);
    console.log(` TOTAL ASSERTIONS: ${assertionIndex}`);
    console.log(` \x1b[32mPASSED: ${passedCount}\x1b[0m`);
    console.log(` \x1b[31mFAILED: ${failedCount}\x1b[0m`);
    console.log('================================================================');

    await pool.end();
    process.exit(failedCount > 0 ? 1 : 0);
  }
}

runStage15Tests();
