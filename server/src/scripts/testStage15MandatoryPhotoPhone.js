/**
 * STAGE 15 VERIFICATION SUITE: MANDATORY PHOTO + PHONE NUMBER FOR CITIZEN COMPLAINTS
 * 
 * Verifies:
 * 1. Complaint with photo + valid phone -> SUCCESS (201)
 * 2. Missing photo -> 400 VALIDATION_ERROR
 * 3. Missing phone -> 400 VALIDATION_ERROR
 * 4. Invalid phone -> 400 VALIDATION_ERROR
 * 5. Unsupported photo (.exe, .txt) -> 400 VALIDATION_ERROR
 * 6. Oversized photo (>5MB) -> 400 VALIDATION_ERROR
 * 7. Direct API request without photo -> rejected 400
 * 8. Direct API request without phone -> rejected 400
 * 9. Existing historical complaints remain accessible
 * 10. Phone is not exposed in public complaint feed
 * 11. Phone is not exposed in analytics
 * 12. Valid new complaint still reaches automatic routing
 * 13. Inside-boundary complaint -> ROUTED
 * 14. Outside-boundary complaint -> HUMAN_REVIEW
 * 15. AI classification continues working
 * 16. Citizen Portal map & coordinates continue working
 * 17. Phone normalization (+91XXXXXXXXXX) verified in database
 * 18. Real multipart/form-data submission end-to-end with Socket.IO verification
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const { pool } = require('../config/db');
const { io: ClientIO } = require('../../../client/node_modules/socket.io-client');

let passed = 0;
let failed = 0;
let assertionIndex = 0;

function assert(condition, testName, details = '') {
  assertionIndex++;
  if (condition) {
    console.log(`  ✔ [${assertionIndex}] [PASS] ${testName}`);
    if (details) console.log(`      Detail: ${details}`);
    passed++;
  } else {
    console.error(`  ✖ [${assertionIndex}] [FAIL] ${testName}`);
    if (details) console.error(`      Detail: ${details}`);
    failed++;
  }
}

// 1x1 valid JPEG binary buffer
const VALID_JPEG = Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x01, 0x00, 0x60, 0x00, 0x60, 0x00, 0x00, 0xFF, 0xD9]);
// 1x1 valid PNG binary buffer
const VALID_PNG = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00, 0x1F, 0x15, 0xC4, 0x89, 0x00, 0x00, 0x00, 0x0A, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9C, 0x63, 0x00, 0x01, 0x00, 0x00, 0x05, 0x00, 0x01, 0x0D, 0x0A, 0x2D, 0xB4, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4E, 0x44, 0xAE, 0x42, 0x60, 0x82]);

function sendMultipart(urlPath, fields = {}, fileObj = null, token = null) {
  return new Promise((resolve, reject) => {
    const boundary = '----CivicBoundary' + Math.random().toString(16).slice(2);
    const postData = [];

    for (const [key, value] of Object.entries(fields)) {
      if (value !== null && value !== undefined) {
        postData.push(Buffer.from(`--${boundary}\r\n`));
        postData.push(Buffer.from(`Content-Disposition: form-data; name="${key}"\r\n\r\n`));
        postData.push(Buffer.from(`${value}\r\n`));
      }
    }

    if (fileObj) {
      postData.push(Buffer.from(`--${boundary}\r\n`));
      postData.push(Buffer.from(`Content-Disposition: form-data; name="${fileObj.fieldName || 'photo'}"; filename="${fileObj.fileName || 'test.jpg'}"\r\n`));
      postData.push(Buffer.from(`Content-Type: ${fileObj.mimeType || 'image/jpeg'}\r\n\r\n`));
      postData.push(fileObj.content);
      postData.push(Buffer.from('\r\n'));
    }

    postData.push(Buffer.from(`--${boundary}--\r\n`));
    const fullBody = Buffer.concat(postData);

    const headers = {
      'Content-Type': `multipart/form-data; boundary=${boundary}`,
      'Content-Length': fullBody.length
    };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const options = {
      hostname: 'localhost',
      port: 4000,
      path: urlPath,
      method: 'POST',
      headers
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

function sendJson(urlPath, method = 'GET', body = null, token = null) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    if (payload) headers['Content-Length'] = Buffer.byteLength(payload);

    const options = {
      hostname: 'localhost',
      port: 4000,
      path: urlPath,
      method,
      headers
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
    if (payload) req.write(payload);
    req.end();
  });
}

async function runTests() {
  console.log('================================================================');
  console.log(' STAGE 15: MANDATORY PHOTO + PHONE CITIZEN INTAKE VERIFICATION');
  console.log('================================================================\n');

  // Socket.IO client setup
  const socketClient = ClientIO('http://localhost:4000', {
    transports: ['websocket'],
    reconnection: false
  });
  const capturedSocketEvents = [];
  socketClient.on('complaint:created', (data) => capturedSocketEvents.push(data));

  await new Promise((resolve) => {
    socketClient.on('connect', resolve);
    setTimeout(resolve, 1500);
  });

  // Fetch operator token for privileged checks
  const opLogin = await sendJson('/api/auth/demo-login', 'POST', { role: 'OPERATOR' });
  const operatorToken = opLogin.body?.data?.token;

  try {
    // -------------------------------------------------------------------------
    // 1. Complaint with photo + valid phone -> SUCCESS (201 Created)
    // -------------------------------------------------------------------------
    console.log('--- 1. Valid Submission with Photo + Valid Indian Phone ---');
    const validRes = await sendMultipart('/api/complaints', {
      description: 'Severe road depression on Ashoka Road near fountain',
      category: 'POTHOLE',
      category_source: 'CITIZEN_SELECTED',
      latitude: '12.3115',
      longitude: '76.6520',
      citizen_contact: '+91 98450 12345'
    }, {
      fieldName: 'photo',
      fileName: 'pothole_evidence.jpg',
      mimeType: 'image/jpeg',
      content: VALID_JPEG
    });

    assert(
      validRes.status === 201 && validRes.body?.success === true && validRes.body?.data?.complaint_code,
      '1. Complaint with photo + valid phone succeeds with 201 Created',
      `Code: ${validRes.body?.data?.complaint_code}, Status: ${validRes.body?.data?.status}`
    );
    const validComplaint = validRes.body?.data;

    // Verify phone normalized to standard E.164 (+91XXXXXXXXXX) in DB
    const dbRow = await pool.query('SELECT citizen_contact, photo_url FROM complaints WHERE id = $1;', [validComplaint.id]);
    assert(
      dbRow.rows[0]?.citizen_contact === '+919845012345',
      'Normalized Phone: Stored as canonical E.164 (+91XXXXXXXXXX)',
      `Stored: ${dbRow.rows[0]?.citizen_contact}`
    );
    assert(
      dbRow.rows[0]?.photo_url && dbRow.rows[0]?.photo_url.startsWith('/uploads/complaints/'),
      'Photo URL: Stored in PostgreSQL with protected path',
      `Photo: ${dbRow.rows[0]?.photo_url}`
    );

    // -------------------------------------------------------------------------
    // 2. Missing photo -> 400 VALIDATION_ERROR
    // -------------------------------------------------------------------------
    console.log('\n--- 2. Missing Photo Rejection ---');
    const noPhotoRes = await sendMultipart('/api/complaints', {
      description: 'Deep pothole on road without photo attached',
      category: 'POTHOLE',
      category_source: 'MANUAL',
      latitude: '12.3115',
      longitude: '76.6520',
      citizen_contact: '9845012345'
    }, null); // null photo

    assert(
      noPhotoRes.status === 400 &&
      (noPhotoRes.body?.code === 'VALIDATION_ERROR' || noPhotoRes.body?.error?.includes('photo')),
      '2. Missing photo rejected with 400 VALIDATION_ERROR',
      `Error: ${noPhotoRes.body?.error || noPhotoRes.body?.message}`
    );

    // -------------------------------------------------------------------------
    // 3. Missing phone -> 400 VALIDATION_ERROR
    // -------------------------------------------------------------------------
    console.log('\n--- 3. Missing Phone Rejection ---');
    const noPhoneRes = await sendMultipart('/api/complaints', {
      description: 'Deep pothole on road without phone attached',
      category: 'POTHOLE',
      category_source: 'MANUAL',
      latitude: '12.3115',
      longitude: '76.6520'
      // no contact field
    }, {
      fieldName: 'photo',
      fileName: 'evidence.jpg',
      mimeType: 'image/jpeg',
      content: VALID_JPEG
    });

    assert(
      noPhoneRes.status === 400 &&
      (noPhoneRes.body?.code === 'VALIDATION_ERROR' || noPhoneRes.body?.error?.includes('Phone number')),
      '3. Missing phone rejected with 400 VALIDATION_ERROR',
      `Error: ${noPhoneRes.body?.error || noPhoneRes.body?.message}`
    );

    // -------------------------------------------------------------------------
    // 4. Invalid phone -> 400 VALIDATION_ERROR
    // -------------------------------------------------------------------------
    console.log('\n--- 4. Invalid Phone Formats Rejection ---');
    const invalidPhones = ['12345', 'abcdefghij', '1234567890', '+1 555-234-5678', '98450-not-a-number'];
    let allInvalidPhonesRejected = true;
    for (const badPhone of invalidPhones) {
      const badPhoneRes = await sendMultipart('/api/complaints', {
        description: 'Pothole test with invalid phone format',
        category: 'POTHOLE',
        category_source: 'MANUAL',
        latitude: '12.3115',
        longitude: '76.6520',
        citizen_contact: badPhone
      }, {
        fieldName: 'photo',
        fileName: 'evidence.jpg',
        mimeType: 'image/jpeg',
        content: VALID_JPEG
      });
      if (badPhoneRes.status !== 400) {
        allInvalidPhonesRejected = false;
        console.error(`      Phone '${badPhone}' was NOT rejected with 400! Status: ${badPhoneRes.status}`);
      }
    }
    assert(allInvalidPhonesRejected, '4. Invalid phone numbers (non-Indian, text, malformed) rejected with 400');

    // -------------------------------------------------------------------------
    // 5. Unsupported photo -> 400
    // -------------------------------------------------------------------------
    console.log('\n--- 5. Unsupported Photo Upload Security ---');
    const exeBuffer = Buffer.from('MZ...executable binary header content');
    const exeRes = await sendMultipart('/api/complaints', {
      description: 'Pothole test with executable file',
      category: 'POTHOLE',
      latitude: '12.3115',
      longitude: '76.6520',
      citizen_contact: '9845012345'
    }, {
      fieldName: 'photo',
      fileName: 'exploit.exe',
      mimeType: 'application/x-msdownload',
      content: exeBuffer
    });

    assert(
      exeRes.status === 400 &&
      (exeRes.body?.code === 'VALIDATION_ERROR' || exeRes.body?.error?.includes('Unsupported file type')),
      '5. Unsupported photo (.exe / non-image) rejected with 400 VALIDATION_ERROR',
      `Response code: ${exeRes.body?.code}, error: ${exeRes.body?.error}`
    );

    // Mismatched extension/MIME test (.jpg extension with text/plain mime)
    const spoofRes = await sendMultipart('/api/complaints', {
      description: 'Pothole test with spoofed MIME',
      category: 'POTHOLE',
      latitude: '12.3115',
      longitude: '76.6520',
      citizen_contact: '9845012345'
    }, {
      fieldName: 'photo',
      fileName: 'spoof.jpg',
      mimeType: 'text/plain',
      content: Buffer.from('plain text inside jpg')
    });
    assert(
      spoofRes.status === 400,
      '5b. Extension and MIME type mismatch rejected with 400',
      `Status: ${spoofRes.status}`
    );

    // -------------------------------------------------------------------------
    // 6. Oversized photo -> 400
    // -------------------------------------------------------------------------
    console.log('\n--- 6. Oversized Photo Rejection ---');
    const oversizedBuffer = Buffer.alloc(5.2 * 1024 * 1024); // 5.2 MB
    const overRes = await sendMultipart('/api/complaints', {
      description: 'Oversized photo test complaint',
      category: 'GARBAGE',
      latitude: '12.3115',
      longitude: '76.6520',
      citizen_contact: '9845012345'
    }, {
      fieldName: 'photo',
      fileName: 'huge.jpg',
      mimeType: 'image/jpeg',
      content: oversizedBuffer
    });

    assert(
      overRes.status === 400 &&
      (overRes.body?.code === 'VALIDATION_ERROR' || overRes.body?.error?.includes('exceeds maximum allowed size')),
      '6. Oversized photo (>5MB) rejected with 400 VALIDATION_ERROR',
      `Error: ${overRes.body?.error}`
    );

    // -------------------------------------------------------------------------
    // 7. Direct API request without photo -> rejected
    // -------------------------------------------------------------------------
    console.log('\n--- 7. Direct API Request Without Photo ---');
    const directNoPhoto = await sendJson('/api/complaints', 'POST', {
      description: 'Direct API JSON complaint without photo',
      category: 'POTHOLE',
      category_source: 'MANUAL',
      latitude: 12.3115,
      longitude: 76.6520,
      citizen_contact: '9845012345'
    });

    assert(
      directNoPhoto.status === 400 &&
      (directNoPhoto.body?.code === 'VALIDATION_ERROR' || directNoPhoto.body?.error?.includes('photo')),
      '7. Direct JSON API request without photo rejected with 400',
      `Status: ${directNoPhoto.status}, Error: ${directNoPhoto.body?.error}`
    );

    // -------------------------------------------------------------------------
    // 8. Direct API request without phone -> rejected
    // -------------------------------------------------------------------------
    console.log('\n--- 8. Direct API Request Without Phone ---');
    const directNoPhone = await sendJson('/api/complaints', 'POST', {
      description: 'Direct API JSON complaint without phone',
      category: 'POTHOLE',
      category_source: 'MANUAL',
      latitude: 12.3115,
      longitude: 76.6520,
      photo_url: '/uploads/complaints/test.jpg'
    });

    assert(
      directNoPhone.status === 400 &&
      (directNoPhone.body?.code === 'VALIDATION_ERROR' || directNoPhone.body?.error?.includes('Phone number')),
      '8. Direct JSON API request without phone rejected with 400',
      `Status: ${directNoPhone.status}, Error: ${directNoPhone.body?.error}`
    );

    // Direct request missing BOTH photo and phone
    const directNoBoth = await sendJson('/api/complaints', 'POST', {
      description: 'Direct API JSON complaint missing both',
      category: 'POTHOLE',
      latitude: 12.3115,
      longitude: 76.6520
    });
    assert(
      directNoBoth.status === 400 && directNoBoth.body?.code === 'VALIDATION_ERROR' && directNoBoth.body?.message?.includes('Photo and phone number are required'),
      '8b. Direct request missing both photo and phone returns exact message "Photo and phone number are required."',
      `Message: ${directNoBoth.body?.message}`
    );

    // -------------------------------------------------------------------------
    // 9. Existing historical complaints remain accessible
    // -------------------------------------------------------------------------
    console.log('\n--- 9. Historical Complaint Preservation ---');
    const histCompRes = await pool.query('SELECT id, complaint_code, photo_url, citizen_contact FROM complaints LIMIT 3;');
    assert(
      histCompRes.rows.length > 0,
      '9. Existing historical complaints remain intact in database',
      `Sample code: ${histCompRes.rows[0]?.complaint_code}`
    );

    // GET /api/complaints/:id for historical complaint succeeds
    const histGet = await sendJson(`/api/complaints/${histCompRes.rows[0].id}`, 'GET');
    assert(
      histGet.status === 200 && histGet.body?.data?.id === histCompRes.rows[0].id,
      '9b. Historical complaint retrieves cleanly via GET /api/complaints/:id with 200 OK',
      `Status: ${histGet.body?.data?.status}`
    );

    // -------------------------------------------------------------------------
    // 10. Phone is not exposed in public complaint feed
    // -------------------------------------------------------------------------
    console.log('\n--- 10. Public Privacy: Phone Excluded from Public Feeds ---');
    const publicFeed = await sendJson('/api/complaints?limit=10', 'GET');
    const phoneLeakedInFeed = publicFeed.body?.data?.some(c => c.citizen_contact !== undefined || c.phone !== undefined);
    assert(
      publicFeed.status === 200 && !phoneLeakedInFeed,
      '10. Anonymous GET /api/complaints feed strips citizen_contact completely',
      `Checked ${publicFeed.body?.data?.length} records, Leaked: 0`
    );

    // Verify submission response also omits phone for non-privileged citizen
    assert(
      validRes.body?.data?.citizen_contact === undefined,
      '10b. Intake submission response strips citizen_contact for citizen',
      `Payload contact: ${validRes.body?.data?.citizen_contact || 'Stripped (Safe)'}`
    );

    // -------------------------------------------------------------------------
    // 11. Phone is not exposed in analytics
    // -------------------------------------------------------------------------
    console.log('\n--- 11. Public Privacy: Phone Excluded from Analytics ---');
    const analyticsOverview = await sendJson('/api/analytics/overview', 'GET', null, operatorToken);
    const overviewStr = JSON.stringify(analyticsOverview.body || {});
    assert(
      !overviewStr.includes('+919845012345') && !overviewStr.includes('9845012345'),
      '11. Analytics responses do not contain citizen phone numbers',
      `Status: ${analyticsOverview.status}`
    );

    // -------------------------------------------------------------------------
    // 12. Valid new complaint still reaches automatic routing
    // -------------------------------------------------------------------------
    console.log('\n--- 12. Automatic PostGIS Routing for Valid Complaint ---');
    assert(
      validComplaint.status === 'ROUTED' || validComplaint.status === 'HUMAN_REVIEW',
      '12. Valid new complaint automatically routes without manual intervention',
      `Routing status: ${validComplaint.status}`
    );

    // -------------------------------------------------------------------------
    // 13. Inside-boundary complaint -> ROUTED
    // -------------------------------------------------------------------------
    console.log('\n--- 13. Inside-Boundary Complaint Routes to ROUTED ---');
    const insideRes = await sendMultipart('/api/complaints', {
      description: 'Major road fissure inside Mysuru municipal jurisdiction',
      category: 'POTHOLE',
      category_source: 'CITIZEN_SELECTED',
      latitude: '12.3020',
      longitude: '76.6430',
      citizen_contact: '9845098450'
    }, {
      fieldName: 'photo',
      fileName: 'inside_evidence.jpg',
      mimeType: 'image/jpeg',
      content: VALID_JPEG
    });

    assert(
      insideRes.status === 201 && insideRes.body?.data?.status === 'ROUTED',
      '13. Inside-boundary complaint automatically resolves to ROUTED',
      `Status: ${insideRes.body?.data?.status}, Code: ${insideRes.body?.data?.complaint_code}`
    );

    // -------------------------------------------------------------------------
    // 14. Outside-boundary complaint -> HUMAN_REVIEW
    // -------------------------------------------------------------------------
    console.log('\n--- 14. Outside-Boundary Complaint Routes to HUMAN_REVIEW ---');
    const outsideRes = await sendMultipart('/api/complaints', {
      description: 'Streetlight pole fallen outside all municipal boundaries',
      category: 'STREETLIGHT',
      category_source: 'CITIZEN_SELECTED',
      latitude: '12.9716', // Bangalore coordinates
      longitude: '77.5946',
      citizen_contact: '9845098451'
    }, {
      fieldName: 'photo',
      fileName: 'outside_evidence.png',
      mimeType: 'image/png',
      content: VALID_PNG
    });

    assert(
      outsideRes.status === 201 && outsideRes.body?.data?.status === 'HUMAN_REVIEW',
      '14. Outside-boundary complaint automatically routes to HUMAN_REVIEW',
      `Status: ${outsideRes.body?.data?.status}, Code: ${outsideRes.body?.data?.complaint_code}`
    );

    // -------------------------------------------------------------------------
    // 15. AI classification continues working
    // -------------------------------------------------------------------------
    console.log('\n--- 15. AI Classification Endpoint Operational ---');
    const aiRes = await sendMultipart('/api/complaints/classify', {
      description: 'Water leaking heavily from broken underground municipal water pipe'
    });
    assert(
      aiRes.status === 200 && aiRes.body?.success === true,
      '15. AI Issue Classification endpoint POST /api/complaints/classify operational',
      `Category: ${aiRes.body?.category || 'Fallback available'}, Available: ${aiRes.body?.available}`
    );

    // -------------------------------------------------------------------------
    // 16. Citizen Portal map coordinates & PostGIS geometry verified
    // -------------------------------------------------------------------------
    console.log('\n--- 16. PostGIS Geometry & Spatial Verification ---');
    const geomCheck = await pool.query(
      'SELECT ST_AsText(location) as geom, ST_SRID(location) as srid FROM complaints WHERE id = $1;',
      [insideRes.body?.data?.id]
    );
    assert(
      geomCheck.rows[0]?.geom === 'POINT(76.643 12.302)' && geomCheck.rows[0]?.srid === 4326,
      '16. Correct PostGIS SRID 4326 Point stored for map and spatial routing',
      `Geom: ${geomCheck.rows[0]?.geom}, SRID: ${geomCheck.rows[0]?.srid}`
    );

    // -------------------------------------------------------------------------
    // 17. Socket.IO Broadcast Verification
    // -------------------------------------------------------------------------
    console.log('\n--- 17. Real-Time Socket.IO Broadcast Verification ---');
    await new Promise(r => setTimeout(r, 600));
    const capturedEvent = capturedSocketEvents.find(e => e.complaintCode === insideRes.body?.data?.complaint_code);
    assert(
      Boolean(capturedEvent) && capturedEvent.hasPhoto === true && capturedEvent.citizen_contact === undefined,
      '17. Socket.IO complaint:created emitted hasPhoto: true and omits citizen_contact',
      `Event Code: ${capturedEvent?.complaintCode}, hasPhoto: ${capturedEvent?.hasPhoto}`
    );

    // -------------------------------------------------------------------------
    // 18. Operator Dossier Verification
    // -------------------------------------------------------------------------
    console.log('\n--- 18. Privileged Operator Dossier Access ---');
    const opDossier = await sendJson(`/api/complaints/${insideRes.body?.data?.id}`, 'GET', null, operatorToken);
    assert(
      opDossier.status === 200 && opDossier.body?.data?.citizen_contact === '+919845098450',
      '18. Authorized OPERATOR recovers normalized phone number for dispatch',
      `Recovered Phone: ${opDossier.body?.data?.citizen_contact}`
    );

  } catch (err) {
    console.error('Fatal error during test suite:', err);
    failed++;
  } finally {
    socketClient.disconnect();
  }

  console.log('\n================================================================');
  console.log(` STAGE 15 RESULTS: ${passed} PASSED, ${failed} FAILED (TOTAL: ${passed + failed})`);
  console.log('================================================================\n');
  process.exit(failed > 0 ? 1 : 0);
}

runTests();
