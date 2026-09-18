const complaintService = require('../services/complaintService');
const aiService = require('../services/aiService');

/**
 * AI-Assisted Issue Classification
 * POST /api/complaints/classify
 */
const classifyComplaint = async (req, res, next) => {
  try {
    const description = req.body.description || '';
    const photoPath = req.file ? req.file.path : null;

    const result = await aiService.classifyIssue(description, photoPath);
    res.status(200).json({
      success: true,
      ...result
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Submit New Citizen Complaint
 * POST /api/complaints
 */
const submitComplaint = async (req, res, next) => {
  try {
    const photoUrl = req.file ? `/uploads/complaints/${req.file.filename}` : null;

    const result = await complaintService.createComplaint(req.body, photoUrl);

    res.status(201).json({
      success: true,
      data: result.complaint,
      duplicateWarning: result.duplicateWarning,
      message: `Complaint ${result.complaint.complaint_code} submitted successfully.`
    });
  } catch (error) {
    if (error.status === 400) {
      return res.status(400).json({
        success: false,
        error: error.message,
        details: error.details || []
      });
    }
    next(error);
  }
};

/**
 * List Recent Complaints
 * GET /api/complaints
 */
const listComplaints = async (req, res, next) => {
  try {
    const { limit, offset, category } = req.query;
    const result = await complaintService.listComplaints(limit, offset, category);
    res.status(200).json({
      success: true,
      data: result.complaints,
      total: result.total
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get Complaint Details by ID or Code
 * GET /api/complaints/:id
 */
const getComplaint = async (req, res, next) => {
  try {
    const { id } = req.params;
    const complaint = await complaintService.getComplaintById(id);

    if (!complaint) {
      return res.status(404).json({
        success: false,
        error: `Complaint '${id}' not found.`
      });
    }

    res.status(200).json({
      success: true,
      data: complaint
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Duplicate Pre-check Query
 * GET /api/complaints/check-duplicate?lat=...&lng=...&category=...
 */
const checkDuplicate = async (req, res, next) => {
  try {
    const { lat, lng, category } = req.query;
    if (!lat || !lng || !category) {
      return res.status(400).json({
        success: false,
        error: 'Query parameters "lat", "lng", and "category" are required.'
      });
    }

    const warning = await complaintService.checkPotentialDuplicates(parseFloat(lat), parseFloat(lng), category);
    res.status(200).json({
      success: true,
      data: warning
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  classifyComplaint,
  submitComplaint,
  listComplaints,
  getComplaint,
  checkDuplicate
};
