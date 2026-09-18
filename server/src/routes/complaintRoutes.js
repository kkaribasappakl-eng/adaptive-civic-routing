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
const { handlePhotoUpload } = require('../middleware/uploadMiddleware');

// AI Issue Classification route (accepts description + optional photo)
router.post('/classify', handlePhotoUpload('photo'), classifyComplaint);

// Duplicate check route
router.get('/check-duplicate', checkDuplicate);

// Submit new complaint route (accepts form data + optional photo)
router.post('/', handlePhotoUpload('photo'), submitComplaint);

// List complaints
router.get('/', listComplaints);

// Single complaint by ID or code (returns complete lifecycle: complaint, routing, status history)
router.get('/:id', getComplaintLifecycleHandler);

// Route complaint endpoint (Stage 5)
router.post('/:complaintId/route', require('../controllers/routingController').routeComplaintHandler);

// Get complaint routing decision (Stage 5)
router.get('/:complaintId/routing', require('../controllers/routingController').getComplaintRoutingHandler);

// Stage 6: Update complaint status with state machine validation
router.patch('/:complaintId/status', updateStatusHandler);

// Stage 6: Get complaint status history
router.get('/:complaintId/status-history', getStatusHistoryHandler);

module.exports = router;

