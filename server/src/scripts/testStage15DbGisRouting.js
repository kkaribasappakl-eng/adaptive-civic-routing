/**
 * STAGE 15 FOCUSED VERIFICATION SUITE
 * Database, PostGIS Extension, and Routing Engine Display Field Mapping
 */

const path = require('path');
const { pool, checkDatabaseHealth } = require('../config/db');
const {
  routeComplaint,
  getRoutingDecisionsList,
  getRoutingDecisionById
} = require('../services/routingService');

let passed = 0;
let failed = 0;
let assertionIndex = 0;

function assert(condition, testName, details = '') {
  assertionIndex++;
  if (condition) {
    console.log(`  ✔ [${assertionIndex}] ${testName}`);
    if (details) console.log(`      Detail: ${details}`);
    passed++;
  } else {
    console.error(`  ✖ [${assertionIndex}] FAILED: ${testName}`);
    if (details) console.error(`      Detail: ${details}`);
    failed++;
  }
}

// Logic mirror of client/src/services/routingDisplay.js for test verification
function isOutsideBoundaryDecision(d) {
  if (!d) return false;
  const hasJurisdiction = Boolean(d.jurisdiction?.name || d.jurisdiction_name);
  const hasAuthority = Boolean(d.authority?.name || d.authority_name);
  if (hasJurisdiction || hasAuthority) return false;

  const reasonText = (d.reason || d.routing_reason || '').toLowerCase();
  if (
    reasonText.includes('outside') ||
    reasonText.includes('no active jurisdiction') ||
    reasonText.includes('not covered') ||
    reasonText.includes('containment failure')
  ) {
    return true;
  }

  const status = d.routing_status || d.routingStatus;
  if ((status === 'HUMAN_REVIEW' || status === 'UNROUTABLE') && !hasJurisdiction && !hasAuthority) {
    return true;
  }

  return false;
}

function getDecisionAuthority(d) {
  if (!d) return 'None';
  if (d.authority?.name) return d.authority.name;
  if (d.authority_name) return d.authority_name;
  if (isOutsideBoundaryDecision(d)) {
    return 'None (Outside Boundaries)';
  }
  return 'None';
}

function getDecisionDepartment(d) {
  if (!d) return 'Unassigned';
  if (d.department?.name) return d.department.name;
  if (d.department_name) return d.department_name;
  const status = d.routing_status || d.routingStatus;
  if (status === 'HUMAN_REVIEW' || status === 'UNROUTABLE' || isOutsideBoundaryDecision(d)) {
    return 'Human Review Queue';
  }
  return 'Unassigned';
}

function getDecisionJurisdiction(d) {
  if (!d) return 'None';
  if (d.jurisdiction?.name) return d.jurisdiction.name;
  if (d.jurisdiction_name) return d.jurisdiction_name;
  return 'None';
}

function getDecisionVersion(d) {
  if (!d) return 'N/A';
  if (d.jurisdictionVersion?.code) return d.jurisdictionVersion.code;
  if (d.version_code) return d.version_code;
  return 'N/A';
}

function getDecisionReason(d) {
  if (!d) return 'Reason not available';
  const reason = d.reason || d.routing_reason;
  if (reason && typeof reason === 'string' && reason.trim().length > 0) {
    return reason.trim();
  }
  if (isOutsideBoundaryDecision(d)) {
    return 'Complaint coordinates are outside all configured jurisdiction boundaries. Flagged for human review.';
  }
  const status = d.routing_status || d.routingStatus;
  if (status === 'HUMAN_REVIEW') {
    return 'Complaint flagged for human review.';
  }
  if (status === 'UNROUTABLE') {
    return 'Complaint location could not be routed to any jurisdiction.';
  }
  if (status === 'ROUTED') {
    return 'Deterministically routed via PostGIS spatial boundary containment.';
  }
  return 'Reason not available';
}

function formatRoutingTimestamp(timestamp) {
  if (!timestamp) return 'Not available';
  const parsed = new Date(timestamp);
  if (isNaN(parsed.getTime())) return 'Not available';
  return parsed.toLocaleString();
}

function getDecisionTimestamp(d) {
  if (!d) return 'Not available';
  const candidates = [
    d.routed_at,
    d.matchedAt,
    d.matched_at,
    d.createdAt,
    d.created_at
  ];
  for (const ts of candidates) {
    if (ts !== undefined && ts !== null && ts !== '') {
      const parsed = new Date(ts);
      if (!isNaN(parsed.getTime())) {
        return parsed.toLocaleString();
      }
    }
  }
  return 'Not available';
}

async function runTests() {
  console.log('================================================================');
  console.log(' STAGE 15 FOCUSED VERIFICATION: DATABASE, POSTGIS & ROUTING DISPLAY');
  console.log('================================================================\n');

  try {
    // Ensure Stage 15 baseline: MYS_2026_V2 is ACTIVE
    await pool.query("UPDATE jurisdiction_versions SET status = 'RETIRED' WHERE version_code = 'MYS_2026_V1';");
    await pool.query("UPDATE jurisdiction_versions SET status = 'ACTIVE' WHERE version_code = 'MYS_2026_V2';");

    // ----------------------------------------------------------------
    // 1. PostgreSQL Connectivity
    // ----------------------------------------------------------------
    console.log('--- 1. PostgreSQL Database Connectivity ---');
    const versionRes = await pool.query('SELECT version(), current_database(), current_user;');
    assert(
      versionRes.rows.length > 0 && versionRes.rows[0].version.includes('PostgreSQL'),
      'PostgreSQL engine connects successfully and returns version metadata',
      `Version: ${versionRes.rows[0].version.split(' on ')[0]}`
    );
    assert(
      versionRes.rows[0].current_database === 'adaptive_civic_routing',
      'Target database is strictly configured project database adaptive_civic_routing',
      `Connected DB: ${versionRes.rows[0].current_database}`
    );

    // ----------------------------------------------------------------
    // 2. PostGIS Extension Availability
    // ----------------------------------------------------------------
    console.log('\n--- 2. PostGIS Extension Availability ---');
    const gisRes = await pool.query('SELECT PostGIS_Version(), PostGIS_Full_Version();');
    const pgisVer = gisRes.rows[0].postgis_version;
    assert(
      Boolean(pgisVer) && pgisVer.startsWith('3.'),
      'PostGIS spatial extension is verified active in PostgreSQL',
      `PostGIS Version: ${pgisVer}`
    );

    const geomCols = await pool.query(
      "SELECT f_table_name, f_geometry_column, srid, type FROM geometry_columns WHERE f_table_name IN ('jurisdictions', 'complaints');"
    );
    const jurGeom = geomCols.rows.find(c => c.f_table_name === 'jurisdictions');
    const compGeom = geomCols.rows.find(c => c.f_table_name === 'complaints');
    assert(
      jurGeom && jurGeom.srid === 4326 && jurGeom.type === 'MULTIPOLYGON' &&
      compGeom && compGeom.srid === 4326 && compGeom.type === 'POINT',
      'PostGIS geometry columns enforce EPSG:4326 spatial reference system and correct geometry types',
      `jurisdictions: ${jurGeom?.type} (${jurGeom?.srid}), complaints: ${compGeom?.type} (${compGeom?.srid})`
    );

    // ----------------------------------------------------------------
    // 3. Real PostGIS ST_Covers Spatial Routing
    // ----------------------------------------------------------------
    console.log('\n--- 3. Real PostGIS ST_Covers Spatial Routing ---');
    const palaceCoord = { lat: 12.2958, lng: 76.6394 }; // Mysore Palace
    const spatialCheck = await pool.query(`
      SELECT j.id, j.name AS jurisdiction_name, a.name AS authority_name, jv.version_code
      FROM jurisdictions j
      JOIN authorities a ON j.authority_id = a.id
      JOIN jurisdiction_versions jv ON j.jurisdiction_version_id = jv.id
      WHERE jv.status = 'ACTIVE'
        AND ST_Covers(j.boundary, ST_SetSRID(ST_MakePoint($1, $2), 4326));
    `, [palaceCoord.lng, palaceCoord.lat]);

    assert(
      spatialCheck.rows.length === 1 && spatialCheck.rows[0].authority_name.includes('Mysuru City Corporation'),
      'Real PostGIS ST_Covers resolves Mysore Palace coordinates to MCC jurisdiction under active version',
      `Matched: ${spatialCheck.rows[0].jurisdiction_name} (${spatialCheck.rows[0].authority_name})`
    );

    // ----------------------------------------------------------------
    // 4. Active Jurisdiction Lookup
    // ----------------------------------------------------------------
    console.log('\n--- 4. Active Jurisdiction Version State ---');
    const activeVersionRes = await pool.query("SELECT id, version_code, status FROM jurisdiction_versions WHERE status = 'ACTIVE';");
    assert(
      activeVersionRes.rows.length === 1,
      'Exactly one jurisdiction version is marked ACTIVE in the database',
      `Active Version: ${activeVersionRes.rows[0]?.version_code}`
    );

    // Coordinate (12.3150, 76.6500) under active V2 resolves to MUDA
    const coordX = { lat: 12.3150, lng: 76.6500 };
    const coordXRes = await pool.query(`
      SELECT j.name AS jurisdiction_name, a.name AS authority_name, jv.version_code
      FROM jurisdictions j
      JOIN authorities a ON j.authority_id = a.id
      JOIN jurisdiction_versions jv ON j.jurisdiction_version_id = jv.id
      WHERE jv.status = 'ACTIVE'
        AND ST_Covers(j.boundary, ST_SetSRID(ST_MakePoint($1, $2), 4326));
    `, [coordX.lng, coordX.lat]);

    assert(
      coordXRes.rows.length === 1 && coordXRes.rows[0].authority_name.includes('Mysuru Urban Development Authority'),
      'Known coordinate (12.3150, 76.6500) routes to MUDA under active MYS_2026_V2',
      `Matched: ${coordXRes.rows[0]?.jurisdiction_name}`
    );

    // ----------------------------------------------------------------
    // 5. Inside-Boundary Routing Execution
    // ----------------------------------------------------------------
    console.log('\n--- 5. Inside-Boundary Routing Execution ---');
    const insideCompRes = await pool.query(`
      INSERT INTO complaints (complaint_code, description, category, category_source, latitude, longitude, location, status)
      VALUES (
        'HM-CIV-TEST-INSIDE-' || floor(random() * 100000)::text,
        'Large road pothole requiring patching',
        'POTHOLE',
        'MANUAL',
        12.2958,
        76.6394,
        ST_SetSRID(ST_MakePoint(76.6394, 12.2958), 4326),
        'SUBMITTED'
      ) RETURNING *;
    `);
    const insideComp = insideCompRes.rows[0];
    const insideRouteResult = await routeComplaint(insideComp.id);

    assert(
      insideRouteResult.decision.routing_status === 'ROUTED' &&
      insideRouteResult.decision.authority?.name.includes('Mysuru City Corporation') &&
      insideRouteResult.decision.department?.name.includes('Roads & Infrastructure'),
      'Inside-boundary complaint routes deterministically to proper authority and department',
      `Authority: ${insideRouteResult.decision.authority?.name}, Dept: ${insideRouteResult.decision.department?.name}`
    );

    // ----------------------------------------------------------------
    // 6. Outside-Boundary Routing Execution
    // ----------------------------------------------------------------
    console.log('\n--- 6. Outside-Boundary Routing Execution ---');
    const outsideCompRes = await pool.query(`
      INSERT INTO complaints (complaint_code, description, category, category_source, latitude, longitude, location, status)
      VALUES (
        'HM-CIV-TEST-OUTSIDE-' || floor(random() * 100000)::text,
        'Garbage in Delhi coordinates',
        'GARBAGE',
        'MANUAL',
        28.6139,
        77.2090,
        ST_SetSRID(ST_MakePoint(77.2090, 28.6139), 4326),
        'SUBMITTED'
      ) RETURNING *;
    `);
    const outsideComp = outsideCompRes.rows[0];
    const outsideRouteResult = await routeComplaint(outsideComp.id);

    assert(
      outsideRouteResult.decision.routing_status === 'HUMAN_REVIEW' &&
      outsideRouteResult.decision.authority === null &&
      outsideRouteResult.decision.jurisdiction === null,
      'Outside-boundary complaint routes to HUMAN_REVIEW without inventing a fake authority or jurisdiction',
      `Status: ${outsideRouteResult.decision.routing_status}, Authority: ${outsideRouteResult.decision.authority}`
    );
    assert(
      outsideRouteResult.decision.reason.includes('outside all configured jurisdiction boundaries'),
      'Outside-boundary routing records truthful reason detailing boundary exclusion',
      `Reason: ${outsideRouteResult.decision.reason}`
    );

    // ----------------------------------------------------------------
    // 7. Human Review Caused by OTHER / Unmapped Category
    // ----------------------------------------------------------------
    console.log('\n--- 7. Human Review Due to Unmapped Category (Inside Jurisdiction) ---');
    const unmappedCompRes = await pool.query(`
      INSERT INTO complaints (complaint_code, description, category, category_source, latitude, longitude, location, status)
      VALUES (
        'HM-CIV-TEST-OTHER-' || floor(random() * 100000)::text,
        'Uncontrolled civic problem needing review',
        'OTHER',
        'MANUAL',
        12.2958,
        76.6394,
        ST_SetSRID(ST_MakePoint(76.6394, 12.2958), 4326),
        'SUBMITTED'
      ) RETURNING *;
    `);
    const unmappedComp = unmappedCompRes.rows[0];
    const unmappedRouteResult = await routeComplaint(unmappedComp.id);

    assert(
      unmappedRouteResult.decision.routing_status === 'HUMAN_REVIEW' &&
      unmappedRouteResult.decision.jurisdiction !== null &&
      unmappedRouteResult.decision.authority !== null,
      'Complaint inside jurisdiction with OTHER category retains valid jurisdiction and authority in database',
      `Jurisdiction: ${unmappedRouteResult.decision.jurisdiction?.name}, Authority: ${unmappedRouteResult.decision.authority?.name}`
    );

    // Verify UI helper does NOT display "None (Outside Boundaries)" for this unmapped case
    const unmappedAuthDisplay = getDecisionAuthority(unmappedRouteResult.decision);
    const unmappedDeptDisplay = getDecisionDepartment(unmappedRouteResult.decision);
    assert(
      !unmappedAuthDisplay.includes('Outside Boundaries') && unmappedAuthDisplay.includes('Mysuru City Corporation'),
      'Evidence-based authority formatter preserves actual authority for unmapped category (DOES NOT claim Outside Boundaries)',
      `Displayed Authority: "${unmappedAuthDisplay}"`
    );
    assert(
      unmappedDeptDisplay === 'Human Review Queue',
      'Unmapped category correctly displays "Human Review Queue" for unassigned department',
      `Displayed Department: "${unmappedDeptDisplay}"`
    );

    // Verify UI helper DOES display "None (Outside Boundaries)" for genuine outside-boundary case
    const outsideAuthDisplay = getDecisionAuthority(outsideRouteResult.decision);
    assert(
      outsideAuthDisplay === 'None (Outside Boundaries)',
      'Evidence-based authority formatter shows "None (Outside Boundaries)" ONLY when location genuinely failed boundary containment',
      `Displayed Authority: "${outsideAuthDisplay}"`
    );

    // ----------------------------------------------------------------
    // 8. Historical Jurisdiction Version Preservation
    // ----------------------------------------------------------------
    console.log('\n--- 8. Historical Jurisdiction Version Preservation ---');
    const histCheck = await pool.query(`
      SELECT rd.id, jv.version_code, a.name as authority_name
      FROM routing_decisions rd
      JOIN jurisdiction_versions jv ON rd.jurisdiction_version_id = jv.id
      LEFT JOIN authorities a ON rd.authority_id = a.id
      WHERE jv.version_code = 'MYS_2026_V1'
      LIMIT 1;
    `);
    assert(
      histCheck.rows.length > 0 && histCheck.rows[0].version_code === 'MYS_2026_V1',
      'Historical routing decisions in PostgreSQL remain permanently bound to their creation version MYS_2026_V1',
      `Historical Decision ID: ${histCheck.rows[0]?.id}, Version: ${histCheck.rows[0]?.version_code}`
    );

    // ----------------------------------------------------------------
    // 9. Routing Reason Display
    // ----------------------------------------------------------------
    console.log('\n--- 9. Routing Reason Formatting & Non-Empty Guarantee ---');
    const reasonInside = getDecisionReason(insideRouteResult.decision);
    const reasonOutside = getDecisionReason(outsideRouteResult.decision);
    const reasonEmptyMock = getDecisionReason({ routing_status: 'ROUTED', reason: '' });
    const reasonNullMock = getDecisionReason({ routing_status: 'HUMAN_REVIEW', reason: null });

    assert(
      reasonInside.length > 10 && reasonInside.includes('MCC Central Zone 1'),
      'Routing reason extracts and displays full dynamic explainable spatial explanation',
      `Reason: "${reasonInside.substring(0, 60)}..."`
    );
    assert(
      reasonEmptyMock !== '' && reasonNullMock !== '',
      'getDecisionReason NEVER returns an empty string for missing or null stored reasons',
      `Fallback for empty: "${reasonEmptyMock}", Fallback for null: "${reasonNullMock}"`
    );

    // ----------------------------------------------------------------
    // 10. Date Handling: Valid Timestamps, Null Timestamps & "Invalid Date"
    // ----------------------------------------------------------------
    console.log('\n--- 10. Date Handling & "Invalid Date" Elimination ---');
    const validDateString = '2026-09-19T16:47:34.792Z';
    const formattedValid = formatRoutingTimestamp(validDateString);
    assert(
      formattedValid !== 'Invalid Date' && formattedValid !== 'Not available' && formattedValid.length > 5,
      'Valid ISO timestamp renders cleanly as a formatted local date string',
      `Input: ${validDateString} -> Output: "${formattedValid}"`
    );

    const formattedNull = formatRoutingTimestamp(null);
    const formattedUndefined = formatRoutingTimestamp(undefined);
    const formattedMalformed = formatRoutingTimestamp('not-a-valid-date-string');
    assert(
      formattedNull === 'Not available' &&
      formattedUndefined === 'Not available' &&
      formattedMalformed === 'Not available',
      'Null, undefined, and malformed timestamps safely display "Not available" and NEVER "Invalid Date"',
      `Null: "${formattedNull}", Undefined: "${formattedUndefined}", Malformed: "${formattedMalformed}"`
    );

    const decisionWithValidDate = { routed_at: validDateString };
    const decisionWithNoDate = { routed_at: null };
    assert(
      getDecisionTimestamp(decisionWithValidDate) !== 'Invalid Date' &&
      getDecisionTimestamp(decisionWithNoDate) === 'Not available',
      'getDecisionTimestamp correctly parses dates across prioritized date properties and prevents "Invalid Date"',
      `With date: "${getDecisionTimestamp(decisionWithValidDate)}", Without date: "${getDecisionTimestamp(decisionWithNoDate)}"`
    );

    // ----------------------------------------------------------------
    // 11. Backend API Serializer & Field Mapping Compatibility
    // ----------------------------------------------------------------
    console.log('\n--- 11. Backend API Serialization (Nested + Flat Aliases) ---');
    const listResult = await getRoutingDecisionsList(5, 0);
    assert(
      listResult.decisions && listResult.decisions.length > 0,
      'getRoutingDecisionsList returns populated array of routing decisions from database',
      `Total returned: ${listResult.decisions.length}`
    );

    const sample = listResult.decisions[0];
    assert(
      sample.hasOwnProperty('authority') && sample.hasOwnProperty('authority_name') &&
      sample.hasOwnProperty('department') && sample.hasOwnProperty('department_name') &&
      sample.hasOwnProperty('jurisdiction') && sample.hasOwnProperty('jurisdiction_name') &&
      sample.hasOwnProperty('jurisdictionVersion') && sample.hasOwnProperty('version_code') &&
      sample.hasOwnProperty('reason') && sample.hasOwnProperty('routing_reason') &&
      sample.hasOwnProperty('routed_at'),
      'Backend serializer formatRoutingDecision exposes both canonical nested contracts AND flat compatibility aliases',
      `Fields verified: authority, authority_name, department, department_name, jurisdictionVersion, version_code, routed_at`
    );

    // ----------------------------------------------------------------
    // 12. Database Health Diagnostic Check
    // ----------------------------------------------------------------
    console.log('\n--- 12. Database Health Diagnostic Functionality ---');
    const health = await checkDatabaseHealth();
    assert(
      health.connected === true &&
      health.postgisInstalled === true &&
      health.databaseName === 'adaptive_civic_routing',
      'checkDatabaseHealth reports truthful connected status and PostGIS availability',
      `Connected: ${health.connected}, PostGIS: ${health.postgisInstalled}, DB: ${health.databaseName}`
    );

  } catch (err) {
    console.error('\nFatal test execution error:', err);
    failed++;
  } finally {
    console.log('\n================================================================');
    console.log(' STAGE 15 FOCUSED VERIFICATION RESULTS');
    console.log(` TOTAL ASSERTIONS: ${assertionIndex}`);
    console.log(` PASSED: ${passed}`);
    console.log(` FAILED: ${failed}`);
    console.log('================================================================\n');

    await pool.end();
    process.exit(failed > 0 ? 1 : 0);
  }
}

runTests();
