const fs = require('fs');
const path = require('path');
const { pool, checkDatabaseHealth } = require('../config/db');

async function runMigrations() {
  console.log('====================================================');
  console.log(' Adaptive Civic Routing - Database Migration Runner');
  console.log('====================================================');

  const health = await checkDatabaseHealth();
  if (!health.connected) {
    console.error('❌ Cannot run migrations: Database is offline or unreachable.');
    console.error(`   Details: ${health.message} (${health.error || 'No error detail'})`);
    process.exit(1);
  }

  const migrationsDir = path.resolve(__dirname, '../../../database/migrations');
  console.log(`📁 Scanning migration directory: ${migrationsDir}`);

  if (!fs.existsSync(migrationsDir)) {
    console.error(`❌ Migration directory not found: ${migrationsDir}`);
    process.exit(1);
  }

  const files = fs.readdirSync(migrationsDir)
    .filter(f => f.endsWith('.sql'))
    .sort();

  console.log(`📄 Found ${files.length} migration file(s): ${files.join(', ')}`);

  const client = await pool.connect();
  try {
    for (const file of files) {
      const filePath = path.join(migrationsDir, file);
      console.log(`⏳ Executing migration: ${file}...`);
      const sql = fs.readFileSync(filePath, 'utf-8');

      await client.query('BEGIN');
      await client.query(sql);
      await client.query('COMMIT');

      console.log(`✅ Completed migration: ${file}`);
    }

    console.log('====================================================');
    console.log('🎉 All migrations applied successfully!');
    console.log('====================================================');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(`❌ Migration execution failed: ${err.message}`);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

runMigrations();
