require('dotenv').config();
const http = require('http');
const app = require('./app');
const { initSocketIO } = require('./services/socketService');
const { checkDatabaseHealth } = require('./config/db');

const PORT = process.env.PORT || 4000;
const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:5173';

const server = http.createServer(app);

// Initialize Socket.IO
initSocketIO(server, CLIENT_URL);

// Start server
server.listen(PORT, async () => {
  console.log(`====================================================`);
  console.log(` Adaptive Civic Routing Intelligence System`);
  console.log(` Backend Service running on port: ${PORT}`);
  console.log(` Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(` Allowed Client Origin: ${CLIENT_URL}`);
  console.log(` Health Endpoint: http://localhost:${PORT}/api/health`);
  console.log(`====================================================`);

  // Check database connectivity gracefully
  const dbHealth = await checkDatabaseHealth();
  if (dbHealth.connected) {
    console.log(`[Database] Connected successfully to PostgreSQL: ${dbHealth.database}`);
    if (dbHealth.postgisInstalled) {
      console.log(`[Database] PostGIS extension detected: ${dbHealth.postgisVersion}`);
    } else {
      console.log(`[Database] Notice: PostGIS extension not detected. Future stages will require PostGIS.`);
    }
  } else {
    console.warn(`[Database Status] Notice: PostgreSQL is currently offline / not connected.`);
    console.warn(`[Database Details] ${dbHealth.message} (${dbHealth.error || 'No error detail'})`);
    console.log(`[Database Status] The server will continue running in Stage 1 standalone mode.`);
  }
});

// Handle uncaught exceptions gracefully
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception thrown:', err);
});
