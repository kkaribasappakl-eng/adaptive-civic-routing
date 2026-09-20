require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
const { pool } = require('../config/db');
const path = require('path');
const jwt = require('jsonwebtoken');

const BASE_URL = 'http://localhost:4000/api';

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

function assert(condition, message, detail = '') {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`  ✅ [PASS] ${totalTests}. ${message}`);
    if (detail) console.log(`     ℹ️  ${detail}`);
  } else {
    failedTests++;
    console.error(`  ❌ [FAIL] ${totalTests}. ${message}`);
    if (detail) console.error(`     ⚠️  ${detail}`);
    throw new Error(`Assertion failed: ${message}`);
  }
}

async function apiRequest(endpoint, method = 'GET', body = null, token = null) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${BASE_URL}${endpoint}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : null
  });

  let data = null;
  const text = await res.text();
  try {
    data = text ? JSON.parse(text) : null;
  } catch (e) {
    data = text;
  }

  return { status: res.status, data };
}

async function runRbacVerification() {
  console.log('================================================================================');
  console.log(' FINAL RBAC & ROLE PERMISSION END-TO-END VERIFICATION (HACKMYSURU 1.0)');
  console.log('================================================================================\n');

  // --- Step 1: Login all 3 roles ---
  console.log('--- 1. Authenticating Roles via Backend Demo Login ---');
  const citizenLogin = await apiRequest('/auth/demo-login', 'POST', { role: 'CITIZEN' });
  assert(citizenLogin.status === 200, 'Citizen demo login returns 200');
  const citizenToken = citizenLogin.data?.data?.token;
  assert(!!citizenToken, 'Citizen JWT token received');

  const operatorLogin = await apiRequest('/auth/demo-login', 'POST', { role: 'OPERATOR' });
  assert(operatorLogin.status === 200, 'Operator demo login returns 200');
  const operatorToken = operatorLogin.data?.data?.token;
  assert(!!operatorToken, 'Operator JWT token received');

  const adminLogin = await apiRequest('/auth/demo-login', 'POST', { role: 'ADMIN' });
  assert(adminLogin.status === 200, 'Admin demo login returns 200');
  const adminToken = adminLogin.data?.data?.token;
  assert(!!adminToken, 'Admin JWT token received');

  // ============================================================================
  // TEST A: CITIZEN PERMISSIONS
  // ============================================================================
  console.log('\n--- 2. TEST A: CITIZEN Role Verification ---');

  // A1: AI classification works for citizen
  const aiRes = await apiRequest('/complaints/classify', 'POST', {
    description: 'Garbage dump near road corner overflowing'
  });
  assert(aiRes.status === 200, 'CITIZEN: Can use AI classification (/api/complaints/classify)');

  // A2: Submit complaint with mandatory photo and phone
  const compRes = await apiRequest('/complaints', 'POST', {
    description: 'Garbage pile left on roadside in Central Mysuru',
    category: 'GARBAGE',
    latitude: 12.2958,
    longitude: 76.6394,
    citizen_contact: '9845012345',
    photo_url: '/uploads/complaints/test_citizen_evidence.jpg'
  }, citizenToken);
  assert(compRes.status === 201, 'CITIZEN: Can submit complaint with photo & phone', `Code: ${compRes.data?.data?.complaint_code}`);
  const complaintCode = compRes.data?.data?.complaint_code;
  const complaintId = compRes.data?.data?.id;

  // A3: Public/Citizen Case Tracking
  const trackRes = await apiRequest(`/complaints/${complaintId}`, 'GET', null, citizenToken);
  assert(trackRes.status === 200, 'CITIZEN: Can track complaint by ID (/api/complaints/:id)');
  assert(trackRes.data?.data?.citizen_contact === undefined, 'CITIZEN: citizen_contact is stripped from citizen tracking dossier');

  const slaRes = await apiRequest(`/complaints/${complaintId}/sla`, 'GET', null, citizenToken);
  assert(slaRes.status === 200, 'CITIZEN: Can view SLA for own complaint (/api/complaints/:id/sla)');

  const historyRes = await apiRequest(`/complaints/${complaintId}/status-history`, 'GET', null, citizenToken);
  assert(historyRes.status === 200, 'CITIZEN: Can view status history for own complaint');

  const notifRes = await apiRequest(`/complaints/${complaintId}/notifications`, 'GET', null, citizenToken);
  assert(notifRes.status === 200, 'CITIZEN: Can view notifications for own complaint');

  // A4: CITIZEN FORBIDDEN ENDPOINTS
  console.log('\n--- 2b. CITIZEN Forbidden Access Attempts (Must be 403) ---');
  const cReviews = await apiRequest('/reviews', 'GET', null, citizenToken);
  assert(cReviews.status === 403, 'CITIZEN: Blocked from Operator Reviews (/api/reviews -> 403)');

  const cAnalytics = await apiRequest('/analytics/overview', 'GET', null, citizenToken);
  assert(cAnalytics.status === 403, 'CITIZEN: Blocked from Analytics (/api/analytics/overview -> 403)');

  const cAudit = await apiRequest('/audit', 'GET', null, citizenToken);
  assert(cAudit.status === 403, 'CITIZEN: Blocked from Audit Trail (/api/audit -> 403)');

  const cJurisdictions = await apiRequest('/jurisdictions/versions', 'GET', null, citizenToken);
  assert(cJurisdictions.status === 403, 'CITIZEN: Blocked from Jurisdiction Versions (/api/jurisdictions/versions -> 403)');

  const cRouting = await apiRequest('/routing/decisions', 'GET', null, citizenToken);
  assert(cRouting.status === 403, 'CITIZEN: Blocked from Routing Decisions list (/api/routing/decisions -> 403)');

  const cStatusUpdate = await apiRequest(`/complaints/${complaintId}/status`, 'PATCH', { status: 'RESOLVED', reason: 'hacked' }, citizenToken);
  assert(cStatusUpdate.status === 403, 'CITIZEN: Blocked from updating complaint status (/api/complaints/:id/status -> 403)');

  const cUserProvision = await apiRequest('/auth/users', 'POST', { fullName: 'X', email: 'x@x.com', password: 'pass', role: 'ADMIN' }, citizenToken);
  assert(cUserProvision.status === 403, 'CITIZEN: Blocked from provisioning users (/api/auth/users -> 403)');

  // ============================================================================
  // TEST B: OPERATOR PERMISSIONS
  // ============================================================================
  console.log('\n--- 3. TEST B: OPERATOR Role Verification ---');

  // B1: Allowed endpoints
  const opRouting = await apiRequest('/routing/decisions', 'GET', null, operatorToken);
  assert(opRouting.status === 200, 'OPERATOR: Can access Routing Decisions (/api/routing/decisions)');

  const opReviews = await apiRequest('/reviews', 'GET', null, operatorToken);
  assert(opReviews.status === 200, 'OPERATOR: Can access Review Workspace (/api/reviews)');

  const opAnalytics = await apiRequest('/analytics/overview', 'GET', null, operatorToken);
  assert(opAnalytics.status === 200, 'OPERATOR: Can access Analytics Overview (/api/analytics/overview)');

  const opSla = await apiRequest('/sla/overview', 'GET', null, operatorToken);
  assert(opSla.status === 200, 'OPERATOR: Can access SLA Overview (/api/sla/overview)');

  const opNotifs = await apiRequest('/notifications', 'GET', null, operatorToken);
  assert(opNotifs.status === 200, 'OPERATOR: Can access Global Notification Feed (/api/notifications)');

  const opAudit = await apiRequest('/audit', 'GET', null, operatorToken);
  assert(opAudit.status === 200, 'OPERATOR: Can access Operational Audit Trail (/api/audit)');

  const opVersions = await apiRequest('/jurisdictions/versions', 'GET', null, operatorToken);
  assert(opVersions.status === 200, 'OPERATOR: Can inspect Jurisdiction Versions (/api/jurisdictions/versions)');

  // B2: Case Status update by operator
  const opStatusUpdate = await apiRequest(`/complaints/${complaintId}/status`, 'PATCH', {
    status: 'IN_PROGRESS',
    reason: 'Sanitation truck dispatched by operator'
  }, operatorToken);
  assert(opStatusUpdate.status === 200, 'OPERATOR: Can update complaint status to IN_PROGRESS');

  // B3: Create Human Review case & resolve by operator
  console.log('\n--- 3b. OPERATOR Human Review Complete Workflow ---');
  const unmappedComp = await apiRequest('/complaints', 'POST', {
    description: 'Outside city limits boundary edge dump',
    category: 'C_AND_D_WASTE',
    latitude: 12.1800,
    longitude: 76.6000,
    citizen_contact: '9845012345',
    photo_url: '/uploads/complaints/test_outside.jpg'
  });
  assert(unmappedComp.status === 201, 'Created outside boundary complaint for human review test');
  const reviewCompId = unmappedComp.data?.data?.id;

  // Find review case in database
  const revRow = await pool.query('SELECT id, review_status FROM complaint_reviews WHERE complaint_id = $1;', [reviewCompId]);
  assert(revRow.rows.length === 1, 'Automatic complaint_reviews record exists with status OPEN');
  const reviewId = revRow.rows[0].id;

  // Operator starts review
  const startRev = await apiRequest(`/reviews/${reviewId}/start`, 'POST', {}, operatorToken);
  assert(startRev.status === 200, 'OPERATOR: Can start review (/api/reviews/:id/start -> IN_REVIEW)');

  // Operator fetches authorities meta
  const authMeta = await apiRequest('/reviews/meta/authorities', 'GET', null, operatorToken);
  assert(authMeta.status === 200, 'OPERATOR: Can fetch authorities & departments list');
  const mudaAuth = authMeta.data?.data?.find(a => a.code === 'MUDA_DEMO') || authMeta.data?.data?.[0];
  const mudaDept = mudaAuth?.departments?.[0];

  // Operator resolves review
  const resolveRev = await apiRequest(`/reviews/${reviewId}/resolve`, 'POST', {
    actionType: 'ROUTE_TO_AUTHORITY',
    authorityId: mudaAuth.id,
    departmentId: mudaDept.id,
    note: 'Operator verified and routed to MUDA peripheral maintenance'
  }, operatorToken);
  assert(resolveRev.status === 200, 'OPERATOR: Can resolve review (/api/reviews/:id/resolve)');

  // Verify complaint is now ROUTED
  const resolvedComp = await apiRequest(`/complaints/${reviewCompId}`, 'GET', null, operatorToken);
  assert(resolvedComp.data?.data?.status === 'ROUTED', 'Resolved complaint status updated to ROUTED');

  // B4: OPERATOR FORBIDDEN ADMIN ACTIONS
  console.log('\n--- 3c. OPERATOR Forbidden Admin Actions (Must be 403) ---');
  const opCreateVer = await apiRequest('/jurisdictions/versions', 'POST', { versionCode: 'MYS_OP_FORBIDDEN' }, operatorToken);
  assert(opCreateVer.status === 403, 'OPERATOR: Blocked from creating jurisdiction version (403)');

  const opActivateVer = await apiRequest(`/jurisdictions/versions/${mudaAuth.id}/activate`, 'POST', {}, operatorToken);
  assert(opActivateVer.status === 403, 'OPERATOR: Blocked from activating jurisdiction version (403)');

  const opUserProvision = await apiRequest('/auth/users', 'POST', { fullName: 'X', email: 'x2@x.com', password: 'pass', role: 'OPERATOR' }, operatorToken);
  assert(opUserProvision.status === 403, 'OPERATOR: Blocked from provisioning users (403)');

  // Verify OPERATOR cannot see AUTH security audit events
  const opAuditEvents = await apiRequest('/audit?action=AUTH_LOGIN', 'GET', null, operatorToken);
  const leakedAuth = opAuditEvents.data?.data?.some(l => l.action && l.action.startsWith('AUTH_'));
  assert(!leakedAuth, 'OPERATOR: Security/AUTH audit logs are filtered out server-side');

  // ============================================================================
  // TEST C: ADMIN PERMISSIONS
  // ============================================================================
  console.log('\n--- 4. TEST C: ADMIN Role Verification ---');

  // Admin can do everything operator can
  const adminAnalytics = await apiRequest('/analytics/overview', 'GET', null, adminToken);
  assert(adminAnalytics.status === 200, 'ADMIN: Can access Analytics');

  const adminAudit = await apiRequest('/audit', 'GET', null, adminToken);
  assert(adminAudit.status === 200, 'ADMIN: Can access Audit Trail');
  const hasAuthInAdmin = adminAudit.data?.data?.some(l => l.action && l.action.startsWith('AUTH_'));
  assert(hasAuthInAdmin, 'ADMIN: Can see security/AUTH events in audit trail');

  // Admin can provision users
  const newEmail = `prov_op_${Date.now()}@hackmysuru.gov.in`;
  const provRes = await apiRequest('/auth/users', 'POST', {
    fullName: 'Provisioned Test Operator',
    email: newEmail,
    password: 'SecureOperator123!',
    role: 'OPERATOR'
  }, adminToken);
  assert(provRes.status === 201, 'ADMIN: Can provision user accounts (/api/auth/users -> 201)');

  // Admin jurisdiction draft creation (safe test, does not touch active version)
  const testDraftCode = `MYS_ADMIN_TEST_${Date.now()}`;
  const createDraftRes = await apiRequest('/jurisdictions/versions', 'POST', {
    versionCode: testDraftCode,
    notes: 'Admin RBAC verification draft'
  }, adminToken);
  assert(createDraftRes.status === 201, 'ADMIN: Can create draft jurisdiction version (/api/jurisdictions/versions -> 201)');
  const draftId = createDraftRes.data?.version?.id || createDraftRes.data?.data?.id;

  // Admin validate draft version
  const validateRes = await apiRequest(`/jurisdictions/versions/${draftId}/validate`, 'POST', {}, adminToken);
  assert(validateRes.status === 200, 'ADMIN: Can validate jurisdiction version (/api/jurisdictions/versions/:id/validate)');

  // Clean up test draft version so database remains pristine
  if (draftId) {
    await pool.query('DELETE FROM jurisdiction_versions WHERE id = $1;', [draftId]);
    console.log('     ℹ️  Test draft version cleanly removed from database');
  }

  // ============================================================================
  // TEST D: ROLE ESCALATION & TAMPER RESILIENCE
  // ============================================================================
  console.log('\n--- 5. TEST D: Role Escalation Resilience ---');
  
  // Tampered JWT with modified role
  const secret = process.env.JWT_SECRET || 'dev_stage_1_super_secret_jwt_key_12345';
  const fakeAdminToken = jwt.sign({ id: citizenLogin.data?.data?.user?.id, role: 'ADMIN', email: 'citizen@hackmysuru.gov.in' }, 'wrong_secret_12345');
  const tamperedRes = await apiRequest('/auth/users', 'POST', { fullName: 'Hacker', email: 'h@h.com', password: 'pass', role: 'ADMIN' }, fakeAdminToken);
  assert(tamperedRes.status === 401, 'Tampered/forged JWT signature rejected with 401 Unauthorized');

  // Verify AUTH_ACCESS_DENIED audit log was produced
  const accessDeniedLogs = await pool.query("SELECT id FROM audit_logs WHERE action = 'AUTH_ACCESS_DENIED' ORDER BY created_at DESC LIMIT 5;");
  assert(accessDeniedLogs.rows.length > 0, 'Denial of unauthorized access successfully recorded in audit_logs');

  console.log('\n================================================================================');
  console.log(` ALL RBAC & PERMISSION TESTS PASSED! (${passedTests}/${totalTests})`);
  console.log('================================================================================\n');

  await pool.end();
}

runRbacVerification().catch((err) => {
  console.error('\n❌ RBAC Verification Failed:', err.message);
  process.exit(1);
});
