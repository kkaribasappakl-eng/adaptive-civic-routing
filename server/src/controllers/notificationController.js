const notificationService = require('../services/notificationService');
const { getComplaintById } = require('../services/complaintService');

const isUUID = (str) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);

/**
 * Resolves complaintId param (supports UUID or complaint_code like HM-CIV-2026-000001)
 */
const resolveComplaintId = async (idOrCode) => {
  if (isUUID(idOrCode)) {
    return idOrCode;
  }
  const complaint = await getComplaintById(idOrCode);
  if (!complaint) {
    const error = new Error(`Complaint '${idOrCode}' not found.`);
    error.status = 404;
    throw error;
  }
  return complaint.id;
};

/**
 * GET /api/complaints/:complaintId/notifications
 * Retrieves all notifications for a given complaint
 */
const getComplaintNotificationsHandler = async (req, res, next) => {
  try {
    const { complaintId } = req.params;
    const { limit, offset } = req.query;

    const resolvedId = await resolveComplaintId(complaintId);
    const notifications = await notificationService.getComplaintNotifications(
      resolvedId,
      limit,
      offset
    );

    res.status(200).json({
      success: true,
      data: notifications,
      total: notifications.length
    });
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json({ success: false, error: error.message });
    }
    next(error);
  }
};

/**
 * GET /api/complaints/:complaintId/notifications/unread
 * Retrieves unread notifications for a given complaint
 */
const getUnreadComplaintNotificationsHandler = async (req, res, next) => {
  try {
    const { complaintId } = req.params;
    const { limit, offset } = req.query;

    const resolvedId = await resolveComplaintId(complaintId);
    const notifications = await notificationService.getUnreadNotifications(
      resolvedId,
      limit,
      offset
    );

    res.status(200).json({
      success: true,
      data: notifications,
      total: notifications.length
    });
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json({ success: false, error: error.message });
    }
    next(error);
  }
};

/**
 * PATCH /api/notifications/:notificationId/read
 * Marks a single notification as read
 */
const markNotificationReadHandler = async (req, res, next) => {
  try {
    const { notificationId } = req.params;

    if (!isUUID(notificationId)) {
      return res.status(400).json({
        success: false,
        error: `Invalid notification ID '${notificationId}'. Must be a valid UUID.`
      });
    }

    const updated = await notificationService.markNotificationRead(notificationId);
    if (!updated) {
      return res.status(404).json({
        success: false,
        error: `Notification '${notificationId}' not found.`
      });
    }

    res.status(200).json({
      success: true,
      message: 'Notification marked as read.',
      data: updated
    });
  } catch (error) {
    next(error);
  }
};

/**
 * PATCH /api/complaints/:complaintId/notifications/read-all
 * Marks all notifications for a specific complaint as read
 */
const markAllComplaintNotificationsReadHandler = async (req, res, next) => {
  try {
    const { complaintId } = req.params;
    const resolvedId = await resolveComplaintId(complaintId);

    const result = await notificationService.markAllComplaintNotificationsRead(resolvedId);

    res.status(200).json({
      success: true,
      message: `Marked ${result.updatedCount} notification(s) as read.`,
      updatedCount: result.updatedCount,
      data: result.notifications
    });
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json({ success: false, error: error.message });
    }
    next(error);
  }
};

/**
 * GET /api/notifications/unread
 * Aggregate unread notifications across all complaints
 */
const getGlobalUnreadNotificationsHandler = async (req, res, next) => {
  try {
    const { limit, offset } = req.query;
    const notifications = await notificationService.getUnreadNotifications(null, limit, offset);

    res.status(200).json({
      success: true,
      data: notifications,
      count: notifications.length
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/notifications
 * All notifications feed with pagination and optional isRead filter
 */
const getAllNotificationsHandler = async (req, res, next) => {
  try {
    const { limit, offset, isRead } = req.query;
    const parsedIsRead = isRead === 'true' ? true : isRead === 'false' ? false : null;

    const result = await notificationService.getAllNotifications(limit, offset, parsedIsRead);

    res.status(200).json({
      success: true,
      data: result.notifications,
      total: result.total
    });
  } catch (error) {
    next(error);
  }
};

/**
 * PATCH /api/notifications/read-all
 * Marks all notifications across all complaints as read
 */
const markAllGlobalNotificationsReadHandler = async (req, res, next) => {
  try {
    const result = await notificationService.markAllGlobalNotificationsRead();

    res.status(200).json({
      success: true,
      message: `Marked ${result.updatedCount} notification(s) as read.`,
      updatedCount: result.updatedCount,
      data: result.notifications
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getComplaintNotificationsHandler,
  getUnreadComplaintNotificationsHandler,
  markNotificationReadHandler,
  markAllComplaintNotificationsReadHandler,
  getGlobalUnreadNotificationsHandler,
  getAllNotificationsHandler,
  markAllGlobalNotificationsReadHandler
};
