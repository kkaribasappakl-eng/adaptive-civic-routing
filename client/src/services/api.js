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
 * GET /api/gis/test?lat=...&lng=...
 */
export const testGisCoordinates = async (lat, lng) => {
  try {
    const response = await api.get('/gis/test', {
      params: { lat, lng }
    });
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

export default api;
