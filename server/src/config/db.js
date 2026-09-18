const { Pool } = require('pg');
require('dotenv').config();

let pool = null;
let dbStatus = {
  connected: false,
  message: 'Database not initialized',
  error: null,
  postgisInstalled: false
};

if (process.env.DATABASE_URL) {
  try {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      // Small timeout for health checks so startup is not blocked if DB is offline
      connectionTimeoutMillis: 3000,
      idleTimeoutMillis: 10000,
      max: 10
    });

    pool.on('error', (err) => {
      console.warn('[PostgreSQL Pool Warning]', err.message);
      dbStatus.connected = false;
      dbStatus.error = err.message;
    });
  } catch (err) {
    console.warn('[PostgreSQL Initialization Error]', err.message);
    dbStatus.connected = false;
    dbStatus.error = err.message;
  }
} else {
  dbStatus.message = 'DATABASE_URL environment variable is not defined';
}

/**
 * Checks PostgreSQL & PostGIS availability without throwing fatal errors.
 * Returns a clean diagnostic object.
 */
const checkDatabaseHealth = async () => {
  if (!pool) {
    return {
      connected: false,
      message: 'PostgreSQL pool not configured (check DATABASE_URL in .env)',
      error: 'No pool instance'
    };
  }

  try {
    const client = await pool.connect();
    try {
      const dbRes = await client.query('SELECT current_database(), version()');
      
      // Check for PostGIS extension availability
      let postgisInstalled = false;
      let postgisVersion = null;
      try {
        const gisRes = await client.query('SELECT PostGIS_Version()');
        postgisInstalled = true;
        postgisVersion = gisRes.rows[0].postgis_version;
      } catch {
        postgisInstalled = false;
      }

      dbStatus = {
        connected: true,
        database: dbRes.rows[0].current_database,
        message: 'PostgreSQL connection successful',
        postgisInstalled,
        postgisVersion
      };
      return dbStatus;
    } finally {
      client.release();
    }
  } catch (error) {
    dbStatus = {
      connected: false,
      message: 'Unable to connect to PostgreSQL database. Server will operate with degraded DB features.',
      error: error.message
    };
    return dbStatus;
  }
};

const getDbStatus = () => dbStatus;

module.exports = {
  pool,
  checkDatabaseHealth,
  getDbStatus
};
