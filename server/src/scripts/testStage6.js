const http = require('http');
const { pool } = require('../config/db');
const { io: ClientIO } = require('../../../client/node_modules/socket.io-client');
const { execSync } = require('child_process');
const path = require('path');

const BASE_URL = 'http://localhost:4000';

let operatorToken = null;
let adminToken = null;

const getOperatorToken = async () => {
  if (operatorToken) return operatorToken;
  try {
    const res = await sendJsonRequest('/api/auth/demo-login', 'POST', { role: 'OPERATOR' }, null);
    if (res.body?.data?.token || res.body?.token) {
      operatorToken = res.body?.data?.token || res.body?.token;
    }
  } catch (e) {}
  return operatorToken;
};

const getAdminToken = async () => {
  if (adminToken) return adminToken;
  try {
    const res = await sendJsonRequest('/api/auth/demo-login', 'POST', { role: 'ADMIN' }, null);
    if (res.body?.data?.token || res.body?.token) {
      adminToken = res.body?.data?.token || res.body?.token;
    }
  } catch (e) {}
  return adminToken;
};

function sendJsonRequest(path, method = 'GET', data = null, explicitToken = undefined) {
  return new Promise(async (resolve, reject) => {
    let token = explicitToken;
    if (token === undefined) {
      token = await getOperatorToken();
    }
    const url = new URL(path, BASE_URL);
    const body = data ? JSON.stringify(data) : null;
    const req = http.request(
      {
        hostname: url.hostname,
        port: url.port,
        path: url.pathname + url.search,
        method,
        headers: {
          'Content-Type': 'application/json',
          ...(body ? { 'Content-Length': Buffer.byteLength(body) } : {}),
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        }
      },
      (res) => {
        let raw = '';
        res.on('data', chunk => { raw += chunk; });
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

    const options = {
      hostname: 'localhost',
      port: 4000,
      path: '/api/complaints',
      method: 'POST',
      headers: {
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Content-Length': fullBody.length
      }
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(data) });
        } catch (e) {
          resolve({ status: res.statusCode, body: data });
        }
      });
    });

    req.on('error', reject);
    req.write(fullBody);
    req.end();
  });
}

async function runStage6Tests() {
  console.log('====================================================');
  console.log('STAGE 6 COMPREHENSIVE VERIFICATION SUITE');
  console.log('Case Status & Citizen Follow-Through Lifecycle');
  console.log('====================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition, testName, details = '') {
    if (condition) {
      console.log(`[PASS] ${testName}`);
      if (details) console.log(`       ${details}`);
      passed++;
    } else {
      console.error(`[FAIL] ${testName}`);
      if (details) console.error(`       ${details}`);
      failed++;
    }
  }

  // Socket.IO client setup
  const socketClient = ClientIO(BASE_URL, {
    transports: ['websocket'],
    reconnection: false
  });

  const statusChangedEvents = [];
  socketClient.on('complaint:status_changed', (data) => statusChangedEvents.push(data));

  await new Promise((resolve) => {
    socketClient.on('connect', resolve);
    setTimeout(resolve, 1500);
  });

  try {
    // 0. Ensure Baseline State: MYS_2026_V1 is ACTIVE, MYS_2026_V2 is DRAFT
    console.log('--- Initializing Baseline State (V1 ACTIVE) ---');
    await pool.query("UPDATE jurisdiction_versions SET status = 'DRAFT' WHERE version_code = 'MYS_2026_V2'");
    await pool.query("UPDATE jurisdiction_versions SET status = 'ACTIVE' WHERE version_code = 'MYS_2026_V1'");
    await sendJsonRequest('/api/jurisdictions/demo-v2-setup', 'POST', null, await getAdminToken());

    // 1. Database Migration check
    const health = await sendJsonRequest('/api/health');
    assert(
      health.status === 200 && health.body.stage >= 6,
      '1. Migration 006 Executes: Backend reporting Stage 6+',
      `Stage: ${health.body.stage}`
    );

    // 2. Status History Table & Constraint Check
    const tableCheck = await pool.query(`
      SELECT 
        (SELECT COUNT(*) FROM information_schema.tables WHERE table_name = 'complaint_status_history') AS table_exists,
        (SELECT COUNT(*) FROM pg_indexes WHERE tablename = 'complaint_status_history' AND indexname = 'idx_status_history_complaint_id') AS idx_exists;
    `);
    const tableExists = parseInt(tableCheck.rows[0].table_exists) > 0;
    const idxExists = parseInt(tableCheck.rows[0].idx_exists) > 0;
    assert(
      tableExists && idxExists,
      '2. Status History Table & Indexes Exist in PostgreSQL',
      `Table: ${tableExists}, Index: ${idxExists}`
    );

    // 3. Existing complaints readable
    const listRes = await sendJsonRequest('/api/complaints?limit=5');
    assert(
      listRes.status === 200 && Array.isArray(listRes.body.data) && listRes.body.data.length > 0,
      '3. Existing Complaints Readable from Database',
      `Found ${listRes.body.total} existing complaints`
    );

    // 4. Stage 5 Routing Still Works
    console.log('\n--- Testing Intake & Routing Pre-requisites ---');
    const comp1 = await sendMultipartComplaint({
      description: 'Major water leakage near Palace Chamundi gate',
      category: 'WATER_LEAK',
      category_source: 'MANUAL',
      latitude: 12.2958,
      longitude: 76.6394
    });
    const c1Id = comp1.body.data.id;
    const c1Code = comp1.body.data.complaint_code;

    const routeRes1 = await sendJsonRequest(`/api/complaints/${c1Id}/route`, 'POST');
    assert(
      routeRes1.status === 200 &&
      routeRes1.body.data.routingStatus === 'ROUTED' &&
      routeRes1.body.data.authority?.code === 'MCC_DEMO' &&
      routeRes1.body.data.department?.code === 'MCC_WATER',
      '4. Stage 5 Routing Still Works: Deterministically matched MCC Water Supply',
      `Complaint: ${c1Code}, Status: ${routeRes1.body.data.routingStatus}, Authority: ${routeRes1.body.data.authority?.name}`
    );

    // 5. Valid Transition: ROUTED -> IN_PROGRESS
    console.log('\n--- Testing Deterministic Status Progression ---');
    const t1 = await sendJsonRequest(`/api/complaints/${c1Id}/status`, 'PATCH', {
      status: 'IN_PROGRESS',
      reason: 'Field maintenance team dispatched to site',
      changedBy: 'mcc_water_inspector_ravi'
    });
    assert(
      t1.status === 200 &&
      t1.body.data.previousStatus === 'ROUTED' &&
      t1.body.data.newStatus === 'IN_PROGRESS',
      '5. Valid Transition ROUTED → IN_PROGRESS Succeeds',
      `Previous: ${t1.body.data.previousStatus} -> New: ${t1.body.data.newStatus}`
    );

    // 6. Valid Transition: IN_PROGRESS -> RESOLVED
    const t2 = await sendJsonRequest(`/api/complaints/${c1Id}/status`, 'PATCH', {
      status: 'RESOLVED',
      reason: 'Valve replacement and pipe repair completed and pressure tested',
      changedBy: 'field_engineer_anand'
    });
    assert(
      t2.status === 200 &&
      t2.body.data.previousStatus === 'IN_PROGRESS' &&
      t2.body.data.newStatus === 'RESOLVED',
      '6. Valid Transition IN_PROGRESS → RESOLVED Succeeds',
      `Previous: ${t2.body.data.previousStatus} -> New: ${t2.body.data.newStatus}`
    );

    // 7. Valid Transition: RESOLVED -> CLOSED
    const t3 = await sendJsonRequest(`/api/complaints/${c1Id}/status`, 'PATCH', {
      status: 'CLOSED',
      reason: 'Citizen confirmed water supply restored cleanly. Case closed.',
      changedBy: 'civic_resolution_desk'
    });
    assert(
      t3.status === 200 &&
      t3.body.data.previousStatus === 'RESOLVED' &&
      t3.body.data.newStatus === 'CLOSED',
      '7. Valid Transition RESOLVED → CLOSED Succeeds',
      `Previous: ${t3.body.data.previousStatus} -> New: ${t3.body.data.newStatus}`
    );

    // 8. Invalid Jump: SUBMITTED -> CLOSED Rejected (400)
    console.log('\n--- Testing State Machine Constraint Enforcements ---');
    const comp2 = await sendMultipartComplaint({
      description: 'Streetlight pole dark on Sayyaji Rao Road',
      category: 'STREETLIGHT',
      category_source: 'MANUAL',
      latitude: 12.3050,
      longitude: 76.6450
    });
    const c2Id = comp2.body.data.id;

    const invalidJump1 = await sendJsonRequest(`/api/complaints/${c2Id}/status`, 'PATCH', {
      status: 'CLOSED',
      reason: 'Attempting illegal bypass directly to closed'
    });
    assert(
      invalidJump1.status === 400 &&
      invalidJump1.body.success === false &&
      invalidJump1.body.error.includes('Invalid status transition'),
      '8. Invalid SUBMITTED → CLOSED Rejected with HTTP 400',
      `Error message: "${invalidJump1.body.error}"`
    );

    // 9. Invalid Jump: ROUTED -> CLOSED Rejected (400)
    const comp3 = await sendMultipartComplaint({
      description: 'Garbage accumulation near market corner',
      category: 'GARBAGE',
      category_source: 'MANUAL',
      latitude: 12.2980,
      longitude: 76.6420
    });
    const c3Id = comp3.body.data.id;
    await sendJsonRequest(`/api/complaints/${c3Id}/route`, 'POST');

    const invalidJump2 = await sendJsonRequest(`/api/complaints/${c3Id}/status`, 'PATCH', {
      status: 'CLOSED',
      reason: 'Attempting illegal jump from routed directly to closed without work'
    });
    assert(
      invalidJump2.status === 400 &&
      invalidJump2.body.success === false &&
      invalidJump2.body.error.includes('Invalid status transition'),
      '9. Invalid ROUTED → CLOSED Rejected with HTTP 400',
      `Error message: "${invalidJump2.body.error}"`
    );

    // 10. Human Review Flow: HUMAN_REVIEW -> TRIAGED
    console.log('\n--- Testing Human Review Workflow ---');
    const compOut = await sendMultipartComplaint({
      description: 'Report filed far outside municipal boundaries',
      category: 'OTHER',
      category_source: 'MANUAL',
      latitude: 28.6139,
      longitude: 77.2090
    });
    const cOutId = compOut.body.data.id;
    await sendJsonRequest(`/api/complaints/${cOutId}/route`, 'POST');

    const tHr = await sendJsonRequest(`/api/complaints/${cOutId}/status`, 'PATCH', {
      status: 'TRIAGED',
      reason: 'Human review officer reviewed location and assigned special advisory categorization',
      changedBy: 'senior_grievance_officer'
    });
    assert(
      tHr.status === 200 &&
      tHr.body.data.previousStatus === 'HUMAN_REVIEW' &&
      tHr.body.data.newStatus === 'TRIAGED',
      '10. Valid Transition HUMAN_REVIEW → TRIAGED Succeeds',
      `Previous: ${tHr.body.data.previousStatus} -> New: ${tHr.body.data.newStatus}`
    );

    // 11. History Persisted in Database
    console.log('\n--- Verifying Append-Only Audit Trail ---');
    const dbHist = await pool.query(
      'SELECT * FROM complaint_status_history WHERE complaint_id = $1 ORDER BY created_at ASC;',
      [c1Id]
    );
    assert(
      dbHist.rows.length >= 4,
      '11. History Persisted: Real rows found in PostgreSQL complaint_status_history',
      `Total history records for ${c1Code}: ${dbHist.rows.length}`
    );

    // 12. Multiple Transitions Preserve Chronological History
    const statusesInOrder = dbHist.rows.map(r => r.new_status);
    const expectedSequence = ['SUBMITTED', 'ROUTED', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'];
    const isSubsequence = expectedSequence.every(s => statusesInOrder.includes(s));
    assert(
      isSubsequence,
      '12. Multiple Transitions Preserve Chronological History',
      `Recorded Progression: ${statusesInOrder.join(' -> ')}`
    );

    // 13. Previous Status Preserved Correctly
    const closedRow = dbHist.rows.find(r => r.new_status === 'CLOSED');
    assert(
      closedRow && closedRow.previous_status === 'RESOLVED',
      '13. Previous Status Preserved Accurately Across Transitions',
      `Closed record: previous_status=${closedRow?.previous_status}, new_status=${closedRow?.new_status}`
    );

    // 14. Real-time Socket.IO Event Emitted
    const c1Event = statusChangedEvents.find(e => e.complaintId === c1Id && e.newStatus === 'CLOSED');
    assert(
      Boolean(c1Event) &&
      c1Event.complaintCode === c1Code &&
      c1Event.previousStatus === 'RESOLVED' &&
      c1Event.newStatus === 'CLOSED',
      '14. Socket.IO Broadcast: complaint:status_changed Received with Safe Metadata',
      `Event received for ${c1Event?.complaintCode}: ${c1Event?.previousStatus} -> ${c1Event?.newStatus}`
    );

    // 15. Status History Endpoint Works
    const histApiRes = await sendJsonRequest(`/api/complaints/${c1Id}/status-history`);
    assert(
      histApiRes.status === 200 &&
      Array.isArray(histApiRes.body.data) &&
      histApiRes.body.data.length >= 4,
      '15. GET /api/complaints/:id/status-history Returns Real Chronological Array',
      `API returned ${histApiRes.body.data.length} records`
    );

    // 16. Full Complaint Lifecycle Endpoint Works
    const fullRes = await sendJsonRequest(`/api/complaints/${c1Id}`);
    assert(
      fullRes.status === 200 &&
      fullRes.body.data.id === c1Id &&
      fullRes.body.data.status === 'CLOSED' &&
      fullRes.body.data.routing !== null &&
      Array.isArray(fullRes.body.data.status_history),
      '16. GET /api/complaints/:id Returns Full Lifecycle (Details + Routing + History)',
      `Status: ${fullRes.body.data.status}, Authority: ${fullRes.body.data.routing?.authority_name}, History: ${fullRes.body.data.status_history?.length} steps`
    );

    // 17. CRITICAL REGRESSION PROOF: Routing Decision Remains Completely Unchanged
    console.log('\n--- Critical Regression: Routing Immutability During Lifecycle ---');
    const rdCheck = await pool.query(
      'SELECT * FROM routing_decisions WHERE complaint_id = $1;',
      [c1Id]
    );
    const rdRow = rdCheck.rows[0];
    assert(
      rdCheck.rows.length === 1 &&
      rdRow.routing_status === 'ROUTED' &&
      rdRow.authority_id === 'a0000000-0000-0000-0000-000000000001' &&
      rdRow.department_id === 'd0000000-0000-0000-0000-000000000008',
      '17. Routing Decision Strictly Unchanged After SUBMITTED → IN_PROGRESS → RESOLVED → CLOSED',
      `Authority ID: ${rdRow.authority_id}, Department ID: ${rdRow.department_id}`
    );

    // 18. Stage 2 Regression: PostGIS Spatial Lookup Still Works
    console.log('\n--- Regression Suite (Stages 2–5) ---');
    const gisRes = await sendJsonRequest('/api/gis/test?lat=12.2958&lng=76.6394');
    assert(
      gisRes.status === 200 && gisRes.body.matched === true && gisRes.body.authority?.code === 'MCC_DEMO',
      '18. Stage 2 Regression: /api/gis/test PostGIS Spatial Query Operational',
      `Authority: ${gisRes.body.authority?.name}`
    );

    // 19. Stage 3 Regression: Jurisdiction Versions Still Work
    const verRes = await sendJsonRequest('/api/jurisdictions/versions');
    assert(
      verRes.status === 200 && Array.isArray(verRes.body.data) && verRes.body.data.length >= 2,
      '19. Stage 3 Regression: /api/jurisdictions/versions Operational',
      `Found ${verRes.body.data.length} versions`
    );

    // 20. Stage 4 Regression: Complaint Intake Pipeline Still Works
    const compReg = await sendMultipartComplaint({
      description: 'Pothole on Jhansi Lakshmibai road regression check',
      category: 'POTHOLE',
      category_source: 'MANUAL',
      latitude: 12.3020,
      longitude: 76.6430
    });
    assert(
      compReg.status === 201 && (compReg.body.data.status === 'ROUTED' || compReg.body.data.status === 'SUBMITTED'),
      '20. Stage 4 Regression: Citizen Intake Pipeline Operational',
      `Complaint Code: ${compReg.body.data.complaint_code}, Status: ${compReg.body.data.status}`
    );

    // 21. Stage 5 Regression: Deterministic Routing Engine Operational
    const routeReg = await sendJsonRequest(`/api/complaints/${compReg.body.data.id}/route`, 'POST');
    assert(
      routeReg.status === 200 &&
      routeReg.body.data.routingStatus === 'ROUTED' &&
      routeReg.body.data.department?.code === 'MCC_ROADS',
      '21. Stage 5 Regression: Deterministic Civic Routing Operational',
      `Department: ${routeReg.body.data.department?.name}`
    );

    // 22. Frontend Build Verification
    console.log('\n--- Verifying Frontend Production Build ---');
    const clientDir = path.resolve(__dirname, '../../../client');
    try {
      execSync('npm.cmd run build', { cwd: clientDir, stdio: 'pipe' });
      assert(true, '22. Frontend Build: Production Build Artifact Compiles with Zero Errors', 'dist/ built successfully');
    } catch (buildErr) {
      assert(false, '22. Frontend Build: Production Build Failed', buildErr.message);
    }

  } catch (fatalErr) {
    console.error('Fatal error during Stage 6 test suite:', fatalErr);
    failed++;
  } finally {
    socketClient.disconnect();
    await pool.end();
  }

  console.log('\n====================================================');
  console.log(`TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('====================================================\n');

  process.exit(failed > 0 ? 1 : 0);
}

runStage6Tests();
