const path = require('path');
if (process.env.NODE_ENV !== 'production' || process.env.LOAD_DOTENV === 'true') {
  require('dotenv').config();
  require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
}
const http = require('http');
const app = require('./app');
const { initSocketIO } = require('./services/socketService');
const { pool, checkDatabaseHealth } = require('./config/db');
const { validateJwtConfig } = require('./services/authService');

const PORT = process.env.PORT || 4000;
const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:5173';

const server = http.createServer(app);

// Initialize Socket.IO
initSocketIO(server, CLIENT_URL);

// Start server if executed directly
if (require.main === module) {
  try {
    // Fail closed before opening HTTP listener if production security is violated
    validateJwtConfig();
  } catch (err) {
    console.error('\n🔴 [STARTUP FAILED — CONFIGURATION ERROR]');
    console.error(err.message);
    console.error('Process exiting before accepting connections.\n');
    process.exit(1);
  }

  // Controlled verification entry point for automated startup test runners
  if (process.env.STARTUP_VERIFY_ONLY === 'true' || process.argv.includes('--verify-startup')) {
    console.log('[Startup Verification] Production configuration validated successfully. Startup allowed.');
    process.exit(0);
  }

  server.listen(PORT, async () => {
    console.log(`====================================================`);
    console.log(` Adaptive Civic Routing Intelligence System`);
    console.log(` Backend Service running on port: ${PORT}`);
    console.log(` Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(` Allowed Client Origin: ${CLIENT_URL}`);
    console.log(` Health Endpoint: http://localhost:${PORT}/api/health`);
    console.log(` Liveness Probe:  http://localhost:${PORT}/api/health/live`);
    console.log(` Readiness Probe: http://localhost:${PORT}/api/health/ready`);
    console.log(`====================================================`);

    const dbHealth = await checkDatabaseHealth();
    if (dbHealth.connected) {
      console.log(`[Database] Connected successfully to PostgreSQL: ${dbHealth.databaseName}`);
      if (dbHealth.postgisInstalled) {
        console.log(`[Database] PostGIS extension detected: ${dbHealth.postgisVersion}`);
      } else {
        console.log(`[Database] Notice: PostGIS extension not detected.`);
      }
    } else {
      console.warn(`[Database Status] Notice: PostgreSQL is currently offline / not connected.`);
      console.warn(`[Database Details] ${dbHealth.message} (${dbHealth.error || 'No error detail'})`);
    }
  });
}

// Graceful Shutdown Handler for cloud orchestrators (Render, Docker, Kubernetes)
let isShuttingDown = false;
const gracefulShutdown = (signal, callback) => {
  if (isShuttingDown) return;
  isShuttingDown = true;
  console.log(`\n[Process] ${signal} signal received. Initiating graceful shutdown...`);

  const forceExitTimer = setTimeout(() => {
    console.error('[Process] Forced shutdown timed out. Terminating now.');
    if (callback) callback(new Error('Shutdown timeout'));
    else process.exit(1);
  }, 10000);
  forceExitTimer.unref();

  server.close(async () => {
    console.log('[HTTP Server] Closed accepting new connections.');
    try {
      if (pool) {
        await pool.end();
        console.log('[Database Pool] PostgreSQL connections cleanly closed.');
      }
      clearTimeout(forceExitTimer);
      console.log('[Process] Graceful shutdown completed cleanly.');
      if (callback) callback(null);
      else process.exit(0);
    } catch (err) {
      console.error('[Database Pool] Error during pool drain:', err.message);
      if (callback) callback(err);
      else process.exit(1);
    }
  });
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception thrown:', err);
});

module.exports = {
  server,
  gracefulShutdown
};
