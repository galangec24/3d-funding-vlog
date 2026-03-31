import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor
api.interceptors.request.use(
  (config) => {
    console.log(`📡 API Request: ${config.method.toUpperCase()} ${config.url}`);
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor
api.interceptors.response.use(
  (response) => {
    console.log(`✅ API Response: ${response.config.url}`, response.status);
    return response;
  },
  (error) => {
    console.error('❌ API Error:', error.response?.data || error.message);
    return Promise.reject(error);
  }
);

// Support Tickets API
export const supportAPI = {
  getAll: () => api.get('/api/support-tickets'),
  create: (data) => api.post('/api/support-tickets', data),
  update: (id, status) => api.put(`/api/support-tickets/${id}`, { status }),
};

// Vlogs API
export const vlogsAPI = {
  getAll: () => api.get('/api/vlogs'),
  create: (data) => api.post('/api/vlogs', data),
  delete: (id) => api.delete(`/api/vlogs/${id}`),
};

// Stats API
export const statsAPI = {
  getStats: () => api.get('/api/stats'),
};

export default api;