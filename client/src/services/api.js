import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:4000/api',
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json'
  }
});

/**
 * Fetch health status from backend API
 */
export const checkApiHealth = async () => {
  try {
    const response = await api.get('/health?detailed=true');
    return {
      success: true,
      data: response.data
    };
  } catch (error) {
    return {
      success: false,
      error: error.response?.data?.message || error.message || 'API unreachable'
    };
  }
};

/**
 * Fetch detailed database & PostGIS system status
 * GET /api/system/database
 */
export const getDatabaseSystemStatus = async () => {
  try {
    const response = await api.get('/system/database');
    return {
      success: true,
      data: response.data
    };
  } catch (error) {
    return {
      success: false,
      error: error.response?.data?.message || error.message || 'System diagnostic unreachable'
    };
  }
};

/**
 * Test GIS point-in-polygon resolution
 * GET /api/gis/test?lat=...&lng=...&version=...
 */
export const testGisCoordinates = async (lat, lng, version = null) => {
  try {
    const params = { lat, lng };
    if (version) params.version = version;
    const response = await api.get('/gis/test', { params });
    return {
      success: true,
      data: response.data
    };
  } catch (error) {
    return {
      success: false,
      status: error.response?.status,
      data: error.response?.data,
      error: error.response?.data?.error || error.response?.data?.message || error.message
    };
  }
};

/**
 * Stage 3: Fetch all jurisdiction versions
 * GET /api/jurisdictions/versions
 */
export const getJurisdictionVersions = async () => {
  try {
    const response = await api.get('/jurisdictions/versions');
    return {
      success: true,
      data: response.data.data
    };
  } catch (error) {
    return {
      success: false,
      error: error.response?.data?.error || error.message
    };
  }
};

/**
 * Stage 3: Setup or reset Demo V2 proposal scenario
 * POST /api/jurisdictions/demo-v2-setup
 */
export const setupDemoV2 = async () => {
  try {
    const response = await api.post('/jurisdictions/demo-v2-setup');
    return {
      success: true,
      data: response.data.data
    };
  } catch (error) {
    return {
      success: false,
      error: error.response?.data?.error || error.message
    };
  }
};

/**
 * Stage 3: Preview coordinate against a specific version (DRAFT or historical)
 * POST /api/jurisdictions/versions/:versionId/preview?lat=...&lng=...
 */
export const previewCoordinateAgainstVersion = async (versionId, lat, lng) => {
  try {
    const response = await api.post(`/jurisdictions/versions/${versionId}/preview`, null, {
      params: { lat, lng }
    });
    return {
      success: true,
      data: response.data
    };
  } catch (error) {
    return {
      success: false,
      error: error.response?.data?.error || error.message
    };
  }
};

/**
 * Stage 3: Compare two versions side-by-side
 * GET /api/jurisdictions/versions/compare?from=...&to=...
 */
export const compareVersions = async (from, to) => {
  try {
    const response = await api.get('/jurisdictions/versions/compare', {
      params: { from, to }
    });
    return {
      success: true,
      data: response.data.data
    };
  } catch (error) {
    return {
      success: false,
      error: error.response?.data?.error || error.message
    };
  }
};

/**
 * Stage 3: Atomically activate a DRAFT version
 * POST /api/jurisdictions/versions/:versionId/activate
 */
export const activateJurisdictionVersion = async (versionId, operator = 'Civic Administrator') => {
  try {
    const response = await api.post(`/jurisdictions/versions/${versionId}/activate`, { operator });
    return {
      success: true,
      data: response.data
    };
  } catch (error) {
    return {
      success: false,
      error: error.response?.data?.error || error.message
    };
  }
};

/**
 * Stage 3: Fetch GeoJSON boundaries for a version (defaults to ACTIVE)
 * GET /api/jurisdictions/boundaries?version=...
 */
export const getJurisdictionBoundaries = async (version = null) => {
  try {
    const params = {};
    if (version) params.version = version;
    const response = await api.get('/jurisdictions/boundaries', { params });
    return {
      success: true,
      data: response.data
    };
  } catch (error) {
    return {
      success: false,
      error: error.response?.data?.error || error.message
    };
  }
};

/**
 * Stage 3: Fetch audit trail of version activations
 * GET /api/jurisdictions/audit
 */
export const getAuditHistory = async () => {
  try {
    const response = await api.get('/jurisdictions/audit');
    return {
      success: true,
      data: response.data.data
    };
  } catch (error) {
    return {
      success: false,
      error: error.response?.data?.error || error.message
    };
  }
};

/**
 * Stage 4: AI Issue Classification
 * POST /api/complaints/classify
 */
export const classifyComplaintIssue = async (formData) => {
  try {
    const response = await api.post('/complaints/classify', formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    });
    return {
      success: true,
      data: response.data
    };
  } catch (error) {
    return {
      success: false,
      error: error.response?.data?.error || error.message
    };
  }
};

/**
 * Stage 4: Submit New Citizen Complaint
 * POST /api/complaints
 */
export const submitCitizenComplaint = async (formData) => {
  try {
    const response = await api.post('/complaints', formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    });
    return {
      success: true,
      data: response.data.data,
      duplicateWarning: response.data.duplicateWarning,
      message: response.data.message
    };
  } catch (error) {
    return {
      success: false,
      status: error.response?.status,
      error: error.response?.data?.error || error.message,
      details: error.response?.data?.details || []
    };
  }
};

/**
 * Stage 4: Fetch Recent Complaints List
 * GET /api/complaints
 */
export const fetchRecentComplaints = async (limit = 20, offset = 0, category = null) => {
  try {
    const params = { limit, offset };
    if (category) params.category = category;
    const response = await api.get('/complaints', { params });
    return {
      success: true,
      data: response.data.data,
      total: response.data.total
    };
  } catch (error) {
    return {
      success: false,
      error: error.response?.data?.error || error.message
    };
  }
};

/**
 * Stage 4: Check for potential duplicate reports
 * GET /api/complaints/check-duplicate
 */
export const checkDuplicateReports = async (lat, lng, category) => {
  try {
    const response = await api.get('/complaints/check-duplicate', {
      params: { lat, lng, category }
    });
    return {
      success: true,
      data: response.data.data
    };
  } catch (error) {
    return {
      success: false,
      error: error.response?.data?.error || error.message
    };
  }
};

/**
 * Stage 5: Execute Deterministic Routing for a complaint
 * POST /api/complaints/:complaintId/route
 */
export const routeComplaint = async (complaintId) => {
  try {
    const response = await api.post(`/complaints/${complaintId}/route`);
    return {
      success: true,
      data: response.data.data,
      alreadyRouted: response.data.alreadyRouted,
      message: response.data.message
    };
  } catch (error) {
    return {
      success: false,
      error: error.response?.data?.error || error.message
    };
  }
};

/**
 * Stage 5: Fetch Routing Decision for a specific complaint
 * GET /api/complaints/:complaintId/routing
 */
export const getComplaintRouting = async (complaintId) => {
  try {
    const response = await api.get(`/complaints/${complaintId}/routing`);
    return {
      success: true,
      data: response.data.data
    };
  } catch (error) {
    return {
      success: false,
      error: error.response?.data?.error || error.message
    };
  }
};

/**
 * Stage 5: Fetch list of recent routing decisions
 * GET /api/routing/decisions
 */
export const getRoutingDecisions = async (limit = 20, offset = 0) => {
  try {
    const response = await api.get('/routing/decisions', {
      params: { limit, offset }
    });
    return {
      success: true,
      data: response.data.data,
      total: response.data.total
    };
  } catch (error) {
    return {
      success: false,
      error: error.response?.data?.error || error.message
    };
  }
};

/**
 * Stage 6: Update complaint status with state machine transition validation
 * PATCH /api/complaints/:complaintId/status
 */
export const updateComplaintStatus = async (complaintId, status, reason = null, changedBy = null) => {
  try {
    const response = await api.patch(`/complaints/${complaintId}/status`, {
      status,
      reason,
      changedBy
    });
    return {
      success: true,
      data: response.data.data,
      message: response.data.message
    };
  } catch (error) {
    return {
      success: false,
      error: error.response?.data?.error || error.message
    };
  }
};

/**
 * Stage 6: Fetch chronological status history for a complaint
 * GET /api/complaints/:complaintId/status-history
 */
export const getComplaintStatusHistory = async (complaintId) => {
  try {
    const response = await api.get(`/complaints/${complaintId}/status-history`);
    return {
      success: true,
      data: response.data.data
    };
  } catch (error) {
    return {
      success: false,
      error: error.response?.data?.error || error.message
    };
  }
};

/**
 * Stage 6: Fetch full complaint lifecycle (details, routing, status history)
 * GET /api/complaints/:complaintId
 */
export const getComplaintLifecycle = async (complaintId) => {
  try {
    const response = await api.get(`/complaints/${complaintId}`);
    return {
      success: true,
      data: response.data.data
    };
  } catch (error) {
    return {
      success: false,
      error: error.response?.data?.error || error.message
    };
  }
};

/**
 * Stage 7: Fetch complete complaint SLA details, benchmark policy, and chronological events
 * GET /api/complaints/:complaintId/sla
 */
export const getComplaintSla = async (complaintId) => {
  try {
    const response = await api.get(`/complaints/${complaintId}/sla`);
    return {
      success: true,
      data: response.data.data
    };
  } catch (error) {
    return {
      success: false,
      error: error.response?.data?.error || error.message
    };
  }
};

/**
 * Stage 7: Evaluate complaint SLA against real PostgreSQL timestamps
 * POST /api/complaints/:complaintId/sla/evaluate
 */
export const evaluateComplaintSla = async (complaintId, referenceTime = null) => {
  try {
    const payload = referenceTime ? { referenceTime } : {};
    const response = await api.post(`/complaints/${complaintId}/sla/evaluate`, payload);
    return {
      success: true,
      data: response.data.data
    };
  } catch (error) {
    return {
      success: false,
      error: error.response?.data?.error || error.message
    };
  }
};

/**
 * Stage 7: Fetch all configured SLA benchmark rules
 * GET /api/sla/rules
 */
export const getSlaRules = async () => {
  try {
    const response = await api.get('/sla/rules');
    return {
      success: true,
      data: response.data.data,
      total: response.data.total
    };
  } catch (error) {
    return {
      success: false,
      error: error.response?.data?.error || error.message
    };
  }
};

/**
 * Stage 7: Fetch aggregate municipal SLA overview statistics
 * GET /api/sla/overview
 */
export const getSlaOverview = async () => {
  try {
    const response = await api.get('/sla/overview');
    return {
      success: true,
      data: response.data.data
    };
  } catch (error) {
    return {
      success: false,
      error: error.response?.data?.error || error.message
    };
  }
};

/**
 * Stage 8: Fetch all notifications for a specific complaint
 * GET /api/complaints/:complaintId/notifications
 */
export const getComplaintNotifications = async (complaintId) => {
  try {
    const response = await api.get(`/complaints/${complaintId}/notifications`);
    return {
      success: true,
      data: response.data.data,
      total: response.data.total
    };
  } catch (error) {
    return {
      success: false,
      error: error.response?.data?.error || error.message
    };
  }
};

/**
 * Stage 8: Fetch unread notifications for a specific complaint
 * GET /api/complaints/:complaintId/notifications/unread
 */
export const getComplaintUnreadNotifications = async (complaintId) => {
  try {
    const response = await api.get(`/complaints/${complaintId}/notifications/unread`);
    return {
      success: true,
      data: response.data.data,
      total: response.data.total
    };
  } catch (error) {
    return {
      success: false,
      error: error.response?.data?.error || error.message
    };
  }
};

/**
 * Stage 8: Mark single notification as read
 * PATCH /api/notifications/:notificationId/read
 */
export const markNotificationRead = async (notificationId) => {
  try {
    const response = await api.patch(`/notifications/${notificationId}/read`);
    return {
      success: true,
      data: response.data.data,
      message: response.data.message
    };
  } catch (error) {
    return {
      success: false,
      error: error.response?.data?.error || error.message
    };
  }
};

/**
 * Stage 8: Mark all notifications for a complaint as read
 * PATCH /api/complaints/:complaintId/notifications/read-all
 */
export const markAllComplaintNotificationsRead = async (complaintId) => {
  try {
    const response = await api.patch(`/complaints/${complaintId}/notifications/read-all`);
    return {
      success: true,
      updatedCount: response.data.updatedCount,
      data: response.data.data
    };
  } catch (error) {
    return {
      success: false,
      error: error.response?.data?.error || error.message
    };
  }
};

/**
 * Stage 8: Fetch global unread notifications across all complaints
 * GET /api/notifications/unread
 */
export const getGlobalUnreadNotifications = async (limit = 50, offset = 0) => {
  try {
    const response = await api.get('/notifications/unread', { params: { limit, offset } });
    return {
      success: true,
      data: response.data.data,
      count: response.data.count
    };
  } catch (error) {
    return {
      success: false,
      error: error.response?.data?.error || error.message
    };
  }
};

/**
 * Stage 8: Fetch paginated notifications feed
 * GET /api/notifications
 */
export const getAllNotifications = async (limit = 50, offset = 0, isRead = null) => {
  try {
    const params = { limit, offset };
    if (isRead !== null) params.isRead = isRead;
    const response = await api.get('/notifications', { params });
    return {
      success: true,
      data: response.data.data,
      total: response.data.total
    };
  } catch (error) {
    return {
      success: false,
      error: error.response?.data?.error || error.message
    };
  }
};

/**
 * Stage 8: Mark all notifications across complaints as read
 * PATCH /api/notifications/read-all
 */
export const markAllGlobalNotificationsRead = async () => {
  try {
    const response = await api.patch('/notifications/read-all');
    return {
      success: true,
      updatedCount: response.data.updatedCount,
      data: response.data.data
    };
  } catch (error) {
    return {
      success: false,
      error: error.response?.data?.error || error.message
    };
  }
};

/**
 * Stage 9: Fetch review queue cases with status filters & search
 * GET /api/reviews
 */
export const getReviews = async (params = {}) => {
  try {
    const response = await api.get('/reviews', { params });
    return {
      success: true,
      data: response.data.data
    };
  } catch (error) {
    return {
      success: false,
      error: error.response?.data?.error || error.message
    };
  }
};

/**
 * Stage 9: Get complete review case dossier
 * GET /api/reviews/:reviewId
 */
export const getReviewDetail = async (reviewId) => {
  try {
    const response = await api.get(`/reviews/${reviewId}`);
    return {
      success: true,
      data: response.data.data
    };
  } catch (error) {
    return {
      success: false,
      error: error.response?.data?.error || error.message
    };
  }
};

/**
 * Stage 9: Start review on case
 * POST /api/reviews/:reviewId/start
 */
export const startReview = async (reviewId, reviewerName, note = '') => {
  try {
    const response = await api.post(`/reviews/${reviewId}/start`, { reviewerName, note });
    return {
      success: true,
      data: response.data.data,
      message: response.data.message
    };
  } catch (error) {
    return {
      success: false,
      error: error.response?.data?.error || error.message
    };
  }
};

/**
 * Stage 9: Resolve review case (ROUTE_TO_AUTHORITY, RETURN_TO_TRIAGE, CLOSE_REVIEW)
 * POST /api/reviews/:reviewId/resolve
 */
export const resolveReview = async (reviewId, payload) => {
  try {
    const response = await api.post(`/reviews/${reviewId}/resolve`, payload);
    return {
      success: true,
      data: response.data.data,
      message: response.data.message
    };
  } catch (error) {
    return {
      success: false,
      error: error.response?.data?.error || error.message
    };
  }
};

/**
 * Stage 9: Mark review case unroutable
 * POST /api/reviews/:reviewId/unroutable
 */
export const markReviewUnroutable = async (reviewId, reviewerName, reason) => {
  try {
    const response = await api.post(`/reviews/${reviewId}/unroutable`, { reviewerName, reason });
    return {
      success: true,
      data: response.data.data,
      message: response.data.message
    };
  } catch (error) {
    return {
      success: false,
      error: error.response?.data?.error || error.message
    };
  }
};

/**
 * Stage 9: Fetch append-only review action audit trail
 * GET /api/reviews/:reviewId/actions
 */
export const getReviewActions = async (reviewId) => {
  try {
    const response = await api.get(`/reviews/${reviewId}/actions`);
    return {
      success: true,
      data: response.data.data
    };
  } catch (error) {
    return {
      success: false,
      error: error.response?.data?.error || error.message
    };
  }
};

/**
 * Stage 9: Fetch real authorities and departments from PostgreSQL for operator assignment
 * GET /api/reviews/meta/authorities
 */
export const getReviewAuthorities = async () => {
  try {
    const response = await api.get('/reviews/meta/authorities');
    return {
      success: true,
      data: response.data.data
    };
  } catch (error) {
    return {
      success: false,
      error: error.response?.data?.error || error.message
    };
  }
};

export default api;


