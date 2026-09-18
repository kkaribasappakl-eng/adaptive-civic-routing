const { pool, checkDatabaseHealth } = require('../config/db');

async function checkStatus() {
  console.log('====================================================');
  console.log(' Adaptive Civic Routing - Database Status Inspector');
  console.log('====================================================');

  const health = await checkDatabaseHealth();

  if (!health.connected) {
    console.log('🔴 PostgreSQL Status: OFFLINE');
    console.log(`   Database Name:    ${health.databaseName}`);
    console.log(`   Diagnostics:      ${health.message}`);
    console.log(`   Error:            ${health.error || 'Connection refused / host unreachable'}`);
    console.log('====================================================');
    process.exit(1);
  }

  console.log('🟢 PostgreSQL Status: CONNECTED');
  console.log(`   Database Name:    ${health.databaseName}`);
  console.log(`   PostGIS Status:   ${health.postgisInstalled ? 'INSTALLED' : 'NOT DETECTED'}`);
  if (health.postgisInstalled) {
    console.log(`   PostGIS Version:  ${health.postgisVersion}`);
  }

  try {
    const tableRes = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      ORDER BY table_name;
    `);
    const tables = tableRes.rows.map(r => r.table_name);
    console.log(`   Tables (${tables.length}):      ${tables.join(', ') || 'No tables yet'}`);

    if (tables.includes('jurisdictions')) {
      const jurCount = await pool.query('SELECT count(*) FROM jurisdictions');
      console.log(`   Jurisdictions:    ${jurCount.rows[0].count} record(s)`);
    }

    if (tables.includes('jurisdiction_versions')) {
      const verCount = await pool.query('SELECT version_code, status FROM jurisdiction_versions');
      console.log(`   Active Versions:  ${verCount.rows.map(v => `${v.version_code} (${v.status})`).join(', ') || 'None'}`);
    }
  } catch (err) {
    console.warn(`   Table check warning: ${err.message}`);
  }

  console.log('====================================================');
  await pool.end();
}

checkStatus();
