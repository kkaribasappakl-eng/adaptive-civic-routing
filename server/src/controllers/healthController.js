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

  res.status(200).json({
    success: true,
    message: "Adaptive Civic Routing API is running",
    stage: 4,
    service: "Adaptive Civic Routing Intelligence System",
    timestamp: new Date().toISOString(),
    database: {
      connected: db.connected,
      message: db.message,
      postgisInstalled: db.postgisInstalled || false
    }
  });
};

module.exports = {
  getHealth
};
