const { pool } = require('../config/db');

// Sensitive keys that must NEVER be persisted in audit metadata
const SENSITIVE_KEY_PATTERN = /(password|token|jwt|secret|cookie|authorization|credential|api_?key)/i;

/**
 * Recursively cleanses an object/array to remove any sensitive keys or values.
 */
const sanitizeAuditMetadata = (data, depth = 0) => {
  if (depth > 6) return '[MAX_DEPTH_EXCEEDED]';
  if (data === null || data === undefined) return null;

  if (typeof data !== 'object') {
    return data;
  }

  if (Array.isArray(data)) {
    return data.map(item => sanitizeAuditMetadata(item, depth + 1));
  }

  const clean = {};
  for (const [key, value] of Object.entries(data)) {
    if (SENSITIVE_KEY_PATTERN.test(key)) {
      clean[key] = '[REDACTED]';
    } else if (typeof value === 'object' && value !== null) {
      clean[key] = sanitizeAuditMetadata(value, depth + 1);
    } else if (typeof value === 'string') {
      // Check for JWT-like structure or Bearer strings
      if (value.startsWith('Bearer ') || (value.startsWith('ey') && value.split('.').length === 3)) {
        clean[key] = '[REDACTED_TOKEN]';
      } else {
        clean[key] = value;
      }
    } else {
      clean[key] = value;
    }
  }
  return clean;
};

/**
 * Extracts client IP safely from request
 */
const extractClientIp = (req) => {
  if (!req) return null;
  const forwarded = req.headers?.['x-forwarded-for'];
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }
  return req.ip || req.connection?.remoteAddress || null;
};

/**
 * Centralized Append-Only Audit Logging
 * 
 * Supports transactional coupling when 'client' is provided.
 * If client is provided and audit fails, it throws to trigger transaction rollback.
 * If client is not provided, audit errors are caught to avoid disrupting the primary operation.
 */
const logAuditEvent = async ({
  actorUserId = null,
  actorRole = null,
  action,
  entityType,
  entityId = null,
  result = 'SUCCESS',
  reason = null,
  metadata = {},
  request = null,
  client = null
}) => {
  if (!action || typeof action !== 'string') {
    throw new Error('Audit log action is required and must be a string.');
  }
  if (!entityType || typeof entityType !== 'string') {
    throw new Error('Audit log entityType is required and must be a string.');
  }

  // Derive actor information from request if not explicitly provided
  let effectiveUserId = actorUserId;
  let effectiveRole = actorRole;

  if (request?.user) {
    if (!effectiveUserId) effectiveUserId = request.user.id || null;
    if (!effectiveRole) effectiveRole = request.user.role || null;
  } else if (!effectiveRole) {
    effectiveRole = 'ANONYMOUS';
  }

  // Extract safe execution context
  const ipAddress = extractClientIp(request);
  const userAgent = request?.headers?.['user-agent'] ? request.headers['user-agent'].substring(0, 255) : null;

  // Sanitize metadata recursively
  const sanitizedMeta = sanitizeAuditMetadata(metadata || {});

  const insertQuery = `
    INSERT INTO audit_logs (
      actor_user_id,
      actor_role,
      action,
      entity_type,
      entity_id,
      result,
      reason,
      metadata,
      ip_address,
      user_agent,
      created_at
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, 
      $9::inet, $10, CURRENT_TIMESTAMP
    )
    RETURNING id, actor_user_id, actor_role, action, entity_type, entity_id, result, reason, metadata, ip_address, user_agent, created_at;
  `;

  const queryParams = [
    effectiveUserId,
    effectiveRole,
    action,
    entityType,
    entityId ? String(entityId) : null,
    result,
    reason,
    JSON.stringify(sanitizedMeta),
    ipAddress && ipAddress !== 'unknown' ? ipAddress : null,
    userAgent
  ];

  try {
    const executor = client || pool;
    const res = await executor.query(insertQuery, queryParams);
    return res.rows[0];
  } catch (err) {
    // If inside a transaction, MUST throw so the transaction rolls back
    if (client) {
      console.error('[Audit Service] Transactional audit insert failed:', err.message);
      throw err;
    }
    // For non-transactional logging, log warning without throwing
    console.warn('[Audit Service Warning] Non-blocking audit log failure:', err.message);
    return null;
  }
};

/**
 * Server-Side Role-Filtered Query for Audit Logs
 * 
 * ADMIN: Full visibility into all audit records (auth, security, governance, operational).
 * OPERATOR: Restricted strictly to operational entities (COMPLAINT, ROUTING_DECISION, REVIEW, JURISDICTION, SLA, NOTIFICATION).
 */
const queryAuditLogs = async (filters = {}, userRole = 'OPERATOR') => {
  const {
    actorUserId,
    actorRole,
    action,
    entityType,
    entityId,
    result,
    startDate,
    endDate,
    page = 1,
    limit = 20
  } = filters;

  const targetActorUserId = actorUserId || filters.actor_user_id;
  const targetActorRole = actorRole || filters.actor_role;
  const targetAction = action || filters.action;
  const targetEntityType = entityType || filters.entity_type;
  const targetEntityId = entityId || filters.entity_id;
  const targetResult = result || filters.result;
  const targetStartDate = startDate || filters.start_date;
  const targetEndDate = endDate || filters.end_date;

  const conditions = [];
  const params = [];
  let paramIndex = 1;

  // Enforce server-side role-based visibility
  if (userRole !== 'ADMIN') {
    // OPERATOR policy: only operational events, no auth/security events
    conditions.push(`entity_type IN ('COMPLAINT', 'ROUTING_DECISION', 'REVIEW', 'JURISDICTION', 'SLA', 'NOTIFICATION')`);
    conditions.push(`action NOT LIKE 'AUTH_%'`);
  }

  if (targetActorUserId) {
    conditions.push(`actor_user_id = $${paramIndex++}`);
    params.push(targetActorUserId);
  }

  if (targetActorRole) {
    conditions.push(`actor_role = $${paramIndex++}`);
    params.push(targetActorRole);
  }

  if (targetAction) {
    conditions.push(`action ILIKE $${paramIndex++}`);
    params.push(`%${targetAction}%`);
  }

  if (targetEntityType) {
    conditions.push(`entity_type = $${paramIndex++}`);
    params.push(targetEntityType);
  }

  if (targetEntityId) {
    conditions.push(`entity_id = $${paramIndex++}`);
    params.push(targetEntityId);
  }

  if (targetResult) {
    conditions.push(`result = $${paramIndex++}`);
    params.push(targetResult);
  }

  if (targetStartDate) {
    conditions.push(`created_at >= $${paramIndex++}`);
    params.push(targetStartDate);
  }

  if (targetEndDate) {
    conditions.push(`created_at <= $${paramIndex++}`);
    params.push(targetEndDate);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  // Get total count
  const countQuery = `SELECT COUNT(*)::int AS total FROM audit_logs ${whereClause};`;
  const countRes = await pool.query(countQuery, params);
  const total = countRes.rows[0].total;

  // Pagination with bounds
  const safeLimit = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 100);
  const offset = filters.offset !== undefined ? Math.max(parseInt(filters.offset, 10) || 0, 0) : Math.max((parseInt(page, 10) || 1) - 1, 0) * safeLimit;
  const safePage = Math.floor(offset / safeLimit) + 1;

  params.push(safeLimit);
  params.push(offset);

  const dataQuery = `
    SELECT 
      a.id,
      a.actor_user_id,
      u.full_name AS actor_name,
      u.email AS actor_email,
      a.actor_role,
      a.action,
      a.entity_type,
      a.entity_id,
      a.result,
      a.reason,
      a.metadata,
      a.ip_address,
      a.user_agent,
      a.created_at
    FROM audit_logs a
    LEFT JOIN users u ON a.actor_user_id = u.id
    ${whereClause}
    ORDER BY a.created_at DESC
    LIMIT $${paramIndex++} OFFSET $${paramIndex++};
  `;

  const dataRes = await pool.query(dataQuery, params);

  return {
    logs: dataRes.rows,
    total,
    page: safePage,
    limit: safeLimit,
    totalPages: Math.ceil(total / safeLimit) || 1
  };
};

/**
 * Fetch a single audit record with role-based check
 */
const getAuditLogById = async (id, userRole = 'OPERATOR') => {
  const query = `
    SELECT 
      a.id,
      a.actor_user_id,
      u.full_name AS actor_name,
      u.email AS actor_email,
      a.actor_role,
      a.action,
      a.entity_type,
      a.entity_id,
      a.result,
      a.reason,
      a.metadata,
      a.ip_address,
      a.user_agent,
      a.created_at
    FROM audit_logs a
    LEFT JOIN users u ON a.actor_user_id = u.id
    WHERE a.id = $1;
  `;

  const res = await pool.query(query, [id]);
  if (res.rows.length === 0) return null;

  const log = res.rows[0];

  // Operator cannot access sensitive auth events
  if (userRole !== 'ADMIN') {
    if (log.action.startsWith('AUTH_') || !['COMPLAINT', 'ROUTING_DECISION', 'REVIEW', 'JURISDICTION', 'SLA', 'NOTIFICATION'].includes(log.entity_type)) {
      const err = new Error('Access denied. Operator role is restricted from viewing sensitive security or authentication audit logs.');
      err.status = 403;
      throw err;
    }
  }

  return log;
};

/**
 * Summary breakdown for Audit Dashboard
 */
const getAuditSummary = async (userRole = 'OPERATOR') => {
  const roleCondition = userRole !== 'ADMIN' 
    ? `WHERE entity_type IN ('COMPLAINT', 'ROUTING_DECISION', 'REVIEW', 'JURISDICTION', 'SLA', 'NOTIFICATION') AND action NOT LIKE 'AUTH_%'`
    : '';

  const totalQuery = `
    SELECT 
      COUNT(*)::int AS total_events,
      COUNT(*) FILTER (WHERE result = 'SUCCESS')::int AS success_events,
      COUNT(*) FILTER (WHERE result = 'FAILURE')::int AS failure_events,
      COUNT(DISTINCT actor_user_id)::int AS distinct_actors
    FROM audit_logs
    ${roleCondition};
  `;

  const actionsQuery = `
    SELECT action, COUNT(*)::int AS count
    FROM audit_logs
    ${roleCondition}
    GROUP BY action
    ORDER BY count DESC
    LIMIT 8;
  `;

  const entitiesQuery = `
    SELECT entity_type, COUNT(*)::int AS count
    FROM audit_logs
    ${roleCondition}
    GROUP BY entity_type
    ORDER BY count DESC;
  `;

  const recentQuery = `
    SELECT 
      a.id, a.action, a.entity_type, a.entity_id, a.result, a.created_at,
      a.actor_role, u.full_name AS actor_name
    FROM audit_logs a
    LEFT JOIN users u ON a.actor_user_id = u.id
    ${roleCondition}
    ORDER BY a.created_at DESC
    LIMIT 10;
  `;

  const [totalRes, actionsRes, entitiesRes, recentRes] = await Promise.all([
    pool.query(totalQuery),
    pool.query(actionsQuery),
    pool.query(entitiesQuery),
    pool.query(recentQuery)
  ]);

  const total = totalRes.rows[0]?.total_events || 0;
  const byCategory = {};
  for (const row of entitiesRes.rows) {
    byCategory[row.entity_type] = row.count;
  }

  return {
    total_records: total,
    past_24h_records: recentRes.rows.length,
    security_events: totalRes.rows[0]?.failure_events || 0,
    unique_actors: totalRes.rows[0]?.distinct_actors || 0,
    by_category: byCategory,
    overview: totalRes.rows[0] || { total_events: 0, success_events: 0, failure_events: 0, distinct_actors: 0 },
    topActions: actionsRes.rows,
    entityBreakdown: entitiesRes.rows,
    recentEvents: recentRes.rows
  };
};

module.exports = {
  sanitizeAuditMetadata,
  logAuditEvent,
  queryAuditLogs,
  getAuditLogById,
  getAuditSummary
};
