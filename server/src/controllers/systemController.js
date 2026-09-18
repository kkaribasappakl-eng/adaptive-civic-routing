const { checkDatabaseHealth } = require('../config/db');

/**
 * Detailed database system diagnostic
 * GET /api/system/database
 */
const getDatabaseStatus = async (req, res) => {
  try {
    const health = await checkDatabaseHealth();

    if (health.connected) {
      return res.status(200).json({
        success: true,
        database: {
          connected: true,
          postgisInstalled: Boolean(health.postgisInstalled),
          postgisVersion: health.postgisVersion || 'Unknown',
          databaseName: health.databaseName || 'adaptive_civic_routing',
          message: health.message
        },
        timestamp: new Date().toISOString()
      });
    }

    return res.status(200).json({
      success: true,
      database: {
        connected: false,
        postgisInstalled: false,
        postgisVersion: null,
        databaseName: health.databaseName || 'adaptive_civic_routing',
        message: health.message,
        error: health.error
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Failed to inspect database status',
      error: error.message
    });
  }
};

module.exports = {
  getDatabaseStatus
};
