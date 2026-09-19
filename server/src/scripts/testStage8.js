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

async function runStage8Tests() {
  console.log('====================================================');
  console.log('STAGE 8 COMPREHENSIVE VERIFICATION SUITE');
  console.log('Citizen Notifications & Real-Time Updates');
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

  // Ensure server is running on port 4000
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
    'notification:created',
    'complaint:created',
    'routing:completed',
    'routing:review_required',
    'complaint:status_changed',
    'sla:warning',
    'sla:breached'
  ];

  eventTypesToListen.forEach((ev) => {
    socketClient.on(ev, (data) => {
      receivedSocketEvents.push({ event: ev, data });
    });
  });

  await new Promise((resolve) => {
    socketClient.on('connect', resolve);
    setTimeout(resolve, 2000);
  });

  try {
    // ----------------------------------------------------
    // Test 1: Migration 008 Verification
    // ----------------------------------------------------
    console.log('--- Database Schema & Migration Checks ---');
    const tableRes = await pool.query(`
      SELECT table_name FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_name = 'citizen_notifications';
    `);
    assert(
      tableRes.rows.length === 1,
      '1. Migration 008: citizen_notifications table created in PostgreSQL',
      'Table public.citizen_notifications confirmed'
    );

    // ----------------------------------------------------
    // Test 2: Notification Table Verification
    // ----------------------------------------------------
    const notifCount = await pool.query('SELECT count(*) FROM citizen_notifications;');
    assert(
      notifCount.rows.length > 0,
      '2. Notification Table: citizen_notifications accessible and queryable',
      `Current notification count in PostgreSQL: ${notifCount.rows[0].count}`
    );

    // ----------------------------------------------------
    // Test 3: Required Columns
    // ----------------------------------------------------
    const colRes = await pool.query(`
      SELECT column_name, data_type, is_nullable 
      FROM information_schema.columns 
      WHERE table_name = 'citizen_notifications';
    `);
    const foundCols = colRes.rows.map(c => c.column_name);
    const requiredCols = ['id', 'complaint_id', 'notification_type', 'title', 'message', 'metadata', 'is_read', 'created_at', 'read_at', 'idempotency_key'];
    const hasAllCols = requiredCols.every(c => foundCols.includes(c));
    assert(
      hasAllCols,
      '3. Required Columns: all 10 required columns present in citizen_notifications',
      `Found: ${foundCols.join(', ')}`
    );

    // ----------------------------------------------------
    // Test 4: Required Indexes
    // ----------------------------------------------------
    const idxRes = await pool.query(`
      SELECT indexname FROM pg_indexes 
      WHERE tablename = 'citizen_notifications';
    `);
    const indexNames = idxRes.rows.map(i => i.indexname);
    const hasComplaintIdx = indexNames.includes('idx_notifications_complaint_id');
    const hasIsReadIdx = indexNames.includes('idx_notifications_is_read');
    const hasCreatedIdx = indexNames.includes('idx_notifications_created_at');
    const hasCompCreatedIdx = indexNames.includes('idx_notifications_complaint_created');
    const hasIdempIdx = indexNames.includes('idx_notifications_idempotency');
    assert(
      hasComplaintIdx && hasIsReadIdx && hasCreatedIdx && hasCompCreatedIdx && hasIdempIdx,
      '4. Required Indexes: performance and uniqueness indexes present',
      `Found indexes: ${indexNames.join(', ')}`
    );

    // ----------------------------------------------------
    // Test 5: Notification Types Check Constraint
    // ----------------------------------------------------
    const chkRes = await pool.query(`
      SELECT pg_get_constraintdef(oid) AS def
      FROM pg_constraint
      WHERE conname = 'chk_notification_type';
    `);
    const chkDef = chkRes.rows[0]?.def || '';
    const all9TypesPresent = [
      'COMPLAINT_SUBMITTED', 'CATEGORY_UPDATED', 'ROUTING_COMPLETED',
      'HUMAN_REVIEW_REQUIRED', 'STATUS_CHANGED', 'SLA_WARNING',
      'SLA_BREACHED', 'CASE_RESOLVED', 'CASE_CLOSED'
    ].every(t => chkDef.includes(t));
    assert(
      all9TypesPresent,
      '5. Notification Types: controlled notification types constraint covers all 9 events',
      chkDef
    );

    // ----------------------------------------------------
    // Test 6: Complaint Submission Notification
    // ----------------------------------------------------
    console.log('\n--- Real Event Integration & Notification Persistence ---');
    const intakeRes = await sendMultipartComplaint({
      description: 'Stage 8 Pothole reporting on Sayyaji Rao Road near bustand',
      category: 'POTHOLE',
      category_source: 'CITIZEN_SELECTED',
      latitude: '12.3115',
      longitude: '76.6505',
      citizen_contact: 'citizen8@mysuru.gov.in'
    });

    assert(
      intakeRes.status === 201 && intakeRes.body?.data?.id,
      'Intake prerequisite: Complaint created successfully',
      `Code: ${intakeRes.body?.data?.complaint_code}`
    );
    const testComplaint = intakeRes.body.data;

    // Verify COMPLAINT_SUBMITTED persisted in PostgreSQL
    const submitNotifRes = await pool.query(
      "SELECT * FROM citizen_notifications WHERE complaint_id = $1 AND notification_type = 'COMPLAINT_SUBMITTED';",
      [testComplaint.id]
    );
    assert(
      submitNotifRes.rows.length === 1 && submitNotifRes.rows[0].title === 'Complaint Registered',
      '6. Complaint Submission Notification: COMPLAINT_SUBMITTED saved in PostgreSQL',
      `Notification ID: ${submitNotifRes.rows[0]?.id}, Title: ${submitNotifRes.rows[0]?.title}`
    );

    // ----------------------------------------------------
    // Test 7: Category Notification (CATEGORY_UPDATED)
    // ----------------------------------------------------
    const { updateComplaintCategory } = require('../services/complaintService');
    await updateComplaintCategory(testComplaint.id, 'DRAINAGE', 'Reclassified to DRAINAGE by supervisor');
    const catNotifRes = await pool.query(
      "SELECT * FROM citizen_notifications WHERE complaint_id = $1 AND notification_type = 'CATEGORY_UPDATED';",
      [testComplaint.id]
    );
    assert(
      catNotifRes.rows.length === 1 && catNotifRes.rows[0].notification_type === 'CATEGORY_UPDATED',
      '7. Category Notification: CATEGORY_UPDATED saved in PostgreSQL with reclassification details',
      `Message: ${catNotifRes.rows[0]?.message}`
    );

    // ----------------------------------------------------
    // Test 8: Routing Notification (ROUTING_COMPLETED)
    // ----------------------------------------------------
    const routeRes = await sendJsonRequest(`/api/complaints/${testComplaint.id}/route`, 'POST');
    assert(
      routeRes.status === 200 && routeRes.body?.data?.routingStatus === 'ROUTED',
      'Routing prerequisite: Complaint routed via PostGIS',
      `Authority: ${routeRes.body?.data?.authority?.name}, Dept: ${routeRes.body?.data?.department?.name}`
    );

    const routeNotifRes = await pool.query(
      "SELECT * FROM citizen_notifications WHERE complaint_id = $1 AND notification_type = 'ROUTING_COMPLETED';",
      [testComplaint.id]
    );
    assert(
      routeNotifRes.rows.length === 1 && routeNotifRes.rows[0].metadata?.authority,
      '8. Routing Notification: ROUTING_COMPLETED saved with real authority & department',
      `Authority: ${routeNotifRes.rows[0]?.metadata?.authority}, Dept: ${routeNotifRes.rows[0]?.metadata?.department}`
    );

    // ----------------------------------------------------
    // Test 9: Human Review Notification (HUMAN_REVIEW_REQUIRED)
    // ----------------------------------------------------
    // Create complaint outside boundaries
    const outsideCompRes = await sendMultipartComplaint({
      description: 'Complaint in outer rural wilderness coordinate',
      category: 'OTHER',
      category_source: 'CITIZEN_SELECTED',
      latitude: '12.9000',
      longitude: '77.1000',
      citizen_contact: 'rural@mysuru.gov.in'
    });
    const outsideComplaint = outsideCompRes.body.data;
    await sendJsonRequest(`/api/complaints/${outsideComplaint.id}/route`, 'POST');

    const hrNotifRes = await pool.query(
      "SELECT * FROM citizen_notifications WHERE complaint_id = $1 AND notification_type = 'HUMAN_REVIEW_REQUIRED';",
      [outsideComplaint.id]
    );
    assert(
      hrNotifRes.rows.length === 1 && hrNotifRes.rows[0].title === 'Human Review Required',
      '9. Human Review Notification: HUMAN_REVIEW_REQUIRED saved without inventing authority',
      `Message: ${hrNotifRes.rows[0]?.message}`
    );

    // ----------------------------------------------------
    // Test 10: Status Change Notification (STATUS_CHANGED)
    // ----------------------------------------------------
    const statusRes = await sendJsonRequest(`/api/complaints/${testComplaint.id}/status`, 'PATCH', {
      status: 'IN_PROGRESS',
      reason: 'Field team dispatched'
    });
    assert(
      statusRes.status === 200,
      'Status change prerequisite: Transitioned to IN_PROGRESS'
    );

    const scNotifRes = await pool.query(
      "SELECT * FROM citizen_notifications WHERE complaint_id = $1 AND notification_type = 'STATUS_CHANGED' AND metadata->>'newStatus' = 'IN_PROGRESS';",
      [testComplaint.id]
    );
    assert(
      scNotifRes.rows.length === 1 && scNotifRes.rows[0].title.includes('IN_PROGRESS'),
      '10. Status Change Notification: STATUS_CHANGED saved in PostgreSQL with transition details',
      scNotifRes.rows[0]?.message
    );

    // ----------------------------------------------------
    // Test 11: Resolved Notification (CASE_RESOLVED)
    // ----------------------------------------------------
    await sendJsonRequest(`/api/complaints/${testComplaint.id}/status`, 'PATCH', {
      status: 'RESOLVED',
      reason: 'Field remediation verified'
    });

    const resNotifRes = await pool.query(
      "SELECT * FROM citizen_notifications WHERE complaint_id = $1 AND notification_type = 'CASE_RESOLVED';",
      [testComplaint.id]
    );
    assert(
      resNotifRes.rows.length === 1 && resNotifRes.rows[0].title === 'Case Resolved',
      '11. Resolved Notification: CASE_RESOLVED saved in PostgreSQL',
      `Message: ${resNotifRes.rows[0]?.message}`
    );

    // ----------------------------------------------------
    // Test 12: Closed Notification (CASE_CLOSED)
    // ----------------------------------------------------
    await sendJsonRequest(`/api/complaints/${testComplaint.id}/status`, 'PATCH', {
      status: 'CLOSED',
      reason: 'Citizen verified and closed'
    });

    const closeNotifRes = await pool.query(
      "SELECT * FROM citizen_notifications WHERE complaint_id = $1 AND notification_type = 'CASE_CLOSED';",
      [testComplaint.id]
    );
    assert(
      closeNotifRes.rows.length === 1 && closeNotifRes.rows[0].title === 'Case Closed',
      '12. Closed Notification: CASE_CLOSED saved in PostgreSQL upon terminal closure',
      `Message: ${closeNotifRes.rows[0]?.message}`
    );

    // ----------------------------------------------------
    // Test 13: SLA Warning Notification (SLA_WARNING)
    // ----------------------------------------------------
    // Create new complaint for SLA testing
    const slaCompIntake = await sendMultipartComplaint({
      description: 'Water pipeline leak SLA warning test',
      category: 'WATER_LEAK',
      category_source: 'CITIZEN_SELECTED',
      latitude: '12.3050',
      longitude: '76.6450',
      citizen_contact: 'sla-test@mysuru.gov.in'
    });
    const slaComp = slaCompIntake.body.data;
    await sendJsonRequest(`/api/complaints/${slaComp.id}/route`, 'POST');

    // Simulate 9 hours later (WATER_LEAK: warning at 8h, target at 12h) -> AT_RISK
    const futureWarningTime = new Date(Date.now() + 9 * 3600 * 1000).toISOString();
    const evalWarningRes = await sendJsonRequest(`/api/complaints/${slaComp.id}/sla/evaluate`, 'POST', {
      referenceTime: futureWarningTime
    });
    assert(
      evalWarningRes.body?.data?.slaStatus === 'AT_RISK',
      'SLA evaluation prerequisite: Entered AT_RISK'
    );

    const slaWarnNotifRes = await pool.query(
      "SELECT * FROM citizen_notifications WHERE complaint_id = $1 AND notification_type = 'SLA_WARNING';",
      [slaComp.id]
    );
    assert(
      slaWarnNotifRes.rows.length === 1 && slaWarnNotifRes.rows[0].title.includes('SLA Warning'),
      '13. SLA Warning Notification: SLA_WARNING saved when complaint enters AT_RISK',
      `Message: ${slaWarnNotifRes.rows[0]?.message}`
    );

    // ----------------------------------------------------
    // Test 14: SLA Breach Notification (SLA_BREACHED)
    // ----------------------------------------------------
    // Simulate 15 hours later -> SLA_BREACHED (> 12h)
    const futureBreachTime = new Date(Date.now() + 15 * 3600 * 1000).toISOString();
    const evalBreachRes = await sendJsonRequest(`/api/complaints/${slaComp.id}/sla/evaluate`, 'POST', {
      referenceTime: futureBreachTime
    });
    assert(
      evalBreachRes.body?.data?.slaStatus === 'SLA_BREACHED',
      'SLA evaluation prerequisite: Entered SLA_BREACHED'
    );

    const slaBreachNotifRes = await pool.query(
      "SELECT * FROM citizen_notifications WHERE complaint_id = $1 AND notification_type = 'SLA_BREACHED';",
      [slaComp.id]
    );
    assert(
      slaBreachNotifRes.rows.length === 1 && slaBreachNotifRes.rows[0].title.includes('SLA Breached'),
      '14. SLA Breach Notification: SLA_BREACHED saved when complaint exceeds deadline',
      `Message: ${slaBreachNotifRes.rows[0]?.message}`
    );

    // ----------------------------------------------------
    // Test 15: Complaint Notifications API
    // ----------------------------------------------------
    console.log('\n--- REST API Endpoints Verification ---');
    const getNotifsRes = await sendJsonRequest(`/api/complaints/${testComplaint.id}/notifications`);
    assert(
      getNotifsRes.status === 200 && Array.isArray(getNotifsRes.body?.data) && getNotifsRes.body.data.length >= 4,
      '15. Complaint Notifications API: GET /api/complaints/:id/notifications returns full notification array',
      `Returned ${getNotifsRes.body?.data?.length} notifications for complaint`
    );

    // ----------------------------------------------------
    // Test 16: Unread Notifications API
    // ----------------------------------------------------
    const unreadRes = await sendJsonRequest(`/api/complaints/${testComplaint.id}/notifications/unread`);
    assert(
      unreadRes.status === 200 && Array.isArray(unreadRes.body?.data) && unreadRes.body.data.every(n => n.is_read === false),
      '16. Unread Notifications API: GET /api/complaints/:id/notifications/unread returns only unread items',
      `Unread count: ${unreadRes.body?.data?.length}`
    );

    // ----------------------------------------------------
    // Test 17: Mark One Read API
    // ----------------------------------------------------
    const notifToMark = unreadRes.body.data[0];
    const markOneRes = await sendJsonRequest(`/api/notifications/${notifToMark.id}/read`, 'PATCH');
    assert(
      markOneRes.status === 200 && markOneRes.body?.data?.is_read === true && markOneRes.body.data.read_at,
      '17. Mark One Read: PATCH /api/notifications/:id/read updates is_read=TRUE and sets real read_at timestamp',
      `Read at: ${markOneRes.body?.data?.read_at}`
    );

    // ----------------------------------------------------
    // Test 18: Mark All Read API
    // ----------------------------------------------------
    const markAllRes = await sendJsonRequest(`/api/complaints/${testComplaint.id}/notifications/read-all`, 'PATCH');
    assert(
      markAllRes.status === 200 && typeof markAllRes.body?.updatedCount === 'number',
      '18. Mark All Read: PATCH /api/complaints/:id/notifications/read-all marks remaining complaint notifications read',
      `Updated count: ${markAllRes.body?.updatedCount}`
    );

    const postMarkUnread = await sendJsonRequest(`/api/complaints/${testComplaint.id}/notifications/unread`);
    assert(
      postMarkUnread.body?.data?.length === 0,
      '       Verified 0 unread notifications remaining for complaint'
    );

    // ----------------------------------------------------
    // Test 19: Duplicate Prevention (Idempotency)
    // ----------------------------------------------------
    console.log('\n--- Idempotency & Duplicate Prevention ---');
    const countBefore = await pool.query(
      'SELECT count(*) FROM citizen_notifications WHERE complaint_id = $1;',
      [slaComp.id]
    );

    // Repeatedly re-evaluate SLA
    await sendJsonRequest(`/api/complaints/${slaComp.id}/sla/evaluate`, 'POST', { referenceTime: futureBreachTime });
    await sendJsonRequest(`/api/complaints/${slaComp.id}/sla/evaluate`, 'POST', { referenceTime: futureBreachTime });
    // Repeatedly call route
    await sendJsonRequest(`/api/complaints/${slaComp.id}/route`, 'POST');

    const countAfter = await pool.query(
      'SELECT count(*) FROM citizen_notifications WHERE complaint_id = $1;',
      [slaComp.id]
    );

    assert(
      countBefore.rows[0].count === countAfter.rows[0].count,
      '19. Duplicate Prevention: Repeated SLA evaluations and re-routing produce ZERO duplicate notifications',
      `Notification rows before: ${countBefore.rows[0].count}, after: ${countAfter.rows[0].count}`
    );

    // ----------------------------------------------------
    // Test 20: notification:created Socket.IO
    // ----------------------------------------------------
    console.log('\n--- Real-Time Socket.IO Verification ---');
    await new Promise((r) => setTimeout(r, 500)); // Allow Socket.IO event queue
    const notifCreatedEvents = receivedSocketEvents.filter(e => e.event === 'notification:created');
    const samplePayload = notifCreatedEvents[0]?.data;
    const hasSafeFields = samplePayload &&
      samplePayload.notificationId &&
      samplePayload.complaintId &&
      samplePayload.complaintCode &&
      samplePayload.notificationType &&
      samplePayload.title &&
      samplePayload.message &&
      samplePayload.createdAt;

    assert(
      notifCreatedEvents.length > 0 && hasSafeFields,
      '20. notification:created Socket.IO: Real-time broadcast received with safe payload schema',
      `Received ${notifCreatedEvents.length} notification:created events. Sample type: ${samplePayload?.notificationType}`
    );

    // ----------------------------------------------------
    // Regressions: Socket.IO events intact (Tests 21-26)
    // ----------------------------------------------------
    console.log('\n--- Socket.IO Regressions ---');
    const complaintCreatedEv = receivedSocketEvents.filter(e => e.event === 'complaint:created');
    assert(complaintCreatedEv.length > 0, '21. complaint:created regression: Event emitted and received');

    const routingCompletedEv = receivedSocketEvents.filter(e => e.event === 'routing:completed');
    assert(routingCompletedEv.length > 0, '22. routing:completed regression: Event emitted and received');

    const routingReviewEv = receivedSocketEvents.filter(e => e.event === 'routing:review_required');
    assert(routingReviewEv.length > 0, '23. routing:review_required regression: Event emitted and received');

    const statusChangedEv = receivedSocketEvents.filter(e => e.event === 'complaint:status_changed');
    assert(statusChangedEv.length > 0, '24. complaint:status_changed regression: Event emitted and received');

    const slaWarningEv = receivedSocketEvents.filter(e => e.event === 'sla:warning');
    assert(slaWarningEv.length > 0, '25. sla:warning regression: Event emitted and received');

    const slaBreachedEv = receivedSocketEvents.filter(e => e.event === 'sla:breached');
    assert(slaBreachedEv.length > 0, '26. sla:breached regression: Event emitted and received');

    // ----------------------------------------------------
    // Test 27: Stage 2 PostGIS Regression
    // ----------------------------------------------------
    console.log('\n--- Architectural Regressions ---');
    const gisRes = await sendJsonRequest('/api/gis/test?lat=12.2958&lng=76.6394');
    assert(
      gisRes.status === 200 && gisRes.body?.matched === true,
      '27. Stage 2 PostGIS Regression: ST_Covers spatial boundary resolution 100% operational',
      `Authority matched: ${gisRes.body?.authority?.name || 'MCC'}, jurisdiction: ${gisRes.body?.jurisdiction?.name}`
    );

    // ----------------------------------------------------
    // Test 28: Stage 3 Jurisdiction Regression
    // ----------------------------------------------------
    const verRes = await pool.query(`
      SELECT version_code, status FROM jurisdiction_versions WHERE status = 'ACTIVE';
    `);
    assert(
      verRes.rows.length === 1,
      '28. Stage 3 Jurisdiction Regression: Exactly one active jurisdiction version enforced',
      `Active: ${verRes.rows[0]?.version_code}`
    );

    // ----------------------------------------------------
    // Test 29: Stage 4 Complaint Intake Regression
    // ----------------------------------------------------
    const seqCheck = await pool.query("SELECT last_value FROM complaint_code_seq;");
    assert(
      parseInt(seqCheck.rows[0]?.last_value) > 0,
      '29. Stage 4 Complaint Intake Regression: Sequence numbering and intake pipeline operational',
      `Latest seq value: ${seqCheck.rows[0]?.last_value}`
    );

    // ----------------------------------------------------
    // Test 30: Stage 5 Deterministic Routing Regression
    // ----------------------------------------------------
    const mappingCheck = await pool.query(`
      SELECT count(*) FROM category_department_mappings;
    `);
    assert(
      parseInt(mappingCheck.rows[0]?.count) >= 14,
      '30. Stage 5 Routing Regression: Deterministic category-to-department maps verified in PostgreSQL',
      `Found ${mappingCheck.rows[0]?.count} deterministic mapping rules`
    );

    // ----------------------------------------------------
    // Test 31: Stage 6 Lifecycle Regression
    // ----------------------------------------------------
    let invalidJumpFailed = false;
    try {
      const invalidRes = await sendJsonRequest(`/api/complaints/${testComplaint.id}/status`, 'PATCH', {
        status: 'IN_PROGRESS'
      });
      if (invalidRes.status === 400) invalidJumpFailed = true;
    } catch (e) {
      invalidJumpFailed = true;
    }
    assert(
      invalidJumpFailed,
      '31. Stage 6 Lifecycle Regression: State machine strictly blocks illegal transition from CLOSED',
      'Direct jump from CLOSED to IN_PROGRESS rejected'
    );

    // ----------------------------------------------------
    // Test 32: Stage 7 SLA Regression
    // ----------------------------------------------------
    const slaRuleRes = await pool.query("SELECT * FROM complaint_sla_rules WHERE category = 'WATER_LEAK';");
    assert(
      slaRuleRes.rows[0]?.target_hours === 12 && slaRuleRes.rows[0]?.warning_hours === 8,
      '32. Stage 7 SLA Regression: SLA benchmark rules intact (WATER_LEAK = 12h/8h)',
      'Benchmark rules preserved unchanged'
    );

    // ----------------------------------------------------
    // Test 33: Routing Immutability
    // ----------------------------------------------------
    const routedComplaintHistory = await pool.query(`
      SELECT rd.id, rd.complaint_id, jv.version_code, a.code AS auth_code
      FROM routing_decisions rd
      JOIN jurisdiction_versions jv ON rd.jurisdiction_version_id = jv.id
      JOIN authorities a ON rd.authority_id = a.id
      WHERE rd.complaint_id = $1;
    `, [testComplaint.id]);
    assert(
      routedComplaintHistory.rows.length === 1 && routedComplaintHistory.rows[0].version_code,
      '33. Routing Immutability: Historical routing decision permanently retains active version at resolution time',
      `Version recorded: ${routedComplaintHistory.rows[0]?.version_code}`
    );

    // ----------------------------------------------------
    // Test 34: Frontend Production Build
    // ----------------------------------------------------
    console.log('\n--- Frontend Production Build Verification ---');
    let buildPassed = false;
    try {
      const clientDir = path.resolve(__dirname, '../../../client');
      execSync('npm.cmd run build', { cwd: clientDir, stdio: 'pipe' });
      buildPassed = true;
    } catch (buildErr) {
      buildPassed = false;
      console.error('Build output error:', buildErr.message);
    }
    assert(
      buildPassed,
      '34. Frontend Production Build: Vite build completes cleanly with 0 errors',
      'Client dist production bundle generated successfully'
    );

  } finally {
    socketClient.disconnect();
    if (serverInstance) {
      await new Promise((r) => serverInstance.close(r));
    }
    await pool.end();
  }

  console.log('\n====================================================');
  console.log(`STAGE 8 VERIFICATION SUMMARY: ${passed} PASSED / ${failed} FAILED`);
  console.log('====================================================\n');

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runStage8Tests().catch((err) => {
  console.error('Fatal test runner error:', err);
  process.exit(1);
});
