const { pool } = require('../config/db');
const { getIO } = require('./socketService');

/**
 * Controlled Notification Types (Stage 8)
 */
const NOTIFICATION_TYPES = [
  'COMPLAINT_SUBMITTED',
  'CATEGORY_UPDATED',
  'ROUTING_COMPLETED',
  'HUMAN_REVIEW_REQUIRED',
  'STATUS_CHANGED',
  'SLA_WARNING',
  'SLA_BREACHED',
  'CASE_RESOLVED',
  'CASE_CLOSED'
];

/**
 * Validates whether a notification type is allowed.
 */
const isValidNotificationType = (type) => {
  return typeof type === 'string' && NOTIFICATION_TYPES.includes(type.trim().toUpperCase());
};

/**
 * Creates and persists a citizen notification in PostgreSQL.
 * 
 * ARCHITECTURAL PRINCIPLES:
 * 1. PostgreSQL is the source of truth.
 * 2. Real PostgreSQL CURRENT_TIMESTAMP is used. No fabricated timestamps.
 * 3. Idempotency keys prevent duplicate notifications for repeated operations.
 * 4. Socket.IO notification:created is emitted ONLY AFTER successful database persistence.
 * 5. Socket.IO failures are caught and logged, never rolling back or failing database operations.
 */
const createNotification = async ({
  complaintId,
  notificationType,
  title,
  message,
  metadata = {},
  idempotencyKey = null,
  client = null
}) => {
  const normalizedType = (notificationType || '').trim().toUpperCase();
  if (!isValidNotificationType(normalizedType)) {
    throw new Error(`Invalid notification_type '${notificationType}'. Allowed: ${NOTIFICATION_TYPES.join(', ')}`);
  }

  if (!complaintId) {
    throw new Error('complaintId is required to create a citizen notification.');
  }

  if (!title || !title.trim()) {
    throw new Error('Notification title is required.');
  }

  if (!message || !message.trim()) {
    throw new Error('Notification message is required.');
  }

  const db = client || pool;

  // Verify complaint exists and obtain complaint_code for clean payload
  const compRes = await db.query(
    'SELECT id, complaint_code FROM complaints WHERE id = $1;',
    [complaintId]
  );
  if (compRes.rows.length === 0) {
    throw new Error(`Complaint '${complaintId}' not found.`);
  }
  const complaintCode = compRes.rows[0].complaint_code;

  // Deterministic Idempotent Insert using ON CONFLICT on idempotency_key
  let insertQuery;
  let params;

  if (idempotencyKey) {
    insertQuery = `
      INSERT INTO citizen_notifications (
        complaint_id,
        notification_type,
        title,
        message,
        metadata,
        idempotency_key,
        created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP)
      ON CONFLICT (idempotency_key) WHERE idempotency_key IS NOT NULL DO NOTHING
      RETURNING id, complaint_id, notification_type, title, message, metadata, is_read, created_at, read_at, idempotency_key;
    `;
    params = [
      complaintId,
      normalizedType,
      title.trim().slice(0, 200),
      message.trim(),
      JSON.stringify(metadata || {}),
      idempotencyKey.trim().slice(0, 150)
    ];
  } else {
    insertQuery = `
      INSERT INTO citizen_notifications (
        complaint_id,
        notification_type,
        title,
        message,
        metadata,
        created_at
      ) VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)
      RETURNING id, complaint_id, notification_type, title, message, metadata, is_read, created_at, read_at, idempotency_key;
    `;
    params = [
      complaintId,
      normalizedType,
      title.trim().slice(0, 200),
      message.trim(),
      JSON.stringify(metadata || {})
    ];
  }

  const result = await db.query(insertQuery, params);

  // If duplicate prevented by ON CONFLICT
  if (result.rows.length === 0 && idempotencyKey) {
    const existing = await db.query(
      'SELECT id, complaint_id, notification_type, title, message, metadata, is_read, created_at, read_at, idempotency_key FROM citizen_notifications WHERE idempotency_key = $1;',
      [idempotencyKey.trim().slice(0, 150)]
    );
    return {
      created: false,
      duplicate: true,
      notification: existing.rows[0] || null
    };
  }

  const notification = result.rows[0];

  // Emit Socket.IO event strictly AFTER successful DB persistence
  try {
    const io = getIO();
    if (io) {
      io.emit('notification:created', {
        notificationId: notification.id,
        complaintId: notification.complaint_id,
        complaintCode,
        notificationType: notification.notification_type,
        title: notification.title,
        message: notification.message,
        createdAt: notification.created_at
      });
    }
  } catch (socketErr) {
    console.warn('[Socket.IO] notification:created broadcast warning:', socketErr.message);
  }

  return {
    created: true,
    duplicate: false,
    notification
  };
};

/**
 * Convenience wrapper matching prompt specifications.
 */
const createComplaintNotification = async (complaintId, type, title, message, metadata = {}, idempotencyKey = null, client = null) => {
  return createNotification({
    complaintId,
    notificationType: type,
    title,
    message,
    metadata,
    idempotencyKey,
    client
  });
};

/**
 * Retrieves all notifications for a specific complaint ordered newest first.
 */
const getComplaintNotifications = async (complaintId, limit = 50, offset = 0) => {
  const query = `
    SELECT 
      n.id,
      n.complaint_id,
      c.complaint_code,
      n.notification_type,
      n.title,
      n.message,
      n.metadata,
      n.is_read,
      n.created_at,
      n.read_at
    FROM citizen_notifications n
    JOIN complaints c ON n.complaint_id = c.id
    WHERE n.complaint_id = $1
    ORDER BY n.created_at DESC
    LIMIT $2 OFFSET $3;
  `;
  const lim = Math.min(100, Math.max(1, parseInt(limit) || 50));
  const off = Math.max(0, parseInt(offset) || 0);

  const res = await pool.query(query, [complaintId, lim, off]);
  return res.rows;
};

/**
 * Retrieves unread notifications for a specific complaint, or all unread if complaintId is null.
 */
const getUnreadNotifications = async (complaintId = null, limit = 50, offset = 0) => {
  const lim = Math.min(100, Math.max(1, parseInt(limit) || 50));
  const off = Math.max(0, parseInt(offset) || 0);

  let query;
  let params;

  if (complaintId) {
    query = `
      SELECT 
        n.id,
        n.complaint_id,
        c.complaint_code,
        n.notification_type,
        n.title,
        n.message,
        n.metadata,
        n.is_read,
        n.created_at,
        n.read_at
      FROM citizen_notifications n
      JOIN complaints c ON n.complaint_id = c.id
      WHERE n.complaint_id = $1 AND n.is_read = FALSE
      ORDER BY n.created_at DESC
      LIMIT $2 OFFSET $3;
    `;
    params = [complaintId, lim, off];
  } else {
    query = `
      SELECT 
        n.id,
        n.complaint_id,
        c.complaint_code,
        n.notification_type,
        n.title,
        n.message,
        n.metadata,
        n.is_read,
        n.created_at,
        n.read_at
      FROM citizen_notifications n
      JOIN complaints c ON n.complaint_id = c.id
      WHERE n.is_read = FALSE
      ORDER BY n.created_at DESC
      LIMIT $1 OFFSET $2;
    `;
    params = [lim, off];
  }

  const res = await pool.query(query, params);
  return res.rows;
};

/**
 * Retrieves recent notifications across all complaints for NotificationCenter.
 */
const getAllNotifications = async (limit = 50, offset = 0, isRead = null) => {
  const lim = Math.min(100, Math.max(1, parseInt(limit) || 50));
  const off = Math.max(0, parseInt(offset) || 0);

  let query = `
    SELECT 
      n.id,
      n.complaint_id,
      c.complaint_code,
      c.category,
      n.notification_type,
      n.title,
      n.message,
      n.metadata,
      n.is_read,
      n.created_at,
      n.read_at
    FROM citizen_notifications n
    JOIN complaints c ON n.complaint_id = c.id
  `;
  const params = [];

  if (isRead !== null && isRead !== undefined) {
    params.push(Boolean(isRead));
    query += ` WHERE n.is_read = $${params.length}`;
  }

  query += ` ORDER BY n.created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2};`;
  params.push(lim, off);

  const countQuery = isRead !== null && isRead !== undefined
    ? 'SELECT COUNT(*)::int AS total FROM citizen_notifications WHERE is_read = $1;'
    : 'SELECT COUNT(*)::int AS total FROM citizen_notifications;';
  const countParams = isRead !== null && isRead !== undefined ? [Boolean(isRead)] : [];

  const [res, countRes] = await Promise.all([
    pool.query(query, params),
    pool.query(countQuery, countParams)
  ]);

  return {
    total: countRes.rows[0].total,
    notifications: res.rows
  };
};

/**
 * Marks a single notification as read using PostgreSQL CURRENT_TIMESTAMP.
 */
const markNotificationRead = async (notificationId) => {
  const query = `
    UPDATE citizen_notifications
    SET is_read = TRUE, read_at = CURRENT_TIMESTAMP
    WHERE id = $1
    RETURNING id, complaint_id, notification_type, title, message, is_read, created_at, read_at;
  `;
  const res = await pool.query(query, [notificationId]);
  if (res.rows.length === 0) {
    return null;
  }
  return res.rows[0];
};

/**
 * Marks all notifications for a specific complaint as read.
 */
const markAllComplaintNotificationsRead = async (complaintId) => {
  const query = `
    UPDATE citizen_notifications
    SET is_read = TRUE, read_at = CURRENT_TIMESTAMP
    WHERE complaint_id = $1 AND is_read = FALSE
    RETURNING id, complaint_id, is_read, read_at;
  `;
  const res = await pool.query(query, [complaintId]);
  return {
    updatedCount: res.rows.length,
    notifications: res.rows
  };
};

/**
 * Marks all unread notifications across the system as read.
 */
const markAllGlobalNotificationsRead = async () => {
  const query = `
    UPDATE citizen_notifications
    SET is_read = TRUE, read_at = CURRENT_TIMESTAMP
    WHERE is_read = FALSE
    RETURNING id, complaint_id, is_read, read_at;
  `;
  const res = await pool.query(query);
  return {
    updatedCount: res.rows.length,
    notifications: res.rows
  };
};

/**
 * Gets the count of unread notifications.
 */
const getUnreadCount = async (complaintId = null) => {
  if (complaintId) {
    const res = await pool.query(
      'SELECT COUNT(*)::int AS unread_count FROM citizen_notifications WHERE complaint_id = $1 AND is_read = FALSE;',
      [complaintId]
    );
    return res.rows[0].unread_count;
  }
  const res = await pool.query(
    'SELECT COUNT(*)::int AS unread_count FROM citizen_notifications WHERE is_read = FALSE;'
  );
  return res.rows[0].unread_count;
};

module.exports = {
  NOTIFICATION_TYPES,
  isValidNotificationType,
  createNotification,
  createComplaintNotification,
  getComplaintNotifications,
  getUnreadNotifications,
  getAllNotifications,
  markNotificationRead,
  markAllComplaintNotificationsRead,
  markAllGlobalNotificationsRead,
  getUnreadCount
};
