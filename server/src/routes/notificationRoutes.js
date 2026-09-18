const express = require('express');
const router = express.Router();
const {
  getGlobalUnreadNotificationsHandler,
  getAllNotificationsHandler,
  markNotificationReadHandler,
  markAllGlobalNotificationsReadHandler
} = require('../controllers/notificationController');

// GET /api/notifications/unread (aggregate unread notifications)
router.get('/unread', getGlobalUnreadNotificationsHandler);

// GET /api/notifications (paginated notification feed)
router.get('/', getAllNotificationsHandler);

// PATCH /api/notifications/:notificationId/read (mark single notification read)
router.patch('/:notificationId/read', markNotificationReadHandler);

// PATCH /api/notifications/read-all (mark all global notifications read)
router.patch('/read-all', markAllGlobalNotificationsReadHandler);

module.exports = router;
