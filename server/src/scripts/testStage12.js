require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { pool } = require('../config/db');
const ClientIO = require(require('path').resolve(__dirname, '../../../client/node_modules/socket.io-client'));

const API_BASE = 'http://localhost:4000/api';
let passedTests = 0;
let totalTests = 0;

function assert(condition, message) {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`  ✓ PASS [${totalTests}]: ${message}`);
  } else {
    console.error(`  ✗ FAIL [${totalTests}]: ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  }
}

async function runStage12Tests() {
  console.log('================================================================');
  console.log('  STAGE 12 — AUTHENTICATION & RBAC VERIFICATION SUITE');
  console.log('================================================================\n');

  try {
    // -------------------------------------------------------------------------
    // TEST 1: Database users schema validation
    // -------------------------------------------------------------------------
    console.log('[Test Group 1] Database Users Schema & Columns:');
    const colsRes = await pool.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'users'
    `);
    const cols = colsRes.rows.map(r => r.column_name);
    assert(cols.includes('id'), 'users table contains id column');
    assert(cols.includes('full_name'), 'users table contains full_name column');
    assert(cols.includes('email'), 'users table contains email column');
    assert(cols.includes('password_hash'), 'users table contains password_hash column');
    assert(cols.includes('role'), 'users table contains role column');
    assert(cols.includes('is_active'), 'users table contains is_active column');
    assert(cols.includes('created_by_user_id'), 'users table contains created_by_user_id audit column');
    assert(cols.includes('last_login_at'), 'users table contains last_login_at column');

    // -------------------------------------------------------------------------
    // TEST 2: Demo users seeded in database
    // -------------------------------------------------------------------------
    console.log('\n[Test Group 2] Demo Users Seeded with Valid bcrypt Hashes:');
    const demoUsersRes = await pool.query(`
      SELECT id, full_name, email, password_hash, role, is_active, created_by_user_id 
      FROM users 
      WHERE email IN ('admin@hackmysuru.gov.in', 'operator@hackmysuru.gov.in', 'citizen@hackmysuru.gov.in')
      ORDER BY role ASC
    `);
    assert(demoUsersRes.rows.length === 3, 'All 3 demo users exist in database');

    const adminUser = demoUsersRes.rows.find(u => u.role === 'ADMIN');
    const operatorUser = demoUsersRes.rows.find(u => u.role === 'OPERATOR');
    const citizenUser = demoUsersRes.rows.find(u => u.role === 'CITIZEN');

    assert(!!adminUser, 'Admin demo user exists');
    assert(!!operatorUser, 'Operator demo user exists');
    assert(!!citizenUser, 'Citizen demo user exists');

    // Verify bcrypt hash structure
    assert(adminUser.password_hash.startsWith('$2a$') || adminUser.password_hash.startsWith('$2b$'), 'Admin password_hash is valid bcrypt');
    assert(operatorUser.password_hash.startsWith('$2a$') || operatorUser.password_hash.startsWith('$2b$'), 'Operator password_hash is valid bcrypt');

    // -------------------------------------------------------------------------
    // TEST 3: Backend-Controlled Demo Login (Zero frontend passwords)
    // -------------------------------------------------------------------------
    console.log('\n[Test Group 3] Backend-Controlled Demo Login:');
    
    // Operator demo login
    const opDemoRes = await fetch(`${API_BASE}/auth/demo-login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: 'OPERATOR' })
    });
    const opDemoData = await opDemoRes.json();
    assert(opDemoRes.status === 200, 'POST /api/auth/demo-login returns 200 for OPERATOR');
    assert(opDemoData.data?.user?.role === 'OPERATOR', 'Operator demo login returns OPERATOR role');
    assert(!opDemoData.data?.user?.password_hash, 'Operator demo response never exposes password_hash');
    assert(!opDemoData.data?.user?.password, 'Operator demo response never exposes password');
    assert(!!opDemoData.data?.token, 'Operator demo login provides JWT token');
    
    const operatorToken = opDemoData.data.token;

    // Admin demo login
    const adminDemoRes = await fetch(`${API_BASE}/auth/demo-login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: 'ADMIN' })
    });
    const adminDemoData = await adminDemoRes.json();
    assert(adminDemoRes.status === 200, 'POST /api/auth/demo-login returns 200 for ADMIN');
    assert(adminDemoData.data?.user?.role === 'ADMIN', 'Admin demo login returns ADMIN role');
    const adminToken = adminDemoData.data.token;

    // Citizen demo login
    const citizenDemoRes = await fetch(`${API_BASE}/auth/demo-login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: 'CITIZEN' })
    });
    const citizenDemoData = await citizenDemoRes.json();
    assert(citizenDemoRes.status === 200, 'POST /api/auth/demo-login returns 200 for CITIZEN');
    assert(citizenDemoData.data?.user?.role === 'CITIZEN', 'Citizen demo login returns CITIZEN role');
    const citizenToken = citizenDemoData.data.token;

    // Invalid role rejection
    const invalidDemoRes = await fetch(`${API_BASE}/auth/demo-login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: 'SUPER_ROOT' })
    });
    assert(invalidDemoRes.status === 400, 'POST /api/auth/demo-login rejects invalid role with 400');

    // -------------------------------------------------------------------------
    // TEST 4: JWT Claims Minimal Content
    // -------------------------------------------------------------------------
    console.log('\n[Test Group 4] JWT Claims Minimal Content & Verification:');
    const decodedOp = jwt.decode(operatorToken);
    assert(decodedOp.id === operatorUser.id, 'JWT contains user id');
    assert(decodedOp.role === 'OPERATOR', 'JWT contains user role');
    assert(decodedOp.email === operatorUser.email, 'JWT contains user email');
    assert(!decodedOp.password, 'JWT does NOT contain password');
    assert(!decodedOp.password_hash, 'JWT does NOT contain password_hash');
    assert(!decodedOp.full_name, 'JWT keeps payload minimal without redundant fields');

    // Verify token using secret
    const secret = process.env.JWT_SECRET || 'hackmysuru_jwt_secure_key_stage12_2026';
    const verified = jwt.verify(operatorToken, secret);
    assert(verified.id === operatorUser.id, 'JWT verifies successfully against environment secret');

    // -------------------------------------------------------------------------
    // TEST 5: Public Registration Enforces CITIZEN Role
    // -------------------------------------------------------------------------
    console.log('\n[Test Group 5] Public Registration Role Enforcement:');
    const testEmail = `citizen_test_${Date.now()}@example.com`;
    const regRes = await fetch(`${API_BASE}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fullName: 'Test Citizen User',
        email: testEmail,
        password: 'securePassword123!',
        role: 'ADMIN' // Client attempts privilege escalation to ADMIN!
      })
    });
    const regData = await regRes.json();
    assert(regRes.status === 201, 'POST /api/auth/register returns 201 for valid registration');
    assert(regData.data?.user?.role === 'CITIZEN', 'Registration strictly forces role = CITIZEN even if role: ADMIN requested');
    assert(!regData.data?.user?.password_hash, 'Registration response never exposes password_hash');

    // Duplicate registration rejection
    const dupRes = await fetch(`${API_BASE}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fullName: 'Test Citizen Duplicate',
        email: testEmail,
        password: 'securePassword123!'
      })
    });
    assert(dupRes.status === 409, 'Registration rejects duplicate email with 409 Conflict');

    // Registration validation rejection
    const shortPassRes = await fetch(`${API_BASE}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fullName: 'Short Pass User',
        email: `invalid_${Date.now()}@test.com`,
        password: '123'
      })
    });
    assert(shortPassRes.status === 400, 'Registration rejects password shorter than 6 characters with 400');

    // -------------------------------------------------------------------------
    // TEST 6: Standard Login & Credential Validation
    // -------------------------------------------------------------------------
    console.log('\n[Test Group 6] Standard Login & Credential Security:');
    const loginRes = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: testEmail,
        password: 'securePassword123!'
      })
    });
    const loginData = await loginRes.json();
    assert(loginRes.status === 200, 'POST /api/auth/login succeeds with registered credentials');
    assert(loginData.data?.user?.email === testEmail, 'Login response returns authenticated user');

    // Check Set-Cookie header for HttpOnly cookie
    const setCookie = loginRes.headers.get('set-cookie');
    assert(setCookie && setCookie.includes('HttpOnly'), 'Login sets HttpOnly cookie for JWT');

    // Failed login: wrong password
    const badPassRes = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: testEmail,
        password: 'wrongPassword123!'
      })
    });
    assert(badPassRes.status === 401, 'Login fails with 401 on incorrect password');

    // Failed login: nonexistent email (no account enumeration)
    const badEmailRes = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'does_not_exist_ever_999@hackmysuru.gov.in',
        password: 'anyPassword123!'
      })
    });
    const badEmailData = await badEmailRes.json();
    assert(badEmailRes.status === 401, 'Login fails with 401 on nonexistent email');
    assert(badEmailData.error === 'Invalid email or password.', 'Generic error message prevents account enumeration');

    // -------------------------------------------------------------------------
    // TEST 7: Authentication Profile & Logout
    // -------------------------------------------------------------------------
    console.log('\n[Test Group 7] Authentication Profile & Logout:');
    const meRes = await fetch(`${API_BASE}/auth/me`, {
      headers: { 'Authorization': `Bearer ${operatorToken}` }
    });
    const meData = await meRes.json();
    assert(meRes.status === 200, 'GET /api/auth/me returns 200 with Bearer token');
    assert(meData.data?.user?.role === 'OPERATOR', 'GET /api/auth/me returns authenticated operator');

    const logoutRes = await fetch(`${API_BASE}/auth/logout`, {
      method: 'POST'
    });
    assert(logoutRes.status === 200, 'POST /api/auth/logout returns 200');

    // -------------------------------------------------------------------------
    // TEST 8: Token Verification Guard on Protected Endpoints
    // -------------------------------------------------------------------------
    console.log('\n[Test Group 8] Protected Endpoint Token Enforcement:');
    // Missing token
    const noTokenRes = await fetch(`${API_BASE}/reviews`);
    assert(noTokenRes.status === 401, 'GET /api/reviews returns 401 when unauthenticated');

    // Invalid token
    const fakeTokenRes = await fetch(`${API_BASE}/reviews`, {
      headers: { 'Authorization': 'Bearer not.a.valid.jwt.token' }
    });
    assert(fakeTokenRes.status === 401, 'GET /api/reviews returns 401 on invalid JWT token');

    // -------------------------------------------------------------------------
    // TEST 9: RBAC on Review Endpoints (OPERATOR & ADMIN only)
    // -------------------------------------------------------------------------
    console.log('\n[Test Group 9] RBAC on Review Queue:');
    // CITIZEN access attempt -> 403 Forbidden
    const citizenReviewRes = await fetch(`${API_BASE}/reviews`, {
      headers: { 'Authorization': `Bearer ${citizenToken}` }
    });
    assert(citizenReviewRes.status === 403, 'GET /api/reviews returns 403 Forbidden for CITIZEN role');

    // OPERATOR access -> 200 OK
    const opReviewRes = await fetch(`${API_BASE}/reviews`, {
      headers: { 'Authorization': `Bearer ${operatorToken}` }
    });
    assert(opReviewRes.status === 200, 'GET /api/reviews returns 200 OK for OPERATOR role');

    // ADMIN access -> 200 OK
    const adminReviewRes = await fetch(`${API_BASE}/reviews`, {
      headers: { 'Authorization': `Bearer ${adminToken}` }
    });
    assert(adminReviewRes.status === 200, 'GET /api/reviews returns 200 OK for ADMIN role');

    // -------------------------------------------------------------------------
    // TEST 10: RBAC on Operational Analytics (OPERATOR & ADMIN only)
    // -------------------------------------------------------------------------
    console.log('\n[Test Group 10] RBAC on Operational Analytics:');
    // Anonymous access -> 401
    const anonAnalyticsRes = await fetch(`${API_BASE}/analytics/overview`);
    assert(anonAnalyticsRes.status === 401, 'GET /api/analytics/overview returns 401 for anonymous caller');

    // CITIZEN access -> 403 Forbidden
    const citizenAnalyticsRes = await fetch(`${API_BASE}/analytics/overview`, {
      headers: { 'Authorization': `Bearer ${citizenToken}` }
    });
    assert(citizenAnalyticsRes.status === 403, 'GET /api/analytics/overview returns 403 Forbidden for CITIZEN');

    // OPERATOR access -> 200 OK
    const opAnalyticsRes = await fetch(`${API_BASE}/analytics/overview`, {
      headers: { 'Authorization': `Bearer ${operatorToken}` }
    });
    assert(opAnalyticsRes.status === 200, 'GET /api/analytics/overview returns 200 OK for OPERATOR');

    // -------------------------------------------------------------------------
    // TEST 11: RBAC on Jurisdiction Mutation & Activation (ADMIN only)
    // -------------------------------------------------------------------------
    console.log('\n[Test Group 11] RBAC on Jurisdiction Governance:');
    // OPERATOR attempt to activate version -> 403 Forbidden
    const opActivateRes = await fetch(`${API_BASE}/jurisdictions/versions/00000000-0000-0000-0000-000000000000/activate`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${operatorToken}` }
    });
    assert(opActivateRes.status === 403, 'POST /jurisdictions/versions/:id/activate returns 403 Forbidden for OPERATOR');

    // OPERATOR attempt to create draft version -> 403 Forbidden
    const opCreateDraftRes = await fetch(`${API_BASE}/jurisdictions/versions`, {
      method: 'POST',
      headers: { 
        'Authorization': `Bearer ${operatorToken}`,
        'Content-Type': 'application/json' 
      },
      body: JSON.stringify({ versionCode: 'MYS_TEST_DRAFT' })
    });
    assert(opCreateDraftRes.status === 403, 'POST /jurisdictions/versions returns 403 Forbidden for OPERATOR');

    // OPERATOR reading versions -> 200 OK
    const opGetVersionsRes = await fetch(`${API_BASE}/jurisdictions/versions`, {
      headers: { 'Authorization': `Bearer ${operatorToken}` }
    });
    assert(opGetVersionsRes.status === 200, 'GET /jurisdictions/versions returns 200 OK for OPERATOR');

    // -------------------------------------------------------------------------
    // TEST 12: Admin User Provisioning & created_by_user_id Audit Trail
    // -------------------------------------------------------------------------
    console.log('\n[Test Group 12] Admin User Provisioning with Audit Field:');
    // Non-admin attempting to provision -> 403 Forbidden
    const opProvRes = await fetch(`${API_BASE}/auth/users`, {
      method: 'POST',
      headers: { 
        'Authorization': `Bearer ${operatorToken}`,
        'Content-Type': 'application/json' 
      },
      body: JSON.stringify({
        fullName: 'Unauthorized Provisioned User',
        email: `unauth_${Date.now()}@hackmysuru.gov.in`,
        password: 'password123',
        role: 'OPERATOR'
      })
    });
    assert(opProvRes.status === 403, 'POST /api/auth/users returns 403 Forbidden for OPERATOR');

    // ADMIN provisioning an OPERATOR account -> 201 Created
    const newOpEmail = `provisioned_op_${Date.now()}@hackmysuru.gov.in`;
    const adminProvRes = await fetch(`${API_BASE}/auth/users`, {
      method: 'POST',
      headers: { 
        'Authorization': `Bearer ${adminToken}`,
        'Content-Type': 'application/json' 
      },
      body: JSON.stringify({
        fullName: 'Mysuru North Zone Operator',
        email: newOpEmail,
        password: 'provisionedPass2026!',
        role: 'OPERATOR'
      })
    });
    const adminProvData = await adminProvRes.json();
    assert(adminProvRes.status === 201, 'POST /api/auth/users returns 201 Created for ADMIN');
    assert(adminProvData.data?.user?.role === 'OPERATOR', 'Provisioned user has OPERATOR role');

    // Verify created_by_user_id in database matches authenticated admin's ID
    const provDbRes = await pool.query(
      'SELECT id, email, role, created_by_user_id FROM users WHERE email = $1',
      [newOpEmail]
    );
    assert(provDbRes.rows.length === 1, 'Provisioned user found in database');
    assert(provDbRes.rows[0].created_by_user_id === adminUser.id, 'created_by_user_id preserves ID of authenticated admin who provisioned the account');

    // -------------------------------------------------------------------------
    // TEST 13: Citizen-Safe Public Endpoints (No regression to public tracking)
    // -------------------------------------------------------------------------
    console.log('\n[Test Group 13] Citizen-Safe Public Endpoints:');
    // POST /api/complaints is public
    const complaintRes = await fetch(`${API_BASE}/complaints`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: 'Water pipe leak near Sayyaji Rao Road',
        description: 'Clean drinking water pipe burst causing road flooding',
        category: 'WATER_LEAK',
        latitude: 12.3115,
        longitude: 76.6528,
        address: 'Sayyaji Rao Road, Mysuru'
      })
    });
    const complaintData = await complaintRes.json();
    assert(complaintRes.status === 201, 'POST /api/complaints remains public and returns 201');
    const complaintId = complaintData.data?.id || complaintData.data?.complaint?.id;
    assert(!!complaintId, 'Complaint created successfully with ID');

    // Public tracking: GET /api/complaints/:id
    const trackRes = await fetch(`${API_BASE}/complaints/${complaintId}`);
    const trackData = await trackRes.json();
    assert(trackRes.status === 200, 'GET /api/complaints/:id remains public and returns 200');
    const returnedComplaint = trackData.data?.complaint || trackData.data;
    assert(returnedComplaint?.id === complaintId, 'Complaint tracking data returned to citizen');
    assert(!returnedComplaint?.review_notes, 'Public tracking never leaks internal reviewer notes');

    // Public status history: GET /api/complaints/:id/status-history
    const historyRes = await fetch(`${API_BASE}/complaints/${complaintId}/status-history`);
    const historyData = await historyRes.json();
    assert(historyRes.status === 200, 'GET /api/complaints/:id/status-history returns 200 for public citizen');
    assert(Array.isArray(historyData.data) || Array.isArray(historyData.data?.statusHistory), 'Status history returned as array');

    // Public SLA: GET /api/complaints/:id/sla
    const slaRes = await fetch(`${API_BASE}/complaints/${complaintId}/sla`);
    assert(slaRes.status === 200, 'GET /api/complaints/:id/sla returns 200 for public citizen');

    // Public Notifications: GET /api/complaints/:id/notifications
    const notifRes = await fetch(`${API_BASE}/complaints/${complaintId}/notifications`);
    assert(notifRes.status === 200, 'GET /api/complaints/:id/notifications returns 200 for public citizen');

    // -------------------------------------------------------------------------
    // TEST 14: Rate Limiting on POST /api/auth/login
    // -------------------------------------------------------------------------
    console.log('\n[Test Group 14] Login Rate Limiting:');
    let rateLimitHit = false;
    for (let i = 0; i < 8; i++) {
      const res = await fetch(`${API_BASE}/auth/login`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'x-forwarded-for': '198.51.100.77'
        },
        body: JSON.stringify({
          email: 'rate_test@hackmysuru.gov.in',
          password: `wrong_attempt_${i}`
        })
      });
      if (res.status === 429) {
        rateLimitHit = true;
        const errData = await res.json();
        assert(errData.code === 'RATE_LIMIT_EXCEEDED', 'Rate limit returns RATE_LIMIT_EXCEEDED code');
        break;
      }
    }
    assert(rateLimitHit, 'Login rate limiter successfully triggers HTTP 429 after repeated failed attempts');

    // -------------------------------------------------------------------------
    // TEST 15: Socket.IO Authentication & Server-Side Scoping
    // -------------------------------------------------------------------------
    console.log('\n[Test Group 15] Socket.IO Gateway Authentication & Room Scoping:');
    
    // Connect anonymous socket
    const anonSocket = ClientIO('http://localhost:4000', {
      transports: ['websocket'],
      forceNew: true
    });

    const anonConnectedPromise = new Promise((resolve) => {
      anonSocket.on('system:connected', (data) => resolve(data));
    });
    const anonHandshake = await anonConnectedPromise;
    assert(anonHandshake.authenticated === false, 'Anonymous socket connects with authenticated: false');
    assert(anonHandshake.role === 'ANONYMOUS', 'Anonymous socket assigned to ANONYMOUS role');

    // Connect authenticated operator socket
    const opSocket = ClientIO('http://localhost:4000', {
      transports: ['websocket'],
      auth: { token: operatorToken },
      forceNew: true
    });

    const opConnectedPromise = new Promise((resolve) => {
      opSocket.on('system:connected', (data) => resolve(data));
    });
    const opHandshake = await opConnectedPromise;
    assert(opHandshake.authenticated === true, 'Operator socket connects with authenticated: true');
    assert(opHandshake.role === 'OPERATOR', 'Operator socket assigned to OPERATOR role');

    anonSocket.disconnect();
    opSocket.disconnect();

    // -------------------------------------------------------------------------
    // TEST 16: SQL Injection Resilience on Auth Endpoints
    // -------------------------------------------------------------------------
    console.log('\n[Test Group 16] SQL Injection Resilience:');
    const sqlInjectionRes = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: "' OR '1'='1' --",
        password: "' OR '1'='1' --"
      })
    });
    assert(sqlInjectionRes.status === 401 || sqlInjectionRes.status === 429, 'SQL injection attempt handled safely without unhandled database error');

    // -------------------------------------------------------------------------
    // TEST 17: PostGIS Spatial Routing Regressions (Stage 2-11)
    // -------------------------------------------------------------------------
    console.log('\n[Test Group 17] PostGIS Spatial Routing Regression Verification:');
    const gisRes = await fetch(`${API_BASE}/gis/test?lat=12.3115&lng=76.6528`);
    const gisData = await gisRes.json();
    assert(gisRes.status === 200, 'GET /api/gis/test returns 200 with PostGIS spatial query');
    assert(gisData.success === true, 'PostGIS spatial containment resolution succeeds');
    const resolvedJurisdiction = gisData.jurisdiction || gisData.data?.jurisdiction;
    assert(!!resolvedJurisdiction && (resolvedJurisdiction.name?.includes('MUDA') || resolvedJurisdiction.name?.includes('MCC')), 'PostGIS point-in-polygon correctly resolves active jurisdiction (MUDA/MCC)');

    // Cleanup test user
    await pool.query('DELETE FROM users WHERE email LIKE $1', ['%_test_%@example.com']);
    await pool.query('DELETE FROM users WHERE email LIKE $1', ['provisioned_op_%@hackmysuru.gov.in']);

    console.log('\n================================================================');
    console.log(`  STAGE 12 VERIFICATION COMPLETED: ALL ${passedTests}/${totalTests} ASSERTIONS PASSED`);
    console.log('================================================================');
    process.exit(0);
  } catch (err) {
    console.error('\n❌ STAGE 12 VERIFICATION FAILED:', err.message);
    process.exit(1);
  }
}

runStage12Tests();
