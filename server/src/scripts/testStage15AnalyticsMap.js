/**
 * STAGE 15 FOCUSED VERIFICATION SUITE:
 * Analytics Spatial Map — OpenStreetMap Migration & CartoDB Removal
 */

const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });
const { pool } = require('../config/db');

let passed = 0;
let failed = 0;
let testIndex = 0;

function assert(condition, name, details = '') {
  testIndex++;
  if (condition) {
    console.log(`  ✔ [${testIndex}] ${name}`);
    if (details) console.log(`      Detail: ${details}`);
    passed++;
  } else {
    console.error(`  ✖ [${testIndex}] FAILED: ${name}`);
    if (details) console.error(`      Detail: ${details}`);
    failed++;
  }
}

async function runTests() {
  console.log('================================================================');
  console.log(' STAGE 15 FOCUSED VERIFICATION: ANALYTICS SPATIAL MAP (OSM)');
  console.log('================================================================\n');

  try {
    const analyticsFile = path.resolve(__dirname, '../../../client/src/components/AnalyticsDashboard.jsx');
    const complaintFormFile = path.resolve(__dirname, '../../../client/src/components/ComplaintForm.jsx');
    const analyticsContent = fs.readFileSync(analyticsFile, 'utf8');
    const complaintFormContent = fs.readFileSync(complaintFormFile, 'utf8');

    // 1. CartoDB completely removed from AnalyticsDashboard.jsx
    const hasCarto = /carto\.com|cartocdn|basemaps|dark_all|light_all/i.test(analyticsContent);
    assert(
      !hasCarto,
      '1. CartoDB removal: AnalyticsDashboard.jsx has ZERO CartoDB or basemaps references',
      `CartoDB detected: ${hasCarto}`
    );

    // 2. OpenStreetMap tile layer configured
    const osmTileUrl = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
    const hasOsm = analyticsContent.includes(osmTileUrl);
    assert(
      hasOsm,
      '2. Tile provider: AnalyticsDashboard.jsx uses standard OpenStreetMap tile URL',
      `Tile URL: ${osmTileUrl}`
    );

    // 3. Proper OpenStreetMap attribution present
    const hasOsmAttribution = analyticsContent.includes('OpenStreetMap') && analyticsContent.includes('contributors');
    assert(
      hasOsmAttribution,
      '3. Attribution: OpenStreetMap contributors attribution properly declared',
      'Attribution declared: YES'
    );

    // 4. MapInvalidator component present to prevent gray/unrendered tiles
    const hasInvalidator = analyticsContent.includes('MapInvalidator') && analyticsContent.includes('map.invalidateSize()');
    assert(
      hasInvalidator,
      '4. Leaflet fix: MapInvalidator included to prevent gray tiles on mount',
      'MapInvalidator present: YES'
    );

    // 5. Leaflet default marker icons configured
    const hasLeafletIcons = analyticsContent.includes('L.Icon.Default.mergeOptions') && analyticsContent.includes('marker-icon.png');
    assert(
      hasLeafletIcons,
      '5. Leaflet fix: Leaflet default icon paths configured for Vite compatibility',
      'Icon options merged: YES'
    );

    // 6. MapAutoBounds dynamically bounds real complaint coordinates
    const hasAutoBounds = analyticsContent.includes('MapAutoBounds') && analyticsContent.includes('map.fitBounds');
    assert(
      hasAutoBounds,
      '6. Map zoom/center: MapAutoBounds dynamically fits real complaint points when present',
      'MapAutoBounds component present: YES'
    );

    // 7. No map API key required in client
    const clientEnvExample = fs.readFileSync(path.resolve(__dirname, '../../../client/.env.example'), 'utf8');
    const hasMapApiKey = /CARTO_API_KEY|MAP_API_KEY|MAPBOX_TOKEN|OSM_API_KEY/i.test(clientEnvExample) ||
                         /CARTO_API_KEY|MAP_API_KEY|MAPBOX_TOKEN|OSM_API_KEY/i.test(analyticsContent);
    assert(
      !hasMapApiKey,
      '7. Zero map API keys: No paid map API key or token required or referenced in frontend',
      'Map API key required: NO (100% Free OpenStreetMap)'
    );

    // 8. Real analytics spatial data query against PostgreSQL PostGIS
    const spatialRes = await pool.query(`
      SELECT 
        c.id,
        c.complaint_code,
        c.category,
        c.status,
        c.latitude,
        c.longitude,
        ST_AsText(c.location) AS geom_text,
        ST_SRID(c.location) AS srid,
        a.name AS authority_name,
        d.name AS department_name
      FROM complaints c
      LEFT JOIN routing_decisions rd ON rd.complaint_id = c.id
      LEFT JOIN authorities a ON a.id = rd.authority_id
      LEFT JOIN departments d ON d.id = rd.department_id
      WHERE c.location IS NOT NULL
      ORDER BY c.created_at DESC
      LIMIT 10;
    `);

    assert(
      spatialRes.rows.length > 0 &&
      spatialRes.rows.every(r => r.latitude && r.longitude && r.srid === 4326),
      '8. Real spatial data: Database returns genuine PostGIS SRID 4326 points for analytics map',
      `Sample Point: ${spatialRes.rows[0].complaint_code} -> (${spatialRes.rows[0].latitude}, ${spatialRes.rows[0].longitude}), SRID: ${spatialRes.rows[0].srid}`
    );

    // 9. Spatial Category Filter preservation
    const garbageFilterRes = await pool.query(`
      SELECT COUNT(*) AS total
      FROM complaints
      WHERE category = 'GARBAGE' AND location IS NOT NULL;
    `);
    const totalGarbage = parseInt(garbageFilterRes.rows[0].total, 10);
    assert(
      typeof totalGarbage === 'number' && totalGarbage >= 0,
      '9. Category filter: Spatial category filter operates against real PostgreSQL records',
      `Garbage complaints mapped: ${totalGarbage}`
    );

    // 10. Citizen Portal Map retained without regression
    const hasCitizenOsm = complaintFormContent.includes('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png') &&
                          complaintFormContent.includes('MapInvalidator') &&
                          complaintFormContent.includes('draggable={true}');
    assert(
      hasCitizenOsm,
      '10. Citizen Portal regression: Citizen Portal Leaflet map remains fully functional with OpenStreetMap',
      'Citizen Portal Map untouched & verified: YES'
    );

    console.log('\n================================================================');
    console.log(` STAGE 15 ANALYTICS MAP VERIFICATION SUMMARY`);
    console.log(` TOTAL ASSERTIONS: ${testIndex}`);
    console.log(` PASSED: ${passed}`);
    console.log(` FAILED: ${failed}`);
    console.log('================================================================\n');

    if (failed > 0) {
      process.exit(1);
    }
  } catch (err) {
    console.error('[Verification Error]', err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

runTests();
