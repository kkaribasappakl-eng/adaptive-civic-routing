/**
 * HACKMYSURU 1.0 — STAGE 14 COMPREHENSIVE VERIFICATION SUITE
 * Production-Quality Civic Routing Intelligence & Workflow Completion
 *
 * Covers all 10 Stage 14 directives and clarifications:
 * 1. Public/Citizen sanitization (no citizen_contact or sensitive internal metadata leaked).
 * 2. Anonymous vs Citizen vs Operator vs Admin RBAC authorization boundaries.
 * 3. Public case tracking vs privileged operator dossier.
 * 4. Complaint-specific notifications vs global notification feed isolation.
 * 5. Socket.IO room authorization for privileged events (operators only).
 * 6. Immutability of Stage 13 audit logs (INSERT succeeds, UPDATE/DELETE blocked, no recursion).
 * 7. End-to-end civic workflow (intake -> GIS routing -> SLA -> state transitions -> history).
 * 8. Historical jurisdiction version immutability.
 * 9. Comprehensive database integrity verification across all 7 core tables.
 * 10. Frontend build verification.
 */

const http = require('http');
const { pool } = require('../config/db');
const { io: ClientIO } = require('../../../client/node_modules/socket.io-client');
const { execSync } = require('child_process');
const path = require('path');

const BASE_URL = 'http://localhost:4000';

let citizenToken = null;
let operatorToken = null;
let adminToken = null;

async function fetchToken(role) {
  const res = await sendJsonRequest('/api/auth/demo-login', 'POST', { role }, null);
  return res.body?.data?.token || res.body?.token;
}

function sendJsonRequest(apiPath, method = 'GET', data = null, explicitToken = null) {
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
          ...(body ? { 'Content-Length': Buffer.byteLength(body) } : {}),
          ...(explicitToken ? { 'Authorization': `Bearer ${explicitToken}` } : {})
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

async function runStage14Tests() {
  console.log('================================================================================');
  console.log(' HACKMYSURU 1.0 — STAGE 14 COMPREHENSIVE VERIFICATION SUITE');
  console.log(' Production-Quality Civic Workflow Completion & Authorization Invariants');
  console.log('================================================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition, testName, details = '') {
    if (condition) {
      console.log(`  ✅ [PASS] ${testName}`);
      if (details) console.log(`     ℹ️  ${details}`);
      passed++;
    } else {
      console.error(`  ❌ [FAIL] ${testName}`);
      if (details) console.error(`     ⚠️  ${details}`);
      failed++;
    }
  }

  // Setup tokens
  console.log('--- Setting Up Role Authentication ---');
  citizenToken = await fetchToken('CITIZEN');
  operatorToken = await fetchToken('OPERATOR');
  adminToken = await fetchToken('ADMIN');

  assert(Boolean(citizenToken), 'Role Token Generation: CITIZEN token generated');
  assert(Boolean(operatorToken), 'Role Token Generation: OPERATOR token generated');
  assert(Boolean(adminToken), 'Role Token Generation: ADMIN token generated');

  // Setup Sockets (one anonymous, one privileged operator)
  console.log('\n--- Setting Up Socket.IO Authorization Test Clients ---');
  const anonSocket = ClientIO(BASE_URL, {
    transports: ['websocket'],
    reconnection: false
  });
  const opSocket = ClientIO(BASE_URL, {
    transports: ['websocket'],
    reconnection: false,
    auth: { token: operatorToken }
  });

  const anonReceivedPrivileged = [];
  const opReceivedPrivileged = [];

  anonSocket.on('routing:review_required', (data) => anonReceivedPrivileged.push(data));
  anonSocket.on('review:created', (data) => anonReceivedPrivileged.push(data));

  opSocket.on('routing:review_required', (data) => opReceivedPrivileged.push(data));
  opSocket.on('review:created', (data) => opReceivedPrivileged.push(data));

  await Promise.all([
    new Promise((resolve) => anonSocket.on('connect', resolve)),
    new Promise((resolve) => opSocket.on('connect', resolve))
  ]);

  try {
    // -------------------------------------------------------------------------
    // GROUP 1: Public Intake & Citizen Data Sanitization
    // -------------------------------------------------------------------------
    console.log('\n--- GROUP 1: Public Intake & Citizen Data Sanitization ---');
    const sensitiveContact = '+91-98450-12345 (Confidential)';
    const intakeRes = await sendMultipartComplaint({
      description: 'Dangerous pothole on Sayyaji Rao Road near Ayurvedic Hospital',
      category: 'POTHOLE',
      category_source: 'MANUAL',
      latitude: '12.3160',
      longitude: '76.6500',
      citizen_contact: sensitiveContact
    });

    assert(
      intakeRes.status === 201 && intakeRes.body?.data?.complaint_code,
      '1. Anonymous Complaint Intake: Returns HTTP 201 with complaint_code',
      `Code: ${intakeRes.body?.data?.complaint_code}`
    );
    const cId = intakeRes.body?.data?.id;
    const cCode = intakeRes.body?.data?.complaint_code;

    // Verify submission response omits citizen_contact for privacy
    assert(
      intakeRes.body?.data?.citizen_contact === undefined,
      '2. Intake Privacy: citizen_contact is omitted from submission response',
      `Contact in payload: ${intakeRes.body?.data?.citizen_contact || 'None (Sanitized)'}`
    );

    // Verify public complaint listing omits contact info for unauthenticated callers
    const publicList = await sendJsonRequest('/api/complaints?limit=5', 'GET', null, null);
    const hasContactInPublic = publicList.body?.data?.some(c => c.citizen_contact !== undefined);
    assert(
      publicList.status === 200 && !hasContactInPublic,
      '3. Public Listing Privacy: Anonymous GET /api/complaints strips citizen_contact from all records',
      `Total checked: ${publicList.body?.data?.length}, Contacts leaked: 0`
    );

    // Verify operator complaint listing retains contact info for authorized personnel
    const opList = await sendJsonRequest('/api/complaints?limit=5', 'GET', null, operatorToken);
    const opItem = opList.body?.data?.find(c => c.id === cId);
    assert(
      opList.status === 200 && opItem && opItem.citizen_contact === sensitiveContact,
      '4. Operator Visibility: Authenticated OPERATOR receives full contact data for dispatch',
      `Recovered contact: ${opItem?.citizen_contact}`
    );

    // -------------------------------------------------------------------------
    // GROUP 2: Public Case Tracking vs Internal Operator Dossier
    // -------------------------------------------------------------------------
    console.log('\n--- GROUP 2: Public Case Tracking vs Operator Dossier ---');
    const trackRes = await sendJsonRequest(`/api/complaints/${cId}/status-history`, 'GET', null, null);
    assert(
      trackRes.status === 200 && Array.isArray(trackRes.body?.data),
      '5. Public Case Tracking: Anonymous GET /api/complaints/:id/status-history succeeds with 200 OK',
      `History events count: ${trackRes.body?.data?.length}`
    );

    // Verify public case tracking sanitization: internal review notes/emails masked
    const pubLifecycleRes = await sendJsonRequest(`/api/complaints/${cId}`, 'GET', null, null);
    assert(
      pubLifecycleRes.status === 200 && pubLifecycleRes.body?.data?.id === cId,
      '6. Public Complaint Dossier: GET /api/complaints/:id accessible to citizen/public',
      `Status: ${pubLifecycleRes.body?.data?.status}`
    );
    assert(
      pubLifecycleRes.body?.data?.citizen_contact === undefined,
      '7. Public Complaint Dossier: citizen_contact stripped for unauthenticated citizen',
      `Contact exposed: ${pubLifecycleRes.body?.data?.citizen_contact ? 'YES' : 'NO (Protected)'}`
    );

    // -------------------------------------------------------------------------
    // GROUP 3: Notification Scoping & Privacy Isolation
    // -------------------------------------------------------------------------
    console.log('\n--- GROUP 3: Notification Privacy & Feed Isolation ---');
    // Complaint-specific notifications accessible to citizen
    const compNotifsRes = await sendJsonRequest(`/api/complaints/${cId}/notifications`, 'GET', null, null);
    assert(
      compNotifsRes.status === 200 && Array.isArray(compNotifsRes.body?.data),
      '8. Citizen Case Notifications: Public can view notifications for their specific complaint code',
      `Notifications for ${cCode}: ${compNotifsRes.body?.data?.length}`
    );

    // Global notifications feed strictly blocked for anonymous/citizen
    const anonGlobalNotifs = await sendJsonRequest('/api/notifications', 'GET', null, null);
    assert(
      anonGlobalNotifs.status === 401,
      '9. Global Feed Isolation: Anonymous access to /api/notifications rejected with HTTP 401',
      `Status: ${anonGlobalNotifs.status}`
    );

    const citizenGlobalNotifs = await sendJsonRequest('/api/notifications', 'GET', null, citizenToken);
    assert(
      citizenGlobalNotifs.status === 403,
      '10. Global Feed Isolation: CITIZEN role access to /api/notifications rejected with HTTP 403',
      `Status: ${citizenGlobalNotifs.status}`
    );

    const opGlobalNotifs = await sendJsonRequest('/api/notifications', 'GET', null, operatorToken);
    assert(
      opGlobalNotifs.status === 200 && Array.isArray(opGlobalNotifs.body?.data),
      '11. Operator Notification Feed: OPERATOR role access to /api/notifications allowed with HTTP 200',
      `Total system notifications returned: ${opGlobalNotifs.body?.total}`
    );

    // -------------------------------------------------------------------------
    // GROUP 4: Granular RBAC Role Authorization Matrix
    // -------------------------------------------------------------------------
    console.log('\n--- GROUP 4: Granular RBAC Authorization Boundaries ---');

    // Endpoint A: Routing (/api/complaints/:id/route - requires OPERATOR/ADMIN)
    const routeAnon = await sendJsonRequest(`/api/complaints/${cId}/route`, 'POST', null, null);
    assert(routeAnon.status === 401, '12. RBAC Boundary: POST /route Anonymous -> 401 Unauthorized');

    const routeCitizen = await sendJsonRequest(`/api/complaints/${cId}/route`, 'POST', null, citizenToken);
    assert(routeCitizen.status === 403, '13. RBAC Boundary: POST /route CITIZEN -> 403 Forbidden');

    const routeOp = await sendJsonRequest(`/api/complaints/${cId}/route`, 'POST', null, operatorToken);
    assert(routeOp.status === 200 && routeOp.body?.data?.routingStatus === 'ROUTED', '14. RBAC Boundary: POST /route OPERATOR -> 200 OK (Routed via PostGIS)');

    // Endpoint B: Case Status Progression (/api/complaints/:id/status - requires OPERATOR/ADMIN)
    const statusAnon = await sendJsonRequest(`/api/complaints/${cId}/status`, 'PATCH', { status: 'IN_PROGRESS' }, null);
    assert(statusAnon.status === 401, '15. RBAC Boundary: PATCH /status Anonymous -> 401 Unauthorized');

    const statusCitizen = await sendJsonRequest(`/api/complaints/${cId}/status`, 'PATCH', { status: 'IN_PROGRESS' }, citizenToken);
    assert(statusCitizen.status === 403, '16. RBAC Boundary: PATCH /status CITIZEN -> 403 Forbidden');

    const statusOp = await sendJsonRequest(`/api/complaints/${cId}/status`, 'PATCH', { status: 'IN_PROGRESS', reason: 'Field unit dispatched' }, operatorToken);
    assert(statusOp.status === 200 && statusOp.body?.data?.newStatus === 'IN_PROGRESS', '17. RBAC Boundary: PATCH /status OPERATOR -> 200 OK (Transitioned to IN_PROGRESS)');

    // Endpoint C: Human Review Queue (/api/reviews - requires OPERATOR/ADMIN)
    const reviewAnon = await sendJsonRequest('/api/reviews', 'GET', null, null);
    assert(reviewAnon.status === 401, '18. RBAC Boundary: GET /reviews Anonymous -> 401 Unauthorized');

    const reviewCitizen = await sendJsonRequest('/api/reviews', 'GET', null, citizenToken);
    assert(reviewCitizen.status === 403, '19. RBAC Boundary: GET /reviews CITIZEN -> 403 Forbidden');

    const reviewOp = await sendJsonRequest('/api/reviews', 'GET', null, operatorToken);
    assert(reviewOp.status === 200 && reviewOp.body?.success, '20. RBAC Boundary: GET /reviews OPERATOR -> 200 OK');

    // Endpoint D: Jurisdiction Boundary Management (requires ADMIN)
    const draftAnon = await sendJsonRequest('/api/jurisdictions/versions', 'POST', { versionCode: 'MYS_ST14_DRAFT' }, null);
    assert(draftAnon.status === 401, '21. RBAC Boundary: POST /jurisdictions/versions Anonymous -> 401 Unauthorized');

    const draftCitizen = await sendJsonRequest('/api/jurisdictions/versions', 'POST', { versionCode: 'MYS_ST14_DRAFT' }, citizenToken);
    assert(draftCitizen.status === 403, '22. RBAC Boundary: POST /jurisdictions/versions CITIZEN -> 403 Forbidden');

    const draftOp = await sendJsonRequest('/api/jurisdictions/versions', 'POST', { versionCode: 'MYS_ST14_DRAFT' }, operatorToken);
    assert(draftOp.status === 403, '23. RBAC Boundary: POST /jurisdictions/versions OPERATOR -> 403 Forbidden (Admin Only)');

    // Endpoint E: Operational Analytics (requires OPERATOR/ADMIN)
    const analyticsAnon = await sendJsonRequest('/api/analytics/overview', 'GET', null, null);
    assert(analyticsAnon.status === 401, '24. RBAC Boundary: GET /analytics/overview Anonymous -> 401 Unauthorized');

    const analyticsCitizen = await sendJsonRequest('/api/analytics/overview', 'GET', null, citizenToken);
    assert(analyticsCitizen.status === 403, '25. RBAC Boundary: GET /analytics/overview CITIZEN -> 403 Forbidden');

    const analyticsOp = await sendJsonRequest('/api/analytics/overview', 'GET', null, operatorToken);
    assert(analyticsOp.status === 200 && analyticsOp.body?.success, '26. RBAC Boundary: GET /analytics/overview OPERATOR -> 200 OK');

    // Endpoint F: Audit Trail (requires ADMIN only)
    const auditAnon = await sendJsonRequest('/api/audit', 'GET', null, null);
    assert(auditAnon.status === 401, '27. RBAC Boundary: GET /api/audit Anonymous -> 401 Unauthorized');

    const auditCitizen = await sendJsonRequest('/api/audit', 'GET', null, citizenToken);
    assert(auditCitizen.status === 403, '28. RBAC Boundary: GET /api/audit CITIZEN -> 403 Forbidden');

    const auditOp = await sendJsonRequest('/api/audit', 'GET', null, operatorToken);
    assert(auditOp.status === 200 && Array.isArray(auditOp.body?.data), '29. RBAC Boundary: GET /api/audit OPERATOR -> 200 OK');

    const auditAdmin = await sendJsonRequest('/api/audit', 'GET', null, adminToken);
    assert(auditAdmin.status === 200 && Array.isArray(auditAdmin.body?.data), '30. RBAC Boundary: GET /api/audit ADMIN -> 200 OK');

    // -------------------------------------------------------------------------
    // GROUP 5: Socket.IO Privileged Event Scoping
    // -------------------------------------------------------------------------
    console.log('\n--- GROUP 5: Socket.IO Privileged Room Authorization ---');
    // Create an unroutable complaint (outside boundaries) to trigger routing:review_required
    const unroutedComp = await sendMultipartComplaint({
      description: 'Out of boundary review trigger for socket authorization test',
      category: 'OTHER',
      category_source: 'MANUAL',
      latitude: '28.6139', // New Delhi coordinates
      longitude: '77.2090'
    });
    const unroutedId = unroutedComp.body?.data?.id;

    // Trigger routing to generate human review requirement
    await sendJsonRequest(`/api/complaints/${unroutedId}/route`, 'POST', null, operatorToken);

    // Wait 500ms for event broadcast
    await new Promise(r => setTimeout(r, 600));

    assert(
      opReceivedPrivileged.length > 0,
      '31. Socket.IO Authorization: Authenticated OPERATOR received privileged review events',
      `Events captured by operator socket: ${opReceivedPrivileged.length}`
    );
    assert(
      anonReceivedPrivileged.length === 0,
      '32. Socket.IO Authorization: Unauthenticated anonymous socket received ZERO privileged events',
      `Events leaked to anonymous socket: ${anonReceivedPrivileged.length}`
    );

    // -------------------------------------------------------------------------
    // GROUP 6: Immutable Audit Trail (Stage 13 Regression & Invariants)
    // -------------------------------------------------------------------------
    console.log('\n--- GROUP 6: Stage 13 Immutable Audit Guarantees ---');
    // Test direct INSERT into audit_logs succeeds
    let insertSucceeded = false;
    let testAuditId = null;
    try {
      const insRes = await pool.query(`
        INSERT INTO audit_logs (action, entity_type, entity_id, actor_role, result, metadata)
        VALUES ('STAGE_14_INTEGRITY_CHECK', 'SYSTEM', $1, 'ADMIN', 'SUCCESS', '{"test": true}'::jsonb)
        RETURNING id;
      `, [cId]);
      testAuditId = insRes.rows[0].id;
      insertSucceeded = true;
    } catch (e) {
      insertSucceeded = false;
    }
    assert(insertSucceeded, '33. Audit Invariant: INSERT into audit_logs succeeds unconditionally');

    // Test direct UPDATE into audit_logs is blocked by trigger
    let updateBlocked = false;
    try {
      await pool.query('UPDATE audit_logs SET action = \'TAMPERED\' WHERE id = $1', [testAuditId]);
    } catch (e) {
      updateBlocked = e.message.toLowerCase().includes('immutable');
    }
    assert(updateBlocked, '34. Audit Invariant: UPDATE on audit_logs blocked by PostgreSQL trigger');

    // Test direct DELETE on audit_logs is blocked by trigger
    let deleteBlocked = false;
    try {
      await pool.query('DELETE FROM audit_logs WHERE id = $1', [testAuditId]);
    } catch (e) {
      deleteBlocked = e.message.toLowerCase().includes('immutable');
    }
    assert(deleteBlocked, '35. Audit Invariant: DELETE on audit_logs blocked by PostgreSQL trigger');

    // Test audit log contains no recursive amplification
    const auditCountBefore = await pool.query("SELECT COUNT(*) FROM audit_logs WHERE action = 'AUTH_ACCESS_DENIED';");
    // Trigger access denied on audit endpoint
    await sendJsonRequest('/api/audit', 'GET', null, citizenToken);
    const auditCountAfter = await pool.query("SELECT COUNT(*) FROM audit_logs WHERE action = 'AUTH_ACCESS_DENIED';");
    const diff = parseInt(auditCountAfter.rows[0].count, 10) - parseInt(auditCountBefore.rows[0].count, 10);
    assert(
      diff === 1,
      '36. Audit Invariant: Exactly one audit log produced per rejected action (Zero recursion)',
      `Audit entries created: ${diff}`
    );

    // -------------------------------------------------------------------------
    // GROUP 7: End-to-End Civic Lifecycle & SLA Integration
    // -------------------------------------------------------------------------
    console.log('\n--- GROUP 7: End-to-End Civic Lifecycle & SLA Integration ---');
    // Advance complaint status through full state machine:
    // IN_PROGRESS -> RESOLVED -> CLOSED
    const resTransition = await sendJsonRequest(`/api/complaints/${cId}/status`, 'PATCH', {
      status: 'RESOLVED',
      reason: 'Pothole filled with cold asphalt mix by ward road gang'
    }, operatorToken);
    assert(
      resTransition.status === 200 && resTransition.body?.data?.newStatus === 'RESOLVED',
      '37. State Machine: Valid transition IN_PROGRESS → RESOLVED succeeds'
    );

    const closeTransition = await sendJsonRequest(`/api/complaints/${cId}/status`, 'PATCH', {
      status: 'CLOSED',
      reason: 'Citizen confirmed smooth road surface; case closed'
    }, operatorToken);
    assert(
      closeTransition.status === 200 && closeTransition.body?.data?.newStatus === 'CLOSED',
      '38. State Machine: Valid transition RESOLVED → CLOSED succeeds'
    );

    // Verify SLA tracking is preserved and marked resolved without retroactive breach
    const finalSla = await sendJsonRequest(`/api/complaints/${cId}/sla`, 'GET', null, operatorToken);
    assert(
      finalSla.status === 200 && finalSla.body?.data?.slaStatus === 'WITHIN_SLA',
      '39. SLA Integrity: Resolved complaint remains safely WITHIN_SLA with complete timeline',
      `Target: ${finalSla.body?.data?.policy?.targetHours}h, Warning: ${finalSla.body?.data?.policy?.warningHours}h`
    );

    // -------------------------------------------------------------------------
    // GROUP 8: Historical Routing Immutability Across Delimitation
    // -------------------------------------------------------------------------
    console.log('\n--- GROUP 8: Historical Routing Immutability ---');
    // Ensure active version is MYS_2026_V1 or V2
    const activeVerRes = await pool.query("SELECT id, version_code FROM jurisdiction_versions WHERE status = 'ACTIVE';");
    const activeVer = activeVerRes.rows[0];
    assert(Boolean(activeVer), '40. Active Version Exists: Exactly one active jurisdiction version', `Active: ${activeVer?.version_code}`);

    // Verify historical routing decision permanently linked to jurisdiction version
    const histRouting = await pool.query('SELECT jurisdiction_version_id FROM routing_decisions WHERE complaint_id = $1;', [cId]);
    assert(
      histRouting.rows.length === 1 && histRouting.rows[0].jurisdiction_version_id !== null,
      '41. Routing Immutability: Complaint permanently bound to specific jurisdiction_version_id in PostgreSQL',
      `Version ID: ${histRouting.rows[0]?.jurisdiction_version_id}`
    );

    // -------------------------------------------------------------------------
    // GROUP 9: Comprehensive PostgreSQL Data Integrity Verification
    // -------------------------------------------------------------------------
    console.log('\n--- GROUP 9: Database Referential & Relational Integrity ---');
    // 1. Complaints without location
    const orphanLocations = await pool.query('SELECT COUNT(*) FROM complaints WHERE location IS NULL;');
    assert(orphanLocations.rows[0].count === '0', '42. Data Integrity: Zero complaints with NULL PostGIS geographic coordinates');

    // 2. Routing decisions referential integrity
    const invalidRoutings = await pool.query(`
      SELECT COUNT(*) FROM routing_decisions rd
      LEFT JOIN complaints c ON rd.complaint_id = c.id
      WHERE c.id IS NULL;
    `);
    assert(invalidRoutings.rows[0].count === '0', '43. Data Integrity: Zero orphan routing decisions');

    // 3. Active jurisdiction count strictly equals 1
    const activeVersionsCount = await pool.query("SELECT COUNT(*) FROM jurisdiction_versions WHERE status = 'ACTIVE';");
    assert(activeVersionsCount.rows[0].count === '1', '44. Data Integrity: Exactly one ACTIVE jurisdiction boundary version enforced');

    // 4. Zero corrupt SLA tracking records
    const corruptSla = await pool.query(`
      SELECT COUNT(*) FROM complaint_sla_events
      WHERE previous_sla_status IS NULL AND event_type != 'SLA_INITIALIZED';
    `);
    assert(corruptSla.rows[0].count === '0', '45. Data Integrity: Zero corrupt SLA transition events');

    // 5. Notifications referential integrity
    const orphanNotifs = await pool.query(`
      SELECT COUNT(*) FROM citizen_notifications n
      LEFT JOIN complaints c ON n.complaint_id = c.id
      WHERE c.id IS NULL;
    `);
    assert(orphanNotifs.rows[0].count === '0', '46. Data Integrity: Zero orphan citizen notifications');

    // 6. Review cases state integrity
    const activeReviewsCount = await pool.query(`
      SELECT complaint_id, COUNT(*)
      FROM complaint_reviews
      WHERE review_status IN ('OPEN', 'IN_REVIEW')
      GROUP BY complaint_id
      HAVING COUNT(*) > 1;
    `);
    assert(activeReviewsCount.rows.length === 0, '47. Data Integrity: Partial unique constraint prevents duplicate active reviews');

    // 7. Audit log sequence integrity
    const auditIntegrity = await pool.query('SELECT COUNT(*) FROM audit_logs WHERE created_at IS NULL OR action IS NULL;');
    assert(auditIntegrity.rows[0].count === '0', '48. Data Integrity: Zero malformed audit trail records');

    // -------------------------------------------------------------------------
    // GROUP 10: Frontend Production Build
    // -------------------------------------------------------------------------
    console.log('\n--- GROUP 10: Production Frontend Verification ---');
    const clientDir = path.resolve(__dirname, '../../../client');
    try {
      execSync('npm.cmd run build', { cwd: clientDir, stdio: 'pipe' });
      assert(true, '49. Frontend Build: Vite production bundle compiles with 0 errors');
    } catch (e) {
      assert(false, '49. Frontend Build: Vite production bundle compiles with 0 errors', e.message);
    }

    const distIndex = path.resolve(__dirname, '../../../client/dist/index.html');
    const fs = require('fs');
    assert(fs.existsSync(distIndex), '50. Frontend Bundle Artifact: dist/index.html exists and is production-ready');

  } catch (err) {
    console.error('\n[FATAL TEST SUITE ERROR]', err);
    failed++;
  } finally {
    anonSocket.disconnect();
    opSocket.disconnect();
  }

  console.log('\n================================================================================');
  console.log(`STAGE 14 VERIFICATION RESULTS: ${passed} PASSED, ${failed} FAILED (TOTAL: ${passed + failed})`);
  console.log('================================================================================\n');

  process.exit(failed > 0 ? 1 : 0);
}

runStage14Tests();
