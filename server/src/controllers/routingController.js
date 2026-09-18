const routingService = require('../services/routingService');

/**
 * Route Complaint Endpoint
 * POST /api/complaints/:complaintId/route
 */
const routeComplaintHandler = async (req, res, next) => {
  try {
    const { complaintId } = req.params;
    const result = await routingService.routeComplaint(complaintId);

    res.status(200).json({
      success: true,
      alreadyRouted: result.alreadyRouted,
      data: result.decision,
      message: result.alreadyRouted
        ? `Complaint already routed previously. Historical routing decision returned.`
        : `Complaint successfully routed via deterministic GIS engine.`
    });
  } catch (error) {
    if (error.status === 404) {
      return res.status(404).json({
        success: false,
        error: error.message
      });
    }
    next(error);
  }
};

/**
 * Get Routing Decision for a Specific Complaint
 * GET /api/complaints/:complaintId/routing
 */
const getComplaintRoutingHandler = async (req, res, next) => {
  try {
    const { complaintId } = req.params;
    const decision = await routingService.getRoutingDecisionByComplaint(complaintId);

    if (!decision) {
      return res.status(404).json({
        success: false,
        error: `No routing decision found for complaint '${complaintId}'. Complaint has not been routed yet.`
      });
    }

    res.status(200).json({
      success: true,
      data: decision
    });
  } catch (error) {
    next(error);
  }
};

/**
 * List All Routing Decisions
 * GET /api/routing/decisions
 */
const listRoutingDecisionsHandler = async (req, res, next) => {
  try {
    const { limit, offset } = req.query;
    const result = await routingService.getRoutingDecisionsList(limit, offset);

    res.status(200).json({
      success: true,
      data: result.decisions,
      total: result.total
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get Routing Decision by Decision ID
 * GET /api/routing/decisions/:id
 */
const getRoutingDecisionHandler = async (req, res, next) => {
  try {
    const { id } = req.params;
    const decision = await routingService.getRoutingDecisionById(id);

    if (!decision) {
      return res.status(404).json({
        success: false,
        error: `Routing decision '${id}' not found.`
      });
    }

    res.status(200).json({
      success: true,
      data: decision
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  routeComplaintHandler,
  getComplaintRoutingHandler,
  listRoutingDecisionsHandler,
  getRoutingDecisionHandler
};
