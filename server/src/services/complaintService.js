const { pool } = require('../config/db');
const { CONTROLLED_CATEGORIES } = require('./aiService');
const { getIO } = require('./socketService');

const VALID_CATEGORY_SOURCES = ['AI_SUGGESTED', 'CITIZEN_SELECTED', 'MANUAL'];

/**
 * Validates raw complaint input fields.
 */
const validateComplaintInput = (data) => {
  const errors = [];

  // Description validation
  if (!data.description || typeof data.description !== 'string' || data.description.trim().length === 0) {
    errors.push('Description is required and cannot be empty.');
  } else if (data.description.trim().length < 5) {
    errors.push('Description must be at least 5 characters long.');
  } else if (data.description.length > 2000) {
    errors.push('Description cannot exceed 2000 characters.');
  }

  // Category validation
  const category = (data.category || '').toUpperCase().trim();
  if (!category || !CONTROLLED_CATEGORIES.includes(category)) {
    errors.push(`Invalid category '${data.category}'. Allowed categories: ${CONTROLLED_CATEGORIES.join(', ')}.`);
  }

  // Category Source validation
  const categorySource = (data.category_source || 'MANUAL').toUpperCase().trim();
  if (!VALID_CATEGORY_SOURCES.includes(categorySource)) {
    errors.push(`Invalid category_source '${data.category_source}'. Allowed: ${VALID_CATEGORY_SOURCES.join(', ')}.`);
  }

  // Geographic coordinates validation
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
      citizen_contact: data.citizen_contact ? String(data.citizen_contact).trim().slice(0, 100) : null
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
const createComplaint = async (inputData, photoRelativeUrl = null) => {
  const validation = validateComplaintInput(inputData);
  if (!validation.valid) {
    const error = new Error(validation.errors.join(' '));
    error.status = 400;
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
    photoRelativeUrl,
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

  return {
    complaint: savedComplaint,
    duplicateWarning: duplicateInfo
  };
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
  getComplaintById
};
