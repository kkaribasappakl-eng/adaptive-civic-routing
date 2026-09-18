const fs = require('fs');
const path = require('path');
const { pool, checkDatabaseHealth } = require('../config/db');

async function runSeeds() {
  console.log('====================================================');
  console.log(' Adaptive Civic Routing - Database Seed Runner');
  console.log(' (DEMO / TEST JURISDICTION DATA)');
  console.log('====================================================');

  const health = await checkDatabaseHealth();
  if (!health.connected) {
    console.error('❌ Cannot run seeds: Database is offline or unreachable.');
    console.error(`   Details: ${health.message} (${health.error || 'No error detail'})`);
    process.exit(1);
  }

  const seedsDir = path.resolve(__dirname, '../../../database/seeds');
  console.log(`📁 Scanning seed directory: ${seedsDir}`);

  if (!fs.existsSync(seedsDir)) {
    console.error(`❌ Seeds directory not found: ${seedsDir}`);
    process.exit(1);
  }

  const files = fs.readdirSync(seedsDir)
    .filter(f => f.endsWith('.sql'))
    .sort();

  console.log(`📄 Found ${files.length} seed file(s): ${files.join(', ')}`);

  const client = await pool.connect();
  try {
    for (const file of files) {
      const filePath = path.join(seedsDir, file);
      console.log(`⏳ Executing seed: ${file}...`);
      const sql = fs.readFileSync(filePath, 'utf-8');

      await client.query('BEGIN');
      await client.query(sql);
      await client.query('COMMIT');

      console.log(`✅ Completed seed: ${file}`);
    }

    console.log('====================================================');
    console.log('🌱 All seeds executed successfully!');
    console.log('====================================================');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(`❌ Seed execution failed: ${err.message}`);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

runSeeds();
