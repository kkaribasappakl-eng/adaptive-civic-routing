const analyticsService = require('../services/analyticsService');

/**
 * Controller for Stage 11 Operational Analytics & Routing Intelligence.
 * STRICT REQUIREMENT: All endpoints are READ-ONLY (SELECT-only).
 */

const getOverview = async (req, res, next) => {
  try {
    const data = await analyticsService.getOverview(req.query);
    res.status(200).json({
      success: true,
      message: 'Operational overview analytics retrieved successfully.',
      data
    });
  } catch (error) {
    next(error);
  }
};

const getTrends = async (req, res, next) => {
  try {
    const data = await analyticsService.getComplaintTrends(req.query);
    res.status(200).json({
      success: true,
      message: 'Complaint trends retrieved successfully.',
      data
    });
  } catch (error) {
    next(error);
  }
};

const getCategories = async (req, res, next) => {
  try {
    const data = await analyticsService.getCategoryBreakdown(req.query);
    res.status(200).json({
      success: true,
      message: 'Category breakdown retrieved successfully.',
      data
    });
  } catch (error) {
    next(error);
  }
};

const getAuthorities = async (req, res, next) => {
  try {
    const data = await analyticsService.getAuthorityPerformance(req.query);
    res.status(200).json({
      success: true,
      message: 'Authority performance analytics retrieved successfully.',
      data
    });
  } catch (error) {
    next(error);
  }
};

const getDepartments = async (req, res, next) => {
  try {
    const data = await analyticsService.getDepartmentPerformance(req.query);
    res.status(200).json({
      success: true,
      message: 'Department performance analytics retrieved successfully.',
      data
    });
  } catch (error) {
    next(error);
  }
};

const getRouting = async (req, res, next) => {
  try {
    const data = await analyticsService.getRoutingAnalytics(req.query);
    res.status(200).json({
      success: true,
      message: 'Routing intelligence analytics retrieved successfully.',
      data
    });
  } catch (error) {
    next(error);
  }
};

const getSla = async (req, res, next) => {
  try {
    const data = await analyticsService.getSlaAnalytics(req.query);
    res.status(200).json({
      success: true,
      message: 'SLA health analytics retrieved successfully.',
      data
    });
  } catch (error) {
    next(error);
  }
};

const getReviews = async (req, res, next) => {
  try {
    const data = await analyticsService.getReviewAnalytics(req.query);
    res.status(200).json({
      success: true,
      message: 'Human review queue analytics retrieved successfully.',
      data
    });
  } catch (error) {
    next(error);
  }
};

const getJurisdictions = async (req, res, next) => {
  try {
    const data = await analyticsService.getJurisdictionAnalytics(req.query);
    res.status(200).json({
      success: true,
      message: 'Jurisdiction historical provenance analytics retrieved successfully.',
      data
    });
  } catch (error) {
    next(error);
  }
};

const getSpatial = async (req, res, next) => {
  try {
    const data = await analyticsService.getSpatialAnalytics(req.query);
    res.status(200).json({
      success: true,
      message: 'Spatial complaint distribution analytics retrieved successfully.',
      data
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getOverview,
  getTrends,
  getCategories,
  getAuthorities,
  getDepartments,
  getRouting,
  getSla,
  getReviews,
  getJurisdictions,
  getSpatial
};
