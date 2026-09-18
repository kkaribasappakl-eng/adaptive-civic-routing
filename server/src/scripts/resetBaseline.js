const { pool } = require('../config/db');
const { setupDemoV2Scenario } = require('../services/versionService');

async function reset() {
  try {
    await pool.query("UPDATE jurisdiction_versions SET status = 'RETIRED' WHERE version_code = 'MYS_2026_V2'");
    await pool.query("UPDATE jurisdiction_versions SET status = 'ACTIVE' WHERE version_code = 'MYS_2026_V1'");
    await setupDemoV2Scenario();
    console.log('RESET COMPLETED: V1 is ACTIVE, V2 is DRAFT');
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

reset();
