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
const { pool } = require('../config/db');
const { getPoolConfig } = require('../config/db');
const { parseAllowedOrigins } = require('../app');
const { getCookieOptions } = require('../controllers/authController');
const { isJwtSecretSecure, DEFAULT_DEV_SECRET } = require('../services/authService');
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

    const trustProxySetting = app.get('trust proxy');
    assert(
      trustProxySetting !== undefined && trustProxySetting !== false,
      'Express app has trust proxy enabled for cloud reverse proxies (Render, AWS, Cloudflare)',
      `trust proxy setting: ${trustProxySetting}`
    );

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
    // SECTION 5: Database Connection Pool & Cloud SSL Prioritization
    // ----------------------------------------------------------------
    console.log('\n\x1b[36m--- Section 5: Database Connection Pool & Cloud SSL Prioritization ---\x1b[0m');

    const originalDbUrl = process.env.DATABASE_URL;
    const originalDbSsl = process.env.DB_SSL;
    const originalPoolMax = process.env.DB_POOL_MAX;

    try {
      // Test DATABASE_URL prioritization over local password
      process.env.DATABASE_URL = 'postgresql://cloud_user:cloud_pass@cloud.postgres.database.com:5432/civic_prod?sslmode=require';
      const cloudConfig = getPoolConfig();
      assert(
        cloudConfig.connectionString === process.env.DATABASE_URL &&
        cloudConfig.ssl && cloudConfig.ssl.rejectUnauthorized === false,
        'getPoolConfig prioritizes DATABASE_URL and enables SSL when sslmode=require',
        `connString: ${cloudConfig.connectionString}`
      );

      // Test custom pool parameters
      process.env.DB_POOL_MAX = '25';
      process.env.DB_POOL_IDLE_TIMEOUT = '15000';
      const customPoolConfig = getPoolConfig();
      assert(
        customPoolConfig.max === 25 && customPoolConfig.idleTimeoutMillis === 15000,
        'getPoolConfig honors DB_POOL_MAX and DB_POOL_IDLE_TIMEOUT configurations',
        `max: ${customPoolConfig.max}, idle: ${customPoolConfig.idleTimeoutMillis}`
      );
    } finally {
      if (originalDbUrl) process.env.DATABASE_URL = originalDbUrl;
      else delete process.env.DATABASE_URL;
      if (originalDbSsl) process.env.DB_SSL = originalDbSsl;
      else delete process.env.DB_SSL;
      if (originalPoolMax) process.env.DB_POOL_MAX = originalPoolMax;
      else delete process.env.DB_POOL_MAX;
    }

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

    const originalJwtSecret = process.env.JWT_SECRET;
    try {
      process.env.JWT_SECRET = DEFAULT_DEV_SECRET;
      assert(
        isJwtSecretSecure() === false,
        'isJwtSecretSecure returns false when using development fallback secret'
      );

      process.env.JWT_SECRET = 'c9a8f2e1d7b654038a1f9e2d3c4b5a6f7e8d9c0b1a2f3e4d5c6b7a8f9e0d1c2b';
      assert(
        isJwtSecretSecure() === true,
        'isJwtSecretSecure returns true when configured with a secure random secret'
      );
    } finally {
      if (originalJwtSecret) process.env.JWT_SECRET = originalJwtSecret;
      else delete process.env.JWT_SECRET;
    }

    const serverModule = require('../server');
    assert(
      typeof serverModule.gracefulShutdown === 'function',
      'server.js exports gracefulShutdown handler for container process lifecycle',
      `type: ${typeof serverModule.gracefulShutdown}`
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
      serverEnvExample.includes('COOKIE_SAME_SITE='),
      'server/.env.example contains complete production configuration documentation'
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
