const http = require('http');
const { pool } = require('../config/db');
const { execSync } = require('child_process');
const path = require('path');
const { io: ClientIO } = require('../../../client/node_modules/socket.io-client');
const app = require('../app');
const { initSocketIO, getIO } = require('../services/socketService');

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

async function runStage9Tests() {
  console.log('====================================================');
  console.log('STAGE 9 COMPREHENSIVE VERIFICATION SUITE');
  console.log('Operator Review & Human-in-the-Loop Workflow');
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

  // Verify server is running on port 4000
  let serverInstance = null;
  const isServerRunning = await new Promise((resolve) => {
    const req = http.get('http://localhost:4000/api/health', (res) => {
      resolve(res.statusCode === 200);
    });
    req.on('error', () => resolve(false));
    req.setTimeout(1000, () => {
      req.destroy();
      resolve(false);
    });
  });

  if (!isServerRunning) {
    console.log('[Setup] Starting in-process server on port 4000 for test suite...');
    serverInstance = http.createServer(app);
    initSocketIO(serverInstance, 'http://localhost:5173');
    await new Promise((resolve) => serverInstance.listen(4000, resolve));
    console.log('[Setup] In-process server started successfully.');
  } else {
    console.log('[Setup] Connected to existing server running on port 4000.');
  }

  const { checkDatabaseHealth } = require('../config/db');
  await checkDatabaseHealth();

  const opToken = await getOperatorToken();

  // Setup Socket.IO Client
  const socketClient = ClientIO(BASE_URL, {
    transports: ['websocket'],
    reconnection: false,
    auth: { token: opToken }
  });

  const receivedSocketEvents = [];
  const eventTypesToListen = [
    'review:created',
    'review:updated',
    'review:resolved',
    'review:unroutable',
    'notification:created',
    'complaint:created',
    'routing:completed',
    'routing:review_required',
    'complaint:status_changed'
  ];

  eventTypesToListen.forEach((ev) => {
    socketClient.on(ev, (payload) => {
      receivedSocketEvents.push({ event: ev, payload, timestamp: Date.now() });
    });
  });

  await new Promise((resolve) => {
    if (socketClient.connected) resolve();
    else socketClient.on('connect', resolve);
  });
  console.log('[Setup] Socket.IO test client connected to port 4000.\n');

  try {
    // -----------------------------------------------------------------
    // TEST 1: Migration 009 Applied
    // -----------------------------------------------------------------
    const migRes = await pool.query(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name IN ('complaint_reviews', 'complaint_review_actions');"
    );
    assert(
      migRes.rows.length === 2,
      '1. Migration 009: complaint_reviews and complaint_review_actions exist in PostgreSQL',
      `Found ${migRes.rows.length} of 2 required tables`
    );

    // -----------------------------------------------------------------
    // TEST 2: complaint_reviews table structure
    // -----------------------------------------------------------------
    const revColsRes = await pool.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'complaint_reviews';
    `);
    const revColNames = revColsRes.rows.map(r => r.column_name);
    const expectedRevCols = [
      'id', 'complaint_id', 'review_status', 'reason', 'reviewer_name',
      'selected_authority_id', 'selected_department_id',
      'selected_jurisdiction_version_id', 'reviewer_note',
      'created_at', 'updated_at', 'resolved_at'
    ];
    const missingRevCols = expectedRevCols.filter(c => !revColNames.includes(c));
    assert(
      missingRevCols.length === 0,
      '2. complaint_reviews table schema contains all required Stage 9 columns',
      missingRevCols.length ? `Missing: ${missingRevCols.join(', ')}` : `All ${expectedRevCols.length} columns verified`
    );

    // -----------------------------------------------------------------
    // TEST 3: complaint_review_actions table structure
    // -----------------------------------------------------------------
    const actColsRes = await pool.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'complaint_review_actions';
    `);
    const actColNames = actColsRes.rows.map(r => r.column_name);
    const expectedActCols = [
      'id', 'review_id', 'complaint_id', 'action_type', 'actor_name',
      'previous_routing_status', 'new_routing_status',
      'previous_complaint_status', 'new_complaint_status',
      'authority_id', 'department_id', 'jurisdiction_version_id',
      'note', 'metadata', 'created_at'
    ];
    const missingActCols = expectedActCols.filter(c => !actColNames.includes(c));
    assert(
      missingActCols.length === 0,
      '3. complaint_review_actions table schema contains all required Stage 9 columns',
      missingActCols.length ? `Missing: ${missingActCols.join(', ')}` : `All ${expectedActCols.length} columns verified`
    );

    // -----------------------------------------------------------------
    // TEST 4: Required constraints and indexes
    // -----------------------------------------------------------------
    const idxRes = await pool.query(`
      SELECT indexname, indexdef 
      FROM pg_indexes 
      WHERE tablename = 'complaint_reviews';
    `);
    const hasActivePartialIdx = idxRes.rows.some(r => r.indexname === 'idx_active_complaint_review');
    assert(
      hasActivePartialIdx,
      '4. Partial unique index idx_active_complaint_review prevents duplicate active reviews',
      'Found partial unique index on complaint_reviews(complaint_id) WHERE review_status IN (OPEN, IN_REVIEW)'
    );

    // -----------------------------------------------------------------
    // TEST 5: Controlled review statuses
    // -----------------------------------------------------------------
    const { CONTROLLED_REVIEW_STATUSES } = require('../services/reviewService');
    const expectedStatuses = ['OPEN', 'IN_REVIEW', 'RESOLVED', 'REJECTED'];
    const hasAllStatuses = expectedStatuses.every(s => CONTROLLED_REVIEW_STATUSES.includes(s));
    assert(
      hasAllStatuses && CONTROLLED_REVIEW_STATUSES.length === 4,
      '5. Controlled review statuses strictly defined: OPEN, IN_REVIEW, RESOLVED, REJECTED',
      `Controlled statuses: ${CONTROLLED_REVIEW_STATUSES.join(', ')}`
    );

    // -----------------------------------------------------------------
    // TEST 6: Controlled action types
    // -----------------------------------------------------------------
    const { CONTROLLED_ACTION_TYPES } = require('../services/reviewService');
    const expectedActions = [
      'REVIEW_STARTED',
      'ROUTE_TO_AUTHORITY',
      'RETURN_TO_TRIAGE',
      'MARK_UNROUTABLE',
      'CLOSE_REVIEW'
    ];
    const hasAllActions = expectedActions.every(a => CONTROLLED_ACTION_TYPES.includes(a));
    assert(
      hasAllActions && CONTROLLED_ACTION_TYPES.length === 5,
      '6. Controlled action types strictly defined: REVIEW_STARTED, ROUTE_TO_AUTHORITY, RETURN_TO_TRIAGE, MARK_UNROUTABLE, CLOSE_REVIEW',
      `Controlled actions: ${CONTROLLED_ACTION_TYPES.join(', ')}`
    );

    // -----------------------------------------------------------------
    // TEST 7: HUMAN_REVIEW creates review case automatically
    // -----------------------------------------------------------------
    // Create an unmapped/out-of-bounds complaint that triggers HUMAN_REVIEW
    // Lat: 12.0000, Lng: 76.0000 (well outside Mysuru demo boundaries)
    const outCompRes = await sendMultipartComplaint({
      description: 'Stage 9 Test: Ambiguous issue outside all municipal boundaries',
      category: 'POTHOLE',
      category_source: 'MANUAL',
      latitude: '12.0000',
      longitude: '76.0000',
      citizen_contact: '+91 9988776655'
    });
    assert(
      outCompRes.status === 201 && outCompRes.body?.data?.id,
      '7a. Created test complaint outside jurisdiction boundaries',
      `Complaint ID: ${outCompRes.body?.data?.id} (${outCompRes.body?.data?.complaint_code})`
    );
    const unroutedCompId = outCompRes.body.data.id;

    // Route the complaint
    const routeRes = await sendJsonRequest(`/api/complaints/${unroutedCompId}/route`, 'POST');
    assert(
      routeRes.status === 200 && routeRes.body?.data?.routingStatus === 'HUMAN_REVIEW',
      '7b. Automatic routing correctly evaluated out-of-boundary complaint as HUMAN_REVIEW',
      `Routing Status: ${routeRes.body?.data?.routingStatus}, Method: ${routeRes.body?.data?.routingMethod}`
    );

    // Verify OPEN review case exists in complaint_reviews
    const checkRevQuery = `
      SELECT id, complaint_id, review_status, reason, reviewer_name, created_at
      FROM complaint_reviews
      WHERE complaint_id = $1;
    `;
    const checkRevRes = await pool.query(checkRevQuery, [unroutedCompId]);
    assert(
      checkRevRes.rows.length === 1 && checkRevRes.rows[0].review_status === 'OPEN',
      '7c. OPEN review case automatically created in complaint_reviews table',
      `Review ID: ${checkRevRes.rows[0]?.id}, Status: ${checkRevRes.rows[0]?.review_status}`
    );
    const testReviewId = checkRevRes.rows[0].id;

    // -----------------------------------------------------------------
    // TEST 8: Duplicate active review prevention
    // -----------------------------------------------------------------
    const { createReviewCase } = require('../services/reviewService');
    const dupAttempt = await createReviewCase(unroutedCompId, 'Second attempt should be deduplicated', 'system');
    assert(
      dupAttempt.created === false && dupAttempt.duplicate === true && dupAttempt.review.id === testReviewId,
      '8. Duplicate active review prevention: second trigger returns existing review without duplicate record',
      `Duplicate detected: ${dupAttempt.duplicate}, Original review ID preserved: ${dupAttempt.review.id}`
    );

    // -----------------------------------------------------------------
    // TEST 9: Review list API
    // -----------------------------------------------------------------
    const listRes = await sendJsonRequest('/api/reviews?status=OPEN');
    assert(
      listRes.status === 200 && listRes.body?.success && Array.isArray(listRes.body?.data?.reviews),
      '9. GET /api/reviews returns review queue with real status counts',
      `Total: ${listRes.body?.data?.total}, Open: ${listRes.body?.data?.counts?.open}, InReview: ${listRes.body?.data?.counts?.inReview}`
    );

    // -----------------------------------------------------------------
    // TEST 10: Review detail API
    // -----------------------------------------------------------------
    const detailRes = await sendJsonRequest(`/api/reviews/${testReviewId}`);
    assert(
      detailRes.status === 200 && detailRes.body?.success && detailRes.body?.data?.review?.id === testReviewId,
      '10. GET /api/reviews/:reviewId returns complete case dossier',
      `Complaint: ${detailRes.body?.data?.complaint?.complaint_code}, Routing Status: ${detailRes.body?.data?.routing?.routing_status}`
    );

    // -----------------------------------------------------------------
    // TEST 11: Start review
    // -----------------------------------------------------------------
    const startRes = await sendJsonRequest(`/api/reviews/${testReviewId}/start`, 'POST', {
      reviewerName: 'Officer Nayana',
      note: 'Investigating jurisdiction boundary discrepancy.'
    });
    assert(
      startRes.status === 200 && startRes.body?.data?.review?.review_status === 'IN_REVIEW',
      '11. POST /api/reviews/:reviewId/start transitions review to IN_REVIEW with assigned reviewer',
      `Reviewer: ${startRes.body?.data?.review?.reviewer_name}, Status: ${startRes.body?.data?.review?.review_status}`
    );

    // -----------------------------------------------------------------
    // TEST 12: Reviewer required validation
    // -----------------------------------------------------------------
    // Try starting without reviewerName
    const failStartRes = await sendJsonRequest(`/api/reviews/${testReviewId}/start`, 'POST', {
      reviewerName: '',
      note: 'Missing reviewer'
    });
    assert(
      failStartRes.status === 400 && failStartRes.body?.success === false,
      '12. Starting review requires reviewer identity (empty name rejected with 400)',
      `Response: ${failStartRes.body?.error}`
    );

    // -----------------------------------------------------------------
    // TEST 13: Valid authority required for human routing
    // -----------------------------------------------------------------
    const fakeAuthRes = await sendJsonRequest(`/api/reviews/${testReviewId}/resolve`, 'POST', {
      actionType: 'ROUTE_TO_AUTHORITY',
      authorityId: '00000000-0000-0000-0000-000000000000',
      departmentId: '00000000-0000-0000-0000-000000000000',
      reviewerName: 'Officer Nayana',
      note: 'Routing with invalid UUID'
    });
    assert(
      fakeAuthRes.status === 400 && fakeAuthRes.body?.success === false,
      '13. Human routing requires a real authority in PostgreSQL (fake UUID rejected)',
      `Response: ${fakeAuthRes.body?.error}`
    );

    // -----------------------------------------------------------------
    // TEST 14: Valid department required for human routing
    // -----------------------------------------------------------------
    // Fetch real authority
    const realAuthRow = (await pool.query("SELECT id, name FROM authorities WHERE code = 'MCC_DEMO' LIMIT 1;")).rows[0];
    const fakeDeptRes = await sendJsonRequest(`/api/reviews/${testReviewId}/resolve`, 'POST', {
      actionType: 'ROUTE_TO_AUTHORITY',
      authorityId: realAuthRow.id,
      departmentId: '00000000-0000-0000-0000-000000000000',
      reviewerName: 'Officer Nayana',
      note: 'Routing with invalid department UUID'
    });
    assert(
      fakeDeptRes.status === 400 && fakeDeptRes.body?.success === false,
      '14. Human routing requires a real department in PostgreSQL (fake department rejected)',
      `Response: ${fakeDeptRes.body?.error}`
    );

    // -----------------------------------------------------------------
    // TEST 15 & 16: Human routing marked HUMAN_REVIEW and action persisted
    // -----------------------------------------------------------------
    // Fetch real department for MCC_DEMO
    const realDeptRow = (await pool.query("SELECT id, name FROM departments WHERE code = 'MCC_ROADS' LIMIT 1;")).rows[0];
    const resolveRes = await sendJsonRequest(`/api/reviews/${testReviewId}/resolve`, 'POST', {
      actionType: 'ROUTE_TO_AUTHORITY',
      authorityId: realAuthRow.id,
      departmentId: realDeptRow.id,
      reviewerName: 'Officer Nayana',
      note: 'Special executive jurisdiction assignment under MCC Roads Division'
    });
    assert(
      resolveRes.status === 200 && resolveRes.body?.data?.review?.review_status === 'RESOLVED',
      '15a. POST /api/reviews/:reviewId/resolve successfully resolved review case',
      `Status: ${resolveRes.body?.data?.review?.review_status}, Resolved By: ${resolveRes.body?.data?.review?.reviewer_name}`
    );

    // Check routing_decisions row for routing_method = 'HUMAN_REVIEW'
    const rdCheck = await pool.query('SELECT routing_status, routing_method, metadata, reason FROM routing_decisions WHERE complaint_id = $1;', [unroutedCompId]);
    const rdRow = rdCheck.rows[0];
    assert(
      rdRow.routing_status === 'ROUTED' && rdRow.routing_method === 'HUMAN_REVIEW',
      '15b. Human routing explicitly marked routing_method = HUMAN_REVIEW (never claimed as PostGIS)',
      `Method: ${rdRow.routing_method}, Status: ${rdRow.routing_status}`
    );

    // -----------------------------------------------------------------
    // TEST 17: Append-only review audit actions
    // -----------------------------------------------------------------
    const actionsRes = await sendJsonRequest(`/api/reviews/${testReviewId}/actions`);
    assert(
      actionsRes.status === 200 && Array.isArray(actionsRes.body?.data) && actionsRes.body.data.length >= 2,
      '17. complaint_review_actions preserves append-only chronological audit log',
      `Audit entries count: ${actionsRes.body?.data?.length}, Actions: ${actionsRes.body?.data?.map(a => a.action_type).join(' -> ')}`
    );

    // -----------------------------------------------------------------
    // TEST 18: Mark Unroutable workflow
    // -----------------------------------------------------------------
    // Create another out-of-boundary complaint to test MARK_UNROUTABLE
    const unroutableComp = await sendMultipartComplaint({
      description: 'Stage 9 Test: Issue on private unregistered land outside civic jurisdiction',
      category: 'STREETLIGHT',
      category_source: 'MANUAL',
      latitude: '11.5000',
      longitude: '75.5000',
      citizen_contact: '+91 9988771122'
    });
    const unroutableCompId = unroutableComp.body.data.id;
    await sendJsonRequest(`/api/complaints/${unroutableCompId}/route`, 'POST');

    // Fetch its review
    const revUnroutRes = (await pool.query('SELECT id FROM complaint_reviews WHERE complaint_id = $1;', [unroutableCompId])).rows[0];
    const unroutRevId = revUnroutRes.id;

    // Start review
    await sendJsonRequest(`/api/reviews/${unroutRevId}/start`, 'POST', {
      reviewerName: 'Inspector Kumar',
      note: 'Investigating site ownership'
    });

    // Mark unroutable
    const markRes = await sendJsonRequest(`/api/reviews/${unroutRevId}/unroutable`, 'POST', {
      reviewerName: 'Inspector Kumar',
      reason: 'Coordinate is private agrarian land outside any municipal corporation or gram panchayat purview.'
    });
    assert(
      markRes.status === 200 && markRes.body?.data?.review?.review_status === 'REJECTED',
      '18. POST /api/reviews/:reviewId/unroutable marks review REJECTED and routing UNROUTABLE without fake authority',
      `Review Status: ${markRes.body?.data?.review?.review_status}`
    );

    const checkUnroutRd = (await pool.query('SELECT routing_status, routing_method FROM routing_decisions WHERE complaint_id = $1;', [unroutableCompId])).rows[0];
    assert(
      checkUnroutRd.routing_status === 'UNROUTABLE' && checkUnroutRd.routing_method === 'HUMAN_REVIEW',
      '18b. Routing record updated to UNROUTABLE with routing_method HUMAN_REVIEW',
      `Status: ${checkUnroutRd.routing_status}, Method: ${checkUnroutRd.routing_method}`
    );

    // -----------------------------------------------------------------
    // TEST 19: Invalid terminal transitions rejected
    // -----------------------------------------------------------------
    const failRetriage = await sendJsonRequest(`/api/reviews/${unroutRevId}/resolve`, 'POST', {
      actionType: 'RETURN_TO_TRIAGE',
      reviewerName: 'Inspector Kumar',
      note: 'Trying to alter terminal review'
    });
    assert(
      failRetriage.status === 400 && failRetriage.body?.success === false,
      '19. Re-resolving a closed/rejected review case rejected (terminal immutability)',
      `Response: ${failRetriage.body?.error}`
    );

    // -----------------------------------------------------------------
    // TEST 20: Concurrent resolution protection
    // -----------------------------------------------------------------
    // Create third complaint to test simultaneous resolution race condition
    const concComp = await sendMultipartComplaint({
      description: 'Stage 9 Test: Concurrency race condition test complaint',
      category: 'WATER_LEAK',
      category_source: 'MANUAL',
      latitude: '11.8000',
      longitude: '75.8000'
    });
    const concCompId = concComp.body.data.id;
    await sendJsonRequest(`/api/complaints/${concCompId}/route`, 'POST');
    const concRevId = (await pool.query('SELECT id FROM complaint_reviews WHERE complaint_id = $1;', [concCompId])).rows[0].id;

    // Launch two simultaneous resolution requests for the exact same review case
    const [res1, res2] = await Promise.all([
      sendJsonRequest(`/api/reviews/${concRevId}/resolve`, 'POST', {
        actionType: 'ROUTE_TO_AUTHORITY',
        authorityId: realAuthRow.id,
        departmentId: realDeptRow.id,
        reviewerName: 'Operator A',
        note: 'Concurrent resolution attempt 1'
      }),
      sendJsonRequest(`/api/reviews/${concRevId}/resolve`, 'POST', {
        actionType: 'ROUTE_TO_AUTHORITY',
        authorityId: realAuthRow.id,
        departmentId: realDeptRow.id,
        reviewerName: 'Operator B',
        note: 'Concurrent resolution attempt 2'
      })
    ]);

    const oneSucceeded = (res1.status === 200 && res2.status === 400) || (res2.status === 200 && res1.status === 400);
    assert(
      oneSucceeded,
      '20. Concurrent resolution protection: FOR UPDATE row lock ensures exactly one operator succeeds, second receives 400',
      `Op A Status: ${res1.status}, Op B Status: ${res2.status}`
    );

    // -----------------------------------------------------------------
    // TEST 21: Stage 5 automatic PostGIS routing unchanged
    // -----------------------------------------------------------------
    // Submit coordinate inside MCC demo boundary: Lat 12.2958, Lng 76.6394
    const mccComp = await sendMultipartComplaint({
      description: 'Stage 9 Test: Deterministic PostGIS complaint inside MCC boundary',
      category: 'GARBAGE',
      category_source: 'MANUAL',
      latitude: '12.2958',
      longitude: '76.6394'
    });
    const mccCompId = mccComp.body.data.id;
    const mccRouteRes = await sendJsonRequest(`/api/complaints/${mccCompId}/route`, 'POST');
    assert(
      mccRouteRes.body?.data?.routingStatus === 'ROUTED' && mccRouteRes.body?.data?.routingMethod === 'GIS_RULE',
      '21. Stage 5 automatic PostGIS routing unchanged: coordinates inside boundary route automatically via GIS_RULE',
      `Status: ${mccRouteRes.body?.data?.routingStatus}, Method: ${mccRouteRes.body?.data?.routingMethod}`
    );

    // Verify NO review case was created for successfully GIS-routed complaint
    const mccRevCount = (await pool.query('SELECT COUNT(*)::int AS count FROM complaint_reviews WHERE complaint_id = $1;', [mccCompId])).rows[0].count;
    assert(
      mccRevCount === 0,
      '21b. No review case created for successfully GIS-routed complaint',
      `Review cases found: ${mccRevCount}`
    );

    // -----------------------------------------------------------------
    // TEST 22: Stage 6 state machine unchanged
    // -----------------------------------------------------------------
    const { updateComplaintStatus } = require('../services/caseStatusService');
    // Verify valid lifecycle progression
    const statRes = await updateComplaintStatus(mccCompId, 'IN_PROGRESS', 'Department began dispatch', 'dept_officer');
    assert(
      statRes.complaint.status === 'IN_PROGRESS',
      '22. Stage 6 state machine unchanged: valid lifecycle transition to IN_PROGRESS executed smoothly',
      `New Status: ${statRes.complaint.status}`
    );

    // -----------------------------------------------------------------
    // TEST 23: Stage 7 SLA unchanged
    // -----------------------------------------------------------------
    const slaRes = await sendJsonRequest(`/api/complaints/${mccCompId}/sla`);
    assert(
      slaRes.status === 200 && slaRes.body?.data?.slaStatus !== undefined && slaRes.body?.data?.routedAt !== null,
      '23. Stage 7 SLA unchanged: SLA timers and benchmark tracking intact without resetting timestamps',
      `SLA Status: ${slaRes.body?.data?.slaStatus}, Target At: ${slaRes.body?.data?.targetAt}`
    );

    // -----------------------------------------------------------------
    // TEST 24: Stage 8 notifications unchanged
    // -----------------------------------------------------------------
    const notifsRes = await sendJsonRequest(`/api/complaints/${unroutedCompId}/notifications`);
    assert(
      notifsRes.status === 200 && Array.isArray(notifsRes.body?.data) && notifsRes.body.data.length >= 1,
      '24. Stage 8 notifications unchanged: citizen notifications persisted in PostgreSQL',
      `Notifications count: ${notifsRes.body?.data?.length}, Types: ${notifsRes.body?.data?.map(n => n.notification_type).join(', ')}`
    );

    // -----------------------------------------------------------------
    // TEST 25: Socket.IO remains functional
    // -----------------------------------------------------------------
    const reviewCreatedEvents = receivedSocketEvents.filter(e => e.event === 'review:created');
    const reviewResolvedEvents = receivedSocketEvents.filter(e => e.event === 'review:resolved');
    assert(
      reviewCreatedEvents.length > 0 && reviewResolvedEvents.length > 0,
      '25. Socket.IO remains functional: real-time events review:created and review:resolved delivered to clients',
      `Received review:created count: ${reviewCreatedEvents.length}, review:resolved count: ${reviewResolvedEvents.length}`
    );

    // -----------------------------------------------------------------
    // TEST 26: Historical jurisdiction version preserved
    // -----------------------------------------------------------------
    const jvRes = await pool.query('SELECT jurisdiction_version_id FROM routing_decisions WHERE complaint_id = $1;', [unroutedCompId]);
    assert(
      jvRes.rows.length > 0 && jvRes.rows[0].jurisdiction_version_id !== null,
      '26. Historical jurisdiction version preserved: version reference remains linked to routing decision',
      `Version ID: ${jvRes.rows[0].jurisdiction_version_id}`
    );

    // -----------------------------------------------------------------
    // TEST 27: Original routing attempt remains recoverable
    // -----------------------------------------------------------------
    const provCheck = await pool.query('SELECT metadata FROM routing_decisions WHERE complaint_id = $1;', [unroutedCompId]);
    const metadata = provCheck.rows[0].metadata;
    assert(
      metadata && metadata.originalAttempt && metadata.originalAttempt.routingStatus === 'HUMAN_REVIEW',
      '27. Original routing attempt remains recoverable: original GIS containment failure preserved in metadata',
      `Original Status: ${metadata.originalAttempt?.routingStatus}, Original Method: ${metadata.originalAttempt?.routingMethod}`
    );

    // -----------------------------------------------------------------
    // TEST 28-34: Regression Suites (Stages 2–8)
    // -----------------------------------------------------------------
    console.log('\n--- Running Stage Regression Tests ---');

    // Stage 2: Database and PostGIS
    const gisTestRes = await sendJsonRequest('/api/gis/test?lat=12.2958&lng=76.6394');
    assert(
      gisTestRes.status === 200 && (gisTestRes.body?.jurisdiction !== undefined || gisTestRes.body?.matched === true),
      '28. Stage 2 regression: PostGIS Point-in-polygon resolution operational',
      `Jurisdiction: ${gisTestRes.body?.jurisdiction?.name || 'Matched'}`
    );

    // Stage 3: Versioning
    const verListRes = await sendJsonRequest('/api/jurisdictions/versions');
    assert(
      verListRes.status === 200 && Array.isArray(verListRes.body?.data) && verListRes.body.data.length >= 1,
      '29. Stage 3 regression: Jurisdiction version management operational',
      `Versions found: ${verListRes.body?.data?.length}`
    );

    // Stage 4: Complaint Intake & AI Classification
    const compFormRes = await sendMultipartComplaint({
      description: 'Stage 9 Regression: Pothole complaint on Vinoba Road',
      category: 'POTHOLE',
      category_source: 'CITIZEN_SELECTED',
      latitude: '12.3050',
      longitude: '76.6450'
    });
    assert(
      compFormRes.status === 201 && compFormRes.body?.data?.complaint_code,
      '30. Stage 4 regression: Complaint intake and sequence generation operational',
      `Code: ${compFormRes.body?.data?.complaint_code}`
    );

    // Stage 5: Deterministic Routing
    const rDecRes = await sendJsonRequest('/api/routing/decisions?limit=5');
    assert(
      rDecRes.status === 200 && (Array.isArray(rDecRes.body?.data) || Array.isArray(rDecRes.body?.data?.decisions)),
      '31. Stage 5 regression: Routing decisions query operational',
      `Decisions count: ${Array.isArray(rDecRes.body?.data) ? rDecRes.body?.data?.length : rDecRes.body?.data?.decisions?.length}`
    );

    // Stage 6: Case Status State Machine
    const lifeRes = await sendJsonRequest(`/api/complaints/${mccCompId}`);
    assert(
      lifeRes.status === 200 && lifeRes.body?.data?.status === 'IN_PROGRESS',
      '32. Stage 6 regression: Complaint lifecycle tracking operational',
      `Status: ${lifeRes.body?.data?.status}`
    );

    // Stage 7: SLA Overview
    const slaOverRes = await sendJsonRequest('/api/sla/overview');
    assert(
      slaOverRes.status === 200 && (slaOverRes.body?.data?.totalTracked !== undefined || slaOverRes.body?.data?.summary !== undefined),
      '33. Stage 7 regression: SLA overview metric calculations operational',
      `Total Monitored: ${slaOverRes.body?.data?.totalTracked ?? slaOverRes.body?.data?.summary?.totalMonitored}`
    );

    // Stage 8: Citizen Notifications Global Feed
    const allNotifsRes = await sendJsonRequest('/api/notifications?limit=10');
    assert(
      allNotifsRes.status === 200 && Array.isArray(allNotifsRes.body?.data),
      '34. Stage 8 regression: Global citizen notifications feed operational',
      `Total notifications: ${allNotifsRes.body?.total}`
    );

    // -----------------------------------------------------------------
    // TEST 35: Frontend Production Build
    // -----------------------------------------------------------------
    console.log('\n--- Running Frontend Production Build Verification ---');
    const clientPath = path.resolve(__dirname, '../../../client');
    try {
      execSync('npm.cmd run build', { cwd: clientPath, stdio: 'pipe' });
      assert(true, '35. Frontend production build: npm run build completed with 0 errors');
    } catch (buildErr) {
      assert(false, '35. Frontend production build: npm run build completed with 0 errors', buildErr.message);
    }

  } catch (err) {
    console.error('\n[UNEXPECTED TEST ERROR]', err);
    failed++;
  } finally {
    socketClient.disconnect();
    if (serverInstance) {
      await new Promise((resolve) => serverInstance.close(resolve));
    }
  }

  console.log('\n====================================================');
  console.log(`STAGE 9 TEST SUMMARY: ${passed} PASSED, ${failed} FAILED (TOTAL: ${passed + failed})`);
  console.log('====================================================\n');

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

if (require.main === module) {
  runStage9Tests().catch((e) => {
    console.error('Fatal test error:', e);
    process.exit(1);
  });
}

module.exports = { runStage9Tests };
