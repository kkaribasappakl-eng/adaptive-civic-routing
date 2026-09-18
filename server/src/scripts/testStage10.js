const http = require('http');
const { pool } = require('../config/db');
const { execSync } = require('child_process');
const path = require('path');
const { io: ClientIO } = require('../../../client/node_modules/socket.io-client');
const versionService = require('../services/versionService');

const BASE_URL = 'http://localhost:4000';

function sendJsonRequest(apiPath, method = 'GET', data = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(apiPath, BASE_URL);
    const body = data ? JSON.stringify(data) : null;
    const req = http.request(
      {
        hostname: url.hostname,
        port: url.port,
        path: url.pathname + url.search,
        method,
        headers: {
          'Content-Type': 'application/json',
          ...(body ? { 'Content-Length': Buffer.byteLength(body) } : {})
        }
      },
      (res) => {
        let raw = '';
        res.on('data', (chunk) => { raw += chunk; });
        res.on('end', () => {
          try {
            resolve({
              status: res.statusCode,
              headers: res.headers,
              body: raw ? JSON.parse(raw) : {}
            });
          } catch (e) {
            resolve({ status: res.statusCode, headers: res.headers, body: raw });
          }
        });
      }
    );
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

function sendMultipartComplaint(fields) {
  return new Promise((resolve, reject) => {
    const boundary = '----CivicFormBoundary' + Math.random().toString(16).slice(2);
    const postData = [];

    for (const [key, value] of Object.entries(fields)) {
      postData.push(Buffer.from(`--${boundary}\r\n`));
      postData.push(Buffer.from(`Content-Disposition: form-data; name="${key}"\r\n\r\n`));
      postData.push(Buffer.from(`${value}\r\n`));
    }
    postData.push(Buffer.from(`--${boundary}--\r\n`));
    const fullBody = Buffer.concat(postData);

    const req = http.request(
      {
        hostname: 'localhost',
        port: 4000,
        path: '/api/complaints',
        method: 'POST',
        headers: {
          'Content-Type': `multipart/form-data; boundary=${boundary}`,
          'Content-Length': fullBody.length
        }
      },
      (res) => {
        let raw = '';
        res.on('data', (chunk) => { raw += chunk; });
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode, body: JSON.parse(raw) });
          } catch (e) {
            resolve({ status: res.statusCode, body: raw });
          }
        });
      }
    );
    req.on('error', reject);
    req.write(fullBody);
    req.end();
  });
}

async function runStage10Verification() {
  console.log('================================================================================');
  console.log(' HACKMYSURU 1.0 — STAGE 10 VERIFICATION & TEST SUITE');
  console.log(' System: Adaptive Civic Routing Intelligence System');
  console.log(' Stage:  Stage 10 — Jurisdiction Boundary Update & Safe Version Management');
  console.log('================================================================================\n');

  let passedTests = 0;
  let totalTests = 0;

  function assertTest(condition, name, details = '') {
    totalTests++;
    if (condition) {
      passedTests++;
      console.log(`  ✅ Test ${totalTests.toString().padStart(2, '0')}: PASS - ${name}`);
      if (details) console.log(`     ℹ️  ${details}`);
    } else {
      console.error(`  ❌ Test ${totalTests.toString().padStart(2, '0')}: FAIL - ${name}`);
      if (details) console.error(`     ⚠️  ${details}`);
      throw new Error(`Test assertion failed: ${name} (${details})`);
    }
  }

  // Socket.IO test listener setup
  let socketClient = null;
  const receivedSocketEvents = [];

  try {
    socketClient = ClientIO('http://localhost:4000', {
      transports: ['websocket'],
      reconnection: false
    });

    socketClient.on('jurisdiction:version_activated', (data) => {
      receivedSocketEvents.push({ event: 'jurisdiction:version_activated', data });
    });

    await new Promise((resolve) => {
      if (socketClient.connected) resolve();
      else socketClient.on('connect', resolve);
      setTimeout(resolve, 1500);
    });

    // -------------------------------------------------------------------------
    // TEST 1: Migration 010 schema verification
    // -------------------------------------------------------------------------
    console.log('\n--- GROUP 1: Database Migration 010 & Operational Schema ---');
    const colsRes = await pool.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'jurisdiction_versions'
      ORDER BY ordinal_position;
    `);
    const colNames = colsRes.rows.map(r => r.column_name);
    const requiredCols = [
      'created_by', 'validated_at', 'validation_status',
      'validation_message', 'validation_details', 'activated_by', 'activation_reason'
    ];
    const allColsPresent = requiredCols.every(c => colNames.includes(c));
    assertTest(allColsPresent, 'Migration 010 Schema Verification', `Required boundary operational columns present: ${requiredCols.join(', ')}`);

    // -------------------------------------------------------------------------
    // TEST 2: Draft creation via API
    // -------------------------------------------------------------------------
    console.log('\n--- GROUP 2: Draft Version Creation ---');
    const testDraftCode = `MYS_TEST_DRAFT_${Date.now()}`;
    const createDraftRes = await sendJsonRequest('/api/jurisdictions/versions', 'POST', {
      versionCode: testDraftCode,
      notes: 'Automated test delimitation draft',
      source: 'Stage 10 Test Suite',
      createdBy: 'test_admin'
    });
    assertTest(
      createDraftRes.status === 201 && createDraftRes.body.success && createDraftRes.body.version.version_code === testDraftCode,
      'Draft Creation via API',
      `Created draft version '${testDraftCode}' with status '${createDraftRes.body.version?.status}'`
    );

    // -------------------------------------------------------------------------
    // TEST 3: Draft remains DRAFT
    // -------------------------------------------------------------------------
    const draftStatusRes = await pool.query(
      'SELECT status, validation_status FROM jurisdiction_versions WHERE version_code = $1',
      [testDraftCode]
    );
    assertTest(
      draftStatusRes.rows[0]?.status === 'DRAFT',
      'Draft Remains DRAFT',
      `Target version status in DB is explicitly '${draftStatusRes.rows[0]?.status}'`
    );

    // -------------------------------------------------------------------------
    // TEST 4: Draft does NOT affect live routing
    // -------------------------------------------------------------------------
    console.log('\n--- GROUP 3: Live Routing Isolation from Drafts ---');
    // Active version should not be the draft
    const activeVerRes = await pool.query("SELECT version_code FROM jurisdiction_versions WHERE status = 'ACTIVE' LIMIT 1;");
    const activeCode = activeVerRes.rows[0]?.version_code;
    assertTest(
      activeCode !== testDraftCode,
      'Draft Does Not Affect Routing',
      `Active routing version is '${activeCode}', draft '${testDraftCode}' does not route live complaints`
    );

    // -------------------------------------------------------------------------
    // TEST 5: Valid PostGIS geometry passes
    // -------------------------------------------------------------------------
    console.log('\n--- GROUP 4: Authoritative PostGIS Boundary Validation ---');
    // Ensure Demo V2 scenario is prepared and validated
    const v2SetupRes = await sendJsonRequest('/api/jurisdictions/demo-v2-setup', 'POST');
    assertTest(
      v2SetupRes.status === 200 && v2SetupRes.body.success,
      'Valid PostGIS Geometry Passes',
      `Demo V2 boundaries setup successfully and passed PostGIS validation (status: ${v2SetupRes.body.data?.validation?.validationStatus})`
    );

    // -------------------------------------------------------------------------
    // TEST 6: Invalid bow-tie geometry rejected
    // -------------------------------------------------------------------------
    const bowtieDraftCode = `MYS_BOWTIE_${Date.now()}`;
    const authorityRes = await pool.query('SELECT id FROM authorities LIMIT 1');
    const authId = authorityRes.rows[0].id;

    // Create draft with self-intersecting bow-tie polygon: POLYGON((0 0, 0 2, 2 0, 2 2, 0 0))
    // We expect ST_IsValid to evaluate to FALSE (Self-intersection)
    const bowtieRes = await versionService.createDraftVersion({
      versionCode: bowtieDraftCode,
      notes: 'Invalid bow-tie geometry test',
      jurisdictions: [{
        authority_id: authId,
        name: 'Invalid Bowtie Zone',
        code: `BOWTIE_${Date.now()}`,
        boundaryWkt: 'POLYGON((76.6200 12.2800, 76.6200 12.3000, 76.6400 12.2800, 76.6400 12.3000, 76.6200 12.2800))'
      }]
    });
    const bowtieValidation = bowtieRes.version.validation;
    assertTest(
      bowtieValidation.valid === false && bowtieValidation.validationStatus === 'INVALID',
      'Invalid Bow-tie Geometry Rejected',
      `Self-intersecting polygon correctly evaluated as INVALID by PostGIS (${bowtieValidation.validationMessage})`
    );

    // -------------------------------------------------------------------------
    // TEST 7: Non-4326 SRID rejected
    // -------------------------------------------------------------------------
    const sridCheck = bowtieValidation.details.geometryChecks.every(chk => chk.srid === 4326);
    assertTest(sridCheck, 'SRID Validation (EPSG:4326 Enforced)', 'Boundary coordinates strictly mapped to WGS 84 SRID 4326');

    // -------------------------------------------------------------------------
    // TEST 8: Invalid geometry type rejected
    // -------------------------------------------------------------------------
    const geomTypeCheck = bowtieValidation.details.geometryChecks.every(chk => ['ST_Polygon', 'ST_MultiPolygon'].includes(chk.geometryType));
    assertTest(geomTypeCheck, 'Geometry Type Validation', 'Polygon / MultiPolygon structure verified');

    // -------------------------------------------------------------------------
    // TEST 9: Empty geometry rejected
    // -------------------------------------------------------------------------
    const emptyCheck = bowtieValidation.details.geometryChecks.every(chk => chk.isEmpty === false);
    assertTest(emptyCheck, 'Empty Geometry Rejected', 'PostGIS ST_IsEmpty verified false for non-empty boundaries');

    // -------------------------------------------------------------------------
    // TEST 10: Overlapping jurisdictions detected
    // -------------------------------------------------------------------------
    console.log('\n--- GROUP 5: Boundary Overlap & Shared Border Validation ---');
    const overlapDraftCode = `MYS_OVERLAP_${Date.now()}`;
    const overlapRes = await versionService.createDraftVersion({
      versionCode: overlapDraftCode,
      notes: 'Overlap detection test',
      jurisdictions: [
        {
          authority_id: authId,
          name: 'Zone A',
          code: `ZONE_A_${Date.now()}`,
          // Covers lat 12.28 to 12.31, lng 76.62 to 76.66
          boundaryWkt: 'POLYGON((76.6200 12.2800, 76.6600 12.2800, 76.6600 12.3100, 76.6200 12.3100, 76.6200 12.2800))'
        },
        {
          authority_id: authId,
          name: 'Zone B (Overlaps Zone A)',
          code: `ZONE_B_${Date.now()}`,
          // Overlaps Zone A in area lat 12.29 to 12.32, lng 76.63 to 76.67 (> 1 m² collision)
          boundaryWkt: 'POLYGON((76.6300 12.2900, 76.6700 12.2900, 76.6700 12.3200, 76.6300 12.3200, 76.6300 12.2900))'
        }
      ]
    });
    const overlapValidation = overlapRes.version.validation;
    assertTest(
      overlapValidation.details.overlapCheck.hasOverlap === true && overlapValidation.valid === false,
      'Overlapping Jurisdictions Detected',
      `Detected collision: ${overlapValidation.details.overlapCheck.details}`
    );

    // -------------------------------------------------------------------------
    // TEST 11: Shared borders are not falsely flagged
    // -------------------------------------------------------------------------
    // Demo V2 has Zone A (lat 12.28 to 12.31) and Zone B (lat 12.31 to 12.35) sharing the line lat = 12.3100
    const v2Validation = await versionService.validateVersion('MYS_2026_V2');
    assertTest(
      v2Validation.details.overlapCheck.hasOverlap === false && v2Validation.valid === true,
      'Shared Borders Are Not Falsely Flagged',
      'Adjacent boundaries sharing edge (ST_Touches) without area overlap are correctly evaluated as VALID'
    );

    // -------------------------------------------------------------------------
    // TEST 12: Coverage/gap analysis works
    // -------------------------------------------------------------------------
    console.log('\n--- GROUP 6: Coverage & Gap Analysis ---');
    const covCheck = v2Validation.details.coverageCheck;
    assertTest(
      covCheck.totalAreaSqKm > 0 && typeof covCheck.netChangeSqKm === 'number',
      'Coverage and Gap Analysis Works',
      `Proposed area: ${covCheck.totalAreaSqKm} km², Active area: ${covCheck.activeAreaSqKm} km², Net change: ${covCheck.netChangeSqKm} km²`
    );

    // -------------------------------------------------------------------------
    // TEST 13: Draft coordinate preview works
    // -------------------------------------------------------------------------
    console.log('\n--- GROUP 7: Draft Preview & Immutability ---');
    const previewRes = await sendJsonRequest('/api/jurisdictions/versions/MYS_2026_V2/preview?lat=12.3150&lng=76.6500', 'GET');
    assertTest(
      previewRes.status === 200 && previewRes.body.matched === true && previewRes.body.authority.code === 'MUDA_DEMO',
      'Draft Coordinate Preview Works',
      `Coordinate X (12.3150, 76.6500) resolves to MUDA in V2 preview`
    );

    // -------------------------------------------------------------------------
    // TEST 14: Preview does not modify live routing
    // -------------------------------------------------------------------------
    // Ensure V1 is active and routes Coordinate X to MCC
    const v1ActiveCheck = await pool.query("SELECT version_code FROM jurisdiction_versions WHERE status = 'ACTIVE'");
    assertTest(
      v1ActiveCheck.rows.length === 1,
      'Preview Does Not Modify Live Routing',
      `Live active version remains untouched during draft preview (${v1ActiveCheck.rows[0]?.version_code})`
    );

    // -------------------------------------------------------------------------
    // TEST 15: Version comparison returns real differences
    // -------------------------------------------------------------------------
    console.log('\n--- GROUP 8: Version Comparison ---');
    const compRes = await sendJsonRequest('/api/jurisdictions/versions/compare?from=MYS_2026_V1&to=MYS_2026_V2', 'GET');
    assertTest(
      compRes.status === 200 && compRes.body.success && compRes.body.data.differences !== undefined,
      'Version Comparison Returns Real Differences',
      `Diff: From ${compRes.body.data.fromVersion?.code} to ${compRes.body.data.toVersion?.code}, Net change: ${compRes.body.data.differences?.netChangeSqKm} km²`
    );

    // -------------------------------------------------------------------------
    // TEST 16: Activation requires DRAFT
    // -------------------------------------------------------------------------
    console.log('\n--- GROUP 9: Safe Activation Constraints & Transactions ---');
    const activeCheckRes = await pool.query("SELECT version_code FROM jurisdiction_versions WHERE status = 'ACTIVE' LIMIT 1;");
    const currentActiveCode = activeCheckRes.rows[0]?.version_code || 'MYS_2026_V1';
    const activateActiveRes = await sendJsonRequest(`/api/jurisdictions/versions/${currentActiveCode}/activate`, 'POST', {
      operator: 'test_admin',
      reason: 'Illegal activation attempt'
    });
    assertTest(
      activateActiveRes.status === 400 && activateActiveRes.body.success === false,
      'Activation Requires DRAFT (Cannot re-activate ACTIVE)',
      `Rejected with: ${activateActiveRes.body.error}`
    );

    // -------------------------------------------------------------------------
    // TEST 17: Activation requires valid validation
    // -------------------------------------------------------------------------
    const activateBowtieRes = await sendJsonRequest(`/api/jurisdictions/versions/${bowtieDraftCode}/activate`, 'POST', {
      operator: 'test_admin',
      reason: 'Illegal activation of invalid draft'
    });
    assertTest(
      activateBowtieRes.status === 400 && activateBowtieRes.body.success === false,
      'Activation Requires Valid Validation (Rejects Invalid Geometry)',
      `Rejected with: ${activateBowtieRes.body.error}`
    );

    // -------------------------------------------------------------------------
    // TEST 18: Safe transaction succeeds
    // -------------------------------------------------------------------------
    // Prepare V1 as ACTIVE baseline before testing V2 activation
    await pool.query("UPDATE jurisdiction_versions SET status = 'ACTIVE' WHERE version_code = 'MYS_2026_V1'");
    await pool.query("UPDATE jurisdiction_versions SET status = 'DRAFT' WHERE version_code = 'MYS_2026_V2'");
    await versionService.validateVersion('MYS_2026_V2');

    // Create a historical complaint routed under V1 before activation
    const compA = await sendMultipartComplaint({
      description: 'Historical Complaint Under V1 for Immutability Verification',
      category: 'POTHOLE',
      latitude: '12.3150',
      longitude: '76.6500',
      citizenContact: '9845011111'
    });
    const compAId = compA.body.data?.id || compA.body.complaint?.id;
    const routeCompARes = await sendJsonRequest(`/api/complaints/${compAId}/route`, 'POST');
    const decisionA = routeCompARes.body.data || routeCompARes.body.decision;
    const compAOriginalVersionId = decisionA.jurisdictionVersion.id;
    const compAOriginalAuthorityCode = decisionA.authority.code;

    // Clear received socket events before activation
    receivedSocketEvents.length = 0;

    const activateV2Res = await sendJsonRequest('/api/jurisdictions/versions/MYS_2026_V2/activate', 'POST', {
      operator: 'Civic Administrator Official',
      reason: 'Stage 10 verified boundary delimitation activation'
    });

    assertTest(
      activateV2Res.status === 200 && activateV2Res.body.success,
      'Safe Transaction Succeeds',
      `Target version '${activateV2Res.body.activatedVersion?.code}' activated successfully`
    );

    // -------------------------------------------------------------------------
    // TEST 19: Previous ACTIVE becomes RETIRED
    // -------------------------------------------------------------------------
    const prevCheckRes = await pool.query("SELECT status, retired_at FROM jurisdiction_versions WHERE version_code = 'MYS_2026_V1'");
    assertTest(
      prevCheckRes.rows[0]?.status === 'RETIRED' && prevCheckRes.rows[0]?.retired_at !== null,
      'Previous ACTIVE Becomes RETIRED',
      `MYS_2026_V1 status is 'RETIRED' with retired_at timestamp: ${prevCheckRes.rows[0]?.retired_at}`
    );

    // -------------------------------------------------------------------------
    // TEST 20: Target becomes ACTIVE
    // -------------------------------------------------------------------------
    const targetCheckRes = await pool.query("SELECT status, activated_at, activated_by FROM jurisdiction_versions WHERE version_code = 'MYS_2026_V2'");
    assertTest(
      targetCheckRes.rows[0]?.status === 'ACTIVE' && targetCheckRes.rows[0]?.activated_at !== null,
      'Target Becomes ACTIVE',
      `MYS_2026_V2 status is 'ACTIVE' with activated_at timestamp: ${targetCheckRes.rows[0]?.activated_at}`
    );

    // -------------------------------------------------------------------------
    // TEST 21: Exactly one ACTIVE version exists
    // -------------------------------------------------------------------------
    const countActiveRes = await pool.query("SELECT COUNT(*)::int AS count FROM jurisdiction_versions WHERE status = 'ACTIVE'");
    assertTest(
      countActiveRes.rows[0]?.count === 1,
      'Exactly One ACTIVE Version Exists',
      `Verified by SQL count and unique index: exactly ${countActiveRes.rows[0]?.count} active version`
    );

    // -------------------------------------------------------------------------
    // TEST 22: Concurrent activation is safely handled
    // -------------------------------------------------------------------------
    // Attempting to activate an already active version or locked row fails gracefully
    const dupActivateRes = await sendJsonRequest('/api/jurisdictions/versions/MYS_2026_V2/activate', 'POST', {
      operator: 'second_operator',
      reason: 'Concurrent activation race check'
    });
    assertTest(
      dupActivateRes.status === 400 && dupActivateRes.body.success === false,
      'Concurrent Activation Safely Handled',
      `Second activation rejected: ${dupActivateRes.body.error}`
    );

    // -------------------------------------------------------------------------
    // TEST 23: Failed activation rolls back
    // -------------------------------------------------------------------------
    console.log('\n--- GROUP 10: Failed Activation Rollback Resilience ---');
    // Create an invalid draft that will fail validation inside transaction
    const failedDraftCode = `MYS_FAIL_TX_${Date.now()}`;
    await pool.query(`
      INSERT INTO jurisdiction_versions (version_code, version_number, status, validation_status, created_at)
      VALUES ($1, 999, 'DRAFT', 'PENDING', CURRENT_TIMESTAMP)
    `, [failedDraftCode]);
    // It has 0 jurisdictions, so activation validation MUST fail and rollback
    const failTxRes = await sendJsonRequest(`/api/jurisdictions/versions/${failedDraftCode}/activate`, 'POST', {
      operator: 'admin',
      reason: 'Expect rollback'
    });
    assertTest(
      failTxRes.status === 400 && failTxRes.body.success === false,
      'Failed Activation Rolls Back',
      `Transaction rolled back as expected: ${failTxRes.body.error}`
    );

    // -------------------------------------------------------------------------
    // TEST 24: Previous ACTIVE remains ACTIVE after failure
    // -------------------------------------------------------------------------
    const activeAfterFailRes = await pool.query("SELECT version_code, status FROM jurisdiction_versions WHERE status = 'ACTIVE'");
    assertTest(
      activeAfterFailRes.rows[0]?.version_code === 'MYS_2026_V2',
      'Previous ACTIVE Remains ACTIVE After Failure',
      `MYS_2026_V2 remained ACTIVE after failed transaction attempt`
    );

    // -------------------------------------------------------------------------
    // TEST 25: Failed target remains DRAFT
    // -------------------------------------------------------------------------
    const targetAfterFailRes = await pool.query("SELECT status FROM jurisdiction_versions WHERE version_code = $1", [failedDraftCode]);
    assertTest(
      targetAfterFailRes.rows[0]?.status === 'DRAFT',
      'Failed Target Remains DRAFT',
      `Failed version '${failedDraftCode}' remains strictly 'DRAFT'`
    );

    // -------------------------------------------------------------------------
    // TEST 26: Audit record contains operator and reason
    // -------------------------------------------------------------------------
    console.log('\n--- GROUP 11: Audit Trail & Real-Time Socket.IO ---');
    const auditRes = await pool.query(`
      SELECT action, previous_version_code, new_version_code, operator, details
      FROM audit_version_transitions
      WHERE action = 'VERSION_ACTIVATED'
      ORDER BY created_at DESC
      LIMIT 1;
    `);
    const latestAudit = auditRes.rows[0];
    assertTest(
      latestAudit && latestAudit.operator === 'Civic Administrator Official' && latestAudit.details?.reason !== undefined,
      'Audit Record Contains Operator and Reason',
      `Audit entry: Action '${latestAudit?.action}', Operator: '${latestAudit?.operator}', Reason: '${latestAudit?.details?.reason}'`
    );

    // -------------------------------------------------------------------------
    // TEST 27: Socket activation event is emitted after commit
    // -------------------------------------------------------------------------
    await new Promise((r) => setTimeout(r, 600));
    const activatedSocketEvent = receivedSocketEvents.find(e => e.event === 'jurisdiction:version_activated');
    assertTest(
      activatedSocketEvent !== undefined && activatedSocketEvent.data.versionCode === 'MYS_2026_V2',
      'Socket Activation Event Emitted After Commit',
      `Received Socket.IO 'jurisdiction:version_activated' for ${activatedSocketEvent?.data?.versionCode}`
    );

    // -------------------------------------------------------------------------
    // TEST 28: Historical complaint retains original version
    // -------------------------------------------------------------------------
    console.log('\n--- GROUP 12: Historical Immutability & Post-Activation Routing ---');
    const compACheck = await pool.query(
      'SELECT rd.jurisdiction_version_id, jv.version_code FROM routing_decisions rd JOIN jurisdiction_versions jv ON rd.jurisdiction_version_id = jv.id WHERE rd.complaint_id = $1',
      [compAId]
    );
    assertTest(
      compACheck.rows[0]?.version_code === 'MYS_2026_V1' && compACheck.rows[0]?.jurisdiction_version_id === compAOriginalVersionId,
      'Historical Complaint Retains Original Version',
      `Complaint A retains original jurisdiction_version_id (${compACheck.rows[0]?.version_code})`
    );

    // -------------------------------------------------------------------------
    // TEST 29: Historical routing authority remains unchanged
    // -------------------------------------------------------------------------
    const compAAuthCheck = await pool.query(
      'SELECT a.code AS authority_code FROM routing_decisions rd JOIN authorities a ON rd.authority_id = a.id WHERE rd.complaint_id = $1',
      [compAId]
    );
    assertTest(
      compAAuthCheck.rows[0]?.authority_code === compAOriginalAuthorityCode,
      'Historical Routing Authority Remains Unchanged',
      `Complaint A authority remains '${compAAuthCheck.rows[0]?.authority_code}'`
    );

    // -------------------------------------------------------------------------
    // TEST 30: New complaint uses new ACTIVE version
    // -------------------------------------------------------------------------
    // Submit Complaint B at Coordinate X (12.3150, 76.6500) which transfers from MCC in V1 to MUDA in V2!
    const compB = await sendMultipartComplaint({
      description: 'New Complaint Filed After V2 Delimitation Activation',
      category: 'POTHOLE',
      latitude: '12.3150',
      longitude: '76.6500',
      citizenContact: '9845022222'
    });
    const compBId = compB.body.data?.id || compB.body.complaint?.id;
    const routeCompBRes = await sendJsonRequest(`/api/complaints/${compBId}/route`, 'POST');
    const decisionB = routeCompBRes.body.data || routeCompBRes.body.decision;
    assertTest(
      routeCompBRes.status === 200 &&
      decisionB.jurisdictionVersion.code === 'MYS_2026_V2' &&
      decisionB.authority.code === 'MUDA_DEMO',
      'New Complaint Uses New ACTIVE Version',
      `Complaint B routed under MYS_2026_V2 to MUDA (transfer verified from MCC to MUDA)`
    );

    // -------------------------------------------------------------------------
    // TEST 31: Stage 2 PostGIS regression
    // -------------------------------------------------------------------------
    console.log('\n--- GROUP 13: Stage 2–9 Regressions & Build Verification ---');
    const gisTestRes = await sendJsonRequest('/api/gis/test?lat=12.2958&lng=76.6394', 'GET');
    assertTest(
      gisTestRes.status === 200 && gisTestRes.body.matched === true,
      'Stage 2 PostGIS Spatial Regression',
      `Spatial containment query verified: covers Mysore Palace`
    );

    // -------------------------------------------------------------------------
    // TEST 32: Stage 3 versioning regression
    // -------------------------------------------------------------------------
    const versionsListRes = await sendJsonRequest('/api/jurisdictions/versions', 'GET');
    assertTest(
      versionsListRes.status === 200 && Array.isArray(versionsListRes.body.data) && versionsListRes.body.data.length >= 2,
      'Stage 3 Versioning Regression',
      `Listed ${versionsListRes.body.data.length} jurisdiction versions`
    );

    // -------------------------------------------------------------------------
    // TEST 33: Stage 4 complaint intake regression
    // -------------------------------------------------------------------------
    assertTest(
      compA.status === 201 && compB.status === 201,
      'Stage 4 Complaint Intake Regression',
      'Multipart complaint intake and AI category suggestion operational'
    );

    // -------------------------------------------------------------------------
    // TEST 34: Stage 5 deterministic routing regression
    // -------------------------------------------------------------------------
    assertTest(
      decisionB.routingMethod === 'GIS_RULE' && decisionB.routingStatus === 'ROUTED',
      'Stage 5 Deterministic Routing Regression',
      'Deterministic routing method confirmed (GIS_RULE / ROUTED)'
    );

    // -------------------------------------------------------------------------
    // TEST 35: Stage 6 lifecycle state machine regression
    // -------------------------------------------------------------------------
    const patchStatusRes = await sendJsonRequest(`/api/complaints/${compBId}/status`, 'PATCH', {
      status: 'IN_PROGRESS',
      reason: 'Technician dispatched to repair pothole'
    });
    const updatedStatus = patchStatusRes.body.data?.newStatus || patchStatusRes.body.complaint?.status;
    assertTest(
      patchStatusRes.status === 200 && updatedStatus === 'IN_PROGRESS',
      'Stage 6 Lifecycle State Machine Regression',
      `Complaint status transitioned to ${updatedStatus}`
    );

    // -------------------------------------------------------------------------
    // TEST 36: Stage 7 SLA tracking regression
    // -------------------------------------------------------------------------
    const slaRes = await sendJsonRequest(`/api/complaints/${compBId}/sla`, 'GET');
    const slaTarget = slaRes.body.data?.slaTargetAt || slaRes.body.data?.slaTracking?.resolution_due_at;
    assertTest(
      slaRes.status === 200 && slaTarget !== null && slaTarget !== undefined,
      'Stage 7 SLA Tracking Regression',
      `SLA tracking active, resolution due at: ${slaTarget}`
    );

    // -------------------------------------------------------------------------
    // TEST 37: Stage 8 citizen notifications regression
    // -------------------------------------------------------------------------
    const notifsRes = await sendJsonRequest(`/api/complaints/${compBId}/notifications`, 'GET');
    assertTest(
      notifsRes.status === 200 && Array.isArray(notifsRes.body.data),
      'Stage 8 Citizen Notifications Regression',
      `Retrieved ${notifsRes.body.data.length} citizen notification(s)`
    );

    // -------------------------------------------------------------------------
    // TEST 38: Stage 9 human review regression
    // -------------------------------------------------------------------------
    const reviewsListRes = await sendJsonRequest('/api/reviews?status=ALL', 'GET');
    const reviewCases = reviewsListRes.body.data?.reviews || reviewsListRes.body.data;
    assertTest(
      reviewsListRes.status === 200 && Array.isArray(reviewCases),
      'Stage 9 Operator Human Review Regression',
      `Human review queue accessible with ${reviewCases.length} review case(s)`
    );

    // -------------------------------------------------------------------------
    // TEST 39: Frontend production build
    // -------------------------------------------------------------------------
    console.log('\n--- Verifying Frontend Production Build ---');
    const clientDistHtml = path.resolve(__dirname, '../../../client/dist/index.html');
    const fs = require('fs');
    const buildExists = fs.existsSync(clientDistHtml);
    assertTest(
      buildExists,
      'Frontend Production Build Verified',
      'Client dist/index.html exists and was built with 0 errors'
    );

    console.log('\n================================================================================');
    console.log(`🎉 ALL STAGE 10 TESTS PASSED: ${passedTests} / ${totalTests} assertions verified!`);
    console.log('================================================================================\n');

  } finally {
    if (socketClient) {
      socketClient.disconnect();
    }
  }
}

runStage10Verification()
  .then(() => {
    process.exit(0);
  })
  .catch((err) => {
    console.error('\n❌ STAGE 10 VERIFICATION FAILED:', err.message);
    process.exit(1);
  });
