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

export default api;
