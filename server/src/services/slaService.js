const { pool } = require('../config/db');
const { getIO } = require('./socketService');

/**
 * Fetch all configured SLA rules from PostgreSQL
 */
const getSlaRules = async () => {
  const query = `
    SELECT id, category, target_hours, warning_hours, description, created_at, updated_at
    FROM complaint_sla_rules
    ORDER BY target_hours ASC, category ASC;
  `;
  const result = await pool.query(query);
  return result.rows;
};

/**
 * Fetch a specific SLA rule by complaint category (falls back to 'OTHER' if unmapped)
 */
const getSlaRule = async (category) => {
  const query = `
    SELECT id, category, target_hours, warning_hours, description, created_at, updated_at
    FROM complaint_sla_rules
    WHERE category = $1;
  `;
  const result = await pool.query(query, [(category || '').trim().toUpperCase()]);
  if (result.rows.length > 0) {
    return result.rows[0];
  }

  // Fallback to OTHER default benchmark
  const fallbackRes = await pool.query(query, ['OTHER']);
  return fallbackRes.rows[0] || {
    category: 'OTHER',
    target_hours: 96,
    warning_hours: 72,
    description: 'Default Fallback SLA'
  };
};

/**
 * Initialize SLA timestamps for a complaint upon deterministic routing.
 * Can execute within an existing PostgreSQL transaction client or using the connection pool.
 * Derives SLA targets strictly from real PostgreSQL timestamps.
 */
const initializeComplaintSla = async (complaintId, client = null, routingTimestamp = null) => {
  const db = client || pool;

  // 1. Fetch complaint category and current timestamps
  const compQuery = `
    SELECT id, complaint_code, category, status, routed_at, created_at
    FROM complaints
    WHERE id = $1;
  `;
  const compRes = await db.query(compQuery, [complaintId]);
  if (compRes.rows.length === 0) {
    throw new Error(`Complaint with ID '${complaintId}' not found.`);
  }
  const complaint = compRes.rows[0];

  // 2. Fetch category SLA rule
  const rule = await getSlaRule(complaint.category);

  // 3. Determine real PostgreSQL baseline routing timestamp
  // If routingTimestamp provided, use it; otherwise use complaint.routed_at or CURRENT_TIMESTAMP
  const updateQuery = `
    UPDATE complaints
    SET 
      routed_at = COALESCE(routed_at, $2, CURRENT_TIMESTAMP),
      sla_warning_at = COALESCE(routed_at, $2, CURRENT_TIMESTAMP) + ($3 * INTERVAL '1 hour'),
      sla_target_at = COALESCE(routed_at, $2, CURRENT_TIMESTAMP) + ($4 * INTERVAL '1 hour'),
      sla_status = 'WITHIN_SLA',
      sla_breached_at = NULL,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = $1
    RETURNING id, complaint_code, category, status, routed_at, sla_warning_at, sla_target_at, sla_status, sla_breached_at;
  `;

  const updatedRes = await db.query(updateQuery, [
    complaintId,
    routingTimestamp || null,
    rule.warning_hours,
    rule.target_hours
  ]);
  const updatedComplaint = updatedRes.rows[0];

  // 4. Record initial SLA_INITIALIZED event in append-only log
  const eventQuery = `
    INSERT INTO complaint_sla_events (
      complaint_id,
      previous_sla_status,
      new_sla_status,
      event_type,
      reason,
      metadata,
      created_at
    ) VALUES ($1, $2, $3, $4, $5, $6, COALESCE($7, CURRENT_TIMESTAMP))
    RETURNING id, event_type, new_sla_status, reason, created_at;
  `;

  const reason = `SLA initialized under category benchmark '${rule.category}': ${rule.warning_hours}h warning threshold, ${rule.target_hours}h target resolution deadline.`;
  const metadata = {
    category: rule.category,
    warningHours: rule.warning_hours,
    targetHours: rule.target_hours,
    routedAt: updatedComplaint.routed_at
  };

  await db.query(eventQuery, [
    complaintId,
    null,
    'WITHIN_SLA',
    'SLA_INITIALIZED',
    reason,
    JSON.stringify(metadata),
    updatedComplaint.routed_at
  ]);

  return {
    success: true,
    complaint: updatedComplaint,
    rule
  };
};

/**
 * Pure helper to compute SLA status given timestamps.
 * Respects CLOSED/RESOLVED protection.
 */
const calculateSlaStatus = (complaint, referenceTime = new Date()) => {
  if (!complaint.sla_target_at || !complaint.sla_warning_at) {
    return 'WITHIN_SLA';
  }

  // If complaint is resolved or closed:
  // If it was already breached before closure, maintain SLA_BREACHED.
  // If it was closed/resolved before breach, protect it from retroactive breach.
  const isResolvedOrClosed = ['RESOLVED', 'CLOSED'].includes(complaint.status);
  if (isResolvedOrClosed) {
    if (complaint.sla_status === 'SLA_BREACHED') {
      return 'SLA_BREACHED';
    }
    return complaint.sla_status || 'WITHIN_SLA';
  }

  const now = referenceTime instanceof Date ? referenceTime : new Date(referenceTime);
  const target = new Date(complaint.sla_target_at);
  const warning = new Date(complaint.sla_warning_at);

  if (now >= target) {
    return 'SLA_BREACHED';
  }
  if (now >= warning) {
    return 'AT_RISK';
  }
  return 'WITHIN_SLA';
};

/**
 * Evaluate SLA status against real PostgreSQL timestamps and persist any status transition.
 * Appends to complaint_sla_events and broadcasts Socket.IO events on transition.
 * 
 * Supports options.referenceTime for controlled verification testing without waiting real hours.
 */
const evaluateComplaintSla = async (complaintId, options = {}) => {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // 1. Lock complaint row FOR UPDATE
    const selectQuery = `
      SELECT id, complaint_code, category, status, routed_at, sla_warning_at, sla_target_at, sla_status, sla_breached_at
      FROM complaints
      WHERE id = $1
      FOR UPDATE;
    `;
    const selRes = await client.query(selectQuery, [complaintId]);
    if (selRes.rows.length === 0) {
      throw new Error(`Complaint with ID '${complaintId}' not found.`);
    }
    const complaint = selRes.rows[0];

    // If SLA not yet initialized (e.g. unrouted), initialize now
    if (!complaint.sla_target_at) {
      await client.query('COMMIT');
      client.release();
      const initResult = await initializeComplaintSla(complaintId);
      return evaluateComplaintSla(complaintId, options);
    }

    // 2. Determine effective current reference timestamp
    // Real DB timestamp CURRENT_TIMESTAMP is used by default; options.referenceTime allows controlled test advancement
    let nowDb;
    if (options.referenceTime) {
      nowDb = new Date(options.referenceTime);
    } else {
      const nowRes = await client.query('SELECT CURRENT_TIMESTAMP AS now;');
      nowDb = new Date(nowRes.rows[0].now);
    }

    // 3. Compute evaluated SLA status with closure protection
    const currentSlaStatus = complaint.sla_status || 'WITHIN_SLA';
    let newSlaStatus = currentSlaStatus;

    const isResolvedOrClosed = ['RESOLVED', 'CLOSED'].includes(complaint.status);
    if (!isResolvedOrClosed) {
      const targetTime = new Date(complaint.sla_target_at);
      const warningTime = new Date(complaint.sla_warning_at);

      if (nowDb >= targetTime) {
        newSlaStatus = 'SLA_BREACHED';
      } else if (nowDb >= warningTime) {
        newSlaStatus = 'AT_RISK';
      } else {
        newSlaStatus = 'WITHIN_SLA';
      }
    }

    let statusChanged = false;
    let eventRecord = null;

    // 4. If status changed, update PostgreSQL and append event
    if (newSlaStatus !== currentSlaStatus) {
      statusChanged = true;
      const breachedAtVal = newSlaStatus === 'SLA_BREACHED' && !complaint.sla_breached_at
        ? nowDb.toISOString()
        : complaint.sla_breached_at;

      const updateQuery = `
        UPDATE complaints
        SET 
          sla_status = $1,
          sla_breached_at = $2,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = $3
        RETURNING id, complaint_code, category, status, routed_at, sla_warning_at, sla_target_at, sla_status, sla_breached_at;
      `;
      const upRes = await client.query(updateQuery, [newSlaStatus, breachedAtVal, complaintId]);
      Object.assign(complaint, upRes.rows[0]);

      // Event classification
      const eventType = newSlaStatus === 'SLA_BREACHED' ? 'SLA_BREACHED' : 'SLA_WARNING';
      const reason = newSlaStatus === 'SLA_BREACHED'
        ? `Complaint resolution deadline breached (${nowDb.toISOString()} >= target ${new Date(complaint.sla_target_at).toISOString()}). Case escalated.`
        : `Complaint resolution time entered warning window (${nowDb.toISOString()} >= warning ${new Date(complaint.sla_warning_at).toISOString()}). At risk of SLA breach.`;

      const insertEventQuery = `
        INSERT INTO complaint_sla_events (
          complaint_id,
          previous_sla_status,
          new_sla_status,
          event_type,
          reason,
          metadata,
          created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING id, complaint_id, previous_sla_status, new_sla_status, event_type, reason, created_at;
      `;

      const evRes = await client.query(insertEventQuery, [
        complaintId,
        currentSlaStatus,
        newSlaStatus,
        eventType,
        reason,
        JSON.stringify({
          evaluatedAt: nowDb.toISOString(),
          warningAt: complaint.sla_warning_at,
          targetAt: complaint.sla_target_at,
          simulated: Boolean(options.referenceTime)
        }),
        nowDb.toISOString()
      ]);
      eventRecord = evRes.rows[0];

      // Real-time Socket.IO emission with safe metadata
      const io = getIO();
      if (io) {
        const payload = {
          complaintId: complaint.id,
          complaintCode: complaint.complaint_code,
          category: complaint.category,
          previousSlaStatus: currentSlaStatus,
          slaStatus: newSlaStatus,
          eventTimestamp: nowDb.toISOString(),
          warningAt: complaint.sla_warning_at,
          targetAt: complaint.sla_target_at,
          breachedAt: complaint.sla_breached_at
        };

        if (newSlaStatus === 'SLA_BREACHED') {
          io.emit('sla:breached', payload);
        } else if (newSlaStatus === 'AT_RISK') {
          io.emit('sla:warning', payload);
        }
      }
    }

    await client.query('COMMIT');

    // Stage 8: Persist SLA citizen notification in PostgreSQL
    if (statusChanged) {
      try {
        const { createNotification } = require('./notificationService');
        if (newSlaStatus === 'AT_RISK') {
          await createNotification({
            complaintId: complaint.id,
            notificationType: 'SLA_WARNING',
            title: 'SLA Warning: Case At Risk',
            message: `Resolution time for complaint ${complaint.complaint_code} (${complaint.category}) has entered its warning threshold.`,
            metadata: {
              category: complaint.category,
              warningAt: complaint.sla_warning_at,
              targetAt: complaint.sla_target_at
            },
            idempotencyKey: `SLA_WARNING:${complaint.id}`
          });
        } else if (newSlaStatus === 'SLA_BREACHED') {
          await createNotification({
            complaintId: complaint.id,
            notificationType: 'SLA_BREACHED',
            title: 'SLA Breached: Case Escalated',
            message: `Resolution deadline for complaint ${complaint.complaint_code} (${complaint.category}) was exceeded. Case escalated.`,
            metadata: {
              category: complaint.category,
              breachedAt: complaint.sla_breached_at,
              targetAt: complaint.sla_target_at
            },
            idempotencyKey: `SLA_BREACHED:${complaint.id}`
          });
        }
      } catch (notifErr) {
        console.warn('[Stage 8 Notification] SLA notification warning:', notifErr.message);
      }
    }

    return {
      success: true,
      complaintId: complaint.id,
      complaintCode: complaint.complaint_code,
      category: complaint.category,
      status: complaint.status,
      previousSlaStatus: currentSlaStatus,
      slaStatus: newSlaStatus,
      statusChanged,
      slaWarningAt: complaint.sla_warning_at,
      slaTargetAt: complaint.sla_target_at,
      slaBreachedAt: complaint.sla_breached_at,
      event: eventRecord,
      evaluatedAt: nowDb.toISOString()
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

/**
 * Fetch complete SLA details and chronological event logs for a specific complaint
 */
const getComplaintSlaDetails = async (complaintId) => {
  const compQuery = `
    SELECT 
      c.id,
      c.complaint_code,
      c.category,
      c.status,
      c.routed_at,
      c.sla_warning_at,
      c.sla_target_at,
      c.sla_status,
      c.sla_breached_at,
      r.target_hours,
      r.warning_hours,
      r.description AS sla_policy_description
    FROM complaints c
    LEFT JOIN complaint_sla_rules r ON c.category = r.category
    WHERE c.id = $1;
  `;
  const compRes = await pool.query(compQuery, [complaintId]);
  if (compRes.rows.length === 0) {
    return null;
  }
  const c = compRes.rows[0];

  // Fetch chronological SLA events
  const eventsQuery = `
    SELECT id, complaint_id, previous_sla_status, new_sla_status, event_type, reason, metadata, created_at
    FROM complaint_sla_events
    WHERE complaint_id = $1
    ORDER BY created_at ASC;
  `;
  const eventsRes = await pool.query(eventsQuery, [complaintId]);

  // Compute remaining time / breach duration
  const now = new Date();
  let remainingHours = null;
  let remainingMinutes = null;
  let isOverdue = false;
  let overdueHours = null;

  if (c.sla_target_at) {
    const target = new Date(c.sla_target_at);
    const diffMs = target.getTime() - now.getTime();
    if (diffMs > 0) {
      remainingHours = Math.floor(diffMs / (1000 * 60 * 60));
      remainingMinutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
    } else {
      isOverdue = true;
      const overdueMs = Math.abs(diffMs);
      overdueHours = (overdueMs / (1000 * 60 * 60)).toFixed(1);
    }
  }

  return {
    complaintId: c.id,
    complaintCode: c.complaint_code,
    category: c.category,
    complaintStatus: c.status,
    slaStatus: c.sla_status || 'WITHIN_SLA',
    routedAt: c.routed_at,
    slaWarningAt: c.sla_warning_at,
    slaTargetAt: c.sla_target_at,
    slaBreachedAt: c.sla_breached_at,
    targetHours: c.target_hours,
    warningHours: c.warning_hours,
    slaPolicyDescription: c.sla_policy_description,
    remainingHours,
    remainingMinutes,
    isOverdue,
    overdueHours,
    isClosed: ['RESOLVED', 'CLOSED'].includes(c.status),
    events: eventsRes.rows
  };
};

/**
 * Fetch aggregate SLA overview statistics for the municipal dashboard
 */
const getSlaOverview = async () => {
  const statsQuery = `
    SELECT 
      COUNT(*) FILTER (WHERE routed_at IS NOT NULL) AS total_tracked,
      COUNT(*) FILTER (WHERE sla_status = 'WITHIN_SLA' AND routed_at IS NOT NULL) AS within_sla,
      COUNT(*) FILTER (WHERE sla_status = 'AT_RISK' AND routed_at IS NOT NULL) AS at_risk,
      COUNT(*) FILTER (WHERE sla_status = 'SLA_BREACHED' AND routed_at IS NOT NULL) AS breached,
      COUNT(*) FILTER (WHERE status = 'RESOLVED') AS resolved_cases,
      COUNT(*) FILTER (WHERE status = 'CLOSED') AS closed_cases
    FROM complaints;
  `;
  const res = await pool.query(statsQuery);
  const s = res.rows[0];

  const totalTracked = parseInt(s.total_tracked, 10) || 0;
  const withinSla = parseInt(s.within_sla, 10) || 0;
  const atRisk = parseInt(s.at_risk, 10) || 0;
  const breached = parseInt(s.breached, 10) || 0;
  const complianceRate = totalTracked > 0
    ? (((withinSla + atRisk) / totalTracked) * 100).toFixed(1)
    : '100.0';

  // Category breakdown
  const catQuery = `
    SELECT 
      c.category,
      r.target_hours,
      r.warning_hours,
      COUNT(*) AS total,
      COUNT(*) FILTER (WHERE c.sla_status = 'WITHIN_SLA') AS within_sla,
      COUNT(*) FILTER (WHERE c.sla_status = 'AT_RISK') AS at_risk,
      COUNT(*) FILTER (WHERE c.sla_status = 'SLA_BREACHED') AS breached
    FROM complaints c
    JOIN complaint_sla_rules r ON c.category = r.category
    WHERE c.routed_at IS NOT NULL
    GROUP BY c.category, r.target_hours, r.warning_hours
    ORDER BY total DESC;
  `;
  const catRes = await pool.query(catQuery);

  return {
    totalTracked,
    withinSla,
    atRisk,
    breached,
    complianceRate: parseFloat(complianceRate),
    categoryBreakdown: catRes.rows
  };
};

module.exports = {
  getSlaRules,
  getSlaRule,
  initializeComplaintSla,
  calculateSlaStatus,
  evaluateComplaintSla,
  getComplaintSlaDetails,
  getSlaOverview
};
