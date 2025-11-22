/**
 * File Upload Middleware
 * Handles file uploads using multer
 */

import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import { generateFileName, getDocumentPath, DOCUMENTS_DIR } from '../utils/fileUpload.js';
import { isValidMimeType, isValidFileSize } from '../utils/validators.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configure multer storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    // Temporary storage - will move to proper location after validation
    cb(null, path.join(__dirname, '../storage/uploads/temp'));
  },
  filename: (req, file, cb) => {
    const uniqueName = generateFileName(file.originalname);
    cb(null, uniqueName);
  }
});

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
    cb(new Error('Invalid file type. Only PDF, JPEG, PNG, and GIF files are allowed.'), false);
  }
};

// Configure multer
export const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB max file size
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
      message: 'No file uploaded'
    });
  }

  // Validate MIME type
  if (!isValidMimeType(req.file.mimetype)) {
    return res.status(400).json({
      success: false,
      message: 'Invalid file type. Only PDF and image files are allowed.'
    });
  }

  // Validate file size
  if (!isValidFileSize(req.file.size)) {
    return res.status(400).json({
      success: false,
      message: 'File size exceeds maximum limit of 10MB'
    });
  }

  next();
};

/**
 * Move file from temp to final location
 * @param {string} tempPath - Temporary file path
 * @param {number} id - Employee ID or Branch ID
 * @param {string} documentType - Document type
 * @param {string} fileName - File name
 * @param {string} type - 'employees' (default) or 'branches'
 */
export async function moveFileToFinalLocation(tempPath, id, documentType, fileName, type = 'employees') {
  const fs = await import('fs');
  const path = await import('path');
  const { getDocumentPath, getBranchDocumentPath } = await import('../utils/fileUpload.js');
  
  let finalPath;
  if (type === 'branches') {
    finalPath = getBranchDocumentPath(id, documentType, fileName);
  } else {
    finalPath = getDocumentPath(id, documentType, fileName);
  }
  
  // Ensure directory exists
  const finalDir = path.dirname(finalPath);
  if (!fs.existsSync(finalDir)) {
    fs.mkdirSync(finalDir, { recursive: true });
  }
  
  // Move file
  fs.renameSync(tempPath, finalPath);
  
  // Return relative path from project root (storage/uploads/...)
  const projectRoot = path.join(__dirname, '..', '..');
  return path.relative(projectRoot, finalPath).replace(/\\/g, '/');
}

