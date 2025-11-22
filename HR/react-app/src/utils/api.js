/**
 * API Service
 * Centralized API calls with authentication
 */

import axios from 'axios';
import { API_URL } from '../config/api.js';

// Create axios instance
const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add token to requests if available
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Handle 401 errors (unauthorized)
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = '/login';
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

export default api;

