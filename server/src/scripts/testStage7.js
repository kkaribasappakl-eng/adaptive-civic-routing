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

function sendJsonRequest(apiPath, method = 'GET', data = null, explicitToken = undefined) {
  return new Promise(async (resolve, reject) => {
    let token = explicitToken;
    if (token === undefined) {
      token = await getOperatorToken();
    }
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
          ...(body ? { 'Content-Length': Buffer.byteLength(body) } : {}),
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
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
      res.on('data', (chunk) => { data += chunk; });
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

async function runStage7Tests() {
  console.log('====================================================');
  console.log('STAGE 7 COMPREHENSIVE VERIFICATION SUITE');
  console.log('SLA Tracking & Escalation Layer');
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
      if (details) console.error(`       Details: ${details}`);
      failed++;
    }
  }

  // Socket.IO client for verifying real-time notifications
  const socketClient = ClientIO(BASE_URL, {
    transports: ['websocket'],
    reconnection: false
  });

  const receivedSocketEvents = [];
  socketClient.on('sla:warning', (data) => {
    receivedSocketEvents.push({ event: 'sla:warning', data });
  });
  socketClient.on('sla:breached', (data) => {
    receivedSocketEvents.push({ event: 'sla:breached', data });
  });

  await new Promise((resolve) => {
    socketClient.on('connect', resolve);
    setTimeout(resolve, 2000);
  });

  try {
    // 1. Migration Verification
    console.log('--- 1. Schema & Migration Verification ---');
    const tableCheck = await pool.query(`
      SELECT table_name FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_name IN ('complaint_sla_rules', 'complaint_sla_events');
    `);
    const colCheck = await pool.query(`
      SELECT column_name FROM information_schema.columns 
      WHERE table_name = 'complaints' AND column_name IN ('routed_at', 'sla_warning_at', 'sla_target_at', 'sla_status', 'sla_breached_at');
    `);
    assert(
      tableCheck.rows.length === 2 && colCheck.rows.length === 5,
      '1. Migration Works: complaint_sla_rules, complaint_sla_events and complaints SLA columns exist',
      `Found ${tableCheck.rows.length}/2 tables, ${colCheck.rows.length}/5 columns`
    );

    // 2. All 8 Controlled SLA Rules Exist
    console.log('\n--- 2. SLA Rules Configuration ---');
    const rulesRes = await pool.query('SELECT category, target_hours, warning_hours FROM complaint_sla_rules ORDER BY category;');
    const expectedRules = {
      'C_AND_D_WASTE': { target: 72, warning: 48 },
      'DRAINAGE': { target: 48, warning: 36 },
      'GARBAGE': { target: 24, warning: 18 },
      'ILLEGAL_DUMPING': { target: 48, warning: 36 },
      'OTHER': { target: 96, warning: 72 },
      'POTHOLE': { target: 72, warning: 48 },
      'STREETLIGHT': { target: 24, warning: 16 },
      'WATER_LEAK': { target: 12, warning: 8 }
    };
    let allRulesMatch = rulesRes.rows.length === 8;
    for (const r of rulesRes.rows) {
      const exp = expectedRules[r.category];
      if (!exp || exp.target !== r.target_hours || exp.warning !== r.warning_hours) {
        allRulesMatch = false;
        break;
      }
    }
    assert(
      allRulesMatch,
      '2. All 8 Controlled SLA Benchmark Rules Seeded & Exact Match',
      `Found ${rulesRes.rows.length} rules (WATER_LEAK: 12h/8h, STREETLIGHT: 24h/16h, GARBAGE: 24h/18h, etc.)`
    );

    // 3. SLA Event Table Structure
    console.log('\n--- 3. SLA Event Table Verification ---');
    const eventCols = await pool.query(`
      SELECT column_name FROM information_schema.columns 
      WHERE table_name = 'complaint_sla_events';
    `);
    const evColNames = eventCols.rows.map(c => c.column_name);
    const requiredEvCols = ['id', 'complaint_id', 'previous_sla_status', 'new_sla_status', 'event_type', 'reason', 'metadata', 'created_at'];
    const hasAllEvCols = requiredEvCols.every(c => evColNames.includes(c));
    assert(
      hasAllEvCols,
      '3. SLA Event Table Exists with All Required Columns',
      `Columns: ${evColNames.join(', ')}`
    );

    // 4. Create and Route a Complaint (WATER_LEAK - 12h target / 8h warning)
    console.log('\n--- 4. SLA Initialization on Spatial Routing ---');
    const createRes = await sendMultipartComplaint({
      description: 'Major water pipeline leak in Saraswathipuram 1st Main',
      category: 'WATER_LEAK',
      category_source: 'MANUAL',
      latitude: 12.3050,
      longitude: 76.6380
    });
    const cId = createRes.body.data.id;

    // Route the complaint
    const routeRes = await sendJsonRequest(`/api/complaints/${cId}/route`, 'POST');
    assert(
      routeRes.status === 200 && routeRes.body.data.routingStatus === 'ROUTED',
      '4. Spatial Routing Successfully Routes Intake',
      `Complaint ID: ${cId}, Status: ${routeRes.body.data.routingStatus}`
    );

    // Record baseline routing decision for immutability check
    const initialRdRes = await pool.query('SELECT * FROM routing_decisions WHERE complaint_id = $1;', [cId]);
    const initialRd = initialRdRes.rows[0];

    // Fetch complaint SLA fields from PostgreSQL
    const compDbRes = await pool.query(
      'SELECT id, category, routed_at, sla_warning_at, sla_target_at, sla_status FROM complaints WHERE id = $1;',
      [cId]
    );
    const compRow = compDbRes.rows[0];

    // 5. Timestamps Originate from Persisted PostgreSQL Routing Time
    const routedAtDate = new Date(compRow.routed_at);
    assert(
      compRow.routed_at !== null && !isNaN(routedAtDate.getTime()),
      '5. Timestamps Originate from Real Persisted PostgreSQL Routing Time (routed_at)',
      `routed_at: ${compRow.routed_at}`
    );

    // 6. Warning Calculation is Correct (routed_at + 8 hours for WATER_LEAK)
    const warningAtDate = new Date(compRow.sla_warning_at);
    const diffWarningHours = (warningAtDate.getTime() - routedAtDate.getTime()) / (1000 * 60 * 60);
    assert(
      Math.abs(diffWarningHours - 8) < 0.01,
      '6. Warning Calculation is Exact (routed_at + 8h for WATER_LEAK)',
      `Calculated: ${diffWarningHours.toFixed(2)}h, Expected: 8h`
    );

    // 7. Target Calculation is Correct (routed_at + 12 hours for WATER_LEAK)
    const targetAtDate = new Date(compRow.sla_target_at);
    const diffTargetHours = (targetAtDate.getTime() - routedAtDate.getTime()) / (1000 * 60 * 60);
    assert(
      Math.abs(diffTargetHours - 12) < 0.01,
      '7. Target Calculation is Exact (routed_at + 12h for WATER_LEAK)',
      `Calculated: ${diffTargetHours.toFixed(2)}h, Expected: 12h`
    );

    // 8. Initial Status is WITHIN_SLA
    assert(
      compRow.sla_status === 'WITHIN_SLA',
      '8. Initial SLA Status is WITHIN_SLA in PostgreSQL',
      `sla_status: ${compRow.sla_status}`
    );

    // 9. SLA_INITIALIZED Event Exists
    const initEvRes = await pool.query(
      "SELECT * FROM complaint_sla_events WHERE complaint_id = $1 AND event_type = 'SLA_INITIALIZED';",
      [cId]
    );
    assert(
      initEvRes.rows.length === 1 && initEvRes.rows[0].new_sla_status === 'WITHIN_SLA',
      '9. SLA_INITIALIZED Event Recorded in Append-only Log',
      `Event ID: ${initEvRes.rows[0]?.id}, Reason: ${initEvRes.rows[0]?.reason}`
    );

    // 10 & 11. Controlled AT_RISK Escalation & sla:warning Event
    console.log('\n--- 10 & 11. AT_RISK Transition & Socket.IO sla:warning ---');
    // Simulate reference time at routed_at + 9 hours (within warning window: >= 8h and < 12h)
    const simulatedWarningTime = new Date(routedAtDate.getTime() + 9 * 60 * 60 * 1000).toISOString();
    const evalRiskRes = await sendJsonRequest(
      `/api/complaints/${cId}/sla/evaluate`,
      'POST',
      { referenceTime: simulatedWarningTime }
    );

    assert(
      evalRiskRes.status === 200 &&
      evalRiskRes.body.data.slaStatus === 'AT_RISK' &&
      evalRiskRes.body.data.statusChanged === true,
      '10. AT_RISK Evaluation Transitions Status Deterministically',
      `Status: ${evalRiskRes.body.data.slaStatus}, StatusChanged: ${evalRiskRes.body.data.statusChanged}`
    );

    // Verify Socket.IO sla:warning received
    await new Promise(r => setTimeout(r, 400));
    const warningSocketEv = receivedSocketEvents.find(
      e => e.event === 'sla:warning' && e.data.complaintId === cId
    );
    assert(
      Boolean(warningSocketEv) && warningSocketEv.data.slaStatus === 'AT_RISK',
      '11. Socket.IO Broadcast: sla:warning Received with Safe Metadata',
      `Category: ${warningSocketEv?.data?.category}, WarningAt: ${warningSocketEv?.data?.warningAt}`
    );

    // 12 & 13. Controlled SLA_BREACHED Escalation & sla:breached Event
    console.log('\n--- 12 & 13. SLA_BREACHED Transition & Socket.IO sla:breached ---');
    // Simulate reference time at routed_at + 13 hours (>= 12h target deadline)
    const simulatedBreachTime = new Date(routedAtDate.getTime() + 13 * 60 * 60 * 1000).toISOString();
    const evalBreachRes = await sendJsonRequest(
      `/api/complaints/${cId}/sla/evaluate`,
      'POST',
      { referenceTime: simulatedBreachTime }
    );

    assert(
      evalBreachRes.status === 200 &&
      evalBreachRes.body.data.slaStatus === 'SLA_BREACHED' &&
      evalBreachRes.body.data.statusChanged === true &&
      evalBreachRes.body.data.slaBreachedAt !== null,
      '12. SLA_BREACHED Evaluation Transitions Status & Records sla_breached_at',
      `Status: ${evalBreachRes.body.data.slaStatus}, BreachedAt: ${evalBreachRes.body.data.slaBreachedAt}`
    );

    // Verify Socket.IO sla:breached received
    await new Promise(r => setTimeout(r, 400));
    const breachSocketEv = receivedSocketEvents.find(
      e => e.event === 'sla:breached' && e.data.complaintId === cId
    );
    assert(
      Boolean(breachSocketEv) && breachSocketEv.data.slaStatus === 'SLA_BREACHED',
      '13. Socket.IO Broadcast: sla:breached Received with Safe Metadata',
      `Category: ${breachSocketEv?.data?.category}, BreachedAt: ${breachSocketEv?.data?.breachedAt}`
    );

    // 14. Prevent Duplicate Escalation Events
    console.log('\n--- 14. Idempotency & Duplicate Escalation Prevention ---');
    const prevEventCountRes = await pool.query(
      'SELECT COUNT(*)::int AS count FROM complaint_sla_events WHERE complaint_id = $1;',
      [cId]
    );
    const prevCount = prevEventCountRes.rows[0].count;

    // Evaluate again at routed_at + 14 hours (still breached)
    const evalDuplicateRes = await sendJsonRequest(
      `/api/complaints/${cId}/sla/evaluate`,
      'POST',
      { referenceTime: new Date(routedAtDate.getTime() + 14 * 60 * 60 * 1000).toISOString() }
    );

    const postEventCountRes = await pool.query(
      'SELECT COUNT(*)::int AS count FROM complaint_sla_events WHERE complaint_id = $1;',
      [cId]
    );
    const postCount = postEventCountRes.rows[0].count;

    assert(
      evalDuplicateRes.status === 200 &&
      evalDuplicateRes.body.data.statusChanged === false &&
      postCount === prevCount,
      '14. Duplicate Escalation Events Prevented (statusChanged = false, no extra rows)',
      `Events count remained strictly: ${postCount}`
    );

    // 15. Resolved / Closed Protection
    console.log('\n--- 15. Closed / Resolved Protection ---');
    // Create a new complaint that is resolved within SLA
    const c2Create = await sendMultipartComplaint({
      description: 'Streetlight flicker near Saraswathipuram 3rd Cross',
      category: 'STREETLIGHT',
      category_source: 'MANUAL',
      latitude: 12.3050,
      longitude: 76.6380
    });
    const c2Id = c2Create.body.data.id;
    const c2RouteRes = await sendJsonRequest(`/api/complaints/${c2Id}/route`, 'POST');
    assert(
      c2RouteRes.status === 200 && c2RouteRes.body.data.routingStatus === 'ROUTED',
      '15a. Protection Test: Complaint Successfully Routed',
      `Routing Status: ${c2RouteRes.body.data.routingStatus}`
    );

    // Move to IN_PROGRESS then RESOLVED within SLA
    await sendJsonRequest(`/api/complaints/${c2Id}/status`, 'PATCH', {
      status: 'IN_PROGRESS',
      reason: 'Work started'
    });
    await sendJsonRequest(`/api/complaints/${c2Id}/status`, 'PATCH', {
      status: 'RESOLVED',
      reason: 'Fixture repaired'
    });

    // Now evaluate SLA with a simulated reference time 48 hours later (past the 24h target)
    const simulatedFutureTime = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();
    const evalResolvedRes = await sendJsonRequest(
      `/api/complaints/${c2Id}/sla/evaluate`,
      'POST',
      { referenceTime: simulatedFutureTime }
    );

    const c2DbCheck = await pool.query('SELECT sla_status, status FROM complaints WHERE id = $1;', [c2Id]);
    assert(
      evalResolvedRes.body.data.slaStatus === 'WITHIN_SLA' &&
      c2DbCheck.rows[0].sla_status === 'WITHIN_SLA' &&
      c2DbCheck.rows[0].status === 'RESOLVED',
      '15. Resolved/Closed Case Protected from Retroactive SLA Breach',
      `SLA Status: ${c2DbCheck.rows[0].sla_status}, Complaint Status: ${c2DbCheck.rows[0].status}`
    );

    // 16. GET /api/complaints/:complaintId/sla
    console.log('\n--- 16. SLA Details API ---');
    const detailsRes = await sendJsonRequest(`/api/complaints/${cId}/sla`);
    assert(
      detailsRes.status === 200 &&
      detailsRes.body.data.complaintId === cId &&
      detailsRes.body.data.slaStatus === 'SLA_BREACHED' &&
      detailsRes.body.data.targetHours === 12 &&
      detailsRes.body.data.warningHours === 8 &&
      Array.isArray(detailsRes.body.data.events) &&
      detailsRes.body.data.events.length === 3, // SLA_INITIALIZED, SLA_WARNING, SLA_BREACHED
      '16. GET /api/complaints/:complaintId/sla Returns Full Policy, Deadlines & Events',
      `Target: ${detailsRes.body.data.targetHours}h, Events: ${detailsRes.body.data.events?.length}`
    );

    // 17. GET /api/sla/rules
    console.log('\n--- 17. SLA Rules API ---');
    const rulesApiRes = await sendJsonRequest('/api/sla/rules');
    assert(
      rulesApiRes.status === 200 &&
      Array.isArray(rulesApiRes.body.data) &&
      rulesApiRes.body.data.length === 8,
      '17. GET /api/sla/rules Returns All 8 Demo SLA Policies',
      `Total rules returned: ${rulesApiRes.body.data.length}`
    );

    // 18. GET /api/sla/overview
    console.log('\n--- 18. SLA Overview API ---');
    const overviewRes = await sendJsonRequest('/api/sla/overview');
    assert(
      overviewRes.status === 200 &&
      typeof overviewRes.body.data.totalTracked === 'number' &&
      typeof overviewRes.body.data.complianceRate === 'number' &&
      Array.isArray(overviewRes.body.data.categoryBreakdown),
      '18. GET /api/sla/overview Returns Aggregate Municipal SLA Compliance Metrics',
      `Total Tracked: ${overviewRes.body.data.totalTracked}, Compliance Rate: ${overviewRes.body.data.complianceRate}%`
    );

    // 19. CRITICAL ROUTING REGRESSION: Routing Decision Immutability
    console.log('\n--- 19. Critical Routing Immutability During SLA Operations ---');
    const rdCheck = await pool.query('SELECT * FROM routing_decisions WHERE complaint_id = $1;', [cId]);
    const rd = rdCheck.rows[0];
    assert(
      rdCheck.rows.length === 1 &&
      rd.id === initialRd.id &&
      rd.authority_id === initialRd.authority_id &&
      rd.department_id === initialRd.department_id &&
      rd.jurisdiction_id === initialRd.jurisdiction_id &&
      rd.jurisdiction_version_id === initialRd.jurisdiction_version_id &&
      rd.routing_status === initialRd.routing_status &&
      new Date(rd.matched_at).getTime() === new Date(initialRd.matched_at).getTime(),
      '19. Routing Decision Remains Strictly Immutable Across All SLA Evaluations',
      `Authority: ${rd.authority_id}, Department: ${rd.department_id}, Version: ${rd.jurisdiction_version_id}`
    );

    // 20. Stage 2 Regression: PostGIS Spatial Lookup
    console.log('\n--- Regression Suite (Stages 2–6) ---');
    const gisRes = await sendJsonRequest('/api/gis/test?lat=12.2958&lng=76.6394');
    assert(
      gisRes.status === 200 && gisRes.body.matched === true && gisRes.body.authority?.code === 'MCC_DEMO',
      '20. Stage 2 Regression: /api/gis/test PostGIS Spatial Query Operational',
      `Authority: ${gisRes.body.authority?.name}`
    );

    // 21. Stage 3 Regression: Jurisdiction Versions
    const verRes = await sendJsonRequest('/api/jurisdictions/versions');
    assert(
      verRes.status === 200 && Array.isArray(verRes.body.data) && verRes.body.data.length >= 2,
      '21. Stage 3 Regression: /api/jurisdictions/versions Operational',
      `Found ${verRes.body.data.length} versions`
    );

    // 22. Stage 4 Regression: Citizen Intake Pipeline
    const compReg = await sendMultipartComplaint({
      description: 'Garbage accumulation near Subbarayanakere Park regression check',
      category: 'GARBAGE',
      category_source: 'MANUAL',
      latitude: 12.3040,
      longitude: 76.6490
    });
    assert(
      compReg.status === 201 && (compReg.body.data.status === 'ROUTED' || compReg.body.data.status === 'SUBMITTED'),
      '22. Stage 4 Regression: Citizen Intake Pipeline Operational',
      `Complaint Code: ${compReg.body.data.complaint_code}, Status: ${compReg.body.data.status}`
    );

    // 23. Stage 5 Regression: Deterministic Routing Engine
    const routeReg = await sendJsonRequest(`/api/complaints/${compReg.body.data.id}/route`, 'POST');
    assert(
      routeReg.status === 200 &&
      routeReg.body.data.routingStatus === 'ROUTED' &&
      routeReg.body.data.department?.code === 'MCC_SWM',
      '23. Stage 5 Regression: Deterministic Civic Routing Operational',
      `Department: ${routeReg.body.data.department?.name}`
    );

    // 24. Stage 6 Regression: State Machine Lifecycle
    const c6Id = compReg.body.data.id;
    const s6Step1 = await sendJsonRequest(`/api/complaints/${c6Id}/status`, 'PATCH', {
      status: 'IN_PROGRESS',
      reason: 'Sanitation team dispatched'
    });
    const s6Step2 = await sendJsonRequest(`/api/complaints/${c6Id}/status`, 'PATCH', {
      status: 'RESOLVED',
      reason: 'Waste cleared'
    });
    const s6Step3 = await sendJsonRequest(`/api/complaints/${c6Id}/status`, 'PATCH', {
      status: 'CLOSED',
      reason: 'Verified and closed'
    });
    assert(
      s6Step1.status === 200 && s6Step2.status === 200 && s6Step3.status === 200 &&
      s6Step3.body.data?.newStatus === 'CLOSED',
      '24. Stage 6 Regression: Deterministic State Machine Lifecycle (ROUTED → IN_PROGRESS → RESOLVED → CLOSED)',
      `Final Lifecycle Status: ${s6Step3.body.data?.newStatus}`
    );

    // 25. Frontend Build Verification
    console.log('\n--- 25. Verifying Frontend Production Build ---');
    const clientDir = path.resolve(__dirname, '../../../client');
    try {
      execSync('npm.cmd run build', { cwd: clientDir, stdio: 'pipe' });
      assert(true, '25. Frontend Build: Production Build Artifact Compiles with Zero Errors', 'dist/ built successfully');
    } catch (buildErr) {
      assert(false, '25. Frontend Build: Production Build Failed', buildErr.message);
    }

  } catch (fatalErr) {
    console.error('Fatal error during Stage 7 test suite:', fatalErr);
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

runStage7Tests();
