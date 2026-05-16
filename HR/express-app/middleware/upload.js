/**
 * File Upload Middleware
 * Handles file uploads using multer
 * Updated to use memory storage for Vercel Blob integration
 */

import multer from 'multer';
import { isValidMimeType, isValidFileSize } from '../utils/validators.js';

// Use memory storage instead of disk storage for Vercel Blob
// Files are stored in memory as buffers, then uploaded to Blob Storage
const storage = multer.memoryStorage();

// File filter - uses the same isValidMimeType validator as validateUploadedFile (single source of truth)
const fileFilter = (req, file, cb) => {
  if (isValidMimeType(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('نوع الملف غير مدعوم. يُسمح فقط بملفات PDF و JPEG و PNG و GIF.'), false);
  }
};

// Configure multer
export const upload = multer({
  storage: storage, // Changed from diskStorage to memoryStorage
  fileFilter: fileFilter,
  limits: {
    fileSize: 15 * 1024 * 1024 // 15MB max file size (globally allow 15MB, restricted by type in check below)
  }
});

// Middleware for single file upload
export const uploadSingle = upload.single('file');

// Middleware for multiple file uploads
export const uploadMultiple = upload.array('files', 10); // Max 10 files

/**
 * Validate uploaded file
 */
export const validateUploadedFile = (req, res, next) => {
  if (!req.file) {
    return res.status(400).json({
      success: false,
      message: 'لم يتم رفع أي ملف'
    });
  }

  // Validate MIME type
  if (!isValidMimeType(req.file.mimetype)) {
    return res.status(400).json({
      success: false,
      message: 'نوع الملف غير مدعوم. يُسمح فقط بملفات PDF والصور.'
    });
  }

  // Determine max file size based on document type
  let maxFileSize = 1 * 1024 * 1024; // Default 1MB

  // High capacity documents (15MB)
  const highCapacityDocs = ['operational_plan', 'acceptance_notifications'];
  const documentType = req.body.document_type;

  if (documentType && highCapacityDocs.includes(documentType)) {
    maxFileSize = 15 * 1024 * 1024; // 15MB
  }

  // Validate file size
  if (!isValidFileSize(req.file.size, maxFileSize / (1024 * 1024))) {
    const sizeLimitMsg = maxFileSize === 15 * 1024 * 1024 ? '15 ميجابايت' : '1 ميجابايت';
    return res.status(400).json({
      success: false,
      message: `حجم الملف يتجاوز الحد الأقصى المسموح به (${sizeLimitMsg})`
    });
  }

  next();
};

// ============================================================================
// Treatment Plan Upload Configuration
// Accepts Word (.docx, .doc) and PDF files
// ============================================================================

const TREATMENT_PLAN_ALLOWED_MIMES = [
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
  'application/msword', // .doc
  'application/pdf', // .pdf
];

const treatmentPlanFileFilter = (req, file, cb) => {
  if (TREATMENT_PLAN_ALLOWED_MIMES.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('نوع الملف غير مدعوم. يُسمح بملفات Word (.docx, .doc) و PDF فقط.'), false);
  }
};

const treatmentPlanUpload = multer({
  storage: storage,
  fileFilter: treatmentPlanFileFilter,
});

export const uploadDocxSingle = treatmentPlanUpload.single('file');

export const validateDocxFile = (req, res, next) => {
  if (!req.file) {
    return res.status(400).json({
      success: false,
      message: 'لم يتم رفع أي ملف'
    });
  }

  if (!TREATMENT_PLAN_ALLOWED_MIMES.includes(req.file.mimetype)) {
    return res.status(400).json({
      success: false,
      message: 'نوع الملف غير مدعوم. يُسمح بملفات Word (.docx, .doc) و PDF فقط.'
    });
  }

  next();
};

// Note: moveFileToFinalLocation function removed - files now go directly to Blob Storage

