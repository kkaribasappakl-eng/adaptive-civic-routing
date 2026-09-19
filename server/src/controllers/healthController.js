const { getDbStatus, checkDatabaseHealth } = require('../config/db');

/**
 * Health check controller
 * GET /api/health
 */
const getHealth = async (req, res) => {
  let db = getDbStatus();
  if (req.query.detailed === 'true') {
    db = await checkDatabaseHealth();
  }

  let socketStatus = { initialized: false, clients: 0 };
  try {
    const { getIO } = require('../services/socketService');
    const io = getIO();
    socketStatus = {
      initialized: true,
      clients: io.engine?.clientsCount || 0
    };
  } catch {
    socketStatus = { initialized: false, clients: 0 };
  }

  res.status(200).json({
    success: true,
    message: "Adaptive Civic Routing API is running",
    stage: 15,
    status: "production-ready",
    service: "Adaptive Civic Routing Intelligence System",
    timestamp: new Date().toISOString(),
    database: {
      connected: db.connected,
      message: db.message,
      postgisInstalled: db.postgisInstalled || false,
      postgisVersion: db.postgisVersion || null
    },
    realtime: socketStatus
  });
};

/**
 * Cloud Liveness Probe
 * GET /api/health/live
 * Fast check indicating process is up and responding
 */
const getLiveness = (req, res) => {
  res.status(200).json({
    status: 'alive',
    uptimeSeconds: Math.floor(process.uptime()),
    timestamp: new Date().toISOString()
  });
};

/**
 * Cloud Readiness Probe
 * GET /api/health/ready
 * Authoritative check indicating database & PostGIS are ready for civic routing queries
 * Returns 503 Service Unavailable if database is unreachable.
 */
const getReadiness = async (req, res) => {
  const db = await checkDatabaseHealth();
  if (db.connected && db.postgisInstalled) {
    return res.status(200).json({
      status: 'ready',
      database: 'connected',
      postgis: 'available',
      databaseName: db.databaseName,
      timestamp: new Date().toISOString()
    });
  }

  return res.status(503).json({
    status: 'not_ready',
    database: db.connected ? 'connected' : 'disconnected',
    postgis: db.postgisInstalled ? 'available' : 'unavailable',
    error: db.message || 'Database connection offline',
    timestamp: new Date().toISOString()
  });
};

module.exports = {
  getHealth,
  getLiveness,
  getReadiness
};
