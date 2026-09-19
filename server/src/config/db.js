const { Pool } = require('pg');
require('dotenv').config();

let pool = null;
let dbStatus = {
  connected: false,
  message: 'Database not initialized',
  error: null,
  databaseName: process.env.DB_NAME || 'adaptive_civic_routing',
  postgisInstalled: false,
  postgisVersion: null
};

const getPoolConfig = () => {
  const max = parseInt(process.env.DB_POOL_MAX || '10', 10);
  const idleTimeoutMillis = parseInt(process.env.DB_POOL_IDLE_TIMEOUT || '10000', 10);
  const connectionTimeoutMillis = parseInt(process.env.DB_POOL_CONN_TIMEOUT || '3000', 10);

  const useSsl = process.env.DB_SSL === 'true' || 
                 Boolean(process.env.DATABASE_URL && process.env.DATABASE_URL.includes('sslmode=require'));
  const ssl = useSsl ? { rejectUnauthorized: false } : false;

  // Cloud deployment prioritization: If DATABASE_URL is explicitly set, use it first
  if (process.env.DATABASE_URL && process.env.DATABASE_URL.trim() !== '') {
    const config = {
      connectionString: process.env.DATABASE_URL.trim(),
      connectionTimeoutMillis,
      idleTimeoutMillis,
      max
    };
    if (useSsl) {
      config.ssl = ssl;
    }
    return config;
  }

  const host = process.env.DB_HOST || 'localhost';
  const port = parseInt(process.env.DB_PORT || '5432', 10);
  const database = process.env.DB_NAME || 'adaptive_civic_routing';
  const user = process.env.DB_USER || 'postgres';
  const password = process.env.DB_PASSWORD !== undefined ? String(process.env.DB_PASSWORD) : '';

  const config = {
    host,
    port,
    database,
    user,
    password,
    connectionTimeoutMillis,
    idleTimeoutMillis,
    max
  };

  if (useSsl) {
    config.ssl = ssl;
  }

  return config;
};

try {
  pool = new Pool(getPoolConfig());

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

/**
 * Checks PostgreSQL & PostGIS availability without throwing fatal errors.
 * Returns a clean diagnostic object.
 */
const checkDatabaseHealth = async () => {
  if (!pool) {
    dbStatus = {
      connected: false,
      message: 'PostgreSQL connection pool not configured',
      error: 'No pool instance',
      databaseName: process.env.DB_NAME || 'adaptive_civic_routing',
      postgisInstalled: false,
      postgisVersion: null
    };
    return dbStatus;
  }

  try {
    const client = await pool.connect();
    try {
      const dbRes = await client.query('SELECT current_database(), version()');
      const dbName = dbRes.rows[0].current_database;

      // Check for PostGIS extension availability and version
      let postgisInstalled = false;
      let postgisVersion = null;
      try {
        const gisRes = await client.query('SELECT PostGIS_Version()');
        postgisInstalled = true;
        postgisVersion = gisRes.rows[0].postgis_version;
      } catch {
        postgisInstalled = false;
        postgisVersion = null;
      }

      dbStatus = {
        connected: true,
        databaseName: dbName,
        message: 'PostgreSQL connection successful',
        postgisInstalled,
        postgisVersion,
        error: null
      };
      return dbStatus;
    } finally {
      client.release();
    }
  } catch (error) {
    dbStatus = {
      connected: false,
      databaseName: process.env.DB_NAME || 'adaptive_civic_routing',
      message: 'Unable to connect to PostgreSQL database. Database server is offline or unreachable.',
      error: error.message,
      postgisInstalled: false,
      postgisVersion: null
    };
    return dbStatus;
  }
};

const getDbStatus = () => dbStatus;

module.exports = {
  pool,
  checkDatabaseHealth,
  getDbStatus,
  getPoolConfig
};
