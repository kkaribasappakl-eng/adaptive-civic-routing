const { pool } = require('../config/db');
const { getIO } = require('./socketService');

/**
 * Controlled Stage 6 Status Values
 */
const CONTROLLED_STATUSES = [
  'SUBMITTED',
  'TRIAGED',
  'ROUTED',
  'IN_PROGRESS',
  'RESOLVED',
  'CLOSED',
  'HUMAN_REVIEW'
];

/**
 * Deterministic State Machine Transition Matrix
 * Strictly enforces valid civic workflow and rejects arbitrary jumps.
 */
const ALLOWED_TRANSITIONS = {
  SUBMITTED: ['TRIAGED', 'ROUTED', 'HUMAN_REVIEW'],
  TRIAGED: ['ROUTED', 'HUMAN_REVIEW'],
  HUMAN_REVIEW: ['TRIAGED', 'ROUTED'],
  ROUTED: ['IN_PROGRESS'],
  IN_PROGRESS: ['RESOLVED'],
  RESOLVED: ['CLOSED'],
  CLOSED: [] // Terminal state
};

/**
 * Validates whether a transition between two statuses is permitted.
 */
const isValidTransition = (currentStatus, targetStatus) => {
  if (!CONTROLLED_STATUSES.includes(targetStatus)) {
    return false;
  }
  const allowed = ALLOWED_TRANSITIONS[currentStatus] || [];
  return allowed.includes(targetStatus);
};

/**
 * Atomically updates a complaint's status inside a PostgreSQL transaction:
 * 1. Locks the complaint row with FOR UPDATE
 * 2. Validates requested transition against ALLOWED_TRANSITIONS
 * 3. Updates complaints.status and updated_at
 * 4. Appends a new immutable row to complaint_status_history
 * 5. Commits the transaction (rolls back on any error)
 * 6. Broadcasts real-time Socket.IO event 'complaint:status_changed'
 */
const updateComplaintStatus = async (complaintId, targetStatus, reason = null, changedBy = 'system_operator', metadata = {}) => {
  const normalizedTarget = (targetStatus || '').trim().toUpperCase();

  if (!CONTROLLED_STATUSES.includes(normalizedTarget)) {
    const error = new Error(`Invalid status '${targetStatus}'. Allowed statuses: ${CONTROLLED_STATUSES.join(', ')}`);
    error.status = 400;
    throw error;
  }

  const client = await pool.connect();
  let updatedComplaint = null;
  let historyRecord = null;
  let previousStatus = null;

  try {
    await client.query('BEGIN');

    // 1. Fetch and lock target complaint
    const selectQuery = `
      SELECT id, complaint_code, status, description, category, latitude, longitude, photo_url, citizen_contact, created_at
      FROM complaints
      WHERE id = $1
      FOR UPDATE;
    `;
    const selRes = await client.query(selectQuery, [complaintId]);

    if (selRes.rows.length === 0) {
      const error = new Error(`Complaint '${complaintId}' not found.`);
      error.status = 404;
      throw error;
    }

    const complaint = selRes.rows[0];
    previousStatus = complaint.status;

    // 2. Validate state machine transition
    if (!isValidTransition(previousStatus, normalizedTarget)) {
      const allowed = ALLOWED_TRANSITIONS[previousStatus] || [];
      const allowedStr = allowed.length > 0 ? allowed.join(', ') : 'None (Terminal status)';
      const error = new Error(
        `Invalid status transition from '${previousStatus}' to '${normalizedTarget}'. Allowed next statuses: ${allowedStr}`
      );
      error.status = 400;
      throw error;
    }

    // 3. Update complaints table
    const updateQuery = `
      UPDATE complaints
      SET status = $1, updated_at = CURRENT_TIMESTAMP
      WHERE id = $2
      RETURNING id, complaint_code, status, updated_at;
    `;
    const upRes = await client.query(updateQuery, [normalizedTarget, complaintId]);
    updatedComplaint = upRes.rows[0];

    // 4. Append to complaint_status_history
    const historyQuery = `
      INSERT INTO complaint_status_history (
        complaint_id,
        previous_status,
        new_status,
        changed_by,
        reason,
        metadata
      ) VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id, complaint_id, previous_status, new_status, changed_by, reason, created_at;
    `;
    const histRes = await client.query(historyQuery, [
      complaintId,
      previousStatus,
      normalizedTarget,
      changedBy || 'system_operator',
      reason || `Status transitioned from ${previousStatus} to ${normalizedTarget}`,
      JSON.stringify(metadata || {})
    ]);
    historyRecord = histRes.rows[0];

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  // 5. Broadcast real-time Socket.IO event with safe metadata
  try {
    const io = getIO();
    io.emit('complaint:status_changed', {
      complaintId: updatedComplaint.id,
      complaintCode: updatedComplaint.complaint_code,
      previousStatus,
      newStatus: updatedComplaint.status,
      reason: historyRecord.reason,
      changedBy: historyRecord.changed_by,
      changedAt: historyRecord.created_at
    });
  } catch (socketErr) {
    console.warn('[Socket.IO] complaint:status_changed broadcast warning:', socketErr.message);
  }

  return {
    complaint: updatedComplaint,
    previousStatus,
    newStatus: updatedComplaint.status,
    historyRecord
  };
};

/**
 * Fetches the chronological status history for a complaint.
 */
const getComplaintStatusHistory = async (complaintId) => {
  const query = `
    SELECT 
      id,
      complaint_id,
      previous_status,
      new_status,
      changed_by,
      reason,
      metadata,
      created_at
    FROM complaint_status_history
    WHERE complaint_id = $1
    ORDER BY created_at ASC;
  `;
  const result = await pool.query(query, [complaintId]);
  return result.rows;
};

/**
 * Returns complete complaint lifecycle including:
 * - Complaint details
 * - Current status
 * - Routing decision, authority, department, jurisdiction, and version (if routed)
 * - Chronological status history array
 */
const getComplaintWithFullLifecycle = async (complaintIdOrCode) => {
  const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(complaintIdOrCode);

  // 1. Fetch complaint
  const complaintQuery = `
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
      status,
      routed_at,
      sla_warning_at,
      sla_target_at,
      sla_status,
      sla_breached_at,
      created_at,
      updated_at,
      ST_AsGeoJSON(location)::json AS geojson
    FROM complaints
    WHERE ${isUUID ? 'id = $1' : 'complaint_code = $1'};
  `;
  const cRes = await pool.query(complaintQuery, [complaintIdOrCode]);

  if (cRes.rows.length === 0) {
    return null;
  }

  const complaint = cRes.rows[0];

  // 2. Fetch routing decision if exists
  const routingQuery = `
    SELECT 
      rd.id AS routing_decision_id,
      rd.routing_status,
      rd.routing_method,
      rd.reason AS routing_reason,
      rd.matched_at AS routed_at,
      a.id AS authority_id,
      a.name AS authority_name,
      a.code AS authority_code,
      d.id AS department_id,
      d.name AS department_name,
      d.code AS department_code,
      j.id AS jurisdiction_id,
      j.name AS jurisdiction_name,
      j.code AS jurisdiction_code,
      jv.id AS jurisdiction_version_id,
      jv.version_code
    FROM routing_decisions rd
    LEFT JOIN authorities a ON rd.authority_id = a.id
    LEFT JOIN departments d ON rd.department_id = d.id
    LEFT JOIN jurisdictions j ON rd.jurisdiction_id = j.id
    LEFT JOIN jurisdiction_versions jv ON rd.jurisdiction_version_id = jv.id
    WHERE rd.complaint_id = $1
    ORDER BY rd.created_at DESC
    LIMIT 1;
  `;
  const rRes = await pool.query(routingQuery, [complaint.id]);
  const routing = rRes.rows.length > 0 ? rRes.rows[0] : null;

  // 3. Fetch status history
  const history = await getComplaintStatusHistory(complaint.id);

  return {
    ...complaint,
    routing,
    status_history: history
  };
};

module.exports = {
  CONTROLLED_STATUSES,
  ALLOWED_TRANSITIONS,
  isValidTransition,
  updateComplaintStatus,
  getComplaintStatusHistory,
  getComplaintWithFullLifecycle
};
