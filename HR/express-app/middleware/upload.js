/**
 * File Upload Middleware
 * Handles file uploads using multer
 * Updated to use memory storage for Vercel Blob integration
 */

import multer from 'multer';
import { isValidMimeType, isValidFileSize } from '../utils/validators.js';
import { generateFileName } from '../utils/fileUpload.js';
import { headR2Object, readR2Prefix, deleteFromR2, r2PublicUrlForKey } from '../utils/r2Storage.js';

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

  // Direct uploads (acceptDirectUpload) never passed through this function,
  // so they get the larger limit; multipart files are capped by Vercel.
  const maxMB = req.file.directKey ? MAX_DIRECT_UPLOAD_MB : MAX_API_UPLOAD_MB;
  if (!isValidFileSize(req.file.size, maxMB)) {
    return res.status(400).json({
      success: false,
      message: req.file.directKey ? directFileTooLargeMessage() : fileTooLargeMessage()
    });
  }

  next();
};

// ============================================================================
// Direct-to-R2 uploads (files larger than the API limit)
//
// The browser gets a signed PUT URL from an /upload-url route, sends the file
// straight to R2, then calls the normal upload route with the same form fields
// plus `direct_upload_key` and `file_name` instead of the file. This middleware
// turns that key into a req.file-like object, so every existing validation and
// save path runs unchanged; routes only skip the storage write when
// req.file.directKey is set.
// ============================================================================

export const MAX_DIRECT_UPLOAD_MB = 15;
export const MAX_DIRECT_UPLOAD_BYTES = MAX_DIRECT_UPLOAD_MB * 1024 * 1024;
export const directFileTooLargeMessage = () =>
  `حجم الملف يتجاوز الحد الأقصى المسموح به (${MAX_DIRECT_UPLOAD_MB} ميجابايت). الرجاء ضغط الملف ثم المحاولة مرة أخرى.`;

const FILE_SIGNATURES = {
  'application/pdf': [0x25, 0x50, 0x44, 0x46], // %PDF
  'image/jpeg': [0xff, 0xd8, 0xff],
  'image/jpg': [0xff, 0xd8, 0xff],
  'image/png': [0x89, 0x50, 0x4e, 0x47],
  'image/gif': [0x47, 0x49, 0x46, 0x38], // GIF8
};

/** True when the first bytes of a file match its declared type. */
export const fileMatchesType = (firstBytes, mimeType) => {
  const signature = FILE_SIGNATURES[mimeType];
  return !!signature && signature.every((byte, i) => firstBytes[i] === byte);
};

/** Object key the upload-url routes hand out for a file. */
export const buildDirectUploadKey = (prefix, fileName) => {
  let uniqueFileName = generateFileName(fileName || 'file');
  uniqueFileName = uniqueFileName.replace(/(\.(pdf|jpg|jpeg|png|gif))\.(\2)$/i, '$1');
  return `${prefix}${uniqueFileName}`;
};

/**
 * @param {(req) => Promise<string|null>|string|null} expectedPrefix - the key
 *   prefix this request may reference (e.g. "employees/12/"), or null to refuse.
 */
export const acceptDirectUpload = (expectedPrefix) => async (req, res, next) => {
  const key = req.body?.direct_upload_key;
  if (req.file || !key) return next();
  try {
    const prefix = await expectedPrefix(req);
    if (!prefix || typeof key !== 'string' || !key.startsWith(prefix) || key.includes('..')) {
      return res.status(400).json({ success: false, message: 'مرجع الملف المرفوع غير صالح' });
    }
    const head = await headR2Object(key);
    if (!head) {
      return res.status(400).json({ success: false, message: 'لم يكتمل رفع الملف. الرجاء المحاولة مرة أخرى.' });
    }
    const mimetype = head.contentType;
    const firstBytes = await readR2Prefix(key, 8);
    if (!isValidMimeType(mimetype) || !fileMatchesType(firstBytes, mimetype) || head.size > MAX_DIRECT_UPLOAD_BYTES) {
      await deleteFromR2(r2PublicUrlForKey(key));
      return res.status(400).json({
        success: false,
        message: head.size > MAX_DIRECT_UPLOAD_BYTES
          ? directFileTooLargeMessage()
          : 'نوع الملف غير مدعوم. يُسمح فقط بملفات PDF والصور.'
      });
    }
    const url = r2PublicUrlForKey(key);
    req.file = {
      directKey: key,
      url,
      originalname: req.body.file_name || key.split('/').pop(),
      mimetype,
      size: head.size,
      buffer: null,
    };
    next();
  } catch (error) {
    next(error);
  }
};

