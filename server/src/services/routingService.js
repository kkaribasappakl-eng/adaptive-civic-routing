const { pool } = require('../config/db');
const { getIO } = require('./socketService');
const { initializeComplaintSla } = require('./slaService');

/**
 * Core Deterministic Civic Routing Engine
 * 
 * STRICT ARCHITECTURAL PRINCIPLE:
 * - AI does NOT decide routing.
 * - Routing is 100% deterministic: PostGIS ST_Covers on the ACTIVE version + Category Mapping.
 * - Historical routing decisions remain permanently immutable once recorded.
 */

/**
 * Routes a persisted complaint against the active jurisdiction version in PostgreSQL.
 */
const routeComplaint = async (complaintIdOrCode) => {
  const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(complaintIdOrCode);

  // 1. Fetch the complaint
  const complaintQuery = `
    SELECT 
      id, complaint_code, description, category, category_source,
      latitude, longitude, status, created_at
    FROM complaints
    WHERE ${isUUID ? 'id = $1' : 'complaint_code = $1'};
  `;
  const compRes = await pool.query(complaintQuery, [complaintIdOrCode]);
  if (compRes.rows.length === 0) {
    const error = new Error(`Complaint '${complaintIdOrCode}' not found.`);
    error.status = 404;
    throw error;
  }
  const complaint = compRes.rows[0];

  // 2. IDEMPOTENCY CHECK: If already routed, return existing decision
  const existingDecisionQuery = `
    SELECT 
      rd.id, rd.complaint_id, rd.routing_status, rd.routing_method, rd.reason, rd.matched_at,
      rd.created_at,
      jv.id AS version_id, jv.version_code, jv.version_number,
      j.id AS jurisdiction_id, j.name AS jurisdiction_name, j.code AS jurisdiction_code,
      a.id AS authority_id, a.name AS authority_name, a.code AS authority_code,
      d.id AS department_id, d.name AS department_name, d.code AS department_code
    FROM routing_decisions rd
    JOIN jurisdiction_versions jv ON rd.jurisdiction_version_id = jv.id
    LEFT JOIN jurisdictions j ON rd.jurisdiction_id = j.id
    LEFT JOIN authorities a ON rd.authority_id = a.id
    LEFT JOIN departments d ON rd.department_id = d.id
    WHERE rd.complaint_id = $1;
  `;
  const existingRes = await pool.query(existingDecisionQuery, [complaint.id]);
  if (existingRes.rows.length > 0) {
    return {
      alreadyRouted: true,
      decision: formatRoutingDecision(existingRes.rows[0], complaint)
    };
  }

  // 3. Fetch current ACTIVE jurisdiction version
  const activeVersionQuery = `
    SELECT id, version_code, version_number, status
    FROM jurisdiction_versions
    WHERE status = 'ACTIVE'
    LIMIT 1;
  `;
  const activeVerRes = await pool.query(activeVersionQuery);
  if (activeVerRes.rows.length === 0) {
    throw new Error('No ACTIVE jurisdiction version found in database. Cannot route complaints.');
  }
  const activeVersion = activeVerRes.rows[0];

  // 4. Real PostGIS Spatial Lookup using ST_Covers on active version boundaries
  const gisQuery = `
    SELECT 
      j.id AS jurisdiction_id,
      j.name AS jurisdiction_name,
      j.code AS jurisdiction_code,
      a.id AS authority_id,
      a.name AS authority_name,
      a.code AS authority_code,
      ST_Touches(j.boundary, c.location) AS on_boundary
    FROM complaints c
    CROSS JOIN jurisdictions j
    JOIN authorities a ON j.authority_id = a.id
    WHERE c.id = $1
      AND j.jurisdiction_version_id = $2
      AND ST_Covers(j.boundary, c.location)
    ORDER BY j.created_at ASC
    LIMIT 1;
  `;
  const gisRes = await pool.query(gisQuery, [complaint.id, activeVersion.id]);

  let jurisdictionId = null;
  let authorityId = null;
  let departmentId = null;
  let routingStatus = 'HUMAN_REVIEW';
  let routingMethod = 'HUMAN_REVIEW';
  let reason = '';
  let matchedData = null;

  if (gisRes.rows.length > 0) {
    matchedData = gisRes.rows[0];
    jurisdictionId = matchedData.jurisdiction_id;
    authorityId = matchedData.authority_id;

    // 5. Look up department mapping for (authority_id, complaint.category)
    const deptQuery = `
      SELECT d.id AS department_id, d.name AS department_name, d.code AS department_code
      FROM category_department_mappings cdm
      JOIN departments d ON cdm.department_id = d.id
      WHERE cdm.authority_id = $1 AND cdm.category = $2;
    `;
    const deptRes = await pool.query(deptQuery, [authorityId, complaint.category]);

    if (deptRes.rows.length > 0) {
      const dept = deptRes.rows[0];
      departmentId = dept.department_id;
      routingStatus = 'ROUTED';
      routingMethod = 'GIS_RULE';
      reason = `Complaint coordinates (${parseFloat(complaint.latitude).toFixed(4)}° N, ${parseFloat(complaint.longitude).toFixed(4)}° E) are covered by active jurisdiction boundary '${matchedData.jurisdiction_name}' (${matchedData.jurisdiction_code}) under version ${activeVersion.version_code}. The complaint category ${complaint.category} deterministically maps to department '${dept.department_name}' under ${matchedData.authority_name}.`;
    } else {
      routingStatus = 'HUMAN_REVIEW';
      routingMethod = 'HUMAN_REVIEW';
      reason = `Complaint location is covered by jurisdiction '${matchedData.jurisdiction_name}' (${matchedData.authority_name}), but issue category '${complaint.category}' does not have an automatic department mapping. Flagged for human review.`;
    }
  } else {
    // Uncovered coordinate outside demo boundaries
    routingStatus = 'HUMAN_REVIEW';
    routingMethod = 'HUMAN_REVIEW';
    reason = `Complaint coordinates (${parseFloat(complaint.latitude).toFixed(4)}° N, ${parseFloat(complaint.longitude).toFixed(4)}° E) are outside all configured jurisdiction boundaries in active version ${activeVersion.version_code}. Flagged for human review.`;
  }

  // 6. Insert into routing_decisions table (with unique complaint_id constraint)
  const client = await pool.connect();
  let savedDecision = null;

  try {
    await client.query('BEGIN');

    const insertDecisionQuery = `
      INSERT INTO routing_decisions (
        complaint_id,
        jurisdiction_version_id,
        jurisdiction_id,
        authority_id,
        department_id,
        routing_status,
        routing_method,
        reason,
        matched_at,
        metadata
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, CURRENT_TIMESTAMP, $9)
      RETURNING id, complaint_id, routing_status, routing_method, reason, matched_at, created_at;
    `;

    const metadata = {
      activeVersionAtRouting: activeVersion.version_code,
      resolvedAt: new Date().toISOString()
    };

    const dRes = await client.query(insertDecisionQuery, [
      complaint.id,
      activeVersion.id,
      jurisdictionId,
      authorityId,
      departmentId,
      routingStatus,
      routingMethod,
      reason,
      JSON.stringify(metadata)
    ]);
    savedDecision = dRes.rows[0];

    // 7. Update complaint status, persist real PostgreSQL routed_at timestamp, and append to status history
    const previousStatus = complaint.status;
    const newComplaintStatus = routingStatus === 'ROUTED' ? 'ROUTED' : 'HUMAN_REVIEW';
    await client.query(
      'UPDATE complaints SET status = $1, routed_at = COALESCE(routed_at, CURRENT_TIMESTAMP), updated_at = CURRENT_TIMESTAMP WHERE id = $2;',
      [newComplaintStatus, complaint.id]
    );

    await client.query(
      `INSERT INTO complaint_status_history (
        complaint_id,
        previous_status,
        new_status,
        changed_by,
        reason,
        metadata
      ) VALUES ($1, $2, $3, $4, $5, $6);`,
      [
        complaint.id,
        previousStatus,
        newComplaintStatus,
        'routing_engine',
        reason,
        JSON.stringify({ activeVersionAtRouting: activeVersion.version_code, authority: matchedData?.authority_name || null })
      ]
    );

    // 8. Initialize Stage 7 SLA tracking in PostgreSQL
    await initializeComplaintSla(complaint.id, client);

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  // Fetch full decision record for response
  const fullDecision = await getRoutingDecisionByComplaint(complaint.id);

  // 8. Emit Socket.IO events with safe metadata
  try {
    const io = getIO();
    const payload = {
      routingDecisionId: savedDecision.id,
      complaintId: complaint.id,
      complaintCode: complaint.complaint_code,
      category: complaint.category,
      routingStatus,
      routingMethod,
      authority: fullDecision?.authority?.name || null,
      department: fullDecision?.department?.name || null,
      jurisdiction: fullDecision?.jurisdiction?.name || null,
      jurisdictionVersion: activeVersion.version_code,
      reason,
      timestamp: new Date().toISOString()
    };

    if (routingStatus === 'ROUTED') {
      io.emit('routing:completed', payload);
    } else {
      io.to('privileged_operators').emit('routing:review_required', payload);
    }

    // Also emit complaint:status_changed for Stage 6 lifecycle tracking
    const newComplaintStatus = routingStatus === 'ROUTED' ? 'ROUTED' : 'HUMAN_REVIEW';
    io.emit('complaint:status_changed', {
      complaintId: complaint.id,
      complaintCode: complaint.complaint_code,
      previousStatus: complaint.status,
      newStatus: newComplaintStatus,
      reason,
      changedBy: 'routing_engine',
      changedAt: new Date().toISOString()
    });
  } catch (socketErr) {
    console.warn('[Socket.IO] Routing broadcast warning:', socketErr.message);
  }

  // Stage 8: Persist citizen notification in PostgreSQL
  try {
    const { createNotification } = require('./notificationService');
    if (routingStatus === 'ROUTED') {
      const authName = fullDecision?.authority?.name || 'Assigned Civic Authority';
      const deptName = fullDecision?.department?.name || 'Department';
      await createNotification({
        complaintId: complaint.id,
        notificationType: 'ROUTING_COMPLETED',
        title: 'Routing Completed',
        message: `Your complaint has been routed to ${authName} (${deptName}).`,
        metadata: {
          routingDecisionId: savedDecision.id,
          authority: fullDecision?.authority?.name || null,
          department: fullDecision?.department?.name || null,
          jurisdiction: fullDecision?.jurisdiction?.name || null,
          jurisdictionVersion: activeVersion.version_code
        },
        idempotencyKey: `ROUTING_COMPLETED:${complaint.id}`
      });
    } else {
      await createNotification({
        complaintId: complaint.id,
        notificationType: 'HUMAN_REVIEW_REQUIRED',
        title: 'Human Review Required',
        message: 'Your complaint requires review by an officer to determine jurisdiction and department assignment.',
        metadata: {
          routingDecisionId: savedDecision.id,
          reason
        },
        idempotencyKey: `HUMAN_REVIEW_REQUIRED:${complaint.id}`
      });
    }
  } catch (notifErr) {
    console.warn('[Stage 8 Notification] Routing notification warning:', notifErr.message);
  }

  // Stage 9: Automatically create an OPEN review case in complaint_reviews if HUMAN_REVIEW
  if (routingStatus === 'HUMAN_REVIEW') {
    try {
      const { createReviewCase } = require('./reviewService');
      await createReviewCase(complaint.id, reason, 'system_routing_engine');
    } catch (revErr) {
      console.warn('[Stage 9 Review Case] Warning creating review case:', revErr.message);
    }
  }

  return {
    alreadyRouted: false,
    decision: fullDecision
  };
};

/**
 * Formats flat database join row into clean nested JSON structure.
 */
function formatRoutingDecision(row, complaint = null) {
  if (!row) return null;
  return {
    id: row.id,
    complaintId: row.complaint_id,
    complaintCode: complaint ? complaint.complaint_code : row.complaint_code,
    category: complaint ? complaint.category : row.category,
    routingStatus: row.routing_status,
    routingMethod: row.routing_method,
    reason: row.reason,
    matchedAt: row.matched_at,
    createdAt: row.created_at,
    jurisdictionVersion: {
      id: row.version_id,
      code: row.version_code,
      number: row.version_number
    },
    jurisdiction: row.jurisdiction_id ? {
      id: row.jurisdiction_id,
      name: row.jurisdiction_name,
      code: row.jurisdiction_code
    } : null,
    authority: row.authority_id ? {
      id: row.authority_id,
      name: row.authority_name,
      code: row.authority_code
    } : null,
    department: row.department_id ? {
      id: row.department_id,
      name: row.department_name,
      code: row.department_code
    } : null
  };
}

/**
 * Gets persisted routing decision for a specific complaint.
 */
const getRoutingDecisionByComplaint = async (complaintIdOrCode) => {
  const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(complaintIdOrCode);
  const query = `
    SELECT 
      rd.id, rd.complaint_id, rd.routing_status, rd.routing_method, rd.reason, rd.matched_at,
      rd.created_at,
      c.complaint_code, c.category, c.latitude, c.longitude, c.status AS complaint_status,
      jv.id AS version_id, jv.version_code, jv.version_number,
      j.id AS jurisdiction_id, j.name AS jurisdiction_name, j.code AS jurisdiction_code,
      a.id AS authority_id, a.name AS authority_name, a.code AS authority_code,
      d.id AS department_id, d.name AS department_name, d.code AS department_code
    FROM routing_decisions rd
    JOIN complaints c ON rd.complaint_id = c.id
    JOIN jurisdiction_versions jv ON rd.jurisdiction_version_id = jv.id
    LEFT JOIN jurisdictions j ON rd.jurisdiction_id = j.id
    LEFT JOIN authorities a ON rd.authority_id = a.id
    LEFT JOIN departments d ON rd.department_id = d.id
    WHERE ${isUUID ? 'rd.complaint_id = $1 OR c.id = $1' : 'c.complaint_code = $1'};
  `;
  const res = await pool.query(query, [complaintIdOrCode]);
  if (res.rows.length === 0) return null;
  return formatRoutingDecision(res.rows[0]);
};

/**
 * Lists all routing decisions with pagination.
 */
const getRoutingDecisionsList = async (limit = 20, offset = 0) => {
  const query = `
    SELECT 
      rd.id, rd.complaint_id, rd.routing_status, rd.routing_method, rd.reason, rd.matched_at,
      rd.created_at,
      c.complaint_code, c.category, c.status AS complaint_status,
      jv.id AS version_id, jv.version_code, jv.version_number,
      j.id AS jurisdiction_id, j.name AS jurisdiction_name, j.code AS jurisdiction_code,
      a.id AS authority_id, a.name AS authority_name, a.code AS authority_code,
      d.id AS department_id, d.name AS department_name, d.code AS department_code
    FROM routing_decisions rd
    JOIN complaints c ON rd.complaint_id = c.id
    JOIN jurisdiction_versions jv ON rd.jurisdiction_version_id = jv.id
    LEFT JOIN jurisdictions j ON rd.jurisdiction_id = j.id
    LEFT JOIN authorities a ON rd.authority_id = a.id
    LEFT JOIN departments d ON rd.department_id = d.id
    ORDER BY rd.created_at DESC
    LIMIT $1 OFFSET $2;
  `;
  const countQuery = 'SELECT COUNT(*)::int AS total FROM routing_decisions;';

  const [res, countRes] = await Promise.all([
    pool.query(query, [Math.min(100, Math.max(1, parseInt(limit) || 20)), Math.max(0, parseInt(offset) || 0)]),
    pool.query(countQuery)
  ]);

  return {
    total: countRes.rows[0].total,
    decisions: res.rows.map(row => formatRoutingDecision(row))
  };
};

/**
 * Gets a single routing decision by ID.
 */
const getRoutingDecisionById = async (decisionId) => {
  const query = `
    SELECT 
      rd.id, rd.complaint_id, rd.routing_status, rd.routing_method, rd.reason, rd.matched_at,
      rd.created_at,
      c.complaint_code, c.category, c.status AS complaint_status,
      jv.id AS version_id, jv.version_code, jv.version_number,
      j.id AS jurisdiction_id, j.name AS jurisdiction_name, j.code AS jurisdiction_code,
      a.id AS authority_id, a.name AS authority_name, a.code AS authority_code,
      d.id AS department_id, d.name AS department_name, d.code AS department_code
    FROM routing_decisions rd
    JOIN complaints c ON rd.complaint_id = c.id
    JOIN jurisdiction_versions jv ON rd.jurisdiction_version_id = jv.id
    LEFT JOIN jurisdictions j ON rd.jurisdiction_id = j.id
    LEFT JOIN authorities a ON rd.authority_id = a.id
    LEFT JOIN departments d ON rd.department_id = d.id
    WHERE rd.id = $1;
  `;
  const res = await pool.query(query, [decisionId]);
  if (res.rows.length === 0) return null;
  return formatRoutingDecision(res.rows[0]);
};

module.exports = {
  routeComplaint,
  getRoutingDecisionByComplaint,
  getRoutingDecisionsList,
  getRoutingDecisionById
};
