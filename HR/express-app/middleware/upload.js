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

// File filter - only allow PDF and images
const fileFilter = (req, file, cb) => {
  const allowedMimes = [
    'application/pdf',
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/gif'
  ];

  if (allowedMimes.includes(file.mimetype)) {
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
    fileSize: 1 * 1024 * 1024 // 1MB max file size
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

  // Validate file size
  if (!isValidFileSize(req.file.size)) {
    return res.status(400).json({
      success: false,
      message: 'حجم الملف يتجاوز الحد الأقصى المسموح به (1 ميجابايت)'
    });
  }

  next();
};

// Note: moveFileToFinalLocation function removed - files now go directly to Blob Storage

