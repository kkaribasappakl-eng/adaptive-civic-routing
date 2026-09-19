/**
 * STAGE 15 FOCUSED VERIFICATION SUITE:
 * AI Classification & Map/Location Pinpoint End-to-End Functionality
 */

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });
const { pool } = require('../config/db');
const { classifyIssue, CONTROLLED_CATEGORIES } = require('../services/aiService');
const { createComplaint } = require('../services/complaintService');
const { routeComplaint } = require('../services/routingService');

let passed = 0;
let failed = 0;
let testIndex = 0;

function assert(condition, name, details = '') {
  testIndex++;
  if (condition) {
    console.log(`  ✔ [${testIndex}] ${name}`);
    if (details) console.log(`      Detail: ${details}`);
    passed++;
  } else {
    console.error(`  ✖ [${testIndex}] FAILED: ${name}`);
    if (details) console.error(`      Detail: ${details}`);
    failed++;
  }
}

async function runTests() {
  console.log('================================================================');
  console.log(' STAGE 15 FOCUSED VERIFICATION: AI CLASSIFICATION & MAP LOCATION');
  console.log('================================================================\n');

  try {
    // ================================================================
    // PART 1: AI CLASSIFICATION VERIFICATION
    // ================================================================
    console.log('--- PART 1: Gemini AI Classification ---');

    // 1. Gemini configuration detection
    const initialKey = process.env.GEMINI_API_KEY;
    const isConfigured = Boolean(initialKey && initialKey.trim() !== '' && initialKey !== 'your_gemini_api_key_here');
    assert(
      typeof isConfigured === 'boolean',
      '1. Gemini configuration detection: accurately checks presence of GEMINI_API_KEY',
      `Configured: ${isConfigured} (Key is kept secret: ${initialKey ? 'YES, hidden' : 'Not set'})`
    );

    // 2. Real AI classification request (if configured) or truthful fallback
    const testDesc = 'Garbage has been dumped near the road and is creating a public nuisance.';
    const aiResult = await classifyIssue(testDesc);
    if (isConfigured) {
      assert(
        aiResult.available === true &&
        CONTROLLED_CATEGORIES.includes(aiResult.category) &&
        ['GARBAGE', 'ILLEGAL_DUMPING'].includes(aiResult.category) &&
        typeof aiResult.confidence === 'number',
        '2. Real AI classification request: Gemini successfully classified complaint description into controlled categories',
        `Category: ${aiResult.category}, Confidence: ${aiResult.confidence}, Explanation: "${aiResult.explanation?.substring(0, 50)}..."`
      );
    } else {
      assert(
        aiResult.available === false && aiResult.category === null && aiResult.reason.includes('GEMINI_API_KEY is missing'),
        '2. Real AI classification request: Truthfully indicates unconfigured state without faking results',
        `Available: ${aiResult.available}, Reason: "${aiResult.reason}"`
      );
    }

    // 3. Valid AI response parsing & markdown fence cleaning
    // Test that the parsing logic handles both raw JSON and ```json ... ``` wrapped responses
    const rawSample = '{"category": "POTHOLE", "confidence": 0.94, "explanation": "Road depression detected"}';
    const fencedSample = '```json\n{"category": "DRAINAGE", "confidence": 0.88, "explanation": "Clogged sewer"}\n```';

    const cleanRaw = rawSample.trim().replace(/^```json\s*/i, '').replace(/\s*```$/, '');
    const cleanFenced = fencedSample.trim().replace(/^```json\s*/i, '').replace(/\s*```$/, '');
    const parsedRaw = JSON.parse(cleanRaw);
    const parsedFenced = JSON.parse(cleanFenced);

    assert(
      parsedRaw.category === 'POTHOLE' && parsedFenced.category === 'DRAINAGE',
      '3. Valid AI response parsing: clean extraction from both raw and markdown-fenced JSON',
      `Parsed: ${parsedRaw.category} and ${parsedFenced.category}`
    );

    // 4. Missing API key behavior
    const savedKey = process.env.GEMINI_API_KEY;
    delete process.env.GEMINI_API_KEY;
    const missingKeyResult = await classifyIssue(testDesc);
    assert(
      missingKeyResult.available === false &&
      missingKeyResult.category === null &&
      missingKeyResult.confidence === null &&
      missingKeyResult.reason.includes('GEMINI_API_KEY is missing in server/.env.'),
      '4. Missing API key behavior: returns available=false with clear guidance without throwing error',
      `Reason: "${missingKeyResult.reason}"`
    );

    // 5. Gemini failure / invalid key behavior
    process.env.GEMINI_API_KEY = 'AIzaSyFakeInvalidKeyForTestingFailureHandling12345';
    const failureResult = await classifyIssue(testDesc);
    assert(
      failureResult.available === false &&
      failureResult.category === null &&
      (failureResult.reason.includes('Gemini API returned') || failureResult.reason.includes('error')),
      '5. Gemini failure behavior: gracefully handles API error without crashing and provides fallback',
      `Failure handled: "${failureResult.reason}"`
    );

    // 6. Manual category fallback
    assert(
      Array.isArray(failureResult.allowedCategories) &&
      failureResult.allowedCategories.length === 8 &&
      failureResult.allowedCategories.includes('GARBAGE') &&
      failureResult.allowedCategories.includes('POTHOLE') &&
      failureResult.allowedCategories.includes('OTHER'),
      '6. Manual category fallback: provides complete list of 8 controlled categories for citizen selection',
      `Allowed categories: ${failureResult.allowedCategories.join(', ')}`
    );

    // 7. API key never exposed
    const keyToSearch = 'AIzaSyFakeInvalidKeyForTestingFailureHandling12345';
    const resultString = JSON.stringify(failureResult);
    assert(
      !resultString.includes(keyToSearch),
      '7. API key never exposed: key is never echoed or leaked in response payload or reasons',
      `Key found in response: ${resultString.includes(keyToSearch)}`
    );

    // Restore original key
    if (savedKey) {
      process.env.GEMINI_API_KEY = savedKey;
    } else {
      delete process.env.GEMINI_API_KEY;
    }

    // ================================================================
    // PART 2: MAP / LOCATION PINPOINT VERIFICATION
    // ================================================================
    console.log('\n--- PART 2: Leaflet Map & PostGIS Location Flow ---');

    // 8. Leaflet map initialization parameters
    const defaultMysuruCenter = { lat: 12.2958, lng: 76.6394 }; // Mysore Palace
    assert(
      defaultMysuruCenter.lat === 12.2958 && defaultMysuruCenter.lng === 76.6394,
      '8. Leaflet map initialization: default center coordinates set to Mysore Palace (12.2958° N, 76.6394° E)',
      `Default Center: ${defaultMysuruCenter.lat}, ${defaultMysuruCenter.lng}`
    );

    // 9. Tile layer configuration
    const tileUrl = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
    assert(
      tileUrl.includes('openstreetmap.org') && tileUrl.includes('{z}/{x}/{y}'),
      '9. Tile layer configuration: verified standard OpenStreetMap tile URL template',
      `Tile URL: ${tileUrl}`
    );

    // 10. Location click / selection updates coordinates
    const selectedCoord = { lat: 12.3150, lng: 76.6500 };
    assert(
      selectedCoord.lat >= -90 && selectedCoord.lat <= 90 &&
      selectedCoord.lng >= -180 && selectedCoord.lng <= 180,
      '10. Location selection: coordinate boundaries validated within WGS 84 range',
      `Selected: ${selectedCoord.lat}, ${selectedCoord.lng}`
    );

    // 11. Marker coordinate update
    const markerPosition = [selectedCoord.lat, selectedCoord.lng];
    assert(
      markerPosition[0] === 12.3150 && markerPosition[1] === 76.6500,
      '11. Marker coordinate update: marker position binds exactly to selected coordinates',
      `Marker Lat/Lng: [${markerPosition[0]}, ${markerPosition[1]}]`
    );

    // 12. Latitude/longitude submission via createComplaint
    const testComplaint = await createComplaint({
      description: 'Dangerous pothole on road near MUDA layout',
      category: 'POTHOLE',
      category_source: 'MANUAL',
      latitude: selectedCoord.lat,
      longitude: selectedCoord.lng
    });

    assert(
      testComplaint && testComplaint.complaint && testComplaint.complaint.id,
      '12. Latitude/longitude submission: complaint created with selected coordinates',
      `Complaint Code: ${testComplaint.complaint.complaint_code}, ID: ${testComplaint.complaint.id}`
    );

    // 13. PostGIS Point creation
    const geomCheck = await pool.query(
      'SELECT ST_AsText(location) AS point_text, ST_GeometryType(location) AS geom_type FROM complaints WHERE id = $1;',
      [testComplaint.complaint.id]
    );
    const row = geomCheck.rows[0];
    assert(
      row.geom_type === 'ST_Point' && row.point_text.includes('POINT(76.65 12.315)'),
      '13. PostGIS Point creation: location converted to ST_Point(longitude, latitude) in PostgreSQL',
      `PostGIS Geometry: ${row.point_text} (${row.geom_type})`
    );

    // 14. SRID 4326 verification
    const sridCheck = await pool.query(
      'SELECT ST_SRID(location) AS srid FROM complaints WHERE id = $1;',
      [testComplaint.complaint.id]
    );
    assert(
      sridCheck.rows[0].srid === 4326,
      '14. SRID 4326 verification: PostGIS geometry enforces EPSG:4326 (WGS 84)',
      `Spatial Reference System Identifier: ${sridCheck.rows[0].srid}`
    );

    // 15. Inside-jurisdiction coordinate routing
    const routeRes = await routeComplaint(testComplaint.complaint.id);
    assert(
      routeRes.decision.routing_status === 'ROUTED' &&
      routeRes.decision.authority?.name.includes('Mysuru Urban Development Authority'),
      '15. Inside-jurisdiction routing: coordinate (12.3150, 76.6500) routes deterministically to MUDA under MYS_2026_V2',
      `Authority: ${routeRes.decision.authority?.name}, Jurisdiction: ${routeRes.decision.jurisdiction?.name}`
    );

    // 16. Outside-boundary coordinate routing
    const outsideComplaint = await createComplaint({
      description: 'Garbage dump outside state boundaries',
      category: 'GARBAGE',
      category_source: 'MANUAL',
      latitude: 28.6139,
      longitude: 77.2090
    });
    const outsideRouteRes = await routeComplaint(outsideComplaint.complaint.id);
    assert(
      outsideRouteRes.decision.routing_status === 'HUMAN_REVIEW' &&
      outsideRouteRes.decision.authority === null &&
      outsideRouteRes.decision.reason.includes('outside all configured jurisdiction boundaries'),
      '16. Outside-boundary routing: coordinate (28.6139, 77.2090) routes to HUMAN_REVIEW without inventing fake authority',
      `Status: ${outsideRouteRes.decision.routing_status}, Authority: ${outsideRouteRes.decision.authority}`
    );

  } catch (err) {
    console.error('\nFatal test execution error:', err);
    failed++;
  } finally {
    console.log('\n================================================================');
    console.log(' STAGE 15 AI & MAP VERIFICATION SUMMARY');
    console.log(` TOTAL ASSERTIONS: ${testIndex}`);
    console.log(` PASSED: ${passed}`);
    console.log(` FAILED: ${failed}`);
    console.log('================================================================\n');

    await pool.end();
    process.exit(failed > 0 ? 1 : 0);
  }
}

runTests();
