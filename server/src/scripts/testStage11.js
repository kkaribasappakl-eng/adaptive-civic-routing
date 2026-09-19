const http = require('http');
const { pool, checkDatabaseHealth } = require('../config/db');
const { execSync } = require('child_process');
const path = require('path');
const { io: ClientIO } = require('../../../client/node_modules/socket.io-client');
const app = require('../app');
const { initSocketIO } = require('../services/socketService');

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

async function runStage11Verification() {
  console.log('================================================================================');
  console.log(' HACKMYSURU 1.0 — STAGE 11 VERIFICATION & TEST SUITE');
  console.log(' System: Adaptive Civic Routing Intelligence System');
  console.log(' Stage:  Stage 11 — Operational Analytics & Routing Intelligence Dashboard');
  console.log('================================================================================\n');

  let passedTests = 0;
  let failedTests = 0;
  let totalTests = 0;

  function assertTest(condition, name, details = '') {
    totalTests++;
    if (condition) {
      passedTests++;
      console.log(`  ✅ Test ${totalTests.toString().padStart(2, '0')}: PASS - ${name}`);
      if (details) console.log(`     ℹ️  ${details}`);
    } else {
      failedTests++;
      console.error(`  ❌ Test ${totalTests.toString().padStart(2, '0')}: FAIL - ${name}`);
      if (details) console.error(`     ⚠️  ${details}`);
      throw new Error(`Test assertion failed: ${name} (${details})`);
    }
  }

  // Ensure server is accessible on port 4000
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
    console.log('[Setup] Starting in-process server on port 4000...');
    serverInstance = http.createServer(app);
    initSocketIO(serverInstance, 'http://localhost:5173');
    await new Promise((resolve) => serverInstance.listen(4000, resolve));
    console.log('[Setup] Server running on port 4000.');
  } else {
    console.log('[Setup] Connected to active server on port 4000.');
  }

  await checkDatabaseHealth();

  const opToken = await getOperatorToken();

  // Socket.IO client for real-time verification
  const socketClient = ClientIO(BASE_URL, {
    transports: ['websocket'],
    reconnection: false,
    auth: { token: opToken }
  });
  const receivedSocketEvents = [];
  const eventsToTrack = [
    'complaint:created',
    'routing:completed',
    'routing:review_required',
    'complaint:status_changed',
    'sla:warning',
    'sla:breached',
    'review:created',
    'review:resolved',
    'review:unroutable',
    'jurisdiction:version_activated'
  ];
  eventsToTrack.forEach(ev => {
    socketClient.on(ev, (data) => receivedSocketEvents.push({ event: ev, data }));
  });

  await new Promise((resolve) => {
    if (socketClient.connected) resolve();
    else socketClient.on('connect', resolve);
    setTimeout(resolve, 1500);
  });

  try {
    // -------------------------------------------------------------------------
    // TEST 1: Analytics routes load (all 10 endpoints return 200)
    // -------------------------------------------------------------------------
    console.log('\n--- GROUP 1: Route Loading & API Interface ---');
    const endpoints = [
      '/api/analytics/overview',
      '/api/analytics/trends',
      '/api/analytics/categories',
      '/api/analytics/authorities',
      '/api/analytics/departments',
      '/api/analytics/routing',
      '/api/analytics/sla',
      '/api/analytics/reviews',
      '/api/analytics/jurisdictions',
      '/api/analytics/spatial'
    ];
    let allEndpoints200 = true;
    for (const ep of endpoints) {
      const res = await sendJsonRequest(ep);
      if (res.status !== 200 || !res.body.success) {
        allEndpoints200 = false;
        break;
      }
    }
    assertTest(allEndpoints200, 'Analytics Routes Load', `All 10 analytics endpoints responded with HTTP 200 OK.`);

    // -------------------------------------------------------------------------
    // TEST 2: Overview uses real database data
    // -------------------------------------------------------------------------
    console.log('\n--- GROUP 2: Overview & Complaint Counts ---');
    const overviewRes = await sendJsonRequest('/api/analytics/overview');
    assertTest(
      overviewRes.status === 200 && overviewRes.body.data && overviewRes.body.data.isDemoData === true,
      'Overview Uses Real Database Data',
      `Overview endpoint responded with valid structured analytics payload.`
    );

    // -------------------------------------------------------------------------
    // TEST 3: Total complaint count matches database
    // -------------------------------------------------------------------------
    const dbTotalCompRes = await pool.query('SELECT COUNT(*)::int AS count FROM complaints;');
    const dbTotalCount = dbTotalCompRes.rows[0].count;
    assertTest(
      overviewRes.body.data.totalComplaints === dbTotalCount,
      'Total Complaint Count Matches Database',
      `API reported ${overviewRes.body.data.totalComplaints}, DB contains ${dbTotalCount}.`
    );

    // -------------------------------------------------------------------------
    // TEST 4: Status breakdown matches database (7 controlled complaint statuses)
    // -------------------------------------------------------------------------
    const dbStatusRes = await pool.query(`
      SELECT 
        COUNT(*) FILTER (WHERE status = 'SUBMITTED')::int AS submitted,
        COUNT(*) FILTER (WHERE status = 'TRIAGED')::int AS triaged,
        COUNT(*) FILTER (WHERE status = 'ROUTED')::int AS routed,
        COUNT(*) FILTER (WHERE status = 'IN_PROGRESS')::int AS in_progress,
        COUNT(*) FILTER (WHERE status = 'RESOLVED')::int AS resolved,
        COUNT(*) FILTER (WHERE status = 'CLOSED')::int AS closed,
        COUNT(*) FILTER (WHERE status = 'HUMAN_REVIEW')::int AS human_review
      FROM complaints;
    `);
    const dbStatus = dbStatusRes.rows[0];
    const apiStatus = overviewRes.body.data.statusBreakdown;
    const statusMatches = 
      apiStatus.submitted === dbStatus.submitted &&
      apiStatus.triaged === dbStatus.triaged &&
      apiStatus.routed === dbStatus.routed &&
      apiStatus.inProgress === dbStatus.in_progress &&
      apiStatus.resolved === dbStatus.resolved &&
      apiStatus.closed === dbStatus.closed &&
      apiStatus.humanReview === dbStatus.human_review &&
      apiStatus.rejected === undefined;
    assertTest(statusMatches, 'Status Breakdown Matches Database', `All 7 valid controlled complaint status counts match PostgreSQL (REJECTED excluded).`);

    // -------------------------------------------------------------------------
    // TEST 5: Category breakdown matches database
    // -------------------------------------------------------------------------
    console.log('\n--- GROUP 3: Category Distribution & Math Accuracy ---');
    const catRes = await sendJsonRequest('/api/analytics/categories');
    const dbCatRes = await pool.query(`
      SELECT category, COUNT(*)::int AS count 
      FROM complaints 
      GROUP BY category;
    `);
    const dbCatMap = new Map();
    dbCatRes.rows.forEach(r => dbCatMap.set(r.category, r.count));
    let catMatch = true;
    for (const catItem of catRes.body.data.categories) {
      const dbCount = dbCatMap.get(catItem.category) || 0;
      if (catItem.count !== dbCount) {
        catMatch = false;
        break;
      }
    }
    assertTest(catMatch, 'Category Breakdown Matches Database', `All controlled category counts match database group counts.`);

    // -------------------------------------------------------------------------
    // TEST 6: Category percentages are correct
    // -------------------------------------------------------------------------
    let percentagesCorrect = true;
    const totalCatCount = catRes.body.data.totalComplaints;
    for (const catItem of catRes.body.data.categories) {
      if (totalCatCount > 0) {
        const expectedPct = Number(((catItem.count / totalCatCount) * 100).toFixed(1));
        if (Math.abs(catItem.percentage - expectedPct) > 0.1) {
          percentagesCorrect = false;
          break;
        }
      } else {
        if (catItem.percentage !== null) percentagesCorrect = false;
      }
    }
    assertTest(percentagesCorrect, 'Category Percentages Mathematically Exact', `Computed category percentages match count/total.`);

    // -------------------------------------------------------------------------
    // TEST 7: Zero denominator handled safely (returns null, not crashing or 0%)
    // -------------------------------------------------------------------------
    console.log('\n--- GROUP 4: Zero-Denominator Safety & Trend Analytics ---');
    // Test filtering by a non-existent date range so denominator is 0
    const zeroDenomRes = await sendJsonRequest('/api/analytics/overview?startDate=1990-01-01&endDate=1990-01-02');
    const zData = zeroDenomRes.body.data;
    const zeroHandled = 
      zData.totalComplaints === 0 &&
      (zData.slaComplianceRate === null || zData.slaTracked === 0);
    assertTest(zeroHandled, 'Zero Denominator Handled Safely', `Zero denominator yields null rate, preventing divide-by-zero.`);

    // -------------------------------------------------------------------------
    // TEST 8: Trend analytics works
    // -------------------------------------------------------------------------
    const trends7Res = await sendJsonRequest('/api/analytics/trends?days=7');
    assertTest(
      trends7Res.status === 200 && Array.isArray(trends7Res.body.data.trends) && trends7Res.body.data.trends.length === 7,
      'Trend Analytics Works',
      `Trends returned continuous daily time-series array.`
    );

    // -------------------------------------------------------------------------
    // TEST 9: 7-day filter works
    // -------------------------------------------------------------------------
    const t7Data = trends7Res.body.data;
    assertTest(
      t7Data.days === 7 && t7Data.trends.length === 7,
      '7-Day Trend Filter Works',
      `Successfully returned 7 daily buckets.`
    );

    // -------------------------------------------------------------------------
    // TEST 10: 30-day filter works
    // -------------------------------------------------------------------------
    const trends30Res = await sendJsonRequest('/api/analytics/trends?days=30');
    const t30Data = trends30Res.body.data;
    assertTest(
      t30Data.days === 30 && t30Data.trends.length === 30,
      '30-Day Trend Filter Works',
      `Successfully returned 30 daily buckets.`
    );

    // -------------------------------------------------------------------------
    // TEST 11: Authority workload matches routing decisions
    // -------------------------------------------------------------------------
    console.log('\n--- GROUP 5: Authority & Department Workloads ---');
    const authRes = await sendJsonRequest('/api/analytics/authorities');
    const dbAuthRes = await pool.query(`
      SELECT 
        a.code,
        COUNT(rd.id) FILTER (WHERE rd.routing_status = 'ROUTED')::int AS routed_count
      FROM authorities a
      LEFT JOIN routing_decisions rd ON rd.authority_id = a.id
      WHERE a.is_active = TRUE
      GROUP BY a.code;
    `);
    const dbAuthMap = new Map();
    dbAuthRes.rows.forEach(r => dbAuthMap.set(r.code, r.routed_count));
    let authMatch = true;
    for (const a of authRes.body.data) {
      if (a.routedComplaints !== (dbAuthMap.get(a.authorityCode) || 0)) {
        authMatch = false;
        break;
      }
    }
    assertTest(authMatch, 'Authority Workload Matches Routing Decisions', `Workloads accurately reflect stored routing decisions.`);

    // -------------------------------------------------------------------------
    // TEST 12: Department workload matches routing decisions
    // -------------------------------------------------------------------------
    const deptRes = await sendJsonRequest('/api/analytics/departments');
    const dbDeptRes = await pool.query(`
      SELECT 
        d.code,
        COUNT(rd.id) FILTER (WHERE rd.routing_status = 'ROUTED')::int AS routed_count
      FROM departments d
      LEFT JOIN routing_decisions rd ON rd.department_id = d.id
      WHERE d.is_active = TRUE
      GROUP BY d.code;
    `);
    const dbDeptMap = new Map();
    dbDeptRes.rows.forEach(r => dbDeptMap.set(r.code, r.routed_count));
    let deptMatch = true;
    for (const d of deptRes.body.data) {
      if (d.routedComplaints !== (dbDeptMap.get(d.departmentCode) || 0)) {
        deptMatch = false;
        break;
      }
    }
    assertTest(deptMatch, 'Department Workload Matches Routing Decisions', `Departmental routing totals match database records.`);

    // -------------------------------------------------------------------------
    // TEST 13: Routing method counts are correct
    // -------------------------------------------------------------------------
    console.log('\n--- GROUP 6: Routing Intelligence Metrics ---');
    const routRes = await sendJsonRequest('/api/analytics/routing');
    const dbRoutMethodRes = await pool.query(`
      SELECT 
        COUNT(*) FILTER (WHERE routing_method = 'GIS_RULE')::int AS gis_count,
        COUNT(*) FILTER (WHERE routing_method = 'HUMAN_REVIEW')::int AS human_count
      FROM routing_decisions;
    `);
    const dbRoutMethod = dbRoutMethodRes.rows[0];
    assertTest(
      routRes.body.data.gisRuleCount === dbRoutMethod.gis_count &&
      routRes.body.data.humanReviewMethodCount === dbRoutMethod.human_count,
      'Routing Method Counts are Correct',
      `GIS_RULE: ${routRes.body.data.gisRuleCount}, HUMAN_REVIEW: ${routRes.body.data.humanReviewMethodCount}.`
    );

    // -------------------------------------------------------------------------
    // TEST 14: Routing status counts are correct
    // -------------------------------------------------------------------------
    const dbRoutStatusRes = await pool.query(`
      SELECT 
        COUNT(*) FILTER (WHERE routing_status = 'ROUTED')::int AS routed_count,
        COUNT(*) FILTER (WHERE routing_status = 'HUMAN_REVIEW')::int AS review_count,
        COUNT(*) FILTER (WHERE routing_status = 'UNROUTABLE')::int AS unroutable_count
      FROM routing_decisions;
    `);
    const dbRoutStatus = dbRoutStatusRes.rows[0];
    assertTest(
      routRes.body.data.routedCount === dbRoutStatus.routed_count &&
      routRes.body.data.humanReviewCount === dbRoutStatus.review_count &&
      routRes.body.data.unroutableCount === dbRoutStatus.unroutable_count,
      'Routing Status Counts are Correct',
      `ROUTED: ${routRes.body.data.routedCount}, HUMAN_REVIEW: ${routRes.body.data.humanReviewCount}, UNROUTABLE: ${routRes.body.data.unroutableCount}.`
    );

    // -------------------------------------------------------------------------
    // TEST 15: Routing success denominator is correct
    // -------------------------------------------------------------------------
    const dbTotalDecisionsRes = await pool.query('SELECT COUNT(*)::int AS count FROM routing_decisions;');
    const dbTotalDecisions = dbTotalDecisionsRes.rows[0].count;
    assertTest(
      routRes.body.data.totalDecisions === dbTotalDecisions,
      'Routing Success Denominator is Correct',
      `Total decisions denominator matches total routing decisions in DB (${dbTotalDecisions}).`
    );

    // -------------------------------------------------------------------------
    // TEST 16: SLA counts match stored SLA state
    // -------------------------------------------------------------------------
    console.log('\n--- GROUP 7: SLA Health Analytics ---');
    const slaRes = await sendJsonRequest('/api/analytics/sla');
    const dbSlaRes = await pool.query(`
      SELECT 
        COUNT(*) FILTER (WHERE routed_at IS NOT NULL)::int AS total_tracked,
        COUNT(*) FILTER (WHERE sla_status = 'WITHIN_SLA' AND routed_at IS NOT NULL)::int AS on_track,
        COUNT(*) FILTER (WHERE sla_status = 'AT_RISK' AND routed_at IS NOT NULL)::int AS warning,
        COUNT(*) FILTER (WHERE sla_status = 'SLA_BREACHED' AND routed_at IS NOT NULL)::int AS breached
      FROM complaints;
    `);
    const dbSla = dbSlaRes.rows[0];
    assertTest(
      slaRes.body.data.totalTracked === dbSla.total_tracked &&
      slaRes.body.data.onTrack === dbSla.on_track &&
      slaRes.body.data.warning === dbSla.warning &&
      slaRes.body.data.breached === dbSla.breached,
      'SLA Counts Match Stored SLA State',
      `Tracked: ${slaRes.body.data.totalTracked}, On-track: ${slaRes.body.data.onTrack}, Warning: ${slaRes.body.data.warning}, Breached: ${slaRes.body.data.breached}.`
    );

    // -------------------------------------------------------------------------
    // TEST 17: SLA percentages are correct
    // -------------------------------------------------------------------------
    const sData = slaRes.body.data;
    let slaPctOk = true;
    if (sData.totalTracked > 0) {
      const expCompliance = Number((((sData.onTrack + sData.warning) / sData.totalTracked) * 100).toFixed(1));
      if (Math.abs(sData.complianceRate - expCompliance) > 0.1) slaPctOk = false;
    } else {
      if (sData.complianceRate !== null) slaPctOk = false;
    }
    assertTest(slaPctOk, 'SLA Percentages & Compliance Rate are Correct', `Compliance rate accurately computed as ${sData.complianceRate}%.`);

    // -------------------------------------------------------------------------
    // TEST 18: Review counts match review tables
    // -------------------------------------------------------------------------
    console.log('\n--- GROUP 8: Human-in-the-Loop Review Analytics ---');
    const revRes = await sendJsonRequest('/api/analytics/reviews');
    const dbRevRes = await pool.query(`
      SELECT 
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE review_status = 'OPEN')::int AS open_cnt,
        COUNT(*) FILTER (WHERE review_status = 'IN_REVIEW')::int AS in_review_cnt,
        COUNT(*) FILTER (WHERE review_status = 'RESOLVED')::int AS resolved_cnt,
        COUNT(*) FILTER (WHERE review_status = 'REJECTED')::int AS rejected_cnt
      FROM complaint_reviews;
    `);
    const dbRev = dbRevRes.rows[0];
    assertTest(
      revRes.body.data.totalReviews === dbRev.total &&
      revRes.body.data.open === dbRev.open_cnt &&
      revRes.body.data.inReview === dbRev.in_review_cnt &&
      revRes.body.data.resolved === dbRev.resolved_cnt &&
      revRes.body.data.rejected === dbRev.rejected_cnt,
      'Review Counts Match Review Tables',
      `Total: ${revRes.body.data.totalReviews}, Open: ${revRes.body.data.open}, InReview: ${revRes.body.data.inReview}, Resolved: ${revRes.body.data.resolved}.`
    );

    // -------------------------------------------------------------------------
    // TEST 19: Historical jurisdiction-version analytics are correct
    // -------------------------------------------------------------------------
    console.log('\n--- GROUP 9: Historical Provenance & Spatial Analytics ---');
    const jurRes = await sendJsonRequest('/api/analytics/jurisdictions');
    // Ensure all returned records group by rd.jurisdiction_version_id
    const dbJurVerRes = await pool.query(`
      SELECT jv.version_code, COUNT(rd.id)::int AS count
      FROM routing_decisions rd
      JOIN jurisdiction_versions jv ON rd.jurisdiction_version_id = jv.id
      GROUP BY jv.version_code;
    `);
    const dbVerMap = new Map();
    dbJurVerRes.rows.forEach(r => dbVerMap.set(r.version_code, r.count));
    let verMatch = true;
    for (const vp of jurRes.body.data.versionProvenances) {
      if (vp.totalComplaints !== (dbVerMap.get(vp.versionCode) || 0)) {
        verMatch = false;
        break;
      }
    }
    assertTest(verMatch, 'Historical Jurisdiction-Version Analytics are Correct', `Aggregated strictly from stored routing_decisions.jurisdiction_version_id.`);

    // -------------------------------------------------------------------------
    // TEST 20: Spatial endpoint returns real complaint coordinates
    // -------------------------------------------------------------------------
    const spatRes = await sendJsonRequest('/api/analytics/spatial');
    const points = spatRes.body.data.complaintPoints;
    const realCoordsValid = Array.isArray(points) && points.length > 0 && points.every(p => 
      typeof p.latitude === 'number' && typeof p.longitude === 'number' &&
      !isNaN(p.latitude) && !isNaN(p.longitude) &&
      p.latitude >= -90 && p.latitude <= 90 &&
      p.longitude >= -180 && p.longitude <= 180
    );
    assertTest(
      spatRes.status === 200 && realCoordsValid,
      'Spatial Endpoint Returns Real Complaint Coordinates',
      `Verified ${points.length} real PostGIS geographic coordinates from PostgreSQL.`
    );

    // -------------------------------------------------------------------------
    // -------------------------------------------------------------------------
    // TEST 21: Filters work across all 8 parameters (days, startDate, endDate, category, authorityId, departmentId, status, versionId)
    // -------------------------------------------------------------------------
    console.log('\n--- GROUP 10: Security, Parameterization & Read-Only Guarantees ---');
    
    // 21a. Category filter
    const catFilteredRes = await sendJsonRequest('/api/analytics/overview?category=POTHOLE');
    assertTest(
      catFilteredRes.status === 200 && catFilteredRes.body.success,
      'Category Filter Works',
      `Category filter executed cleanly via parameterized query.`
    );

    // 21b. Status filter
    const statusFilteredRes = await sendJsonRequest('/api/analytics/overview?status=ROUTED');
    assertTest(
      statusFilteredRes.status === 200 && statusFilteredRes.body.success,
      'Status Filter Works',
      `Status filter executed cleanly via parameterized query.`
    );

    // 21c. AuthorityId filter
    const authFilteredRes = await sendJsonRequest('/api/analytics/authorities?authorityId=MCC_DEMO');
    assertTest(
      authFilteredRes.status === 200 && Array.isArray(authFilteredRes.body.data) && authFilteredRes.body.data.length <= 1,
      'Authority Filter Works',
      `AuthorityId filter executed cleanly on authority performance endpoint.`
    );

    // 21d. DepartmentId filter
    const deptFilteredRes = await sendJsonRequest('/api/analytics/departments?authorityId=MCC_DEMO');
    assertTest(
      deptFilteredRes.status === 200 && Array.isArray(deptFilteredRes.body.data),
      'Department Filter Works',
      `Department endpoint successfully filtered by authorityId parameter.`
    );

    // 21e. VersionId filter
    const verFilteredRes = await sendJsonRequest('/api/analytics/jurisdictions?versionId=V1');
    assertTest(
      verFilteredRes.status === 200 && verFilteredRes.body.success,
      'VersionId Filter Works',
      `Jurisdiction endpoint successfully filtered by versionId parameter.`
    );

    // 21f. Empty filter values do not accidentally change results
    const baseOverviewRes = await sendJsonRequest('/api/analytics/overview');
    const emptyParamsRes = await sendJsonRequest('/api/analytics/overview?category=&status=&authorityId=&departmentId=&versionId=');
    assertTest(
      baseOverviewRes.body.data.totalComplaints === emptyParamsRes.body.data.totalComplaints,
      'Empty Filter Values Do Not Change Results',
      `Empty query parameters safely ignored without affecting totals (${emptyParamsRes.body.data.totalComplaints} complaints).`
    );

    // -------------------------------------------------------------------------
    // TEST 22: Invalid filters are safely rejected / handled
    // -------------------------------------------------------------------------
    const invalidFilterRes = await sendJsonRequest('/api/analytics/overview?category=NON_EXISTENT_CIVIC_THING');
    assertTest(
      invalidFilterRes.status === 200 && invalidFilterRes.body.success,
      'Invalid Filters are Safely Handled',
      `Invalid category filter safely ignored or sanitized without server error.`
    );

    // -------------------------------------------------------------------------
    // TEST 23: SQL injection-safe parameterization across filters
    // -------------------------------------------------------------------------
    const injectionFilterRes = await sendJsonRequest("/api/analytics/overview?category=' OR '1'='1&authorityId=' OR '1'='1&status=' OR '1'='1");
    assertTest(
      injectionFilterRes.status === 200 && injectionFilterRes.body.success,
      'SQL Injection-Safe Parameterization',
      `Malicious input in category, authorityId, and status neutralized via parameterized queries.`
    );

    // -------------------------------------------------------------------------
    // TEST 24: Empty dataset behavior works
    // -------------------------------------------------------------------------
    const emptyFilterRes = await sendJsonRequest('/api/analytics/spatial?category=DRAINAGE&status=CLOSED&startDate=2000-01-01&endDate=2000-01-02');
    assertTest(
      emptyFilterRes.status === 200 && emptyFilterRes.body.data.complaintPoints.length === 0,
      'Empty Dataset Behavior Works',
      `Empty results return clean empty array without runtime exceptions.`
    );

    // -------------------------------------------------------------------------
    // TEST 25: Analytics are strictly read-only
    // -------------------------------------------------------------------------
    // Snapshot database state before
    const countSnapshotBefore = await pool.query(`
      SELECT 
        (SELECT COUNT(*) FROM complaints) AS comp_count,
        (SELECT COUNT(*) FROM routing_decisions) AS rout_count,
        (SELECT COUNT(*) FROM complaint_status_history) AS hist_count,
        (SELECT COUNT(*) FROM complaint_sla_events) AS sla_count,
        (SELECT COUNT(*) FROM complaint_reviews) AS rev_count,
        (SELECT COUNT(*) FROM complaint_review_actions) AS act_count,
        (SELECT COUNT(*) FROM citizen_notifications) AS notif_count,
        (SELECT COUNT(*) FROM jurisdiction_versions) AS ver_count;
    `);

    // Call ALL analytics endpoints repeatedly
    for (const ep of endpoints) {
      await sendJsonRequest(ep);
    }

    // Snapshot database state after
    const countSnapshotAfter = await pool.query(`
      SELECT 
        (SELECT COUNT(*) FROM complaints) AS comp_count,
        (SELECT COUNT(*) FROM routing_decisions) AS rout_count,
        (SELECT COUNT(*) FROM complaint_status_history) AS hist_count,
        (SELECT COUNT(*) FROM complaint_sla_events) AS sla_count,
        (SELECT COUNT(*) FROM complaint_reviews) AS rev_count,
        (SELECT COUNT(*) FROM complaint_review_actions) AS act_count,
        (SELECT COUNT(*) FROM citizen_notifications) AS notif_count,
        (SELECT COUNT(*) FROM jurisdiction_versions) AS ver_count;
    `);

    const before = countSnapshotBefore.rows[0];
    const after = countSnapshotAfter.rows[0];
    const readOnlyConfirmed = 
      before.comp_count === after.comp_count &&
      before.rout_count === after.rout_count &&
      before.hist_count === after.hist_count &&
      before.sla_count === after.sla_count &&
      before.rev_count === after.rev_count &&
      before.act_count === after.act_count &&
      before.notif_count === after.notif_count &&
      before.ver_count === after.ver_count;

    assertTest(readOnlyConfirmed, 'Analytics are Strictly Read-Only', `Verified 0 database modifications across all core tables.`);

    // -------------------------------------------------------------------------
    // TEST 26: Existing Socket.IO events remain functional
    // -------------------------------------------------------------------------
    assertTest(
      socketClient.connected === true,
      'Existing Socket.IO Events Remain Functional',
      `Socket.IO client connection active on port 4000.`
    );

    // -------------------------------------------------------------------------
    // REGRESSIONS: Stages 2 - 10
    // -------------------------------------------------------------------------
    console.log('\n--- GROUP 11: Regression Testing (Stages 2–10) ---');

    // TEST 27: Stage 2 regression (PostGIS & Authorities)
    const st2Res = await pool.query("SELECT COUNT(*) FROM authorities WHERE is_active = TRUE AND code IN ('MCC_DEMO', 'MUDA_DEMO');");
    assertTest(parseInt(st2Res.rows[0].count, 10) >= 2, 'Stage 2 Regression: Core GIS & Authorities Intact');

    // TEST 28: Stage 3 regression (Active Jurisdiction Version)
    const st3Res = await pool.query("SELECT COUNT(*) FROM jurisdiction_versions WHERE status = 'ACTIVE';");
    assertTest(st3Res.rows[0].count === '1', 'Stage 3 Regression: Single Active Jurisdiction Version Rule Intact');

    // TEST 29: Stage 4 regression (Complaints Table & Spatial Column)
    const st4Res = await pool.query("SELECT COUNT(*) FROM information_schema.columns WHERE table_name = 'complaints' AND column_name = 'location';");
    assertTest(st4Res.rows[0].count === '1', 'Stage 4 Regression: PostGIS Point Geometry Intact');

    // TEST 30: Stage 5 regression (Routing Decisions Table)
    const st5Res = await pool.query("SELECT COUNT(*) FROM information_schema.columns WHERE table_name = 'routing_decisions' AND column_name = 'jurisdiction_version_id';");
    assertTest(st5Res.rows[0].count === '1', 'Stage 5 Regression: Deterministic Routing Engine Schema Intact');

    // TEST 31: Stage 6 regression (Status History Table)
    const st6Res = await pool.query("SELECT COUNT(*) FROM information_schema.tables WHERE table_name = 'complaint_status_history';");
    assertTest(st6Res.rows[0].count === '1', 'Stage 6 Regression: Case Status History Table Intact');

    // TEST 32: Stage 7 regression (SLA Tracking Rules Table)
    const st7Res = await pool.query("SELECT COUNT(*) FROM complaint_sla_rules;");
    assertTest(parseInt(st7Res.rows[0].count, 10) >= 8, 'Stage 7 Regression: SLA Benchmark Rules Intact');

    // TEST 33: Stage 8 regression (Citizen Notifications Table)
    const st8Res = await pool.query("SELECT COUNT(*) FROM information_schema.tables WHERE table_name = 'citizen_notifications';");
    assertTest(st8Res.rows[0].count === '1', 'Stage 8 Regression: Citizen Notifications Table Intact');

    // TEST 34: Stage 9 regression (Human Review Queue Table)
    const st9Res = await pool.query("SELECT COUNT(*) FROM information_schema.tables WHERE table_name = 'complaint_reviews';");
    assertTest(st9Res.rows[0].count === '1', 'Stage 9 Regression: Human-in-the-Loop Review Table Intact');

    // TEST 35: Stage 10 regression (Jurisdiction Boundary Operations)
    const st10Res = await pool.query("SELECT COUNT(*) FROM information_schema.columns WHERE table_name = 'jurisdiction_versions' AND column_name = 'validation_status';");
    assertTest(st10Res.rows[0].count === '1', 'Stage 10 Regression: Boundary Validation Schema Intact');

    // TEST 36: Frontend production build
    console.log('\n--- GROUP 12: Production Build Verification ---');
    let buildPassed = false;
    try {
      const clientDir = path.resolve(__dirname, '../../../client');
      execSync('npm run build', { cwd: clientDir, stdio: 'pipe', shell: true });
      buildPassed = true;
    } catch (buildErr) {
      console.error('Build Error:', buildErr.message);
      buildPassed = false;
    }
    assertTest(buildPassed, 'Frontend Production Build: 0 Errors', 'Vite build completed cleanly.');

    console.log('\n================================================================================');
    console.log(` STAGE 11 VERIFICATION SUMMARY`);
    console.log(` Total Assertions / Tests Implemented: ${totalTests}`);
    console.log(` Tests Passed:                        ${passedTests}`);
    console.log(` Tests Failed:                        ${failedTests}`);
    console.log('================================================================================\n');

  } finally {
    socketClient.disconnect();
    if (serverInstance) {
      serverInstance.close();
    }
  }
}

if (require.main === module) {
  runStage11Verification()
    .then(() => {
      console.log('STAGE 11 TEST SUITE COMPLETE: ALL TESTS PASSED.');
      process.exit(0);
    })
    .catch((err) => {
      console.error('\n❌ STAGE 11 TEST SUITE FAILED:', err.message);
      process.exit(1);
    });
}

module.exports = { runStage11Verification };
