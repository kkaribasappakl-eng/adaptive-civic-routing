const { pool } = require('../config/db');
const { CONTROLLED_CATEGORIES } = require('./aiService');
const { getIO } = require('./socketService');

const VALID_CATEGORY_SOURCES = ['AI_SUGGESTED', 'CITIZEN_SELECTED', 'MANUAL'];

/**
 * Validates and normalizes Indian mobile phone numbers.
 * Accepted input formats:
 *   - 9845012345
 *   - +91 98450 12345
 *   - +91-98450-12345
 *   - 09845012345
 *   - 919845012345
 * Normalizes to standard E.164: +91XXXXXXXXXX
 */
const validateAndNormalizeIndianPhone = (phone) => {
  if (!phone || typeof phone !== 'string') {
    return { valid: false, error: 'Phone number is required to submit a complaint.' };
  }
  const trimmed = phone.trim();
  if (trimmed.length === 0) {
    return { valid: false, error: 'Phone number is required to submit a complaint.' };
  }
  // Remove whitespace, hyphens, parentheses, dots
  const stripped = trimmed.replace(/[\s\-\(\)\.]/g, '');
  const indianMobileRegex = /^(?:\+91|91|0)?([6-9]\d{9})$/;
  const match = stripped.match(indianMobileRegex);
  if (!match) {
    return {
      valid: false,
      error: 'Please enter a valid 10-digit Indian mobile number (e.g., 9845012345 or +91 98450 12345).'
    };
  }
  const tenDigit = match[1];
  const normalized = `+91${tenDigit}`;
  return { valid: true, normalized };
};

/**
 * Validates raw complaint input fields.
 */
const validateComplaintInput = (data, photoUrl = null) => {
  const errors = [];

  // 1. Mandatory Photo validation
  const photo = photoUrl || data.photo_url || null;
  if (!photo || typeof photo !== 'string' || photo.trim().length === 0) {
    errors.push('A photo is required to submit a complaint.');
  }

  // 2. Mandatory Phone validation
  const phoneRaw = data.citizen_contact !== undefined && data.citizen_contact !== null
    ? String(data.citizen_contact)
    : (data.phone !== undefined && data.phone !== null
      ? String(data.phone)
      : (data.contact !== undefined && data.contact !== null
        ? String(data.contact)
        : null));

  let normalizedPhone = null;
  if (phoneRaw === null || phoneRaw.trim().length === 0) {
    errors.push('Phone number is required to submit a complaint.');
  } else {
    const phoneResult = validateAndNormalizeIndianPhone(phoneRaw);
    if (!phoneResult.valid) {
      errors.push(phoneResult.error);
    } else {
      normalizedPhone = phoneResult.normalized;
    }
  }

  // 3. Description validation
  if (!data.description || typeof data.description !== 'string' || data.description.trim().length === 0) {
    errors.push('Description is required and cannot be empty.');
  } else if (data.description.trim().length < 5) {
    errors.push('Description must be at least 5 characters long.');
  } else if (data.description.length > 2000) {
    errors.push('Description cannot exceed 2000 characters.');
  }

  // 4. Category validation
  const category = (data.category || '').toUpperCase().trim();
  if (!category || !CONTROLLED_CATEGORIES.includes(category)) {
    errors.push(`Invalid category '${data.category}'. Allowed categories: ${CONTROLLED_CATEGORIES.join(', ')}.`);
  }

  // 5. Category Source validation
  const categorySource = (data.category_source || 'MANUAL').toUpperCase().trim();
  if (!VALID_CATEGORY_SOURCES.includes(categorySource)) {
    errors.push(`Invalid category_source '${data.category_source}'. Allowed: ${VALID_CATEGORY_SOURCES.join(', ')}.`);
  }

  // 6. Geographic coordinates validation
  const lat = parseFloat(data.latitude);
  const lng = parseFloat(data.longitude);

  if (isNaN(lat) || isNaN(lng)) {
    errors.push('Both latitude and longitude must be valid floating-point numbers.');
  } else {
    if (lat < -90 || lat > 90) {
      errors.push('Latitude must be between -90 and 90 degrees.');
    }
    if (lng < -180 || lng > 180) {
      errors.push('Longitude must be between -180 and 180 degrees.');
    }
  }

  // Confidence validation (if supplied)
  let confidence = null;
  if (data.category_confidence !== undefined && data.category_confidence !== null && data.category_confidence !== '') {
    const parsedConf = parseFloat(data.category_confidence);
    if (!isNaN(parsedConf) && parsedConf >= 0 && parsedConf <= 1) {
      confidence = parsedConf;
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    sanitized: {
      description: data.description ? data.description.trim() : '',
      category,
      category_source: categorySource,
      category_confidence: confidence,
      latitude: lat,
      longitude: lng,
      photo_url: photo ? photo.trim() : null,
      citizen_contact: normalizedPhone
    }
  };
};

/**
 * Checks for potential duplicate civic reports:
 * Looks within 100 meters for the same category in the last 7 days.
 * Does NOT reject or block complaints.
 */
const checkPotentialDuplicates = async (latitude, longitude, category) => {
  const query = `
    SELECT 
      complaint_code,
      description,
      status,
      created_at,
      ROUND(ST_Distance(location::geography, ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography)::numeric, 1) AS distance_meters
    FROM complaints
    WHERE category = $3
      AND created_at >= CURRENT_TIMESTAMP - INTERVAL '7 days'
      AND ST_DWithin(location::geography, ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography, 100)
    ORDER BY distance_meters ASC
    LIMIT 3;
  `;

  try {
    const res = await pool.query(query, [longitude, latitude, category]);
    if (res.rows.length > 0) {
      return {
        possibleDuplicate: true,
        count: res.rows.length,
        message: `Warning: ${res.rows.length} similar issue(s) reported nearby within the last 7 days.`,
        nearbyReports: res.rows.map(r => ({
          complaintCode: r.complaint_code,
          distanceMeters: parseFloat(r.distance_meters),
          status: r.status,
          createdAt: r.created_at
        }))
      };
    }
  } catch (err) {
    console.warn('[Duplicate Check Warning]', err.message);
  }

  return {
    possibleDuplicate: false,
    count: 0,
    nearbyReports: []
  };
};

/**
 * Generates next unique complaint code using PostgreSQL sequence:
 * Format: HM-CIV-2026-000001
 */
const generateNextComplaintCode = async () => {
  const result = await pool.query("SELECT nextval('complaint_code_seq') AS seq;");
  const seqNum = result.rows[0].seq;
  return `HM-CIV-2026-${String(seqNum).padStart(6, '0')}`;
};

/**
 * Creates and persists a citizen complaint into PostgreSQL with PostGIS Point geometry.
 */
const createComplaint = async (inputData, photoRelativeUrl = null, autoRoute = true) => {
  const validation = validateComplaintInput(inputData, photoRelativeUrl);
  if (!validation.valid) {
    const photoMissing = validation.errors.includes('A photo is required to submit a complaint.');
    const phoneMissing = validation.errors.includes('Phone number is required to submit a complaint.');
    let errorMessage;
    if (photoMissing && phoneMissing && validation.errors.length === 2) {
      errorMessage = 'Photo and phone number are required.';
    } else {
      errorMessage = validation.errors.join(' ');
    }
    const error = new Error(errorMessage);
    error.status = 400;
    error.code = 'VALIDATION_ERROR';
    error.details = validation.errors;
    throw error;
  }

  const {
    description,
    category,
    category_source,
    category_confidence,
    latitude,
    longitude,
    photo_url,
    citizen_contact
  } = validation.sanitized;

  // Run duplicate warning check (advisory only)
  const duplicateInfo = await checkPotentialDuplicates(latitude, longitude, category);

  // Generate unique complaint code
  const complaintCode = await generateNextComplaintCode();

  const insertQuery = `
    INSERT INTO complaints (
      complaint_code,
      description,
      category,
      category_source,
      category_confidence,
      photo_url,
      location,
      latitude,
      longitude,
      citizen_contact,
      status,
      metadata
    ) VALUES (
      $1, $2, $3, $4, $5, $6,
      ST_SetSRID(ST_MakePoint($7, $8), 4326),
      $8, $7,
      $9, 'SUBMITTED', $10
    )
    RETURNING 
      id,
      complaint_code,
      description,
      category,
      category_source,
      category_confidence,
      photo_url,
      latitude,
      longitude,
      citizen_contact,
      status,
      created_at;
  `;

  const metadata = {
    duplicateWarningIssued: duplicateInfo.possibleDuplicate,
    nearbyReportsFound: duplicateInfo.count,
    submittedVia: 'citizen_web_portal'
  };

  const result = await pool.query(insertQuery, [
    complaintCode,
    description,
    category,
    category_source,
    category_confidence,
    photo_url,
    longitude, // $7 (X)
    latitude,  // $8 (Y)
    citizen_contact,
    JSON.stringify(metadata)
  ]);

  const savedComplaint = result.rows[0];

  // Record initial SUBMITTED status history
  try {
    await pool.query(
      `INSERT INTO complaint_status_history (
        complaint_id,
        previous_status,
        new_status,
        changed_by,
        reason,
        metadata
      ) VALUES ($1, $2, $3, $4, $5, $6);`,
      [
        savedComplaint.id,
        null,
        savedComplaint.status || 'SUBMITTED',
        'citizen_portal',
        'Initial citizen complaint submitted',
        JSON.stringify({ duplicateWarningIssued: duplicateInfo.possibleDuplicate })
      ]
    );
  } catch (histErr) {
    console.warn('[Status History] Initial history log error:', histErr.message);
  }

  // Stage 8: Create COMPLAINT_SUBMITTED notification in PostgreSQL
  try {
    const { createNotification } = require('./notificationService');
    await createNotification({
      complaintId: savedComplaint.id,
      notificationType: 'COMPLAINT_SUBMITTED',
      title: 'Complaint Registered',
      message: `Complaint ${savedComplaint.complaint_code} has been successfully registered under ${savedComplaint.category}.`,
      metadata: {
        complaintCode: savedComplaint.complaint_code,
        category: savedComplaint.category,
        status: savedComplaint.status
      },
      idempotencyKey: `COMPLAINT_SUBMITTED:${savedComplaint.id}`
    });
  } catch (notifErr) {
    console.warn('[Stage 8 Notification] COMPLAINT_SUBMITTED notification warning:', notifErr.message);
  }

  // Broadcast real-time Socket.IO event with safe metadata
  try {
    const io = getIO();
    io.emit('complaint:created', {
      id: savedComplaint.id,
      complaintCode: savedComplaint.complaint_code,
      description: savedComplaint.description,
      category: savedComplaint.category,
      categorySource: savedComplaint.category_source,
      latitude: parseFloat(savedComplaint.latitude),
      longitude: parseFloat(savedComplaint.longitude),
      status: savedComplaint.status,
      hasPhoto: Boolean(savedComplaint.photo_url),
      createdAt: savedComplaint.created_at
    });
  } catch (socketErr) {
    console.warn('[Socket.IO] Broadcast failed (client may still be connecting):', socketErr.message);
  }

  // Stage 15: Automatic deterministic PostGIS civic routing
  let routingDecision = null;
  if (autoRoute) {
    try {
      const { routeComplaint } = require('./routingService');
      const routeResult = await routeComplaint(savedComplaint.id);
      routingDecision = routeResult?.decision || null;
      if (routingDecision) {
        savedComplaint.status = routingDecision.routing_status || routingDecision.routingStatus || savedComplaint.status;
      }
    } catch (routeErr) {
      console.warn('[Auto Routing Warning] Automatic deterministic routing failed:', routeErr.message);
    }
  }

  return {
    complaint: savedComplaint,
    duplicateWarning: duplicateInfo,
    routingDecision
  };
};

/**
 * Stage 8: Updates complaint category and creates CATEGORY_UPDATED notification.
 */
const updateComplaintCategory = async (complaintId, newCategory, reason = 'Category reassigned by civic operator') => {
  const normalizedCategory = (newCategory || '').toUpperCase().trim();
  if (!CONTROLLED_CATEGORIES.includes(normalizedCategory)) {
    throw new Error(`Invalid category '${newCategory}'. Allowed categories: ${CONTROLLED_CATEGORIES.join(', ')}.`);
  }

  const query = `
    UPDATE complaints
    SET category = $1, updated_at = CURRENT_TIMESTAMP
    WHERE id = $2
    RETURNING id, complaint_code, category, status;
  `;
  const res = await pool.query(query, [normalizedCategory, complaintId]);
  if (res.rows.length === 0) {
    throw new Error(`Complaint '${complaintId}' not found.`);
  }

  const updatedComplaint = res.rows[0];

  // Stage 8: Persist CATEGORY_UPDATED notification
  const { createNotification } = require('./notificationService');
  await createNotification({
    complaintId: updatedComplaint.id,
    notificationType: 'CATEGORY_UPDATED',
    title: 'Category Updated',
    message: `Complaint ${updatedComplaint.complaint_code} category updated to ${normalizedCategory}. Reason: ${reason}`,
    metadata: {
      category: normalizedCategory,
      reason
    },
    idempotencyKey: `CATEGORY_UPDATED:${updatedComplaint.id}:${normalizedCategory}`
  });

  return updatedComplaint;
};

/**
 * Lists complaints with pagination and GeoJSON point format.
 */
const listComplaints = async (limit = 20, offset = 0, category = null) => {
  let query = `
    SELECT 
      id,
      complaint_code,
      description,
      category,
      category_source,
      category_confidence,
      photo_url,
      latitude,
      longitude,
      citizen_contact,
      status,
      routed_at,
      sla_warning_at,
      sla_target_at,
      sla_status,
      sla_breached_at,
      created_at,
      ST_AsGeoJSON(location)::json AS geojson
    FROM complaints
  `;
  const params = [];

  if (category) {
    params.push(category.toUpperCase());
    query += ` WHERE category = $1`;
  }

  query += ` ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2};`;
  params.push(Math.min(100, Math.max(1, parseInt(limit) || 20)));
  params.push(Math.max(0, parseInt(offset) || 0));

  const countQuery = category
    ? 'SELECT COUNT(*)::int AS total FROM complaints WHERE category = $1;'
    : 'SELECT COUNT(*)::int AS total FROM complaints;';
  const countParams = category ? [category.toUpperCase()] : [];

  const [res, countRes] = await Promise.all([
    pool.query(query, params),
    pool.query(countQuery, countParams)
  ]);

  return {
    total: countRes.rows[0].total,
    complaints: res.rows
  };
};

/**
 * Retrieves a single complaint by UUID or complaint_code.
 */
const getComplaintById = async (idOrCode) => {
  const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(idOrCode);
  const query = `
    SELECT 
      id,
      complaint_code,
      description,
      category,
      category_source,
      category_confidence,
      photo_url,
      latitude,
      longitude,
      citizen_contact,
      status,
      routed_at,
      sla_warning_at,
      sla_target_at,
      sla_status,
      sla_breached_at,
      metadata,
      created_at,
      updated_at,
      ST_AsGeoJSON(location)::json AS geojson
    FROM complaints
    WHERE ${isUUID ? 'id = $1' : 'complaint_code = $1'};
  `;
  const res = await pool.query(query, [idOrCode]);
  return res.rows[0] || null;
};

module.exports = {
  validateComplaintInput,
  checkPotentialDuplicates,
  generateNextComplaintCode,
  createComplaint,
  listComplaints,
  getComplaintById,
  updateComplaintCategory
};
