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

    // Audit complaint creation
    try {
      const { logAuditEvent } = require('../services/auditService');
      await logAuditEvent({
        actorUserId: req.user?.id || null,
        actorRole: req.user?.role || 'CITIZEN',
        action: 'COMPLAINT_CREATED',
        entityType: 'COMPLAINT',
        entityId: result.complaint.id,
        result: 'SUCCESS',
        metadata: {
          complaintCode: result.complaint.complaint_code,
          category: result.complaint.category,
          latitude: result.complaint.latitude,
          longitude: result.complaint.longitude
        },
        request: req
      });
    } catch (auditErr) {
      console.warn('[Audit Warning] Complaint creation audit failed:', auditErr.message);
    }

    const isPrivileged = req.user && ['OPERATOR', 'ADMIN'].includes(req.user.role);
    const safeComplaint = isPrivileged ? result.complaint : {
      id: result.complaint.id,
      complaint_code: result.complaint.complaint_code,
      description: result.complaint.description,
      category: result.complaint.category,
      category_source: result.complaint.category_source,
      category_confidence: result.complaint.category_confidence,
      photo_url: result.complaint.photo_url,
      latitude: result.complaint.latitude,
      longitude: result.complaint.longitude,
      status: result.complaint.status,
      created_at: result.complaint.created_at
    };

    res.status(201).json({
      success: true,
      data: safeComplaint,
      duplicateWarning: result.duplicateWarning,
      routing: result.routingDecision,
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
    
    const isPrivileged = req.user && ['OPERATOR', 'ADMIN'].includes(req.user.role);
    const complaints = isPrivileged
      ? result.complaints
      : result.complaints.map(c => ({
          id: c.id,
          complaint_code: c.complaint_code,
          description: c.description,
          category: c.category,
          category_source: c.category_source,
          category_confidence: c.category_confidence,
          photo_url: c.photo_url,
          latitude: c.latitude,
          longitude: c.longitude,
          status: c.status,
          routed_at: c.routed_at,
          sla_status: c.sla_status,
          created_at: c.created_at,
          geojson: c.geojson
        }));

    res.status(200).json({
      success: true,
      data: complaints,
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
