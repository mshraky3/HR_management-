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

// Vercel rejects function request bodies above ~4.5 MB before our code runs
// (and without CORS headers, so the SPA shows its maintenance page). Anything
// that travels through the API is therefore capped just under that.
export const MAX_API_UPLOAD_MB = 4;
export const MAX_API_UPLOAD_BYTES = MAX_API_UPLOAD_MB * 1024 * 1024;
export const fileTooLargeMessage = () =>
  `حجم الملف يتجاوز الحد الأقصى المسموح به (${MAX_API_UPLOAD_MB} ميجابايت). الرجاء ضغط الملف أو تقسيمه ثم المحاولة مرة أخرى.`;

// File filter - uses the same isValidMimeType validator as validateUploadedFile (single source of truth)
const fileFilter = (req, file, cb) => {
  if (isValidMimeType(file.mimetype)) {
    cb(null, true);
  } else {
    // status 400: a rejected file is a user mistake, not a server failure (no critical alert email)
    const err = new Error('نوع الملف غير مدعوم. يُسمح فقط بملفات PDF و JPEG و PNG و GIF.');
    err.status = 400;
    cb(err, false);
  }
};

// Configure multer
export const upload = multer({
  storage: storage, // Changed from diskStorage to memoryStorage
  fileFilter: fileFilter,
  limits: {
    fileSize: MAX_API_UPLOAD_BYTES
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

  if (!isValidFileSize(req.file.size, MAX_API_UPLOAD_MB)) {
    return res.status(400).json({
      success: false,
      message: fileTooLargeMessage()
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
    const err = new Error('نوع الملف غير مدعوم. يُسمح بملفات Word (.docx, .doc) و PDF فقط.');
    err.status = 400;
    cb(err, false);
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

