const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
if (process.env.NODE_ENV !== 'production' || process.env.LOAD_DOTENV === 'true') {
  require('dotenv').config();
  require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });
}

let pool = null;
let dbStatus = {
  connected: false,
  message: 'Database not initialized',
  error: null,
  databaseName: process.env.DB_NAME || 'adaptive_civic_routing',
  postgisInstalled: false,
  postgisVersion: null
};

/**
 * Configure PostgreSQL SSL / TLS connection parameters.
 * 
 * Rules:
 * 1. Local/no SSL: Returns false when SSL is not required or explicitly disabled.
 * 2. Production TLS: Enabled when DB_SSL=true or DATABASE_URL contains sslmode=(require|verify-ca|verify-full).
 * 3. Secure by default: rejectUnauthorized is true by default. It is NEVER false by default.
 * 4. Insecure override: rejectUnauthorized=false is supported ONLY via explicit DB_SSL_REJECT_UNAUTHORIZED='false'.
 * 5. CA certificate support: DB_SSL_CA supports either a file path or raw PEM certificate string.
 */
const getSslConfig = (env = process.env) => {
  // Explicit DB_SSL=false disables SSL
  if (env.DB_SSL === 'false') {
    return false;
  }

  const useSsl = env.DB_SSL === 'true' || 
                 Boolean(env.DATABASE_URL && /sslmode=(require|verify-ca|verify-full)/i.test(env.DATABASE_URL));

  if (!useSsl) {
    return false;
  }

  // Certificate verification MUST remain enabled by default (rejectUnauthorized: true)
  // Insecure verification is strictly opt-in via DB_SSL_REJECT_UNAUTHORIZED === 'false'
  const rejectUnauthorized = env.DB_SSL_REJECT_UNAUTHORIZED !== 'false';

  const sslConfig = {
    rejectUnauthorized
  };

  // Explicit CA certificate support
  if (env.DB_SSL_CA && typeof env.DB_SSL_CA === 'string' && env.DB_SSL_CA.trim()) {
    const caVal = env.DB_SSL_CA.trim();
    try {
      if (fs.existsSync && fs.existsSync(caVal)) {
        sslConfig.ca = fs.readFileSync(caVal, 'utf-8');
      } else {
        sslConfig.ca = caVal;
      }
    } catch {
      sslConfig.ca = caVal;
    }
  }

  return sslConfig;
};

const getPoolConfig = (env = process.env) => {
  const max = parseInt(env.DB_POOL_MAX || '10', 10);
  const idleTimeoutMillis = parseInt(env.DB_POOL_IDLE_TIMEOUT || '10000', 10);
  const connectionTimeoutMillis = parseInt(env.DB_POOL_CONN_TIMEOUT || '3000', 10);

  const ssl = getSslConfig(env);

  // Cloud deployment prioritization: If DATABASE_URL is explicitly set, use it first
  if (env.DATABASE_URL && env.DATABASE_URL.trim() !== '') {
    const config = {
      connectionString: env.DATABASE_URL.trim(),
      connectionTimeoutMillis,
      idleTimeoutMillis,
      max
    };
    if (ssl) {
      config.ssl = ssl;
    }
    return config;
  }

  const host = env.DB_HOST || 'localhost';
  const port = parseInt(env.DB_PORT || '5432', 10);
  const database = env.DB_NAME || 'adaptive_civic_routing';
  const user = env.DB_USER || 'postgres';
  const password = env.DB_PASSWORD !== undefined ? String(env.DB_PASSWORD) : '';

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

  if (ssl) {
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
  getPoolConfig,
  getSslConfig
};
