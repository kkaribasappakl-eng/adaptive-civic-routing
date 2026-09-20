/**
 * Focused verification test script for Stage 15: Routing Engine Complaint Code Lookup
 * Verifies:
 * 1. Newly created complaint (unrouted) resolves by complaint_code as AWAITING_ROUTING.
 * 2. Lookup works with both exact complaint_code and UUID.
 * 3. Lookup is resilient to case differences and surrounding whitespace.
 * 4. getRoutingDecisionsList with search finds unrouted complaints by complaint_code.
 * 5. Once routed, lookup returns the actual deterministic decision (ROUTED).
 * 6. HUMAN_REVIEW complaints return real review status and spatial reason.
 * 7. Nonexistent complaint code returns null / 404 Not Found.
 * 8. Pre-existing routing decisions list pagination remains unaffected.
 */

const { pool } = require('../config/db');
const complaintService = require('../services/complaintService');
const routingService = require('../services/routingService');

async function runTest() {
  console.log('===============================================================');
  console.log('STAGE 15: ROUTING ENGINE COMPLAINT CODE LOOKUP VERIFICATION');
  console.log('===============================================================\n');

  let passedTests = 0;
  let totalTests = 0;

  function assert(condition, description) {
    totalTests++;
    if (condition) {
      console.log(`[PASS] ${description}`);
      passedTests++;
    } else {
      console.error(`[FAIL] ${description}`);
      process.exitCode = 1;
    }
  }

  try {
    // 1. Create a fresh unrouted complaint
    console.log('--- Step 1: Create fresh citizen complaint (unrouted) ---');
    const compResult = await complaintService.createComplaint({
      description: 'Massive pothole near Saraswathipuram 5th main road test',
      category: 'POTHOLE',
      category_source: 'CITIZEN_SELECTED',
      category_confidence: 1.0,
      latitude: 12.3051,
      longitude: 76.6432,
      citizen_contact: '9876543210'
    });

    const unroutedComp = compResult.complaint;
    const complaintCode = unroutedComp.complaint_code;
    const complaintId = unroutedComp.id;
    console.log(`Created complaint ID: ${complaintId}, Code: ${complaintCode}`);
    assert(complaintCode && complaintCode.startsWith('HM-CIV-2026-'), 'Complaint code follows HM-CIV-2026-XXXXXX format');

    // 2. Lookup unrouted complaint by complaint_code
    console.log('\n--- Step 2: Lookup unrouted complaint by complaint_code ---');
    const unroutedLookupByCode = await routingService.getRoutingDecisionByComplaint(complaintCode);
    assert(unroutedLookupByCode !== null, 'Unrouted complaint resolves by complaint_code');
    assert(unroutedLookupByCode?.routing_status === 'AWAITING_ROUTING', 'Unrouted complaint status is AWAITING_ROUTING');
    assert(unroutedLookupByCode?.complaint_code === complaintCode, 'Returned complaint_code matches created code');
    assert(unroutedLookupByCode?.is_routed === false, 'is_routed is false for unrouted complaint');
    assert(unroutedLookupByCode?.reason.includes('awaiting routing'), 'Reason clearly indicates awaiting routing');

    // 3. Lookup unrouted complaint by UUID
    console.log('\n--- Step 3: Lookup unrouted complaint by UUID ---');
    const unroutedLookupById = await routingService.getRoutingDecisionByComplaint(complaintId);
    assert(unroutedLookupById !== null, 'Unrouted complaint resolves by complaint UUID');
    assert(unroutedLookupById?.routing_status === 'AWAITING_ROUTING', 'UUID lookup also returns AWAITING_ROUTING');

    // 4. Lookup with case-insensitivity and whitespace
    console.log('\n--- Step 4: Lookup with whitespace and lowercase code ---');
    const lowercaseCodeWithSpaces = `  ${complaintCode.toLowerCase()}  `;
    const lookupPadded = await routingService.getRoutingDecisionByComplaint(lowercaseCodeWithSpaces);
    assert(lookupPadded !== null && lookupPadded.complaint_code === complaintCode, 'Lookup handles lowercase and surrounding whitespace');

    // 5. Test getRoutingDecisionsList with search for unrouted complaint
    console.log('\n--- Step 5: Test getRoutingDecisionsList with search parameter ---');
    const searchResult = await routingService.getRoutingDecisionsList(20, 0, complaintCode);
    assert(searchResult.decisions.length > 0, 'getRoutingDecisionsList finds unrouted complaint by code');
    const foundDecision = searchResult.decisions.find(d => d.complaint_code === complaintCode);
    assert(foundDecision !== undefined, 'Specific unrouted complaint is present in search results');
    assert(foundDecision?.routing_status === 'AWAITING_ROUTING', 'Search result displays AWAITING_ROUTING status');

    // 6. Route the complaint and verify lookup now returns ROUTED decision
    console.log('\n--- Step 6: Route complaint and verify real ROUTED decision ---');
    const routeResult = await routingService.routeComplaint(complaintId);
    assert(routeResult.decision.routing_status === 'ROUTED', 'Complaint routed successfully via PostGIS');

    const routedLookup = await routingService.getRoutingDecisionByComplaint(complaintCode);
    assert(routedLookup?.routing_status === 'ROUTED', 'Lookup by code returns ROUTED after routing');
    assert(routedLookup?.authority?.name || routedLookup?.authority_name, 'Responsible authority is present');
    assert(routedLookup?.department?.name || routedLookup?.department_name, 'Assigned department is present');
    assert(routedLookup?.version_code || routedLookup?.jurisdictionVersion?.code, 'Jurisdiction version code is present');

    // 7. Test HUMAN_REVIEW complaint lookup (outside Mysore boundary)
    console.log('\n--- Step 7: Create and route complaint outside boundary for HUMAN_REVIEW ---');
    const outsideCompRes = await complaintService.createComplaint({
      description: 'Issue in distant rural coordinate outside boundary',
      category: 'STREETLIGHT',
      category_source: 'CITIZEN_SELECTED',
      category_confidence: 1.0,
      latitude: 12.9716, // Bangalore coordinates, well outside Mysore
      longitude: 77.5946,
      citizen_contact: '9876543211'
    });
    const outsideCode = outsideCompRes.complaint.complaint_code;
    const outsideId = outsideCompRes.complaint.id;
    await routingService.routeComplaint(outsideId);

    const outsideLookup = await routingService.getRoutingDecisionByComplaint(outsideCode);
    assert(outsideLookup?.routing_status === 'HUMAN_REVIEW', 'Outside complaint returns HUMAN_REVIEW');
    assert(!outsideLookup?.authority && !outsideLookup?.authority_name, 'No fake authority invented for outside boundary');
    assert(outsideLookup?.reason.toLowerCase().includes('outside'), 'Spatial reason clearly indicates outside boundary');

    // 8. Nonexistent complaint code returns null (404)
    console.log('\n--- Step 8: Verify nonexistent complaint code returns null ---');
    const nonexistentLookup = await routingService.getRoutingDecisionByComplaint('HM-CIV-9999-999999');
    assert(nonexistentLookup === null, 'Nonexistent complaint code returns null (mapped to 404)');

    // 9. Standard getRoutingDecisionsList without search works normally
    console.log('\n--- Step 9: Verify standard pagination without search ---');
    const defaultList = await routingService.getRoutingDecisionsList(5, 0);
    assert(defaultList.decisions.length <= 5, 'Default pagination respects limit');
    assert(typeof defaultList.total === 'number', 'Total count is a number');

    console.log('\n===============================================================');
    console.log(`RESULTS: ${passedTests}/${totalTests} tests passed.`);
    console.log('===============================================================\n');

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
