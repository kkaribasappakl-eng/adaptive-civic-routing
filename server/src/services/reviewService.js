const { pool } = require('../config/db');
const { getIO } = require('./socketService');
const { updateComplaintStatus } = require('./caseStatusService');
const { initializeComplaintSla } = require('./slaService');

const isUUID = (str) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);

const CONTROLLED_REVIEW_STATUSES = ['OPEN', 'IN_REVIEW', 'RESOLVED', 'REJECTED'];
const CONTROLLED_ACTION_TYPES = [
  'REVIEW_STARTED',
  'ROUTE_TO_AUTHORITY',
  'RETURN_TO_TRIAGE',
  'MARK_UNROUTABLE',
  'CLOSE_REVIEW'
];

/**
 * Creates an OPEN review case in complaint_reviews if no active review exists for the complaint.
 * Idempotent: prevents duplicate active reviews.
 */
const createReviewCase = async (complaintId, reason, reviewerName = null, client = null) => {
  const db = client || pool;

  if (!complaintId) {
    throw new Error('complaintId is required to create a review case.');
  }

  // 1. Verify complaint exists
  const compRes = await db.query(
    'SELECT id, complaint_code, status, category, latitude, longitude FROM complaints WHERE id = $1;',
    [complaintId]
  );
  if (compRes.rows.length === 0) {
    throw new Error(`Complaint '${complaintId}' not found.`);
  }
  const complaint = compRes.rows[0];

  // 2. Check for existing active review (OPEN or IN_REVIEW)
  const existingActive = await db.query(
    `SELECT id, complaint_id, review_status, reason, reviewer_name, created_at 
     FROM complaint_reviews 
     WHERE complaint_id = $1 AND review_status IN ('OPEN', 'IN_REVIEW')
     LIMIT 1;`,
    [complaintId]
  );

  if (existingActive.rows.length > 0) {
    return {
      created: false,
      duplicate: true,
      review: existingActive.rows[0]
    };
  }

  // 3. Insert new review case
  const insertQuery = `
    INSERT INTO complaint_reviews (
      complaint_id,
      review_status,
      reason,
      reviewer_name,
      created_at,
      updated_at
    ) VALUES ($1, 'OPEN', $2, $3, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    RETURNING id, complaint_id, review_status, reason, reviewer_name, created_at, updated_at;
  `;

  const result = await db.query(insertQuery, [
    complaintId,
    reason || 'Requires manual evaluation by civic operator.',
    reviewerName || null
  ]);
  const newReview = result.rows[0];

  // 4. Emit Socket.IO event with safe metadata
  try {
    const io = getIO();
    if (io) {
      io.to('privileged_operators').emit('review:created', {
        reviewId: newReview.id,
        complaintId: complaint.id,
        complaintCode: complaint.complaint_code,
        reviewStatus: newReview.review_status,
        reason: newReview.reason,
        createdAt: newReview.created_at
      });
    }
  } catch (socketErr) {
    console.warn('[Socket.IO] review:created broadcast warning:', socketErr.message);
  }

  return {
    created: true,
    duplicate: false,
    review: newReview
  };
};

/**
 * Retrieves a single review case with all associated complaint details,
 * routing decisions, SLA information, status history, and review actions.
 */
const getReviewCase = async (reviewId) => {
  if (!isUUID(reviewId)) {
    const error = new Error(`Invalid reviewId '${reviewId}'. Must be a valid UUID.`);
    error.status = 400;
    throw error;
  }

  const query = `
    SELECT 
      cr.id AS review_id,
      cr.complaint_id,
      cr.review_status,
      cr.reason AS review_reason,
      cr.reviewer_name,
      cr.reviewer_note,
      cr.selected_authority_id,
      cr.selected_department_id,
      cr.selected_jurisdiction_version_id,
      cr.created_at AS review_created_at,
      cr.updated_at AS review_updated_at,
      cr.resolved_at AS review_resolved_at,
      c.complaint_code,
      c.description,
      c.category,
      c.category_source,
      c.category_confidence,
      c.photo_url,
      c.latitude,
      c.longitude,
      c.citizen_contact,
      c.status AS complaint_status,
      c.routed_at,
      c.sla_warning_at,
      c.sla_target_at,
      c.sla_status,
      c.sla_breached_at,
      c.created_at AS complaint_created_at,
      ST_AsGeoJSON(c.location)::json AS geojson,
      rd.id AS routing_decision_id,
      rd.routing_status,
      rd.routing_method,
      rd.reason AS routing_reason,
      rd.matched_at AS routing_matched_at,
      rd.metadata AS routing_metadata,
      jv.version_code AS active_version_code,
      a.name AS authority_name,
      a.code AS authority_code,
      d.name AS department_name,
      d.code AS department_code,
      j.name AS jurisdiction_name,
      j.code AS jurisdiction_code
    FROM complaint_reviews cr
    JOIN complaints c ON cr.complaint_id = c.id
    LEFT JOIN routing_decisions rd ON c.id = rd.complaint_id
    LEFT JOIN jurisdiction_versions jv ON rd.jurisdiction_version_id = jv.id
    LEFT JOIN authorities a ON COALESCE(cr.selected_authority_id, rd.authority_id) = a.id
    LEFT JOIN departments d ON COALESCE(cr.selected_department_id, rd.department_id) = d.id
    LEFT JOIN jurisdictions j ON rd.jurisdiction_id = j.id
    WHERE cr.id = $1;
  `;

  const res = await pool.query(query, [reviewId]);
  if (res.rows.length === 0) {
    const error = new Error(`Review case '${reviewId}' not found.`);
    error.status = 404;
    throw error;
  }

  const r = res.rows[0];

  // Fetch append-only review actions
  const actionsQuery = `
    SELECT 
      ra.id,
      ra.review_id,
      ra.complaint_id,
      ra.action_type,
      ra.actor_name,
      ra.previous_routing_status,
      ra.new_routing_status,
      ra.previous_complaint_status,
      ra.new_complaint_status,
      ra.authority_id,
      ra.department_id,
      ra.jurisdiction_version_id,
      ra.note,
      ra.metadata,
      ra.created_at,
      a.name AS authority_name,
      d.name AS department_name
    FROM complaint_review_actions ra
    LEFT JOIN authorities a ON ra.authority_id = a.id
    LEFT JOIN departments d ON ra.department_id = d.id
    WHERE ra.review_id = $1
    ORDER BY ra.created_at ASC;
  `;
  const actionsRes = await pool.query(actionsQuery, [reviewId]);

  // Fetch status history
  const statusHistQuery = `
    SELECT id, previous_status, new_status, changed_by, reason, created_at
    FROM complaint_status_history
    WHERE complaint_id = $1
    ORDER BY created_at ASC;
  `;
  const statusHistRes = await pool.query(statusHistQuery, [r.complaint_id]);

  // Fetch notifications
  const notifsQuery = `
    SELECT id, notification_type, title, message, is_read, created_at
    FROM citizen_notifications
    WHERE complaint_id = $1
    ORDER BY created_at DESC;
  `;
  const notifsRes = await pool.query(notifsQuery, [r.complaint_id]);

  return {
    review: {
      id: r.review_id,
      complaint_id: r.complaint_id,
      status: r.review_status,
      reason: r.review_reason,
      reviewer_name: r.reviewer_name,
      reviewer_note: r.reviewer_note,
      selected_authority_id: r.selected_authority_id,
      selected_department_id: r.selected_department_id,
      created_at: r.review_created_at,
      updated_at: r.review_updated_at,
      resolved_at: r.review_resolved_at
    },
    complaint: {
      id: r.complaint_id,
      complaint_code: r.complaint_code,
      description: r.description,
      category: r.category,
      category_source: r.category_source,
      category_confidence: r.category_confidence,
      photo_url: r.photo_url,
      latitude: parseFloat(r.latitude),
      longitude: parseFloat(r.longitude),
      citizen_contact: r.citizen_contact,
      status: r.complaint_status,
      created_at: r.complaint_created_at,
      geojson: r.geojson
    },
    routing: {
      id: r.routing_decision_id,
      routing_status: r.routing_status,
      routing_method: r.routing_method,
      reason: r.routing_reason,
      matched_at: r.routing_matched_at,
      metadata: r.routing_metadata,
      authority: r.authority_name ? { id: r.selected_authority_id, name: r.authority_name, code: r.authority_code } : null,
      department: r.department_name ? { id: r.selected_department_id, name: r.department_name, code: r.department_code } : null,
      jurisdiction: r.jurisdiction_name ? { name: r.jurisdiction_name, code: r.jurisdiction_code } : null,
      version_code: r.active_version_code
    },
    sla: {
      status: r.sla_status,
      routed_at: r.routed_at,
      warning_at: r.sla_warning_at,
      target_at: r.sla_target_at,
      breached_at: r.sla_breached_at
    },
    actions: actionsRes.rows,
    statusHistory: statusHistRes.rows,
    notifications: notifsRes.rows
  };
};

/**
 * Lists review cases with filters, pagination, and real counts per status.
 */
const listReviewCases = async (filters = {}) => {
  const { status, limit = 50, offset = 0, search } = filters;
  const lim = Math.min(100, Math.max(1, parseInt(limit) || 50));
  const off = Math.max(0, parseInt(offset) || 0);

  let query = `
    SELECT 
      cr.id AS review_id,
      cr.complaint_id,
      cr.review_status,
      cr.reason AS review_reason,
      cr.reviewer_name,
      cr.reviewer_note,
      cr.created_at AS review_created_at,
      cr.updated_at AS review_updated_at,
      cr.resolved_at AS review_resolved_at,
      c.complaint_code,
      c.description,
      c.category,
      c.category_source,
      c.status AS complaint_status,
      c.photo_url,
      c.latitude,
      c.longitude,
      c.sla_status,
      c.sla_warning_at,
      c.sla_target_at,
      rd.routing_status,
      rd.routing_method,
      rd.reason AS routing_reason,
      a.name AS authority_name,
      d.name AS department_name
    FROM complaint_reviews cr
    JOIN complaints c ON cr.complaint_id = c.id
    LEFT JOIN routing_decisions rd ON c.id = rd.complaint_id
    LEFT JOIN authorities a ON COALESCE(cr.selected_authority_id, rd.authority_id) = a.id
    LEFT JOIN departments d ON COALESCE(cr.selected_department_id, rd.department_id) = d.id
  `;

  const conditions = [];
  const params = [];

  if (status && status !== 'ALL') {
    const normStatus = status.trim().toUpperCase();
    if (CONTROLLED_REVIEW_STATUSES.includes(normStatus)) {
      params.push(normStatus);
      conditions.push(`cr.review_status = $${params.length}`);
    }
  }

  if (search && search.trim()) {
    params.push(`%${search.trim()}%`);
    conditions.push(`(c.complaint_code ILIKE $${params.length} OR c.description ILIKE $${params.length})`);
  }

  if (conditions.length > 0) {
    query += ` WHERE ${conditions.join(' AND ')}`;
  }

  query += ` ORDER BY cr.created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2};`;
  params.push(lim, off);

  // Status counts query
  const countsQuery = `
    SELECT 
      COUNT(*)::int AS total,
      COUNT(CASE WHEN review_status = 'OPEN' THEN 1 END)::int AS open_count,
      COUNT(CASE WHEN review_status = 'IN_REVIEW' THEN 1 END)::int AS in_review_count,
      COUNT(CASE WHEN review_status = 'RESOLVED' THEN 1 END)::int AS resolved_count,
      COUNT(CASE WHEN review_status = 'REJECTED' THEN 1 END)::int AS rejected_count
    FROM complaint_reviews;
  `;

  const [res, countsRes] = await Promise.all([
    pool.query(query, params),
    pool.query(countsQuery)
  ]);

  const counts = countsRes.rows[0];

  return {
    total: res.rows.length,
    counts: {
      all: counts.total,
      open: counts.open_count,
      inReview: counts.in_review_count,
      resolved: counts.resolved_count,
      rejected: counts.rejected_count
    },
    reviews: res.rows
  };
};

/**
 * Transitions review case from OPEN to IN_REVIEW.
 * Requires reviewerName.
 * Thread-safe: uses FOR UPDATE row locking.
 */
const startReview = async (reviewId, reviewerName, note = null) => {
  if (!reviewerName || !reviewerName.trim()) {
    const error = new Error('Reviewer name is required to start review.');
    error.status = 400;
    throw error;
  }

  if (!isUUID(reviewId)) {
    const error = new Error(`Invalid reviewId '${reviewId}'.`);
    error.status = 400;
    throw error;
  }

  const client = await pool.connect();
  let updatedReview = null;
  let actionRecord = null;

  try {
    await client.query('BEGIN');

    // 1. Lock review row
    const selRes = await client.query(
      `SELECT cr.id, cr.complaint_id, cr.review_status, cr.reviewer_name,
              c.complaint_code, c.status AS complaint_status,
              rd.routing_status
       FROM complaint_reviews cr
       JOIN complaints c ON cr.complaint_id = c.id
       LEFT JOIN routing_decisions rd ON c.id = rd.complaint_id
       WHERE cr.id = $1
       FOR UPDATE OF cr;`,
      [reviewId]
    );

    if (selRes.rows.length === 0) {
      const error = new Error(`Review case '${reviewId}' not found.`);
      error.status = 404;
      throw error;
    }

    const review = selRes.rows[0];

    // Cannot start if already resolved or rejected
    if (['RESOLVED', 'REJECTED'].includes(review.review_status)) {
      const error = new Error(`Cannot start review: Case is already in terminal state '${review.review_status}'.`);
      error.status = 400;
      throw error;
    }

    // 2. Update complaint_reviews
    const upRes = await client.query(
      `UPDATE complaint_reviews
       SET review_status = 'IN_REVIEW',
           reviewer_name = $1,
           reviewer_note = COALESCE($2, reviewer_note),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $3
       RETURNING id, complaint_id, review_status, reviewer_name, reviewer_note, updated_at;`,
      [reviewerName.trim(), note ? note.trim() : null, reviewId]
    );
    updatedReview = upRes.rows[0];

    // 3. Append to complaint_review_actions
    const actRes = await client.query(
      `INSERT INTO complaint_review_actions (
         review_id,
         complaint_id,
         action_type,
         actor_name,
         previous_routing_status,
         new_routing_status,
         previous_complaint_status,
         new_complaint_status,
         note,
         metadata
       ) VALUES ($1, $2, 'REVIEW_STARTED', $3, $4, $4, $5, $5, $6, $7)
       RETURNING id, action_type, actor_name, created_at;`,
      [
        reviewId,
        review.complaint_id,
        reviewerName.trim(),
        review.routing_status || 'HUMAN_REVIEW',
        review.complaint_status,
        note ? note.trim() : `Review investigation started by operator ${reviewerName.trim()}`,
        JSON.stringify({ startedAt: new Date().toISOString() })
      ]
    );
    actionRecord = actRes.rows[0];

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  // Socket.IO notification
  try {
    const io = getIO();
    if (io) {
      io.to('privileged_operators').emit('review:updated', {
        reviewId: updatedReview.id,
        complaintId: updatedReview.complaint_id,
        reviewStatus: 'IN_REVIEW',
        reviewerName: updatedReview.reviewer_name
      });
    }
  } catch (socketErr) {
    console.warn('[Socket.IO] review:updated broadcast warning:', socketErr.message);
  }

  return {
    review: updatedReview,
    action: actionRecord
  };
};

/**
 * Resolves a human review case with explicit documented decision:
 * Supports:
 * - ROUTE_TO_AUTHORITY: Assigns real authority & department, preserves original attempt in metadata, transitions status to ROUTED
 * - RETURN_TO_TRIAGE: Transitions complaint status to TRIAGED
 * - CLOSE_REVIEW: Closes review without changing routing
 */
const resolveReview = async (reviewId, { actionType, authorityId, departmentId, reviewerName, note }) => {
  if (!reviewerName || !reviewerName.trim()) {
    const error = new Error('Reviewer name is required to resolve a review.');
    error.status = 400;
    throw error;
  }

  const normalizedAction = (actionType || '').trim().toUpperCase();
  if (!['ROUTE_TO_AUTHORITY', 'RETURN_TO_TRIAGE', 'CLOSE_REVIEW'].includes(normalizedAction)) {
    const error = new Error(`Invalid actionType '${actionType}'. Allowed: ROUTE_TO_AUTHORITY, RETURN_TO_TRIAGE, CLOSE_REVIEW`);
    error.status = 400;
    throw error;
  }

  if (!isUUID(reviewId)) {
    const error = new Error(`Invalid reviewId '${reviewId}'.`);
    error.status = 400;
    throw error;
  }

  // If ROUTE_TO_AUTHORITY, validate that authorityId and departmentId are real rows in PostgreSQL
  let verifiedAuthority = null;
  let verifiedDepartment = null;

  if (normalizedAction === 'ROUTE_TO_AUTHORITY') {
    if (!authorityId || !isUUID(authorityId)) {
      const error = new Error('A valid authorityId (UUID) referencing a real authority in PostgreSQL is required.');
      error.status = 400;
      throw error;
    }
    if (!departmentId || !isUUID(departmentId)) {
      const error = new Error('A valid departmentId (UUID) referencing a real department in PostgreSQL is required.');
      error.status = 400;
      throw error;
    }

    const authRes = await pool.query('SELECT id, name, code FROM authorities WHERE id = $1;', [authorityId]);
    if (authRes.rows.length === 0) {
      const error = new Error(`Authority '${authorityId}' does not exist in PostgreSQL.`);
      error.status = 400;
      throw error;
    }
    verifiedAuthority = authRes.rows[0];

    const deptRes = await pool.query('SELECT id, name, code, authority_id FROM departments WHERE id = $1;', [departmentId]);
    if (deptRes.rows.length === 0) {
      const error = new Error(`Department '${departmentId}' does not exist in PostgreSQL.`);
      error.status = 400;
      throw error;
    }
    verifiedDepartment = deptRes.rows[0];
  }

  const client = await pool.connect();
  let updatedReview = null;
  let actionRecord = null;
  let updatedDecision = null;
  let updatedComplaint = null;

  try {
    await client.query('BEGIN');

    // 1. Lock review row FOR UPDATE (prevents concurrent operators from resolving simultaneously)
    const selRes = await client.query(
      `SELECT cr.id, cr.complaint_id, cr.review_status, cr.reason AS review_reason,
              c.id AS comp_id, c.complaint_code, c.status AS complaint_status, c.category,
              rd.id AS rd_id, rd.routing_status, rd.routing_method, rd.reason AS rd_reason,
              rd.matched_at AS rd_matched_at, rd.jurisdiction_version_id, rd.metadata AS rd_metadata
       FROM complaint_reviews cr
       JOIN complaints c ON cr.complaint_id = c.id
       LEFT JOIN routing_decisions rd ON c.id = rd.complaint_id
       WHERE cr.id = $1
       FOR UPDATE OF cr;`,
      [reviewId]
    );

    if (selRes.rows.length === 0) {
      const error = new Error(`Review case '${reviewId}' not found.`);
      error.status = 404;
      throw error;
    }

    const row = selRes.rows[0];

    // Concurrency protection: If already resolved or rejected, reject immediately
    if (['RESOLVED', 'REJECTED'].includes(row.review_status)) {
      const error = new Error(`Review case is already in terminal state '${row.review_status}'. Cannot resolve again.`);
      error.status = 400;
      throw error;
    }

    const prevRoutingStatus = row.routing_status || 'HUMAN_REVIEW';
    const prevComplaintStatus = row.complaint_status;
    let newRoutingStatus = prevRoutingStatus;
    let newComplaintStatus = prevComplaintStatus;

    // Fetch active version
    const verRes = await client.query("SELECT id, version_code FROM jurisdiction_versions WHERE status = 'ACTIVE' LIMIT 1;");
    const activeVersion = verRes.rows[0] || null;

    if (normalizedAction === 'ROUTE_TO_AUTHORITY') {
      newRoutingStatus = 'ROUTED';

      // 2. CRITICAL IMMUTABILITY SAFEGUARD:
      // Preserve the original automated attempt in metadata before recording human decision
      const originalMetadata = row.rd_metadata || {};
      const updatedMetadata = {
        ...originalMetadata,
        originalAttempt: originalMetadata.originalAttempt || {
          routingStatus: row.routing_status,
          routingMethod: row.routing_method,
          reason: row.rd_reason,
          matchedAt: row.rd_matched_at,
          jurisdictionVersionId: row.jurisdiction_version_id
        },
        humanResolution: {
          actionType: normalizedAction,
          resolvedBy: reviewerName.trim(),
          resolvedAt: new Date().toISOString(),
          note: note ? note.trim() : null,
          authority: verifiedAuthority.name,
          department: verifiedDepartment.name
        }
      };

      const humanReason = `Resolved by human review: Assigned to ${verifiedAuthority.name} (${verifiedDepartment.name}). Rationale: ${note ? note.trim() : 'Operator override'}`;

      if (row.rd_id) {
        const upRdRes = await client.query(
          `UPDATE routing_decisions
           SET authority_id = $1,
               department_id = $2,
               routing_status = 'ROUTED',
               routing_method = 'HUMAN_REVIEW',
               reason = $3,
               metadata = $4,
               updated_at = CURRENT_TIMESTAMP
           WHERE id = $5
           RETURNING id, complaint_id, routing_status, routing_method, reason, updated_at;`,
          [
            verifiedAuthority.id,
            verifiedDepartment.id,
            humanReason,
            JSON.stringify(updatedMetadata),
            row.rd_id
          ]
        );
        updatedDecision = upRdRes.rows[0];
      } else {
        const insRdRes = await client.query(
          `INSERT INTO routing_decisions (
             complaint_id,
             jurisdiction_version_id,
             authority_id,
             department_id,
             routing_status,
             routing_method,
             reason,
             matched_at,
             metadata
           ) VALUES ($1, $2, $3, $4, 'ROUTED', 'HUMAN_REVIEW', $5, CURRENT_TIMESTAMP, $6)
           RETURNING id, complaint_id, routing_status, routing_method, reason, created_at;`,
          [
            row.complaint_id,
            activeVersion.id,
            verifiedAuthority.id,
            verifiedDepartment.id,
            humanReason,
            JSON.stringify(updatedMetadata)
          ]
        );
        updatedDecision = insRdRes.rows[0];
      }

      // 3. Update complaint status to ROUTED via Stage 6 state machine
      // (If current status is HUMAN_REVIEW, transition to ROUTED)
      if (prevComplaintStatus === 'HUMAN_REVIEW') {
        newComplaintStatus = 'ROUTED';
        await client.query(
          'UPDATE complaints SET status = $1, routed_at = COALESCE(routed_at, CURRENT_TIMESTAMP), updated_at = CURRENT_TIMESTAMP WHERE id = $2;',
          ['ROUTED', row.complaint_id]
        );

        await client.query(
          `INSERT INTO complaint_status_history (
             complaint_id, previous_status, new_status, changed_by, reason, metadata
           ) VALUES ($1, $2, $3, $4, $5, $6);`,
          [
            row.complaint_id,
            prevComplaintStatus,
            'ROUTED',
            reviewerName.trim(),
            humanReason,
            JSON.stringify({ authority: verifiedAuthority.name, department: verifiedDepartment.name })
          ]
        );
      }

      // Initialize SLA if needed
      await initializeComplaintSla(row.complaint_id, client);

    } else if (normalizedAction === 'RETURN_TO_TRIAGE') {
      if (prevComplaintStatus === 'HUMAN_REVIEW') {
        newComplaintStatus = 'TRIAGED';
        await client.query(
          'UPDATE complaints SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2;',
          ['TRIAGED', row.complaint_id]
        );

        await client.query(
          `INSERT INTO complaint_status_history (
             complaint_id, previous_status, new_status, changed_by, reason, metadata
           ) VALUES ($1, $2, $3, $4, $5, $6);`,
          [
            row.complaint_id,
            prevComplaintStatus,
            'TRIAGED',
            reviewerName.trim(),
            note ? note.trim() : 'Returned to triage queue for reconsideration',
            JSON.stringify({ reviewer: reviewerName.trim() })
          ]
        );
      }
    }

    // 4. Update complaint_reviews
    const upRevRes = await client.query(
      `UPDATE complaint_reviews
       SET review_status = 'RESOLVED',
           reviewer_name = $1,
           selected_authority_id = $2,
           selected_department_id = $3,
           selected_jurisdiction_version_id = $4,
           reviewer_note = $5,
           updated_at = CURRENT_TIMESTAMP,
           resolved_at = CURRENT_TIMESTAMP
       WHERE id = $6
       RETURNING id, complaint_id, review_status, reviewer_name, reviewer_note, resolved_at;`,
      [
        reviewerName.trim(),
        verifiedAuthority ? verifiedAuthority.id : null,
        verifiedDepartment ? verifiedDepartment.id : null,
        activeVersion ? activeVersion.id : null,
        note ? note.trim() : null,
        reviewId
      ]
    );
    updatedReview = upRevRes.rows[0];

    // 5. Append to complaint_review_actions (Append-Only Audit Trail)
    const actRes = await client.query(
      `INSERT INTO complaint_review_actions (
         review_id,
         complaint_id,
         action_type,
         actor_name,
         previous_routing_status,
         new_routing_status,
         previous_complaint_status,
         new_complaint_status,
         authority_id,
         department_id,
         jurisdiction_version_id,
         note,
         metadata
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
       RETURNING id, action_type, actor_name, previous_routing_status, new_routing_status, created_at;`,
      [
        reviewId,
        row.complaint_id,
        normalizedAction,
        reviewerName.trim(),
        prevRoutingStatus,
        newRoutingStatus,
        prevComplaintStatus,
        newComplaintStatus,
        verifiedAuthority ? verifiedAuthority.id : null,
        verifiedDepartment ? verifiedDepartment.id : null,
        activeVersion ? activeVersion.id : null,
        note ? note.trim() : `Case resolved via ${normalizedAction} by operator ${reviewerName.trim()}`,
        JSON.stringify({
          actionType: normalizedAction,
          authority: verifiedAuthority?.name || null,
          department: verifiedDepartment?.name || null
        })
      ]
    );
    actionRecord = actRes.rows[0];

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  // Socket.IO emissions
  try {
    const io = getIO();
    if (io) {
      io.to('privileged_operators').emit('review:resolved', {
        reviewId: updatedReview.id,
        complaintId: updatedReview.complaint_id,
        actionType: normalizedAction,
        reviewerName: updatedReview.reviewer_name,
        authority: verifiedAuthority?.name || null,
        department: verifiedDepartment?.name || null
      });

      if (normalizedAction === 'ROUTE_TO_AUTHORITY') {
        io.emit('routing:completed', {
          complaintId: updatedReview.complaint_id,
          routingStatus: 'ROUTED',
          routingMethod: 'HUMAN_REVIEW',
          authority: verifiedAuthority?.name,
          department: verifiedDepartment?.name,
          resolvedBy: updatedReview.reviewer_name,
          timestamp: new Date().toISOString()
        });

        io.emit('complaint:status_changed', {
          complaintId: updatedReview.complaint_id,
          previousStatus: 'HUMAN_REVIEW',
          newStatus: 'ROUTED',
          changedBy: updatedReview.reviewer_name,
          changedAt: new Date().toISOString()
        });
      }
    }
  } catch (socketErr) {
    console.warn('[Socket.IO] review:resolved broadcast warning:', socketErr.message);
  }

  return {
    review: updatedReview,
    action: actionRecord,
    routingDecision: updatedDecision
  };
};

/**
 * Marks a review case and its routing decision as UNROUTABLE.
 * Requires reviewerName and reason.
 * Thread-safe: uses FOR UPDATE row locking.
 */
const markUnroutable = async (reviewId, reviewerName, reason) => {
  if (!reviewerName || !reviewerName.trim()) {
    const error = new Error('Reviewer name is required to mark a case unroutable.');
    error.status = 400;
    throw error;
  }

  if (!reason || !reason.trim()) {
    const error = new Error('A detailed reason is required to mark a case unroutable.');
    error.status = 400;
    throw error;
  }

  if (!isUUID(reviewId)) {
    const error = new Error(`Invalid reviewId '${reviewId}'.`);
    error.status = 400;
    throw error;
  }

  const client = await pool.connect();
  let updatedReview = null;
  let actionRecord = null;

  try {
    await client.query('BEGIN');

    // 1. Lock review row FOR UPDATE
    const selRes = await client.query(
      `SELECT cr.id, cr.complaint_id, cr.review_status,
              c.complaint_code, c.status AS complaint_status,
              rd.id AS rd_id, rd.routing_status, rd.routing_method, rd.reason AS rd_reason,
              rd.matched_at AS rd_matched_at, rd.jurisdiction_version_id, rd.metadata AS rd_metadata
       FROM complaint_reviews cr
       JOIN complaints c ON cr.complaint_id = c.id
       LEFT JOIN routing_decisions rd ON c.id = rd.complaint_id
       WHERE cr.id = $1
       FOR UPDATE OF cr;`,
      [reviewId]
    );

    if (selRes.rows.length === 0) {
      const error = new Error(`Review case '${reviewId}' not found.`);
      error.status = 404;
      throw error;
    }

    const row = selRes.rows[0];

    // Concurrency protection
    if (['RESOLVED', 'REJECTED'].includes(row.review_status)) {
      const error = new Error(`Review case is already in terminal state '${row.review_status}'. Cannot mark unroutable.`);
      error.status = 400;
      throw error;
    }

    const prevRoutingStatus = row.routing_status || 'HUMAN_REVIEW';
    const prevComplaintStatus = row.complaint_status;

    // 2. Update routing_decisions
    const originalMetadata = row.rd_metadata || {};
    const updatedMetadata = {
      ...originalMetadata,
      originalAttempt: originalMetadata.originalAttempt || {
        routingStatus: row.routing_status,
        routingMethod: row.routing_method,
        reason: row.rd_reason,
        matchedAt: row.rd_matched_at
      },
      unroutableDeclaration: {
        declaredBy: reviewerName.trim(),
        declaredAt: new Date().toISOString(),
        reason: reason.trim()
      }
    };

    const unroutableReason = `Marked UNROUTABLE by operator ${reviewerName.trim()}: ${reason.trim()}`;

    if (row.rd_id) {
      await client.query(
        `UPDATE routing_decisions
         SET routing_status = 'UNROUTABLE',
             routing_method = 'HUMAN_REVIEW',
             reason = $1,
             metadata = $2,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $3;`,
        [unroutableReason, JSON.stringify(updatedMetadata), row.rd_id]
      );
    }

    // 3. Update complaint_reviews
    const upRevRes = await client.query(
      `UPDATE complaint_reviews
       SET review_status = 'REJECTED',
           reviewer_name = $1,
           reviewer_note = $2,
           updated_at = CURRENT_TIMESTAMP,
           resolved_at = CURRENT_TIMESTAMP
       WHERE id = $3
       RETURNING id, complaint_id, review_status, reviewer_name, reviewer_note, resolved_at;`,
      [reviewerName.trim(), reason.trim(), reviewId]
    );
    updatedReview = upRevRes.rows[0];

    // 4. Append to complaint_review_actions (Append-Only Audit Trail)
    const actRes = await client.query(
      `INSERT INTO complaint_review_actions (
         review_id,
         complaint_id,
         action_type,
         actor_name,
         previous_routing_status,
         new_routing_status,
         previous_complaint_status,
         new_complaint_status,
         note,
         metadata
       ) VALUES ($1, $2, 'MARK_UNROUTABLE', $3, $4, 'UNROUTABLE', $5, $5, $6, $7)
       RETURNING id, action_type, actor_name, previous_routing_status, new_routing_status, created_at;`,
      [
        reviewId,
        row.complaint_id,
        reviewerName.trim(),
        prevRoutingStatus,
        prevComplaintStatus,
        reason.trim(),
        JSON.stringify({ unroutableReason: reason.trim() })
      ]
    );
    actionRecord = actRes.rows[0];

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  // Socket.IO notification
  try {
    const io = getIO();
    if (io) {
      io.to('privileged_operators').emit('review:unroutable', {
        reviewId: updatedReview.id,
        complaintId: updatedReview.complaint_id,
        reviewerName: updatedReview.reviewer_name,
        reason
      });
    }
  } catch (socketErr) {
    console.warn('[Socket.IO] review:unroutable broadcast warning:', socketErr.message);
  }

  return {
    review: updatedReview,
    action: actionRecord
  };
};

/**
 * Retrieves the append-only audit trail of actions for a specific review case.
 */
const getReviewActions = async (reviewId) => {
  if (!isUUID(reviewId)) {
    const error = new Error(`Invalid reviewId '${reviewId}'.`);
    error.status = 400;
    throw error;
  }

  const query = `
    SELECT 
      ra.id,
      ra.review_id,
      ra.complaint_id,
      ra.action_type,
      ra.actor_name,
      ra.previous_routing_status,
      ra.new_routing_status,
      ra.previous_complaint_status,
      ra.new_complaint_status,
      ra.authority_id,
      ra.department_id,
      ra.jurisdiction_version_id,
      ra.note,
      ra.metadata,
      ra.created_at,
      a.name AS authority_name,
      d.name AS department_name
    FROM complaint_review_actions ra
    LEFT JOIN authorities a ON ra.authority_id = a.id
    LEFT JOIN departments d ON ra.department_id = d.id
    WHERE ra.review_id = $1
    ORDER BY ra.created_at ASC;
  `;
  const res = await pool.query(query, [reviewId]);
  return res.rows;
};

/**
 * Fetches real active authorities and their linked active departments from PostgreSQL.
 */
const getAuthoritiesWithDepartments = async () => {
  const query = `
    SELECT 
      a.id AS authority_id,
      a.name AS authority_name,
      a.code AS authority_code,
      d.id AS department_id,
      d.name AS department_name,
      d.code AS department_code
    FROM authorities a
    JOIN departments d ON a.id = d.authority_id
    WHERE a.is_active = TRUE AND d.is_active = TRUE
    ORDER BY a.name ASC, d.name ASC;
  `;
  const res = await pool.query(query);
  const map = {};
  for (const row of res.rows) {
    if (!map[row.authority_id]) {
      map[row.authority_id] = {
        id: row.authority_id,
        name: row.authority_name,
        code: row.authority_code,
        departments: []
      };
    }
    map[row.authority_id].departments.push({
      id: row.department_id,
      name: row.department_name,
      code: row.department_code
    });
  }
  return Object.values(map);
};

module.exports = {
  CONTROLLED_REVIEW_STATUSES,
  CONTROLLED_ACTION_TYPES,
  createReviewCase,
  getReviewCase,
  listReviewCases,
  startReview,
  resolveReview,
  markUnroutable,
  getReviewActions,
  getAuthoritiesWithDepartments
};
