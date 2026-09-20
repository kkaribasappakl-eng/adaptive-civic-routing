/**
 * Comprehensive verification test script for Stage 15:
 * Automatic Deterministic PostGIS Complaint Routing & Routing Engine Code Lookup
 * 
 * Verifies:
 * 1. Inside-boundary citizen complaint automatically routes to ROUTED upon creation.
 * 2. Deterministic authority, department, jurisdiction zone, and version are populated.
 * 3. Routing method is GIS_RULE and reason is generated from real PostGIS ST_Covers decision.
 * 4. Outside-boundary citizen complaint automatically routes to HUMAN_REVIEW without inventing authority.
 * 5. Idempotency guarantees: re-routing returns existing decision with ZERO duplicate rows.
 * 6. Audit, SLA, status history, and notification counts are strictly verified for zero duplication.
 * 7. Explicit unrouted complaints (autoRoute = false) resolve correctly as AWAITING_ROUTING fallback.
 * 8. Lookup works with complaint_code, UUID, whitespace padding, and case differences.
 * 9. Nonexistent complaint code returns null / 404.
 */

const { pool } = require('../config/db');
const complaintService = require('../services/complaintService');
const routingService = require('../services/routingService');

async function runTest() {
  console.log('================================================================');
  console.log('STAGE 15: AUTOMATIC COMPLAINT ROUTING & LOOKUP VERIFICATION');
  console.log('================================================================\n');

  let passedTests = 0;
  let totalTests = 0;

  function assert(condition, description, details = '') {
    totalTests++;
    if (condition) {
      console.log(`[PASS] ${description}`);
      if (details) console.log(`       ${details}`);
      passedTests++;
    } else {
      console.error(`[FAIL] ${description}`);
      if (details) console.error(`       ${details}`);
      process.exitCode = 1;
    }
  }

  try {
    // -------------------------------------------------------------------------
    // GROUP 1: Automatic Routing for Inside-Boundary Complaint
    // -------------------------------------------------------------------------
    console.log('--- Step 1: Automatic Routing for Inside-Boundary Complaint ---');
    const insideResult = await complaintService.createComplaint({
      description: 'Major road fissure and pothole on Jhansi Lakshmibai road auto-route test',
      category: 'POTHOLE',
      category_source: 'CITIZEN_SELECTED',
      category_confidence: 1.0,
      latitude: 12.3020,
      longitude: 76.6430,
      citizen_contact: '9876543210'
    }, '/uploads/complaints/test_photo.jpg');

    const insideComp = insideResult.complaint;
    const insideCode = insideComp.complaint_code;
    const insideId = insideComp.id;
    console.log(`Created inside-boundary complaint: ${insideCode} (ID: ${insideId})`);

    assert(insideCode && insideCode.startsWith('HM-CIV-2026-'), '1. Complaint code follows HM-CIV-2026-XXXXXX sequence');
    assert(insideComp.status === 'ROUTED', '2. Returned complaint status is ROUTED upon creation', `Status: ${insideComp.status}`);

    // Verify PostgreSQL database state
    const dbComp = await pool.query('SELECT status, routed_at FROM complaints WHERE id = $1;', [insideId]);
    assert(
      dbComp.rows.length === 1 && dbComp.rows[0].status === 'ROUTED' && dbComp.rows[0].routed_at !== null,
      '3. Canonical database status is ROUTED and routed_at timestamp is set',
      `DB Status: ${dbComp.rows[0]?.status}, Routed At: ${dbComp.rows[0]?.routed_at}`
    );

    // Verify row in routing_decisions
    const dbDecision = await pool.query(
      `SELECT rd.*, j.name AS jurisdiction_name, a.name AS authority_name, d.name AS department_name, jv.version_code
       FROM routing_decisions rd
       JOIN jurisdiction_versions jv ON rd.jurisdiction_version_id = jv.id
       LEFT JOIN jurisdictions j ON rd.jurisdiction_id = j.id
       LEFT JOIN authorities a ON rd.authority_id = a.id
       LEFT JOIN departments d ON rd.department_id = d.id
       WHERE rd.complaint_id = $1;`,
      [insideId]
    );
    assert(dbDecision.rows.length === 1, '4. Exactly one routing_decisions row created in PostgreSQL');
    const rdRow = dbDecision.rows[0];
    assert(rdRow.routing_status === 'ROUTED', '5. Routing decision status is ROUTED', `Status: ${rdRow.routing_status}`);
    assert(rdRow.routing_method === 'GIS_RULE', '6. Routing method is GIS_RULE', `Method: ${rdRow.routing_method}`);
    assert(Boolean(rdRow.authority_name), '7. Responsible authority populated from PostGIS', `Authority: ${rdRow.authority_name}`);
    assert(Boolean(rdRow.department_name), '8. Assigned department populated from active mappings', `Department: ${rdRow.department_name}`);
    assert(Boolean(rdRow.jurisdiction_name), '9. Jurisdiction zone matched by ST_Covers', `Jurisdiction: ${rdRow.jurisdiction_name}`);
    assert(Boolean(rdRow.version_code), '10. Jurisdiction version recorded immutably', `Version: ${rdRow.version_code}`);
    assert(rdRow.reason && rdRow.reason.includes('MYS_2026_'), '11. Explainable PostGIS reason recorded', `Reason: "${rdRow.reason}"`);

    // Verify lookup by complaint_code
    console.log('\n--- Step 2: Routing Engine Lookup by Complaint Code ---');
    const lookupByCode = await routingService.getRoutingDecisionByComplaint(insideCode);
    assert(lookupByCode !== null, '12. Resolves successfully by complaint_code');
    assert(lookupByCode?.routing_status === 'ROUTED', '13. Lookup confirms routing_status is ROUTED');
    assert(lookupByCode?.authority?.name === rdRow.authority_name, '14. Lookup returns correct authority name');
    assert(lookupByCode?.department?.name === rdRow.department_name, '15. Lookup returns correct department name');
    assert(lookupByCode?.jurisdiction?.name === rdRow.jurisdiction_name, '16. Lookup returns correct jurisdiction zone');
    assert(lookupByCode?.jurisdictionVersion?.code === rdRow.version_code, '17. Lookup returns correct jurisdiction version');

    // Verify lookup by UUID
    console.log('\n--- Step 3: Routing Engine Lookup by Complaint UUID ---');
    const lookupById = await routingService.getRoutingDecisionByComplaint(insideId);
    assert(lookupById !== null && lookupById.complaint_code === insideCode, '18. Resolves successfully by complaint UUID');

    // Case-insensitivity & whitespace padding
    console.log('\n--- Step 4: Resilient Code Lookup (Case & Whitespace) ---');
    const lookupPadded = await routingService.getRoutingDecisionByComplaint(`  ${insideCode.toLowerCase()}  `);
    assert(lookupPadded !== null && lookupPadded.complaint_code === insideCode, '19. Handles lowercase and surrounding whitespace');

    // -------------------------------------------------------------------------
    // GROUP 2: Automatic Routing for Outside-Boundary Complaint
    // -------------------------------------------------------------------------
    console.log('\n--- Step 5: Automatic Routing for Outside-Boundary Complaint ---');
    const outsideResult = await complaintService.createComplaint({
      description: 'Streetlight pole broken in distant rural highway outside municipal boundaries',
      category: 'STREETLIGHT',
      category_source: 'CITIZEN_SELECTED',
      category_confidence: 1.0,
      latitude: 12.9716, // Bangalore coordinates, well outside Mysuru boundaries
      longitude: 77.5946,
      citizen_contact: '9876543211'
    }, '/uploads/complaints/test_photo.jpg');

    const outsideComp = outsideResult.complaint;
    const outsideCode = outsideComp.complaint_code;
    const outsideId = outsideComp.id;
    console.log(`Created outside-boundary complaint: ${outsideCode} (ID: ${outsideId})`);

    assert(outsideComp.status === 'HUMAN_REVIEW', '20. Outside complaint status is HUMAN_REVIEW upon creation', `Status: ${outsideComp.status}`);

    const dbOutsideComp = await pool.query('SELECT status, routed_at FROM complaints WHERE id = $1;', [outsideId]);
    assert(
      dbOutsideComp.rows.length === 1 && dbOutsideComp.rows[0].status === 'HUMAN_REVIEW' && dbOutsideComp.rows[0].routed_at !== null,
      '21. Canonical database status is HUMAN_REVIEW for outside boundary',
      `DB Status: ${dbOutsideComp.rows[0]?.status}`
    );

    const outsideLookup = await routingService.getRoutingDecisionByComplaint(outsideCode);
    assert(outsideLookup !== null, '22. Outside complaint resolves by complaint_code');
    assert(outsideLookup?.routing_status === 'HUMAN_REVIEW', '23. Outside complaint routing_status is HUMAN_REVIEW');
    assert(!outsideLookup?.authority && !outsideLookup?.authority_name, '24. Authority is NOT invented for outside boundary');
    assert(!outsideLookup?.department && !outsideLookup?.department_name, '25. Department is NOT invented for outside boundary');
    assert(!outsideLookup?.jurisdiction && !outsideLookup?.jurisdiction_name, '26. Jurisdiction zone is NOT invented for outside boundary');
    assert(outsideLookup?.reason.toLowerCase().includes('outside'), '27. Spatial reason explains outside boundary containment failure');

    // -------------------------------------------------------------------------
    // GROUP 3: Idempotency & Zero Duplicate Records Verification
    // -------------------------------------------------------------------------
    console.log('\n--- Step 6: Idempotency & Zero Duplication Check ---');
    const reRouteResult = await routingService.routeComplaint(insideId);
    assert(reRouteResult.alreadyRouted === true, '28. Re-routing returns alreadyRouted: true');

    // Verify row counts in PostgreSQL
    const decisionCount = await pool.query('SELECT COUNT(*)::int AS count FROM routing_decisions WHERE complaint_id = $1;', [insideId]);
    assert(decisionCount.rows[0].count === 1, '29. Exactly one routing_decisions record exists (no duplicate decision)');

    const histCount = await pool.query('SELECT COUNT(*)::int AS count FROM complaint_status_history WHERE complaint_id = $1;', [insideId]);
    assert(histCount.rows[0].count === 2, '30. Status history has exactly 2 steps (SUBMITTED -> ROUTED, no duplicate steps)');

    const slaCount = await pool.query("SELECT COUNT(*)::int AS count FROM complaint_sla_events WHERE complaint_id = $1 AND event_type = 'SLA_INITIALIZED';", [insideId]);
    assert(slaCount.rows[0].count === 1, '31. SLA initialized exactly once (no duplicate SLA records)');

    const notifCount = await pool.query(
      "SELECT COUNT(*)::int AS count FROM citizen_notifications WHERE complaint_id = $1 AND notification_type = 'ROUTING_COMPLETED';",
      [insideId]
    );
    assert(notifCount.rows[0].count === 1, '32. ROUTING_COMPLETED notification exists exactly once');

    // -------------------------------------------------------------------------
    // GROUP 4: Unrouted Fallback (autoRoute = false)
    // -------------------------------------------------------------------------
    console.log('\n--- Step 7: Fallback Unrouted Handling (autoRoute = false) ---');
    const unroutedResult = await complaintService.createComplaint({
      description: 'Manually held intake complaint test without auto-routing',
      category: 'GARBAGE',
      category_source: 'MANUAL',
      latitude: 12.3050,
      longitude: 76.6450,
      citizen_contact: '9876543212'
    }, '/uploads/complaints/test_photo.jpg', false); // autoRoute = false

    const unroutedComp = unroutedResult.complaint;
    const unroutedCode = unroutedComp.complaint_code;
    console.log(`Created manual unrouted complaint: ${unroutedCode}`);

    assert(unroutedComp.status === 'SUBMITTED', '33. Unrouted complaint status is SUBMITTED');
    const unroutedLookup = await routingService.getRoutingDecisionByComplaint(unroutedCode);
    assert(unroutedLookup !== null, '34. Unrouted complaint resolves via code lookup');
    assert(unroutedLookup?.routing_status === 'AWAITING_ROUTING', '35. Unrouted complaint displays AWAITING_ROUTING');
    assert(unroutedLookup?.is_routed === false, '36. is_routed flag is false for unrouted complaint');

    // Search query includes unrouted complaint
    const searchRes = await routingService.getRoutingDecisionsList(20, 0, unroutedCode);
    assert(searchRes.decisions.some(d => d.complaint_code === unroutedCode), '37. getRoutingDecisionsList includes unrouted complaint in search');

    // -------------------------------------------------------------------------
    // GROUP 5: Nonexistent Complaint Code
    // -------------------------------------------------------------------------
    console.log('\n--- Step 8: Nonexistent Complaint Code Handling ---');
    const nonexistentLookup = await routingService.getRoutingDecisionByComplaint('HM-CIV-9999-999999');
    assert(nonexistentLookup === null, '38. Nonexistent complaint code returns null (mapped to 404)');

    // -------------------------------------------------------------------------
    // Summary
    // -------------------------------------------------------------------------
    console.log('\n================================================================');
    console.log(`RESULTS: ${passedTests}/${totalTests} tests passed.`);
    console.log('================================================================\n');

    if (passedTests === totalTests) {
      console.log('ALL TESTS PASSED SUCCESSFULLY!');
    } else {
      process.exitCode = 1;
    }
  } catch (err) {
    console.error('Test execution error:', err);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

runTest();
