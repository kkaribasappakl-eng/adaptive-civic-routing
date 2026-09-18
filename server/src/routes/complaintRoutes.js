const express = require('express');
const router = express.Router();
const {
  classifyComplaint,
  submitComplaint,
  listComplaints,
  getComplaint,
  checkDuplicate
} = require('../controllers/complaintController');
const { handlePhotoUpload } = require('../middleware/uploadMiddleware');

// AI Issue Classification route (accepts description + optional photo)
router.post('/classify', handlePhotoUpload('photo'), classifyComplaint);

// Duplicate check route
router.get('/check-duplicate', checkDuplicate);

// Submit new complaint route (accepts form data + optional photo)
router.post('/', handlePhotoUpload('photo'), submitComplaint);

// List complaints
router.get('/', listComplaints);

// Single complaint by ID or code
router.get('/:id', getComplaint);

// Route complaint endpoint
router.post('/:complaintId/route', require('../controllers/routingController').routeComplaintHandler);

// Get complaint routing decision
router.get('/:complaintId/routing', require('../controllers/routingController').getComplaintRoutingHandler);

module.exports = router;
