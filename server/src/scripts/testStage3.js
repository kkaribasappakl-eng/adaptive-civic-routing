const http = require('http');

const request = (path, method = 'GET', body = null) => {
  return new Promise((resolve, reject) => {
    const url = new URL(`http://localhost:4000${path}`);
    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method: method,
      headers: {
        'Content-Type': 'application/json'
      }
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve({ status: res.statusCode, body: parsed });
        } catch (e) {
          resolve({ status: res.statusCode, body: data });
        }
      });
    });

    req.on('error', reject);

    if (body) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
};

async function runStage3Verification() {
  console.log('====================================================');
  console.log('STAGE 3 COMPREHENSIVE VERIFICATION SUITE');
  console.log('Adaptive Civic Routing Intelligence System');
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

  try {
    // 1. Health check
    const health = await request('/api/health');
    assert(health.status === 200 && health.body.success === true && health.body.stage >= 3, '1. System Health Check', `Stage: ${health.body.stage}, Message: ${health.body.message}`);

    // 2. Database Status
    const db = await request('/api/system/database');
    assert(db.status === 200 && db.body.database?.postgisInstalled === true, '2. PostgreSQL 18 & PostGIS 3.6 Connected', `PostGIS: ${db.body.database?.postgisVersion}`);

    // 3. Reset Demo V1 & V2 state to guarantee clean test baseline
    console.log('\n--- Resetting to initial state (V1 ACTIVE, V2 DRAFT) ---');
    const { pool } = require('../config/db');
    await pool.query("UPDATE jurisdiction_versions SET status = 'DRAFT' WHERE version_code = 'MYS_2026_V2'");
    await pool.query("UPDATE jurisdiction_versions SET status = 'ACTIVE' WHERE version_code = 'MYS_2026_V1'");
    const v2Setup = await request('/api/jurisdictions/demo-v2-setup', 'POST');
    assert(v2Setup.status === 200 && v2Setup.body.success, '3. Setup Demo V2 scenario (MYS_2026_V2 as DRAFT)', v2Setup.body.data?.message);

    // 4. List versions
    const versionsRes = await request('/api/jurisdictions/versions');
    const versions = versionsRes.body.data;
    const v1 = versions.find(v => v.version_code === 'MYS_2026_V1');
    const v2 = versions.find(v => v.version_code === 'MYS_2026_V2');
    assert(v1 && v1.status === 'ACTIVE', '4. Initial Active Version is MYS_2026_V1', `V1 Status: ${v1?.status}`);
    assert(v2 && v2.status === 'DRAFT', '5. Proposed Version MYS_2026_V2 is DRAFT', `V2 Status: ${v2?.status}`);

    // 5. Test BEFORE Activation: Coordinate X (12.3150, 76.6500) under ACTIVE routing (V1)
    console.log('\n--- Testing GIS Lookup BEFORE V2 Activation ---');
    const coordXBefore = await request('/api/gis/test?lat=12.3150&lng=76.6500');
    assert(
      coordXBefore.status === 200 &&
      coordXBefore.body.matched === true &&
      coordXBefore.body.authority.code === 'MCC_DEMO' &&
      coordXBefore.body.jurisdiction.version === 'MYS_2026_V1',
      '6. BEFORE Activation: Coordinate X (12.3150, 76.6500) routes to MCC under active V1',
      `Authority: ${coordXBefore.body.authority?.name} (${coordXBefore.body.jurisdiction?.version})`
    );

    // 6. Test Palace (12.2958, 76.6394) under ACTIVE routing (V1)
    const palaceBefore = await request('/api/gis/test?lat=12.2958&lng=76.6394');
    assert(
      palaceBefore.status === 200 &&
      palaceBefore.body.matched === true &&
      palaceBefore.body.authority.code === 'MCC_DEMO',
      '7. BEFORE Activation: Mysore Palace routes to MCC under active V1',
      `Authority: ${palaceBefore.body.authority?.name}`
    );

    // 7. Preview Coordinate X against DRAFT V2
    console.log('\n--- Testing Preview against Proposed V2 (DRAFT) ---');
    const previewRes = await request('/api/jurisdictions/versions/MYS_2026_V2/preview?lat=12.3150&lng=76.6500', 'POST');
    assert(
      previewRes.status === 200 &&
      previewRes.body.matched === true &&
      previewRes.body.authority?.code === 'MUDA_DEMO' &&
      previewRes.body.isPreview === true,
      '8. PREVIEW V2: Coordinate X (12.3150, 76.6500) resolves to MUDA under V2 proposal',
      `Authority: ${previewRes.body.authority?.name} (Jurisdiction: ${previewRes.body.jurisdiction?.name})`
    );

    // 8. Compare V1 and V2
    console.log('\n--- Testing Version Comparison ---');
    const compareRes = await request('/api/jurisdictions/versions/compare?from=MYS_2026_V1&to=MYS_2026_V2');
    assert(
      compareRes.status === 200 &&
      compareRes.body.data?.fromVersion?.code === 'MYS_2026_V1' &&
      compareRes.body.data?.toVersion?.code === 'MYS_2026_V2',
      '9. Compare Versions: Successfully compares V1 vs V2 metadata & jurisdictions',
      `V1 jurisdictions: ${compareRes.body.data?.fromVersion?.jurisdictions?.length}, V2 jurisdictions: ${compareRes.body.data?.toVersion?.jurisdictions?.length}`
    );

    // 9. GeoJSON Boundaries endpoint
    const boundaries = await request('/api/jurisdictions/boundaries?version=MYS_2026_V2');
    assert(
      boundaries.status === 200 &&
      boundaries.body.type === 'FeatureCollection' &&
      boundaries.body.features.length >= 2,
      '10. GeoJSON Boundaries: Fetches MultiPolygon GeoJSON features for V2',
      `Features count: ${boundaries.body.features?.length}`
    );

    // 10. Activate V2 via POST /api/jurisdictions/versions/MYS_2026_V2/activate
    console.log('\n--- Executing Atomic V1 -> V2 Transition ---');
    const activateRes = await request('/api/jurisdictions/versions/MYS_2026_V2/activate', 'POST', {
      operator: 'civic_commissioner_admin'
    });
    assert(
      activateRes.status === 200 &&
      activateRes.body.success === true &&
      activateRes.body.activatedVersion.code === 'MYS_2026_V2' &&
      activateRes.body.previousVersion.code === 'MYS_2026_V1',
      '11. Atomic Transition: MYS_2026_V2 activated, MYS_2026_V1 retired in single transaction',
      activateRes.body.message
    );

    // 11. Verify Database State Post-Activation
    const versionsPost = await request('/api/jurisdictions/versions');
    const v1Post = versionsPost.body.data.find(v => v.version_code === 'MYS_2026_V1');
    const v2Post = versionsPost.body.data.find(v => v.version_code === 'MYS_2026_V2');
    assert(v1Post.status === 'RETIRED', '12. Post-Activation: MYS_2026_V1 is RETIRED', `V1 Status: ${v1Post?.status}`);
    assert(v2Post.status === 'ACTIVE', '13. Post-Activation: MYS_2026_V2 is ACTIVE', `V2 Status: ${v2Post?.status}`);

    // 12. Test AFTER Activation: Coordinate X (12.3150, 76.6500) under ACTIVE routing
    console.log('\n--- Testing GIS Lookup AFTER V2 Activation ---');
    const coordXAfter = await request('/api/gis/test?lat=12.3150&lng=76.6500');
    assert(
      coordXAfter.status === 200 &&
      coordXAfter.body.matched === true &&
      coordXAfter.body.authority.code === 'MUDA_DEMO' &&
      coordXAfter.body.jurisdiction.version === 'MYS_2026_V2',
      '14. AFTER Activation: Coordinate X (12.3150, 76.6500) NOW routes to MUDA under active V2!',
      `Authority: ${coordXAfter.body.authority?.name} (${coordXAfter.body.jurisdiction?.version})`
    );

    // 13. Test Palace (12.2958, 76.6394) under ACTIVE routing (should STILL be MCC)
    const palaceAfter = await request('/api/gis/test?lat=12.2958&lng=76.6394');
    assert(
      palaceAfter.status === 200 &&
      palaceAfter.body.matched === true &&
      palaceAfter.body.authority.code === 'MCC_DEMO' &&
      palaceAfter.body.jurisdiction.version === 'MYS_2026_V2',
      '15. AFTER Activation: Mysore Palace remains correctly with MCC under V2',
      `Authority: ${palaceAfter.body.authority?.name}`
    );

    // 14. Test Historical Query: Querying historical V1 after V2 activation
    console.log('\n--- Testing Historical Immutability (Querying V1 after V2 activation) ---');
    const historicalV1 = await request('/api/gis/test?lat=12.3150&lng=76.6500&version=MYS_2026_V1');
    assert(
      historicalV1.status === 200 &&
      historicalV1.body.matched === true &&
      historicalV1.body.authority.code === 'MCC_DEMO' &&
      historicalV1.body.jurisdiction.version === 'MYS_2026_V1',
      '16. Historical Immutability: Coordinate X queried against historical V1 still yields MCC',
      `Authority: ${historicalV1.body.authority?.name} (${historicalV1.body.jurisdiction?.version})`
    );

    // 15. Test Audit Trail
    console.log('\n--- Testing Audit Trail ---');
    const auditRes = await request('/api/jurisdictions/audit');
    const transitionLog = auditRes.body.data?.find(a => a.action === 'VERSION_ACTIVATED' && a.new_version_code === 'MYS_2026_V2');
    assert(
      auditRes.status === 200 && Boolean(transitionLog),
      '17. Audit Logging: Transition logged with operator and timestamp',
      `Action: ${transitionLog?.action}, Operator: ${transitionLog?.operator}, From: ${transitionLog?.previous_version_code} -> To: ${transitionLog?.new_version_code}`
    );

    // 16. Negative Test: Cannot activate an already ACTIVE version
    console.log('\n--- Testing Edge Case & Constraint Enforcements ---');
    const reActivateRes = await request('/api/jurisdictions/versions/MYS_2026_V2/activate', 'POST');
    assert(
      reActivateRes.status === 400 && reActivateRes.body.error?.includes('already ACTIVE'),
      '18. Negative Test: Refuses to re-activate already ACTIVE version',
      `Error: ${reActivateRes.body.error}`
    );

    // 17. Negative Test: Cannot activate a RETIRED version
    const activateRetiredRes = await request('/api/jurisdictions/versions/MYS_2026_V1/activate', 'POST');
    assert(
      activateRetiredRes.status === 400 && activateRetiredRes.body.error?.includes('RETIRED'),
      '19. Negative Test: Refuses to activate RETIRED version without creating a draft',
      `Error: ${activateRetiredRes.body.error}`
    );

  } catch (err) {
    console.error('Fatal error during test suite:', err);
    failed++;
  }

  console.log('\n====================================================');
  console.log(`TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('====================================================\n');
  process.exit(failed > 0 ? 1 : 0);
}

runStage3Verification();
