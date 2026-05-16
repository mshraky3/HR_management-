/**
 * Error Handling Middleware
 * Centralized error handling with email notifications for critical errors
 */

import { logError, log } from '../utils/logger.js';
import { reportBackendError } from '../utils/errorNotificationService.js';

export const errorHandler = (err, req, res, next) => {
  logError(err, { path: req.path, method: req.method });

  // Database errors
  if (err.code === '23505') { // Unique violation
    return res.status(409).json({
      success: false,
      message: 'Duplicate entry. This record already exists.',
      error: err.detail || err.message
    });
  }

  if (err.code === '23503') { // Foreign key violation
    return res.status(400).json({
      success: false,
      message: 'Invalid reference. Related record does not exist.',
      error: err.detail || err.message
    });
  }

  if (err.code === '23502') { // Not null violation
    return res.status(400).json({
      success: false,
      message: 'Required field is missing.',
      error: err.detail || err.message
    });
  }

  if (err.code === '57P01') { // admin_shutdown — transient DB connection loss (e.g. Neon auto-suspend)
    return res.status(503).json({
      success: false,
      message: 'Database connection was interrupted. Please try again.',
    });
  }

  // Validation errors
  if (err.name === 'ValidationError') {
    return res.status(400).json({
      success: false,
      message: 'Validation error',
      error: err.message
    });
  }

  // JWT errors (when implemented)
  if (err.name === 'JsonWebTokenError') {
    return res.status(401).json({
      success: false,
      message: 'Invalid token'
    });
  }

  if (err.name === 'TokenExpiredError') {
    return res.status(401).json({
      success: false,
      message: 'Token expired'
    });
  }

  // For 500 errors, send email notification
  const statusCode = err.status || 500;
  if (statusCode >= 500) {
    // Send email notification asynchronously (don't block response)
    reportBackendError(err, req).catch(e => {
      log.error('Failed to send error notification', { error: e.message });
    });
  }

  // Default error
  res.status(statusCode).json({
    success: false,
    message: err.message || 'Internal server error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
};

export const notFound = (req, res) => {
  res.status(404).json({
    success: false,
    message: `Route ${req.method} ${req.path} not found`
  });
};