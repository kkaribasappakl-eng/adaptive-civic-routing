const express = require('express');
const router = express.Router();
const {
  classifyComplaint,
  submitComplaint,
  listComplaints,
  checkDuplicate
} = require('../controllers/complaintController');
const {
  updateStatusHandler,
  getStatusHistoryHandler,
  getComplaintLifecycleHandler
} = require('../controllers/caseStatusController');
const {
  getComplaintSlaHandler,
  evaluateComplaintSlaHandler
} = require('../controllers/slaController');
const { handlePhotoUpload } = require('../middleware/uploadMiddleware');
const { requireAuth, requireRole, optionalAuth } = require('../middleware/authMiddleware');

// AI Issue Classification route (accepts description + optional photo - Public)
router.post('/classify', handlePhotoUpload('photo'), classifyComplaint);

// Duplicate check route (Public)
router.get('/check-duplicate', checkDuplicate);

// Submit new complaint route (Public intake with optional authentication)
router.post('/', optionalAuth, handlePhotoUpload('photo'), submitComplaint);

// List complaints across the system (Restricted to OPERATOR and ADMIN)
router.get('/', requireAuth, requireRole('OPERATOR', 'ADMIN'), listComplaints);

// Single complaint by ID or code (Public citizen tracking with optionalAuth)
router.get('/:id', optionalAuth, getComplaintLifecycleHandler);

// Route complaint endpoint (Stage 5 - Operator / Admin only)
router.post('/:complaintId/route', requireAuth, requireRole('OPERATOR', 'ADMIN'), require('../controllers/routingController').routeComplaintHandler);

// Get complaint routing decision (Public citizen tracking access)
router.get('/:complaintId/routing', require('../controllers/routingController').getComplaintRoutingHandler);

// Stage 6: Update complaint status with state machine validation (Operator / Admin only)
router.patch('/:complaintId/status', requireAuth, requireRole('OPERATOR', 'ADMIN'), updateStatusHandler);

// Stage 6: Get complaint status history (Public citizen tracking with optionalAuth)
router.get('/:complaintId/status-history', optionalAuth, getStatusHistoryHandler);

// Stage 7: Get complaint SLA details & event history (Public citizen tracking)
router.get('/:complaintId/sla', getComplaintSlaHandler);

// Stage 7: Evaluate complaint SLA (Operator / Admin only)
router.post('/:complaintId/sla/evaluate', requireAuth, requireRole('OPERATOR', 'ADMIN'), evaluateComplaintSlaHandler);

// Stage 8: Complaint citizen notifications (Public citizen tracking for case)
const {
  getComplaintNotificationsHandler,
  getUnreadComplaintNotificationsHandler,
  markAllComplaintNotificationsReadHandler
} = require('../controllers/notificationController');

router.get('/:complaintId/notifications', getComplaintNotificationsHandler);
router.get('/:complaintId/notifications/unread', getUnreadComplaintNotificationsHandler);
router.patch('/:complaintId/notifications/read-all', markAllComplaintNotificationsReadHandler);

module.exports = router;

