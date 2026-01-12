/**
 * Logger Utility
 * Structured logging with winston for better log management
 * Replaces console.log/error/warn with proper logging
 */

import winston from 'winston';

// Define log levels
const levels = {
  error: 0,
  warn: 1,
  info: 2,
  http: 3,
  debug: 4,
};

// Define colors for each level
const colors = {
  error: 'red',
  warn: 'yellow',
  info: 'green',
  http: 'magenta',
  debug: 'blue',
};

// Tell winston about our colors
winston.addColors(colors);

// Determine log level based on environment
const level = () => {
  const env = process.env.NODE_ENV || 'development';
  const isDevelopment = env === 'development';
  return isDevelopment ? 'debug' : 'info';
};

// Custom format for development (colorized, readable)
const devFormat = winston.format.combine(
  winston.format.timestamp({ format: 'HH:mm:ss' }),
  winston.format.colorize({ all: true }),
  winston.format.printf(({ timestamp, level, message, ...metadata }) => {
    let metaStr = '';
    if (Object.keys(metadata).length > 0) {
      // Filter out sensitive data
      const sanitized = sanitizeMetadata(metadata);
      if (Object.keys(sanitized).length > 0) {
        metaStr = ` ${JSON.stringify(sanitized)}`;
      }
    }
    return `[${timestamp}] ${level}: ${message}${metaStr}`;
  })
);

// Custom format for production (JSON, machine readable)
const prodFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.errors({ stack: true }),
  winston.format.printf(({ timestamp, level, message, ...metadata }) => {
    const sanitized = sanitizeMetadata(metadata);
    return JSON.stringify({
      timestamp,
      level,
      message,
      ...sanitized,
    });
  })
);

// Sanitize metadata to remove sensitive information
const sanitizeMetadata = (metadata) => {
  const sensitiveKeys = [
    'password', 'token', 'authorization', 'secret', 
    'apiKey', 'api_key', 'credentials', 'jwt',
    'credit_card', 'ssn', 'bank_iban'
  ];
  
  const sanitized = { ...metadata };
  
  // Remove stack traces in production
  if (process.env.NODE_ENV === 'production') {
    delete sanitized.stack;
  }
  
  // Recursively sanitize objects
  const sanitizeObject = (obj) => {
    if (!obj || typeof obj !== 'object') return obj;
    
    const result = Array.isArray(obj) ? [...obj] : { ...obj };
    
    for (const key of Object.keys(result)) {
      const lowerKey = key.toLowerCase();
      if (sensitiveKeys.some(s => lowerKey.includes(s))) {
        result[key] = '[REDACTED]';
      } else if (typeof result[key] === 'object') {
        result[key] = sanitizeObject(result[key]);
      }
    }
    
    return result;
  };
  
  return sanitizeObject(sanitized);
};

// Create the logger instance
const logger = winston.createLogger({
  level: level(),
  levels,
  format: process.env.NODE_ENV === 'production' ? prodFormat : devFormat,
  transports: [
    // Console transport
    new winston.transports.Console({
      // Only show logs if not in test environment
      silent: process.env.NODE_ENV === 'test',
    }),
  ],
  // Don't exit on handled exceptions
  exitOnError: false,
});

// Add file transport in production (optional - can be configured)
// Skip file logging on Vercel (read-only filesystem)
if (process.env.NODE_ENV === 'production' && process.env.LOG_TO_FILE === 'true' && process.env.VERCEL !== '1') {
  logger.add(new winston.transports.File({
    filename: 'logs/error.log',
    level: 'error',
    maxsize: 5242880, // 5MB
    maxFiles: 5,
  }));
  
  logger.add(new winston.transports.File({
    filename: 'logs/combined.log',
    maxsize: 5242880, // 5MB
    maxFiles: 5,
  }));
}

// HTTP request logging middleware
export const httpLogger = (req, res, next) => {
  // Skip health check endpoints to reduce noise
  if (req.path === '/api/health' || req.path === '/health') {
    return next();
  }
  
  const startTime = Date.now();
  
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    const message = `${req.method} ${req.path}`;
    
    const metadata = {
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      duration: `${duration}ms`,
    };
    
    // Add user info if available (but not sensitive data)
    if (req.user) {
      metadata.userId = req.user.id;
      metadata.userRole = req.user.role;
    }
    
    // Log based on status code
    if (res.statusCode >= 500) {
      logger.error(message, metadata);
    } else if (res.statusCode >= 400) {
      // Skip warning logs for intentional 404 handlers (like /me redirect)
      if (req.path === '/me' && res.statusCode === 404) {
        // Silently ignore - this is an intentional handler for incorrect requests
      } else if (req.path === '/' && res.statusCode === 401) {
        // Skip 401 warnings for root endpoint - it doesn't require authentication
        // Requests with invalid tokens should still succeed
      } else {
        logger.warn(message, metadata);
      }
    } else if (process.env.NODE_ENV === 'development') {
      // Only log successful requests in development
      logger.http(message, metadata);
    }
  });
  
  next();
};

// Database query logger (for debugging slow queries)
export const dbQueryLogger = (query, duration) => {
  // Only log slow queries (> 100ms) or in development
  const isSlowQuery = duration > 100;
  
  if (isSlowQuery) {
    logger.warn('Slow database query', {
      query: query.substring(0, 200), // Truncate long queries
      duration: `${duration}ms`,
    });
  } else if (process.env.NODE_ENV === 'development' && process.env.LOG_DB_QUERIES === 'true') {
    logger.debug('Database query', {
      query: query.substring(0, 100),
      duration: `${duration}ms`,
    });
  }
};

// Error logger with context
export const logError = (error, context = {}) => {
  const errorInfo = {
    message: error.message,
    name: error.name,
    ...context,
  };
  
  // Include stack trace in development
  if (process.env.NODE_ENV === 'development') {
    errorInfo.stack = error.stack;
  }
  
  logger.error(error.message, errorInfo);
};

// Export logger methods for convenience
export const log = {
  error: (message, meta = {}) => logger.error(message, meta),
  warn: (message, meta = {}) => logger.warn(message, meta),
  info: (message, meta = {}) => logger.info(message, meta),
  http: (message, meta = {}) => logger.http(message, meta),
  debug: (message, meta = {}) => logger.debug(message, meta),
};

// Default export for direct use
export default logger;

