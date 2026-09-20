const http = require('http');
const fs = require('fs');
const path = require('path');
const { pool } = require('../config/db');
const { io: ClientIO } = require('../../../client/node_modules/socket.io-client');

const dummyJpg1x1 = Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x01, 0x00, 0x60, 0x00, 0x60, 0x00, 0x00, 0xFF, 0xD9]);

// Helper for multipart/form-data requests without external dependencies
function sendMultipartRequest(urlPath, fields = {}, fileObj = undefined) {
  return new Promise((resolve, reject) => {
    const boundary = '----CivicFormBoundary' + Math.random().toString(16).slice(2);
    const postData = [];

    const fieldMap = { ...fields };
    if (fieldMap.citizen_contact === undefined && fieldMap.phone === undefined && !urlPath.includes('/classify')) {
      fieldMap.citizen_contact = '9845012345';
    }

    // Add fields
    for (const [key, value] of Object.entries(fieldMap)) {
      if (value !== null && value !== undefined) {
        postData.push(Buffer.from(`--${boundary}\r\n`));
        postData.push(Buffer.from(`Content-Disposition: form-data; name="${key}"\r\n\r\n`));
        postData.push(Buffer.from(`${value}\r\n`));
      }
    }

    // Add file if present or default
    let actualFile = fileObj;
    if (actualFile === undefined && !urlPath.includes('/classify')) {
      actualFile = {
        fieldName: 'photo',
        fileName: 'default_evidence.jpg',
        mimeType: 'image/jpeg',
        content: dummyJpg1x1
      };
    }

    if (actualFile) {
      postData.push(Buffer.from(`--${boundary}\r\n`));
      postData.push(Buffer.from(`Content-Disposition: form-data; name="${actualFile.fieldName || 'photo'}"; filename="${actualFile.fileName || 'test.jpg'}"\r\n`));
      postData.push(Buffer.from(`Content-Type: ${actualFile.mimeType || 'image/jpeg'}\r\n\r\n`));
      postData.push(actualFile.content);
      postData.push(Buffer.from('\r\n'));
    }

    postData.push(Buffer.from(`--${boundary}--\r\n`));
    const fullBody = Buffer.concat(postData);

    const options = {
      hostname: 'localhost',
      port: 4000,
      path: urlPath,
      method: 'POST',
      headers: {
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Content-Length': fullBody.length
      }
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
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

function sendJsonRequest(urlPath, method = 'GET', body = null, token = null) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port: 4000,
      path: urlPath,
      method: method,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { 'Authorization': `Bearer ${token}` } : {})
      }
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(data) });
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
}

async function runStage4Tests() {
  console.log('====================================================');
  console.log('STAGE 4 COMPREHENSIVE VERIFICATION SUITE');
  console.log('Citizen Complaint Intake & AI Classification');
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

  // Setup Socket.IO listener for real-time broadcast testing
  const socketClient = ClientIO('http://localhost:4000', {
    transports: ['websocket'],
    reconnection: false
  });

  const socketEvents = [];
  socketClient.on('complaint:created', (data) => {
    socketEvents.push(data);
  });

  await new Promise((resolve) => {
    socketClient.on('connect', resolve);
    setTimeout(resolve, 1500); // fallback timeout
  });

  try {
    // 1. Health check & Stage indicator
    const health = await sendJsonRequest('/api/health');
    assert(health.status === 200 && health.body.stage >= 4, '1. Backend Health & Stage 4+ Indicator', `Stage: ${health.body.stage}`);

    // 2. Database Schema & Spatial Index Check
    const schemaCheck = await pool.query(`
      SELECT 
        (SELECT COUNT(*) FROM information_schema.tables WHERE table_name = 'complaints') AS table_exists,
        (SELECT COUNT(*) FROM pg_indexes WHERE tablename = 'complaints' AND indexname = 'idx_complaints_location') AS gist_index_exists;
    `);
    const tableExists = parseInt(schemaCheck.rows[0].table_exists) > 0;
    const gistExists = parseInt(schemaCheck.rows[0].gist_index_exists) > 0;
    assert(tableExists && gistExists, '2. PostgreSQL Schema & PostGIS GiST Index Verified', `Table: ${tableExists}, GiST Index: ${gistExists}`);

    // 3. AI Service: Real Gemini classification if configured, or explicit fallback if unconfigured
    const classifyRes = await sendMultipartRequest('/api/complaints/classify', {
      description: 'Massive pothole near palace road'
    });
    if (classifyRes.body.available) {
      assert(
        classifyRes.status === 200 &&
        classifyRes.body.available === true &&
        ['POTHOLE', 'OTHER'].includes(classifyRes.body.category),
        '3. AI Service: Real AI classification returned valid category when GEMINI_API_KEY is configured',
        `Category: ${classifyRes.body.category}, Confidence: ${classifyRes.body.confidence}`
      );
    } else {
      assert(
        classifyRes.status === 200 &&
        classifyRes.body.available === false &&
        classifyRes.body.category === null &&
        (classifyRes.body.reason?.includes('GEMINI_API_KEY') || classifyRes.body.reason?.includes('429') || classifyRes.body.reason?.includes('Falling back')),
        '3. AI Service Fallback: Transparently unavailable without faking results',
        `Reason: ${classifyRes.body.reason}`
      );
    }

    // 4. Valid Complaint Submission (Manual Category)
    console.log('\n--- Testing Complaint Submission Pipeline ---');
    const validCoord = { lat: 12.2958, lng: 76.6394 }; // Mysore Palace
    const validRes1 = await sendMultipartRequest('/api/complaints', {
      description: 'Severe water leak from municipal pipeline near bus stand',
      category: 'WATER_LEAK',
      category_source: 'MANUAL',
      latitude: validCoord.lat,
      longitude: validCoord.lng,
      citizen_contact: '9845012345'
    });

    const c1 = validRes1.body.data;
    assert(
      validRes1.status === 201 &&
      c1 &&
      c1.complaint_code?.startsWith('HM-CIV-2026-') &&
      (c1.status === 'ROUTED' || c1.status === 'SUBMITTED'),
      '4. Valid Complaint Submission: Persisted with 201 Created & Routed via PostGIS',
      `Code: ${c1?.complaint_code}, ID: ${c1?.id}, Status: ${c1?.status}`
    );

    // 5. Unique sequential complaint code generation
    const validRes2 = await sendMultipartRequest('/api/complaints', {
      description: 'Overflowing dustbin at market square causing stench',
      category: 'GARBAGE',
      category_source: 'MANUAL',
      latitude: 12.3000,
      longitude: 76.6450
    });
    const c2 = validRes2.body.data;
    const code1Num = parseInt(c1?.complaint_code?.split('-')[3] || '0');
    const code2Num = parseInt(c2?.complaint_code?.split('-')[3] || '0');
    assert(
      validRes2.status === 201 &&
      c2 &&
      code2Num > code1Num,
      '5. Complaint Code Monotonic Sequence Generation',
      `Code 1: ${c1?.complaint_code} -> Code 2: ${c2?.complaint_code}`
    );

    // 6. PostGIS Point Geometry Verification in PostgreSQL
    const pointQuery = await pool.query(
      "SELECT ST_AsText(location) AS geom_text, ST_SRID(location) AS srid FROM complaints WHERE id = $1",
      [c1.id]
    );
    const geom = pointQuery.rows[0];
    assert(
      geom &&
      geom.geom_text === `POINT(${validCoord.lng} ${validCoord.lat})` &&
      geom.srid === 4326,
      '6. PostGIS Point Geometry Storage: Exact SRID 4326 Point stored',
      `Geometry: ${geom?.geom_text}, SRID: ${geom?.srid}`
    );

    // 7. Negative Test: Invalid Latitude (> 90)
    console.log('\n--- Testing Validation Rules ---');
    const invLatRes = await sendMultipartRequest('/api/complaints', {
      description: 'Streetlight not working on 5th cross',
      category: 'STREETLIGHT',
      category_source: 'MANUAL',
      latitude: 999.0,
      longitude: 76.6500
    });
    assert(invLatRes.status === 400 && invLatRes.body.error?.includes('Latitude'), '7. Validation: Reject invalid latitude > 90', invLatRes.body.error);

    // 8. Negative Test: Invalid Longitude (> 180)
    const invLngRes = await sendMultipartRequest('/api/complaints', {
      description: 'Streetlight not working on 5th cross',
      category: 'STREETLIGHT',
      category_source: 'MANUAL',
      latitude: 12.3150,
      longitude: -250.0
    });
    assert(invLngRes.status === 400 && invLngRes.body.error?.includes('Longitude'), '8. Validation: Reject invalid longitude < -180', invLngRes.body.error);

    // 9. Negative Test: Missing Description
    const noDescRes = await sendMultipartRequest('/api/complaints', {
      description: '   ',
      category: 'POTHOLE',
      category_source: 'MANUAL',
      latitude: 12.3150,
      longitude: 76.6500
    });
    assert(noDescRes.status === 400 && noDescRes.body.error?.includes('Description is required'), '9. Validation: Reject empty description', noDescRes.body.error);

    // 10. Negative Test: Too short description (<5 chars)
    const shortDescRes = await sendMultipartRequest('/api/complaints', {
      description: 'Fix',
      category: 'POTHOLE',
      category_source: 'MANUAL',
      latitude: 12.3150,
      longitude: 76.6500
    });
    assert(shortDescRes.status === 400 && shortDescRes.body.error?.includes('at least 5 characters'), '10. Validation: Reject description shorter than 5 chars', shortDescRes.body.error);

    // 11. Negative Test: Invalid Category (not in controlled list)
    const invCatRes = await sendMultipartRequest('/api/complaints', {
      description: 'Alien spacecraft landed on road',
      category: 'UFO_SIGHTING',
      category_source: 'MANUAL',
      latitude: 12.3150,
      longitude: 76.6500
    });
    assert(invCatRes.status === 400 && invCatRes.body.error?.includes('Invalid category'), '11. Validation: Reject uncontrolled category', invCatRes.body.error);

    // 12. Negative Test: Invalid Category Source
    const invSrcRes = await sendMultipartRequest('/api/complaints', {
      description: 'Broken footpath pavers',
      category: 'OTHER',
      category_source: 'TELEPATHY',
      latitude: 12.3150,
      longitude: 76.6500
    });
    assert(invSrcRes.status === 400 && invSrcRes.body.error?.includes('Invalid category_source'), '12. Validation: Reject arbitrary category_source', invSrcRes.body.error);

    // 13. Valid Photo Upload (Valid JPEG file)
    console.log('\n--- Testing Photo Upload Pipeline ---');
    const dummyJpgBuffer = Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x01, 0x00, 0x60, 0x00, 0x60, 0x00, 0x00, 0xFF, 0xD9]);
    const photoRes = await sendMultipartRequest('/api/complaints', {
      description: 'Deep pothole filled with rain water posing hazard',
      category: 'POTHOLE',
      category_source: 'CITIZEN_SELECTED',
      latitude: 12.3150,
      longitude: 76.6500
    }, {
      fieldName: 'photo',
      fileName: 'pothole_evidence.jpg',
      mimeType: 'image/jpeg',
      content: dummyJpgBuffer
    });

    const cPhoto = photoRes.body.data;
    const fileSaved = cPhoto?.photo_url && fs.existsSync(path.resolve(__dirname, '../../uploads', cPhoto.photo_url.replace('/uploads/', '')));
    assert(
      photoRes.status === 201 &&
      cPhoto?.photo_url?.startsWith('/uploads/complaints/complaint-') &&
      fileSaved,
      '13. Photo Upload: Valid JPEG stored with sanitized randomized filename',
      `URL: ${cPhoto?.photo_url}`
    );

    // 14. Negative Test: Reject Invalid MIME Type (.exe)
    const exeBuffer = Buffer.from('MZ...dummy binary content');
    const exeRes = await sendMultipartRequest('/api/complaints', {
      description: 'Malicious upload test',
      category: 'OTHER',
      category_source: 'MANUAL',
      latitude: 12.3150,
      longitude: 76.6500
    }, {
      fieldName: 'photo',
      fileName: 'exploit.exe',
      mimeType: 'application/x-msdownload',
      content: exeBuffer
    });
    assert(exeRes.status === 400 && exeRes.body.error?.includes('Unsupported file type'), '14. Photo Upload Security: Reject executable file type', exeRes.body.error);

    // 15. Negative Test: Reject Oversized Image (>5MB)
    const oversizedBuffer = Buffer.alloc(5.2 * 1024 * 1024); // 5.2 MB
    const overRes = await sendMultipartRequest('/api/complaints', {
      description: 'Oversized photo test',
      category: 'GARBAGE',
      category_source: 'MANUAL',
      latitude: 12.3150,
      longitude: 76.6500
    }, {
      fieldName: 'photo',
      fileName: 'large.jpg',
      mimeType: 'image/jpeg',
      content: oversizedBuffer
    });
    assert(overRes.status === 400 && overRes.body.error?.includes('exceeds maximum allowed size'), '15. Photo Upload Security: Reject oversized image > 5MB', overRes.body.error);

    // 16. Category Source: AI_SUGGESTED
    console.log('\n--- Testing Category Source Flags & Overrides ---');
    const aiSugRes = await sendMultipartRequest('/api/complaints', {
      description: 'Street light blinking and sparking at night',
      category: 'STREETLIGHT',
      category_source: 'AI_SUGGESTED',
      category_confidence: '0.9450',
      latitude: 12.3200,
      longitude: 76.6500
    });
    assert(
      aiSugRes.status === 201 &&
      aiSugRes.body.data.category_source === 'AI_SUGGESTED' &&
      parseFloat(aiSugRes.body.data.category_confidence) === 0.945,
      '16. Category Source AI_SUGGESTED: Preserves AI attribution & confidence',
      `Source: ${aiSugRes.body.data?.category_source}, Conf: ${aiSugRes.body.data?.category_confidence}`
    );

    // 17. Category Source: CITIZEN_SELECTED (Citizen overrides AI)
    const overrideRes = await sendMultipartRequest('/api/complaints', {
      description: 'Debris left over from demolished wall',
      category: 'C_AND_D_WASTE',
      category_source: 'CITIZEN_SELECTED',
      latitude: 12.3210,
      longitude: 76.6510
    });
    assert(
      overrideRes.status === 201 &&
      overrideRes.body.data.category_source === 'CITIZEN_SELECTED',
      '17. Citizen Override: Accurately tags category_source as CITIZEN_SELECTED',
      `Source: ${overrideRes.body.data?.category_source}`
    );

    // 18. Duplicate Detection Warning (Within 100m in 7 days without blocking)
    console.log('\n--- Testing Duplicate Warning & Proximity ---');
    // Submit second complaint right next to c1 (same category WATER_LEAK, ~20 meters away)
    const dupRes = await sendMultipartRequest('/api/complaints', {
      description: 'Water gushing out of pipe at the bus stand entrance',
      category: 'WATER_LEAK',
      category_source: 'MANUAL',
      latitude: validCoord.lat + 0.0001, // ~11 meters away
      longitude: validCoord.lng
    });
    assert(
      dupRes.status === 201 &&
      dupRes.body.duplicateWarning?.possibleDuplicate === true &&
      dupRes.body.duplicateWarning?.count >= 1,
      '18. Duplicate Warning: Detects nearby identical category within 100m without blocking',
      `Possible Duplicate: ${dupRes.body.duplicateWarning?.possibleDuplicate}, Nearby: ${dupRes.body.duplicateWarning?.count}`
    );

    // 19. Real-time Socket.IO Broadcast
    console.log('\n--- Testing Real-Time Gateway ---');
    // Wait briefly for socket queue
    await new Promise(r => setTimeout(r, 500));
    const receivedEvent = socketEvents.find(e => e.complaintCode === dupRes.body.data?.complaint_code);
    assert(
      Boolean(receivedEvent) &&
      receivedEvent.category === 'WATER_LEAK' &&
      !receivedEvent.photoUrl?.includes('..'),
      '19. Real-Time Socket.IO: Emitted complaint:created with safe metadata',
      `Received Code: ${receivedEvent?.complaintCode}, Event Count: ${socketEvents.length}`
    );

    // 20. Regression: Stage 2 GIS Lookup Still Works
    console.log('\n--- Testing Regressions ---');
    const gisRes = await sendJsonRequest('/api/gis/test?lat=12.2958&lng=76.6394');
    assert(
      gisRes.status === 200 &&
      gisRes.body.matched === true &&
      gisRes.body.authority?.code === 'MCC_DEMO',
      '20. Regression: Stage 2 PostGIS ST_Covers point-in-polygon still operational',
      `Authority: ${gisRes.body.authority?.name}`
    );

    // 21. Regression: Stage 3 Jurisdiction Versioning Still Works
    const opLoginRes = await sendJsonRequest('/api/auth/demo-login', 'POST', { role: 'OPERATOR' });
    const opToken = opLoginRes.body?.data?.token;
    const verRes = await sendJsonRequest('/api/jurisdictions/versions', 'GET', null, opToken);
    assert(
      verRes.status === 200 &&
      Array.isArray(verRes.body.data) &&
      verRes.body.data.some(v => v.version_code === 'MYS_2026_V1'),
      '21. Regression: Stage 3 Jurisdiction versioning and lifecycle still operational',
      `Versions found: ${verRes.body.data?.length}`
    );

  } catch (err) {
    console.error('Fatal error during test suite:', err);
    failed++;
  } finally {
    socketClient.disconnect();
  }

  console.log('\n====================================================');
  console.log(`TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('====================================================\n');
  process.exit(failed > 0 ? 1 : 0);
}

runStage4Tests();
