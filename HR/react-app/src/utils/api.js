/**
 * API Service
 * Centralized API calls with authentication
 */

import axios from 'axios';
import { API_URL } from '../config/api.js';

// In-memory storage for branch documents passwords (not persistent, cleared on page reload)
// Key: branchId, Value: password
const branchDocumentsPasswords = new Map();

// Document-to-branch mapping (metadata only, not sensitive)
const documentBranchMapping = new Map();

// Functions to manage branch documents passwords
export const setBranchDocumentsPassword = (branchId, password) => {
  branchDocumentsPasswords.set(branchId, password);
};

export const getBranchDocumentsPassword = (branchId) => {
  return branchDocumentsPasswords.get(branchId);
};

export const clearBranchDocumentsPassword = (branchId) => {
  branchDocumentsPasswords.delete(branchId);
};

export const clearAllBranchDocumentsPasswords = () => {
  branchDocumentsPasswords.clear();
};

// Functions to manage document-to-branch mapping
export const setDocumentBranchMapping = (documentId, branchId) => {
  documentBranchMapping.set(documentId, branchId);
};

export const getDocumentBranchMapping = (documentId) => {
  return documentBranchMapping.get(documentId);
};

// Create axios instance
const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Helper function to extract branch ID from request config
const extractBranchId = (config) => {
  // Check query params
  if (config.params?.branch_id) {
    return config.params.branch_id;
  }
  
  // Check URL path params (e.g., /api/branch-documents/:id)
  const urlMatch = config.url?.match(/\/api\/branch-documents\/(\d+)/);
  if (urlMatch) {
    const documentId = urlMatch[1];
    const branchId = getDocumentBranchMapping(documentId);
    if (branchId) return branchId;
    
    // Fallback: use first available password (assuming single branch access)
    if (branchDocumentsPasswords.size > 0) {
      return branchDocumentsPasswords.keys().next().value;
    }
  }
  
  // Check request data (for POST/PUT)
  if (config.data) {
    if (config.data instanceof FormData) {
      return config.data.get('branch_id');
    }
    // Handle JSON stringified data (axios may stringify before interceptor)
    if (typeof config.data === 'string') {
      try {
        const parsed = JSON.parse(config.data);
        if (parsed.branch_id) {
          return parsed.branch_id;
        }
      } catch (e) {
        // Not JSON, continue
      }
    }
    // Handle object data (most common case)
    if (typeof config.data === 'object' && config.data !== null) {
      if (config.data.branch_id) {
        return config.data.branch_id;
      }
    }
  }
  
  // For reports API, try to get branch_id from URL query if available
  if (config.url?.includes('/api/reports')) {
    const url = new URL(config.url, window.location.origin);
    const branchIdParam = url.searchParams.get('branch_id');
    if (branchIdParam) {
      return branchIdParam;
    }
  }
  
  // Fallback: use first available password (assuming single branch access)
  if (branchDocumentsPasswords.size > 0) {
    return branchDocumentsPasswords.keys().next().value;
  }
  
  return null;
};

// Helper function to get password for branch documents API calls
const getPasswordForRequest = (branchId) => {
  if (branchId) {
    return getBranchDocumentsPassword(branchId);
  }
  // Fallback: try to get password for any verified branch
  if (branchDocumentsPasswords.size > 0) {
    const firstBranchId = branchDocumentsPasswords.keys().next().value;
    return getBranchDocumentsPassword(firstBranchId);
  }
  return null;
};

// Add token to requests if available
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    
    // Add branch documents password for branch documents and reports API calls
    if (config.url?.includes('/api/branch-documents') || config.url?.includes('/api/reports')) {
      const branchId = extractBranchId(config);
      const password = getPasswordForRequest(branchId);
      if (password) {
        config.headers['X-Branch-Documents-Password'] = password;
      }
    }
    
    return config;
  },
  (error) => Promise.reject(error)
);

// Handle 401 errors (unauthorized)
api.interceptors.response.use(
  (response) => response,
  (error) => {
    // Only redirect to login for authentication-related 401 errors
    // Don't redirect for business logic 401 errors (e.g., invalid branch documents password)
    if (error.response?.status === 401) {
      const url = error.config?.url || '';
      const errorMessage = error.response?.data?.message || '';
      
      // Check if this is a business logic error (not authentication error)
      const isBusinessLogicError = 
        errorMessage.includes('password') ||
        errorMessage.includes('Password') ||
        errorMessage.includes('Branch documents password') ||
        errorMessage.includes('Invalid branch documents password') ||
        url.includes('/branch-documents/verify-password');
      
      // Check if this is an authentication error
      const isAuthError = 
        errorMessage.includes('token') ||
        errorMessage.includes('Token') ||
        errorMessage.includes('Authentication required') ||
        errorMessage.includes('Authentication failed') ||
        errorMessage.includes('Invalid token') ||
        errorMessage.includes('Token has expired') ||
        errorMessage.includes('Please login');
      
      // Only redirect if it's an authentication error, not a business logic error
      if (isAuthError && !isBusinessLogicError) {
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
  
  delete: (id) => 
    api.delete(`/api/branches/${id}`),
};

// Employees API
export const employeesAPI = {
  getAll: (filters = {}) => 
    api.get('/api/employees', { params: filters }),
  
  getById: (id) => 
    api.get(`/api/employees/${id}`),
  
  create: (data) => 
    api.post('/api/employees', data),
  
  update: (id, data) => 
    api.put(`/api/employees/${id}`, data),
  
  delete: (id) => 
    api.delete(`/api/employees/${id}`),
  
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
  
  verifyPassword: (branchId, password) =>
    api.post('/api/branch-documents/verify-password', { branch_id: branchId, password }),
  
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

export default api;

