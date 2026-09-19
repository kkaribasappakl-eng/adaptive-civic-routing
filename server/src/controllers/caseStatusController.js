const caseStatusService = require('../services/caseStatusService');

/**
 * Updates a complaint's status with deterministic transition validation
 * PATCH /api/complaints/:complaintId/status
 */
const updateStatusHandler = async (req, res, next) => {
  try {
    const { complaintId } = req.params;
    const { status, reason, changedBy, metadata } = req.body;

    if (!status) {
      return res.status(400).json({
        success: false,
        error: 'Target "status" is required in request body.'
      });
    }

    const result = await caseStatusService.updateComplaintStatus(
      complaintId,
      status,
      reason,
      changedBy || 'civic_operator',
      metadata
    );

    res.status(200).json({
      success: true,
      message: `Complaint status updated from '${result.previousStatus}' to '${result.newStatus}'`,
      data: result
    });
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json({
        success: false,
        error: error.message
      });
    }
    next(error);
  }
};

/**
 * Sanitizes complaint lifecycle payload for unauthenticated / citizen viewers.
 * Strictly hides internal reviewer notes, operator emails, and privileged metadata.
 */
const sanitizeLifecycleForCitizen = (complaint) => {
  if (!complaint) return null;
  return {
    id: complaint.id,
    complaint_code: complaint.complaint_code,
    description: complaint.description,
    category: complaint.category,
    category_confidence: complaint.category_confidence,
    photo_url: complaint.photo_url,
    latitude: complaint.latitude,
    longitude: complaint.longitude,
    status: complaint.status,
    routed_at: complaint.routed_at,
    sla_status: complaint.sla_status,
    sla_target_at: complaint.sla_target_at,
    created_at: complaint.created_at,
    updated_at: complaint.updated_at,
    geojson: complaint.geojson,
    routing: complaint.routing ? {
      routing_status: complaint.routing.routing_status,
      authority_name: complaint.routing.authority_name,
      department_name: complaint.routing.department_name,
      routed_at: complaint.routing.routed_at
    } : null,
    status_history: (complaint.status_history || []).map(h => ({
      id: h.id,
      previous_status: h.previous_status,
      new_status: h.new_status,
      changed_by: h.changed_by && h.changed_by.includes('@') ? 'Civic Operations' : (h.changed_by || 'System'),
      reason: h.reason,
      created_at: h.created_at
    }))
  };
};

/**
 * Fetches chronological status history for a complaint
 * GET /api/complaints/:complaintId/status-history
 */
const getStatusHistoryHandler = async (req, res, next) => {
  try {
    const { complaintId } = req.params;
    const rawHistory = await caseStatusService.getComplaintStatusHistory(complaintId);
    const isPrivileged = req.user && ['OPERATOR', 'ADMIN'].includes(req.user.role);

    const history = isPrivileged
      ? rawHistory
      : rawHistory.map(h => ({
          id: h.id,
          previous_status: h.previous_status,
          new_status: h.new_status,
          changed_by: h.changed_by && h.changed_by.includes('@') ? 'Civic Operations' : (h.changed_by || 'System'),
          reason: h.reason,
          created_at: h.created_at
        }));

    res.status(200).json({
      success: true,
      data: history
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Fetches full complaint lifecycle including routing and status history
 * GET /api/complaints/:id
 */
const getComplaintLifecycleHandler = async (req, res, next) => {
  try {
    const id = req.params.complaintId || req.params.id;
    const complaint = await caseStatusService.getComplaintWithFullLifecycle(id);

    if (!complaint) {
      return res.status(404).json({
        success: false,
        error: `Complaint '${id}' not found.`
      });
    }

    const isPrivileged = req.user && ['OPERATOR', 'ADMIN'].includes(req.user.role);
    const data = isPrivileged ? complaint : sanitizeLifecycleForCitizen(complaint);

    res.status(200).json({
      success: true,
      data
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  updateStatusHandler,
  getStatusHistoryHandler,
  getComplaintLifecycleHandler
};
