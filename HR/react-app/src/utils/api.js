/**
 * API Service
 * Centralized API calls with authentication
 * Performance Optimization: Caching and Request Deduplication
 */

import axios from 'axios';
import { API_URL, getCurrentApiUrl } from '../config/api.js';
import { reportApiError } from './errorTracking.js';

// API Response Cache - stores successful GET requests
// Key: cache key (URL + params), Value: { data, timestamp, expiry }
const apiCache = new Map();

// Request Deduplication - prevents duplicate concurrent requests
// Key: request key, Value: Promise
const pendingRequests = new Map();

// Cache configuration - Aggressive reduction for maximum freshness
const CACHE_TTL = {
  // Short cache (5 seconds) - for frequently changing data
  SHORT: 5 * 1000,
  // Medium cache (10 seconds) - for moderately changing data
  MEDIUM: 10 * 1000,
  // Long cache (30 seconds) - for rarely changing data
  LONG: 30 * 1000,
  // Very long cache (1 minute) - for static data
  VERY_LONG: 60 * 1000,
  // No cache (0) - for real-time data that must always be fresh
  NONE: 0,
};

// Generate cache key from request config
const getCacheKey = (config) => {
  const url = config.url || '';
  const params = config.params ? JSON.stringify(config.params) : '';
  const method = config.method || 'get';
  return `${method.toUpperCase()}:${url}:${params}`;
};

// Generate request deduplication key
const getRequestKey = (config) => {
  return getCacheKey(config);
};

/**
 * Detect if an error is a backend/database connection error
 * @param {Error} error - The error object
 * @returns {boolean} - True if this is a backend/database error
 */
const detectBackendError = (error) => {
  // Check error code and errno for connection errors
  const code = error.code || '';
  const errno = error.errno || '';
  const message = (error.message || '').toLowerCase();

  // Connection closed errors (CONNECTION_CLOSED)
  if (
    code === 'CONNECTION_CLOSED' ||
    errno === 'CONNECTION_CLOSED' ||
    message.includes('connection_closed') ||
    message.includes('connection closed')
  ) {
    return true;
  }

  // Network errors (no response from server)
  if (!error.response) {
    // Connection refused, timeout, or network errors
    if (
      code === 'ECONNREFUSED' ||
      code === 'ETIMEDOUT' ||
      code === 'ENOTFOUND' ||
      code === 'ECONNRESET' ||
      message.includes('network error') ||
      message.includes('connection') ||
      message.includes('timeout')
    ) {
      return true;
    }
  }

  // HTTP 500 errors with database-related messages
  if (error.response?.status === 500) {
    const errorMessage = (
      error.response?.data?.message ||
      error.response?.data?.error ||
      error.message ||
      ''
    ).toLowerCase();

    // Database connection errors
    if (
      errorMessage.includes('remaining connection slots') ||
      errorMessage.includes('connection slots') ||
      errorMessage.includes('database') ||
      errorMessage.includes('postgres') ||
      errorMessage.includes('connection') ||
      errorMessage.includes('connection_closed') ||
      errorMessage.includes('connection closed') ||
      errorMessage.includes('53300') || // PostgreSQL error code for connection limit
      errorMessage.includes('too many connections')
    ) {
      return true;
    }
  }

  // HTTP 503 Service Unavailable
  if (error.response?.status === 503) {
    return true;
  }

  return false;
};

// Check if cache entry is still valid
const isCacheValid = (cacheEntry) => {
  if (!cacheEntry) return false;
  return Date.now() < cacheEntry.timestamp + cacheEntry.expiry;
};

// Get cache TTL based on endpoint
// Dashboard and notification endpoints have NO CACHE for maximum freshness
const getCacheTTL = (url) => {
  // Bus Transportation - NO CACHE (uploads/saves must reflect immediately)
  if (url.includes('/api/bus-transportation')) {
    return CACHE_TTL.NONE;
  }

  // Dashboard-related endpoints - NO CACHE (must always be fresh)
  if (url.includes('/api/branch-statistics')) {
    return CACHE_TTL.NONE; // Statistics must be real-time
  }
  if (url.includes('/api/notifications')) {
    return CACHE_TTL.NONE; // Notifications must be real-time
  }

  // Attendance period status endpoints - NO CACHE (must reflect manual-open immediately)
  if (url.includes('/api/attendance-periods/check') || url.includes('/api/attendance-periods/check-current')) {
    return CACHE_TTL.NONE; // Status must be real-time to reflect manual-open changes
  }

  // Payroll absences - must always reflect manual open/close immediately
  if (url.includes('/api/payroll-absences')) {
    return CACHE_TTL.NONE;
  }

  // Employee data - short cache (changes frequently, but allow minimal caching)
  if (url.includes('/api/employees')) {
    return CACHE_TTL.SHORT; // 5 seconds
  }

  // Documents - short cache
  if (url.includes('/api/documents') || url.includes('/api/branch-documents')) {
    return CACHE_TTL.SHORT; // 5 seconds
  }

  // Branches - medium cache (reduced from very long)
  if (url.includes('/api/branches')) {
    return CACHE_TTL.MEDIUM; // 10 seconds
  }

  // User data - medium cache
  if (url.includes('/api/users')) {
    return CACHE_TTL.MEDIUM; // 10 seconds
  }

  // Default - short cache for maximum freshness
  return CACHE_TTL.SHORT;
};

// Clear cache for specific endpoint pattern
export const clearCache = (pattern) => {
  if (!pattern) {
    // Clear all cache
    apiCache.clear();
    return;
  }
  // Clear cache entries matching pattern
  for (const [key] of apiCache) {
    if (key.includes(pattern)) {
      apiCache.delete(key);
    }
  }
};

// Clear cache on mutations (POST, PUT, DELETE)
// Aggressively clear dashboard-related cache to ensure data freshness
const clearRelatedCache = (url) => {
  // Always clear dashboard-related endpoints after any mutation
  const dashboardEndpoints = [
    '/api/branch-statistics',
    '/api/notifications',
    '/api/employees', // Dashboard shows employee data
  ];

  // Clear related cache entries when data is modified
  if (url.includes('/api/bus-transportation')) {
    clearCache('/api/bus-transportation');
    // bus cards can depend on branches/terms display too
    clearCache('/api/branches');
    clearCache('/api/terms');
    return;
  }

  if (url.includes('/api/employees')) {
    clearCache('/api/employees');
    // Clear all dashboard endpoints
    dashboardEndpoints.forEach(endpoint => clearCache(endpoint));
  } else if (url.includes('/api/branches')) {
    clearCache('/api/branches');
    // Branch changes affect statistics and dashboard
    clearCache('/api/branch-statistics');
    clearCache('/api/employees'); // Employee completion status may change
  } else if (url.includes('/api/documents')) {
    clearCache('/api/documents');
    clearCache('/api/employees'); // Employee completion status may change
    clearCache('/api/branch-statistics'); // Statistics depend on documents
  } else if (url.includes('/api/branch-documents')) {
    clearCache('/api/branch-documents');
    clearCache('/api/branch-statistics'); // Statistics may depend on branch documents
  } else if (url.includes('/api/notifications')) {
    clearCache('/api/notifications');
    // Notifications are already no-cache, but clear anyway
  } else if (url.includes('/api/users')) {
    clearCache('/api/users');
  } else {
    // For any other mutation, clear dashboard endpoints to be safe
    dashboardEndpoints.forEach(endpoint => clearCache(endpoint));
  }
};

// Document-to-branch mapping (metadata only, not sensitive)
const documentBranchMapping = new Map();

// Functions to manage document-to-branch mapping
export const setDocumentBranchMapping = (documentId, branchId) => {
  documentBranchMapping.set(documentId, branchId);
};

export const getDocumentBranchMapping = (documentId) => {
  return documentBranchMapping.get(documentId);
};

// Create axios instance with dynamic baseURL
const api = axios.create({
  baseURL: getCurrentApiUrl(),
  headers: {
    'Content-Type': 'application/json',
  },
});

// Update baseURL when it changes (for localhost fallback)
const updateApiBaseUrl = () => {
  api.defaults.baseURL = getCurrentApiUrl();
};

// Add token to requests if available; block protected requests if no token
api.interceptors.request.use(
  async (config) => {
    const requestStartTime = performance.now();
    const url = config.url || '';
    const method = (config.method || 'get').toUpperCase();


    const token = localStorage.getItem('token');
    const publicPaths = ['/api/auth/login', '/api/auth/me'];

    if (!token && !publicPaths.some(p => url.includes(p))) {
      return Promise.reject(new axios.Cancel('No token available'));
    }

    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }

    // Request Deduplication and Caching for GET requests
    const methodLower = method.toLowerCase();
    if (methodLower === 'get') {
      const requestKey = getRequestKey(config);
      const cacheTTL = getCacheTTL(url);

      // Skip caching entirely for endpoints with CACHE_TTL.NONE (dashboard/notifications)
      const shouldCache = cacheTTL !== CACHE_TTL.NONE;

      // Check cache only if caching is enabled for this endpoint
      if (shouldCache) {
        const cacheKey = getCacheKey(config);
        const cacheEntry = apiCache.get(cacheKey);
        if (cacheEntry && isCacheValid(cacheEntry)) {
          // Attach cached response to config
          config.__isCached = true;
          config.__cachedResponse = cacheEntry.data;
          config.__requestStartTime = requestStartTime;
          return config;
        }
      }

      // Store start time for timing
      config.__requestStartTime = requestStartTime;
    }

    return config;
  },
  (error) => Promise.reject(error)
);

// Handle 401 errors (unauthorized) and cache successful responses
api.interceptors.response.use(
  (response) => {
    const config = response.config;
    const url = config?.url || '';
    const method = (config?.method || 'get').toUpperCase();

    // Handle cached response
    if (config?.__isCached) {
      return config.__cachedResponse;
    }

    // Cache successful GET requests (only if caching is enabled for this endpoint)
    const methodLower = method.toLowerCase();

    if (methodLower === 'get' && response.status === 200) {
      const cacheTTL = getCacheTTL(url);

      // Only cache if TTL is not NONE (dashboard/notifications should never be cached)
      if (cacheTTL !== CACHE_TTL.NONE) {
        const cacheKey = getCacheKey(config);

        apiCache.set(cacheKey, {
          data: response,
          timestamp: Date.now(),
          expiry: cacheTTL,
        });

        // Clean up old cache entries periodically (keep cache size manageable)
        if (apiCache.size > 100) {
          // Remove expired entries
          for (const [key, entry] of apiCache.entries()) {
            if (!isCacheValid(entry)) {
              apiCache.delete(key);
            }
          }
        }
      }
    }

    // Clear related cache on successful mutations
    if (config && ['post', 'put', 'delete', 'patch'].includes(methodLower)) {
      clearRelatedCache(url);
    }

    return response;
  },
  (error) => {
    const config = error.config;
    const url = config?.url || '';
    const method = (config?.method || 'get').toUpperCase();

    // No auto-switching - if connection fails, show the error
    // To switch environments, change API_CONFIG.CURRENT in config/api.js

    // Detect backend/database connection errors
    const isBackendError = detectBackendError(error);

    if (isBackendError) {
      // Console log full error details for debugging
      console.error('[API] Backend/Database Connection Error:', {
        url: url,
        method: method,
        message: error.message,
        code: error.code,
        name: error.name,
        response: error.response ? {
          status: error.response.status,
          statusText: error.response.statusText,
          data: error.response.data,
        } : null,
      });

      // Report critical error via email notification
      reportApiError(error, config);

      // Set backend error state via global function (set by BackendErrorProvider)
      if (window.setBackendError) {
        window.setBackendError(error);
      }

      // Don't show individual error notifications for backend errors (prevent spam)
      // The maintenance page will be shown instead
      return Promise.reject(error);
    }

    // Report server errors (500+) that aren't backend connection issues
    if (error.response?.status >= 500) {
      reportApiError(error, config);

      // Show friendly server error notification to user
      if (window.__showServerError) {
        window.__showServerError(error.message);
      }
    }

    // Only redirect to login for authentication-related 401 errors
    if (error.response?.status === 401) {
      const errorMessage = error.response?.data?.message || '';

      // Check if this is an authentication error
      const isAuthError =
        errorMessage.includes('token') ||
        errorMessage.includes('Token') ||
        errorMessage.includes('Authentication required') ||
        errorMessage.includes('Authentication failed') ||
        errorMessage.includes('Invalid token') ||
        errorMessage.includes('Token has expired') ||
        errorMessage.includes('Please login');

      // Only redirect if it's an authentication error
      if (isAuthError) {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

// Auth API
export const authAPI = {
  login: (username, password) =>
    api.post('/api/auth/login', { username, password }),

  logout: () =>
    api.post('/api/auth/logout'),

  getMe: () =>
    api.get('/api/auth/me'),
};

// Users API
export const usersAPI = {
  getAll: (filters = {}) =>
    api.get('/api/users', { params: filters }),

  getById: (id) =>
    api.get(`/api/users/${id}`),

  create: (data) =>
    api.post('/api/users', data),

  update: (id, data) =>
    api.put(`/api/users/${id}`, data),

  delete: (id) =>
    api.delete(`/api/users/${id}`),
};

// Branches API
export const branchesAPI = {
  getAll: (filters = {}) =>
    api.get('/api/branches', { params: filters }),

  getById: (id) =>
    api.get(`/api/branches/${id}`),

  create: (data) =>
    api.post('/api/branches', data),

  update: (id, data) =>
    api.put(`/api/branches/${id}`, data),

  updateMyBranch: (data) =>
    api.put('/api/branches/my-branch', data),

  delete: (id) =>
    api.delete(`/api/branches/${id}`),
};

// Employees API
export const employeesAPI = {
  getAll: (filters = {}) =>
    api.get('/api/employees', { params: filters }),

  // Server-side pagination - optimized for large datasets
  getPaginated: (params = {}) =>
    api.get('/api/employees/paginated', { params }),

  getById: (id) =>
    api.get(`/api/employees/${id}`),

  checkDuplicate: (data) =>
    api.post('/api/employees/check-duplicate', data),

  linkToBranch: (data) =>
    api.post('/api/employees/link-to-branch', data),

  transfer: (id, data) =>
    api.put(`/api/employees/${id}/transfer`, data),

  getLinkedBranches: (id) =>
    api.get(`/api/employees/${id}/branches`),

  unlinkFromBranch: (employeeId, branchId) =>
    api.delete(`/api/employees/${employeeId}/branches/${branchId}`),

  create: (data) =>
    api.post('/api/employees', data),

  update: (id, data) =>
    api.put(`/api/employees/${id}`, data),

  delete: (id, data = {}) =>
    api.delete(`/api/employees/${id}`, { data }),

  getDocuments: (id, filters = {}) =>
    api.get(`/api/employees/${id}/documents`, { params: filters }),

  getMissingData: (id) =>
    api.get(`/api/employees/${id}/missing-data`),

  updateCompletionStatus: (id) =>
    api.post(`/api/employees/${id}/update-completion-status`),

  generateEmployeeFile: (data, config = {}) =>
    api.post('/api/employee-file/generate', data, {
      ...config,
      responseType: config.responseType || 'blob',
    }),

  generateSingleEmployeeFile: (employeeId, config = {}) => {
    const { branch_id, ...restConfig } = config;
    const params = branch_id ? { branch_id } : {};
    return api.post(`/api/employee-file/generate-single/${employeeId}`, {}, {
      ...restConfig,
      params,
      responseType: config.responseType || 'blob',
    });
  },

  updateStatus: (id, data) =>
    api.put(`/api/employees/${id}/status`, data),

  renew: (id) =>
    api.post(`/api/employees/${id}/renew`),

  nonRenewal: (id, data) =>
    api.post(`/api/employees/${id}/non-renewal`, data),

  getDuplicates: () =>
    api.get('/api/employees/duplicates'),

  mergeDuplicates: (canonicalId, duplicateIds = []) =>
    api.post('/api/employees/merge-duplicates', {
      canonical_id: canonicalId,
      duplicate_ids: duplicateIds
    }),

  getDuplicateDocuments: (params = {}) =>
    api.get('/api/employees/duplicate-documents', { params }),

  mergeDuplicateDocuments: (employeeId, documentType, keepId) =>
    api.post('/api/employees/merge-duplicate-documents', {
      employee_id: employeeId,
      document_type: documentType,
      keep_id: keepId
    }),

  getPaperContractInsurance: (docType = 'تأمين طبي') =>
    api.get('/api/employees/paper-contract-insurance', { params: { doc_type: docType } }),

  deletePaperContractInsurance: (employeeIds = [], docType = 'تأمين طبي') =>
    api.post('/api/employees/paper-contract-insurance/delete', {
      employee_ids: employeeIds,
      doc_type: docType
    }),

  getMissingRequiredData: (params = {}) =>
    api.get('/api/employees/missing-required-data', { params }),

  saveMissingRequiredData: (data, config = {}) =>
    api.post('/api/employees/missing-required-data', data, config),

  getStatistics: (filters = {}) =>
    api.get('/api/employees/statistics', { params: filters }),

  generateStatisticsPDF: (data, config = {}) =>
    api.post('/api/employees/statistics/generate-pdf', data, {
      ...config,
      responseType: config.responseType || 'blob',
    }),

  generateCertificate: (data, config = {}) =>
    api.post('/api/employees/certificates/generate', data, {
      ...config,
      responseType: config.responseType || 'blob',
    }),
};

// Students API
export const studentsAPI = {
  generatePDF: (data, config = {}) =>
    api.post('/api/students/generate-pdf', data, {
      ...config,
      responseType: config.responseType || 'blob',
    }),

  getByBranch: (branchId, filters = {}) =>
    api.get(`/api/students/branch/${branchId}`, { params: filters }),
};

// Documents API
export const documentsAPI = {
  getAll: (filters = {}) => {
    // Remove null/undefined values from filters
    const cleanFilters = Object.entries(filters).reduce((acc, [key, value]) => {
      if (value !== null && value !== undefined && value !== '') {
        acc[key] = value;
      }
      return acc;
    }, {});
    return api.get('/api/documents', { params: cleanFilters });
  },

  getById: (id) =>
    api.get(`/api/documents/${id}`),

  upload: (formData) =>
    api.post('/api/documents', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }),

  download: (id) =>
    api.get(`/api/documents/${id}/download`, { responseType: 'blob' }),

  preview: (id) =>
    api.get(`/api/documents/${id}/preview`),

  update: (id, data) =>
    api.put(`/api/documents/${id}`, data),

  verify: (id) =>
    api.post(`/api/documents/${id}/verify`),

  delete: (id, deleteFile = false) =>
    api.delete(`/api/documents/${id}`, { params: { deleteFile } }),

  search: (searchTerm, employeeId = null) =>
    api.get('/api/documents', {
      params: { search: searchTerm, employee_id: employeeId }
    }),

  getExpiring: (days = 30) =>
    api.get('/api/documents', { params: { expiring: true, days } }),

  getUnverified: (employeeId = null) =>
    api.get('/api/documents', {
      params: { unverified: true, employee_id: employeeId }
    }),

  getByEmployeeId: (employeeId) =>
    api.get(`/api/employees/${employeeId}/documents`),
};

// Branch Documents API
export const branchDocumentsAPI = {
  getAll: (filters = {}) => {
    const cleanFilters = Object.entries(filters).reduce((acc, [key, value]) => {
      if (value !== null && value !== undefined && value !== '') {
        acc[key] = value;
      }
      return acc;
    }, {});
    return api.get('/api/branch-documents', { params: cleanFilters });
  },

  getById: (id) =>
    api.get(`/api/branch-documents/${id}`),

  upload: (formData) =>
    api.post('/api/branch-documents', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }),

  download: (id) =>
    api.get(`/api/branch-documents/${id}/download`, { responseType: 'blob' }),

  preview: (id) =>
    api.get(`/api/branch-documents/${id}/preview`),

  update: (id, data) =>
    api.put(`/api/branch-documents/${id}`, data),

  updateWithFile: (id, formData) =>
    api.put(`/api/branch-documents/${id}`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }),

  verify: (id) =>
    api.post(`/api/branch-documents/${id}/verify`),

  delete: (id) =>
    api.delete(`/api/branch-documents/${id}`),

  generatePayrollReport: (data) =>
    api.post('/api/branch-documents/generate-payroll-report', data, {
      responseType: 'blob'
    }),
};

// Reports API
export const reportsAPI = {
  generate: (data, config = {}) =>
    api.post('/api/reports/generate', data, {
      ...config,
      responseType: config.responseType || 'blob',
    }),

  preview: (filename) =>
    api.get(`/api/reports/preview/${filename}`, { responseType: 'blob' }),
};

// Notifications API
export const notificationsAPI = {
  // Main Manager APIs
  getAll: (filters = {}) =>
    api.get('/api/notifications', { params: filters }),

  getById: (id) =>
    api.get(`/api/notifications/${id}`),

  create: (data) => {
    // If data is FormData, set proper headers
    if (data instanceof FormData) {
      return api.post('/api/notifications', data, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });
    }
    return api.post('/api/notifications', data);
  },

  update: (id, data) =>
    api.put(`/api/notifications/${id}`, data),

  delete: (id) =>
    api.delete(`/api/notifications/${id}`),

  toggleActive: (id) =>
    api.patch(`/api/notifications/${id}/toggle-active`),

  markViewed: (id) =>
    api.post(`/api/notifications/${id}/mark-viewed`),

  // Branch Manager APIs
  getMyBranchNotifications: (filters = {}) =>
    api.get('/api/notifications/my-branch/notifications', { params: filters }),

  getBranchNotifications: (branchId, filters = {}) =>
    api.get(`/api/notifications/branch/${branchId}`, { params: filters }),

  respond: (notificationId, data) =>
    api.post(`/api/notifications/${notificationId}/respond`, data),
};

// Terms API
export const termsAPI = {
  getAll: (filters = {}) =>
    api.get('/api/terms', { params: filters }),

  getById: (id) =>
    api.get(`/api/terms/${id}`),

  create: (data) =>
    api.post('/api/terms', data),

  createAcademicYear: (data) =>
    api.post('/api/terms/create-academic-year', data),

  update: (id, data) =>
    api.put(`/api/terms/${id}`, data),

  delete: (id) =>
    api.delete(`/api/terms/${id}`),

  getCurrent: (branchType) =>
    api.get(`/api/terms/current/${branchType}`),
};

// Academic Years API
export const academicYearsAPI = {
  getAll: (filters = {}) =>
    api.get('/api/academic-years', { params: filters }),

  getById: (id) =>
    api.get(`/api/academic-years/${id}`),

  getCurrent: (branchType) =>
    api.get(`/api/academic-years/current/${branchType}`),

  create: (data) =>
    api.post('/api/academic-years', data),

  update: (id, data) =>
    api.put(`/api/academic-years/${id}`, data),

  endYear: (yearId, branchType) =>
    api.post(`/api/academic-years/${yearId}/end-year`, { branch_type: branchType }),

  completeYear: (id) =>
    api.post(`/api/academic-years/${id}/complete`),
};

// Archive API
export const archiveAPI = {
  getAll: (filters = {}) =>
    api.get('/api/archive', { params: filters }),

  getById: (id) =>
    api.get(`/api/archive/${id}`),

  getStatistics: (filters = {}) =>
    api.get('/api/archive/statistics', { params: filters }),

  updateStatus: (id, data) =>
    api.put(`/api/archive/${id}/status`, data),

  restore: (id, data) =>
    api.post(`/api/archive/${id}/restore`, data),

  permanentDelete: (id) =>
    api.delete(`/api/archive/${id}`),

  getArchivedBranchDocuments: (filters = {}) =>
    api.get('/api/archive/branch-documents/all', { params: filters }),

  getArchivedBranchDocumentById: (id) =>
    api.get(`/api/archive/branch-documents/${id}`),

  getArchivedEmployeeDocuments: (filters = {}) =>
    api.get('/api/archive/employee-documents/all', { params: filters }),

  permanentDeleteEmployeeDocument: (id) =>
    api.delete(`/api/archive/employee-documents/${id}`),

  export: (filters = {}, format = 'excel') =>
    api.get('/api/archive/export', {
      params: { ...filters, format },
      responseType: format === 'csv' ? 'blob' : 'arraybuffer'
    }),
};

// Branch Statistics API
export const branchStatisticsAPI = {
  getAll: () =>
    api.get('/api/branch-statistics'),

  generatePerformanceReport: async (data) => {
    try {
      return await api.post('/api/branch-statistics/performance-report', data, {
        responseType: 'blob'
      });
    } catch (error) {
      // When responseType is 'blob', axios converts error responses to blobs too
      // We need to check if the error response is actually JSON wrapped in a blob
      if (error.response && error.response.data instanceof Blob) {
        try {
          const text = await error.response.data.text();
          const jsonError = JSON.parse(text);
          // Replace blob with parsed JSON
          error.response.data = jsonError;
        } catch (parseError) {
          // If parsing fails, it's a real blob error, keep it as is
          console.error('Failed to parse error blob:', parseError);
        }
      }
      throw error;
    }
  },
};

// Dashboard API (lightweight cached summary)
export const dashboardAPI = {
  getSummary: (params = {}) =>
    api.get('/api/dashboard/summary', { params }),
};

// Utils API
export const utilsAPI = {
  convertDate: (date, calendarType, dateType = 'general') =>
    api.post('/api/utils/convert-date', {
      date,
      calendar_type: calendarType,
      date_type: dateType
    }),
};

// Admin API
export const adminAPI = {
  getEmployeesWithMissingDates: (limit = 100, offset = 0) =>
    api.get('/api/admin/employees-missing-dates', {
      params: { limit, offset }
    }),

  getEmployeesWithInvalidData: (limit = 100, offset = 0) =>
    api.get('/api/admin/employees-invalid-data', {
      params: { limit, offset }
    }),

  fixEmployeeDate: (employeeId, action) =>
    api.post('/api/admin/fix-employee-date', {
      employee_id: employeeId,
      action
    }),

  notifyBranchInvalidData: (employeeId) =>
    api.post('/api/admin/notify-branch-invalid-data', {
      employee_id: employeeId
    }),

  recalculateBranch: (data) =>
    api.post('/api/admin/recalculate-branch', data),

  batchFixAllEmployeeDates: (options = {}) =>
    api.post('/api/admin/fix-all-employee-dates', options),

  getBranchDocumentsDateStatus: () =>
    api.get('/api/admin/branch-documents/date-status'),

  getBranchDocumentsAbnormalDates: () =>
    api.get('/api/admin/branch-documents/abnormal-dates'),

  convertBranchDocumentDates: (docId, options = {}) =>
    api.post(`/api/admin/branch-documents/${docId}/convert-dates`, options),

  updateBranchDocumentDates: (docId, dates) =>
    api.put(`/api/admin/branch-documents/${docId}/dates`, dates),
};

// Requests API

export const requestsAPI = {
  getAll: (filters = {}) => {
    const cleanFilters = Object.entries(filters).reduce((acc, [key, value]) => {
      if (value !== null && value !== undefined && value !== '') {
        acc[key] = value;
      }
      return acc;
    }, {});
    return api.get('/api/requests', { params: cleanFilters });
  },

  getById: (id) =>
    api.get(`/api/requests/${id}`),

  getMainManagers: () =>
    api.get('/api/requests/main-managers'),

  create: (formData) =>
    api.post('/api/requests', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }),


  respond: (id, formData) =>
    api.put(`/api/requests/${id}/respond`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }),

  delete: (id) =>
    api.delete(`/api/requests/${id}`),
};

// Payroll Absence API
export const payrollAbsenceAPI = {
  getBranchState: (params = {}) =>
    api.get('/api/payroll-absences/branch/state', { params }),

  submitBranch: (data) =>
    api.post('/api/payroll-absences/branch/submit', data),

  getCycles: () =>
    api.get('/api/payroll-absences/admin/cycles'),

  getBranches: (cycleId) =>
    api.get(`/api/payroll-absences/admin/cycles/${cycleId}/branches`),

  getBranchEntries: (cycleId, branchId) =>
    api.get(`/api/payroll-absences/admin/cycles/${cycleId}/branches/${branchId}/entries`),

  reopenBranches: (data) =>
    api.post('/api/payroll-absences/admin/reopen', data),

  closeBranches: (data) =>
    api.post('/api/payroll-absences/admin/close', data),

  resetCycle: (data) =>
    api.post('/api/payroll-absences/admin/reset', data),

  exportBranches: (data) =>
    api.post('/api/payroll-absences/admin/export', data, { responseType: 'blob' }),
};

// Bus Transportation API
export const busTransportationAPI = {
  generatePDF: (data, config = {}) =>
    api.post('/api/bus-transportation/generate-pdf', data, {
      ...config,
      responseType: config.responseType || 'blob',
    }),

  getAll: (params = {}) =>
    api.get('/api/bus-transportation', { params }),

  getById: (id) =>
    api.get(`/api/bus-transportation/${id}`),

  create: (data) =>
    api.post('/api/bus-transportation', data),

  update: (id, data) =>
    api.put(`/api/bus-transportation/${id}`, data),

  delete: (id) =>
    api.delete(`/api/bus-transportation/${id}`),

  // Registration
  saveRegistration: (id, data) =>
    api.post(`/api/bus-transportation/${id}/registration`, data),

  uploadRegistrationDocument: (id, file) => {
    const formData = new FormData();
    formData.append('file', file);
    return api.post(`/api/bus-transportation/${id}/registration/upload`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    });
  },

  // Driver License
  saveDriverLicense: (id, data) =>
    api.post(`/api/bus-transportation/${id}/driver-license`, data),

  uploadDriverLicenseDocument: (id, file) => {
    const formData = new FormData();
    formData.append('file', file);
    return api.post(`/api/bus-transportation/${id}/driver-license/upload`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    });
  },

  // Lease Contract (for leased buses)
  uploadLeaseContractDocument: (id, file) => {
    const formData = new FormData();
    formData.append('file', file);
    return api.post(`/api/bus-transportation/${id}/lease-contract/upload`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    });
  },

  // License Plates
  addLicensePlate: (id, data) =>
    api.post(`/api/bus-transportation/${id}/license-plates`, data),

  updateLicensePlate: (id, plateId, data) =>
    api.put(`/api/bus-transportation/${id}/license-plates/${plateId}`, data),

  deleteLicensePlate: (id, plateId) =>
    api.delete(`/api/bus-transportation/${id}/license-plates/${plateId}`),

  // Bus Details
  saveDetails: (id, data) =>
    api.post(`/api/bus-transportation/${id}/details`, data),

  // Students
  getStudents: (id, params = {}) =>
    api.get(`/api/bus-transportation/${id}/students`, { params }),

  addStudent: (id, data) =>
    api.post(`/api/bus-transportation/${id}/students`, data),

  updateStudent: (id, studentId, data) =>
    api.put(`/api/bus-transportation/${id}/students/${studentId}`, data),

  deleteStudent: (id, studentId) =>
    api.delete(`/api/bus-transportation/${id}/students/${studentId}`),
};

export const busTransportationReportAPI = {
  generatePDF: (data, config = {}) =>
    api.post('/api/bus-transportation-report/generate-pdf', data, {
      ...config,
      responseType: config.responseType || 'blob',
    }),
};

// Beneficiaries API (المستفيدين)
export const beneficiariesAPI = {
  getAll: (params = {}) =>
    api.get('/api/beneficiaries', { params }),

  getById: (id) =>
    api.get(`/api/beneficiaries/${id}`),

  create: (data) =>
    api.post('/api/beneficiaries', data),

  update: (id, data) =>
    api.put(`/api/beneficiaries/${id}`, data),

  delete: (id) =>
    api.delete(`/api/beneficiaries/${id}`),

  getStats: (params = {}) =>
    api.get('/api/beneficiaries/stats', { params }),

  getBranchStats: (params = {}) =>
    api.get('/api/beneficiaries/stats/branch', { params }),

  getSubmissionStatus: (params = {}) =>
    api.get('/api/beneficiaries/submission-status', { params }),

  getActiveTerm: () =>
    api.get('/api/beneficiaries/active-term'),

  getTermsWithData: () =>
    api.get('/api/beneficiaries/terms'),

  exportExcel: (params = {}) =>
    api.get('/api/beneficiaries/export', { params, responseType: 'blob' }),

  getArchive: (params = {}) =>
    api.get('/api/beneficiaries/archive', { params }),

  archiveTerm: (termId) =>
    api.post(`/api/beneficiaries/archive/${termId}`),

  copyFromTerm: (data) =>
    api.post('/api/beneficiaries/copy-from-term', data),

  getBusStudents: (params = {}) =>
    api.get('/api/beneficiaries/bus-students', { params }),

  getAvailableBuses: (params = {}) =>
    api.get('/api/beneficiaries/available-buses', { params }),

  assignToBus: (id, data) =>
    api.post(`/api/beneficiaries/${id}/assign-bus`, data),

  getStaffingRequirements: (params = {}) =>
    api.get('/api/beneficiaries/staffing-requirements', { params }),

  getBranchCount: () =>
    api.get('/api/beneficiaries/branch-count'),
};

// Suggestions API
export const suggestionsAPI = {
  // Get options (importance levels, status options)
  getOptions: () =>
    api.get('/api/suggestions/options'),

  // Get statistics (Main Manager only)
  getStats: () =>
    api.get('/api/suggestions/stats'),

  // Get all suggestions with optional filters
  getAll: (params = {}) =>
    api.get('/api/suggestions', { params }),

  // Get suggestion by ID
  getById: (id) =>
    api.get(`/api/suggestions/${id}`),

  // Create new suggestion
  create: (data) =>
    api.post('/api/suggestions', data),

  // Update suggestion
  update: (id, data) =>
    api.put(`/api/suggestions/${id}`, data),

  // Delete suggestion
  delete: (id) =>
    api.delete(`/api/suggestions/${id}`),
};


export default api;

