/**
 * Branch Document Routes
 * Upload, download, list, and manage branch documents
 */

import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import PdfPrinter from '@digicole/pdfmake-rtl';
import { PDFDocument } from 'pdf-lib';
import sql from '../config/database.js';
import { authenticate } from '../middleware/auth.js';
import { uploadSingle, validateUploadedFile } from '../middleware/upload.js';
import { verifyBranchDocumentsPassword } from '../middleware/branchDocumentsPassword.js';
import { BranchDocument } from '../models/BranchDocument.js';
import { Branch } from '../models/Branch.js';
import { getExtensionFromMimeType, fixFilenameEncoding } from '../utils/fileUpload.js';
import { uploadBranchDocumentToBlob, deleteFromBlob, fetchFromBlob } from '../utils/blobStorage.js';
import { clearByPrefix } from '../utils/simpleCache.js';
import { formatDate } from '../utils/dateConverter.js';
import { validateDateFields } from '../middleware/dateValidation.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Create pdfmake RTL printer with fonts (same setup as reports.js)
// Note: Font files are included in Vercel deployment, but paths may differ
// This code handles both local development and Vercel serverless environments
const fontsDir = path.join(__dirname, '..', 'fonts');
const notoSansArabicDir = path.join(fontsDir, 'Noto_Sans_Arabic');
const notoSansArabicVariable = path.join(notoSansArabicDir, 'NotoSansArabic-VariableFont_wdth,wght.ttf');
const notoSansArabicStatic = path.join(notoSansArabicDir, 'static');
let arabicFontPath = null;

try {
  if (fs.existsSync(notoSansArabicVariable)) {
    arabicFontPath = notoSansArabicVariable;
  } else if (fs.existsSync(notoSansArabicStatic)) {
    try {
      const staticFiles = fs.readdirSync(notoSansArabicStatic);
      const regularFont = staticFiles.find(f => f.includes('Regular') && f.endsWith('.ttf'));
      if (regularFont) {
        arabicFontPath = path.join(notoSansArabicStatic, regularFont);
      }
    } catch (e) {
      console.warn('Error reading static fonts directory:', e.message);
    }
  }
} catch (error) {
  // On Vercel or if fonts are not accessible, will use fallback fonts
  console.warn('Font files not accessible, will use fallback fonts:', error.message);
}

const hasArabicFont = arabicFontPath !== null && (() => {
  try {
    return fs.existsSync(arabicFontPath);
  } catch {
    return false;
  }
})();

let fonts;
if (hasArabicFont) {
  const notoSansStatic = path.join(notoSansArabicDir, 'static');
  const regularFont = path.join(notoSansStatic, 'NotoSansArabic-Regular.ttf');
  const boldFont = path.join(notoSansStatic, 'NotoSansArabic-Bold.ttf');
  const mediumFont = path.join(notoSansStatic, 'NotoSansArabic-Medium.ttf');

  // Use available fonts, fallback to regular if others don't exist
  // Wrap fs.existsSync in try-catch for Vercel compatibility
  const fontExists = (fontPath) => {
    try {
      return fs.existsSync(fontPath);
    } catch {
      return false;
    }
  };

  fonts = {
    Roboto: {
      normal: fontExists(regularFont) ? regularFont : arabicFontPath,
      bold: fontExists(boldFont) ? boldFont : (fontExists(mediumFont) ? mediumFont : arabicFontPath),
      italics: fontExists(regularFont) ? regularFont : arabicFontPath,
      bolditalics: fontExists(boldFont) ? boldFont : (fontExists(mediumFont) ? mediumFont : arabicFontPath)
    },
    Nillima: {
      normal: fontExists(regularFont) ? regularFont : arabicFontPath,
      bold: fontExists(boldFont) ? boldFont : (fontExists(mediumFont) ? mediumFont : arabicFontPath),
      italics: fontExists(regularFont) ? regularFont : arabicFontPath,
      bolditalics: fontExists(boldFont) ? boldFont : (fontExists(mediumFont) ? mediumFont : arabicFontPath)
    }
  };

  console.log('Using Noto Sans Arabic font for PDF generation');
} else {
  // Fallback to Helvetica (limited Arabic support)
  fonts = {
    Roboto: {
      normal: 'Helvetica',
      bold: 'Helvetica-Bold',
      italics: 'Helvetica-Oblique',
      bolditalics: 'Helvetica-BoldOblique'
    },
    Nillima: {
      normal: 'Helvetica',
      bold: 'Helvetica-Bold',
      italics: 'Helvetica-Oblique',
      bolditalics: 'Helvetica-BoldOblique'
    }
  };
}

const printer = new PdfPrinter(fonts);

const router = express.Router();

/**
 * Get valid user ID for uploaded_by field
 */
const getUploadedByUserId = async (userId) => {
  if (!userId) return null;

  try {
    const sql = (await import('../config/database.js')).default;
    const [user] = await sql`SELECT id FROM users WHERE id = ${userId}`;
    if (user?.id) return user.id;
  } catch (error) {
    console.error('Error verifying user:', error);
  }

  // Fallback: find first active user
  try {
    const sql = (await import('../config/database.js')).default;
    const [fallbackUser] = await sql`
      SELECT id FROM users WHERE is_active = true ORDER BY id ASC LIMIT 1
    `;
    if (fallbackUser?.id) return fallbackUser.id;

    // Last resort: find any user
    const [anyUser] = await sql`SELECT id FROM users ORDER BY id ASC LIMIT 1`;
    return anyUser?.id || null;
  } catch (error) {
    console.error('Error finding fallback user:', error);
    return null;
  }
};

/**
 * Safely parse document ID from request params
 */
const parseDocumentId = (req) => {
  const id = parseInt(req.params?.id);
  if (isNaN(id)) {
    return { error: 'Invalid document ID' };
  }
  return { documentId: id };
};

/**
 * Resolve file path for backward compatibility with old local files
 * Note: New files are stored in Blob Storage, this is only for legacy files
 */
const resolveFilePath = (filePath) => {
  if (!filePath) return null;

  // If it's already a URL (Blob Storage), return null (handled elsewhere)
  if (filePath.startsWith('http://') || filePath.startsWith('https://')) {
    return null;
  }

  // If absolute path, use as is
  if (path.isAbsolute(filePath)) {
    return fs.existsSync(filePath) ? filePath : null;
  }

  // Try different relative path combinations (for legacy files only)
  const alternatives = [
    path.join(__dirname, '..', filePath),
    path.join(__dirname, '..', filePath.replace(/^express-app\//, '')),
  ];

  for (const altPath of alternatives) {
    if (fs.existsSync(altPath)) {
      return altPath;
    }
  }

  return null;
};

// All routes require authentication
router.use(authenticate);

/**
 * Verify branch documents password
 * POST /api/branch-documents/verify-password
 * Body: { branch_id, password }
 */
router.post('/verify-password', async (req, res) => {
  try {
    const { branch_id, password } = req.body;

    if (!branch_id || !password) {
      return res.status(400).json({
        success: false,
        message: 'معرف الفرع وكلمة المرور مطلوبان'
      });
    }

    const parsedBranchId = parseInt(branch_id);
    if (isNaN(parsedBranchId)) {
      return res.status(400).json({
        success: false,
        message: 'تنسيق معرف الفرع غير صحيح'
      });
    }

    // Get branch
    const branch = await Branch.findById(parsedBranchId);
    if (!branch) {
      return res.status(404).json({ success: false, message: 'الفرع غير موجود' });
    }

    // Check access - branch managers can only verify their own branch
    if (req.user.role === 'branch_manager' && req.user.branch_id !== parsedBranchId) {
      return res.status(403).json({ success: false, message: 'تم رفض الوصول' });
    }

    // Verify password
    if (branch.branch_documents_password !== password) {
      return res.status(401).json({ success: false, message: 'كلمة المرور غير صحيحة' });
    }

    res.json({ success: true, message: 'تم التحقق من كلمة المرور بنجاح' });
  } catch (error) {
    console.error('Error verifying password:', error);
    res.status(500).json({
      success: false,
      message: 'فشل التحقق من كلمة المرور',
      error: error.message
    });
  }
});

/**
 * Get all branch documents (with filters)
 * GET /api/branch-documents?branch_id=123&document_type=license&is_verified=false
 * Requires: X-Branch-Documents-Password header or branch_documents_password query parameter
 */
/**
 * Build filters from query parameters
 */
const buildFilters = (query) => {
  const filters = {};

  if (query.branch_id) filters.branch_id = parseInt(query.branch_id);
  if (query.document_type) filters.document_type = query.document_type;
  if (query.mime_type) filters.mime_type = query.mime_type;
  if (query.is_verified !== undefined) {
    filters.is_verified = query.is_verified === 'true';
  }

  return filters;
};

/**
 * Get documents based on user role
 */
const getDocumentsByRole = async (user, filters) => {
  if (user.role === 'branch_manager' && user.branch_id) {
    return await BranchDocument.findByBranchId(user.branch_id, filters);
  }
  if (user.role === 'main_manager') {
    return await BranchDocument.findAll(filters);
  }
  return [];
};

router.get('/', verifyBranchDocumentsPassword, async (req, res) => {
  try {
    const filters = buildFilters(req.query);
    const documents = await getDocumentsByRole(req.user, filters);
    return res.json({ success: true, data: documents || [] });
  } catch (error) {
    console.error('Error fetching branch documents:', error);
    res.status(500).json({
      success: false,
      message: 'فشل جلب مستندات الفرع',
      error: error.message
    });
  }
});

/**
 * Upload branch document
 * POST /api/branch-documents
 * Form data: branch_id, document_type, file, description (optional), expiry_date (optional)
 * Requires: X-Branch-Documents-Password header or branch_documents_password in form data
 */
router.post('/', 
  verifyBranchDocumentsPassword, 
  uploadSingle, 
  validateUploadedFile,
  validateDateFields({
    'issue_date_hijri': { calendarType: 'hijri', dateType: 'general', required: false },
    'expiry_date_hijri': { calendarType: 'hijri', dateType: 'general', required: false }
  }),
  async (req, res) => {
  try {
    const { branch_id, document_type, description, document_number, issue_date, issue_date_hijri, expiry_date, expiry_date_hijri, iban_number, bank_name } = req.body;

    if (!branch_id || !document_type || !req.file) {
      return res.status(400).json({
        success: false,
        message: 'معرف الفرع ونوع المستند والملف مطلوبة'
      });
    }

    // Check branch exists and user has access
    const branch = await Branch.findById(parseInt(branch_id));
    if (!branch) {
      return res.status(404).json({
        success: false,
        message: 'الفرع غير موجود'
      });
    }

    // Branch managers can only upload to their branch
    if (req.user.role === 'branch_manager' && req.user.branch_id !== parseInt(branch_id)) {
      return res.status(403).json({
        success: false,
        message: 'You can only upload documents for your branch'
      });
    }

    // Restrict certain document types from branch managers
    const restrictedDocumentTypes = [
      'staff_cadre',
      'dropped_students',
      'free_seats',
      'acceptance_notifications',
      'other'
    ];

    if (req.user.role === 'branch_manager' && restrictedDocumentTypes.includes(document_type)) {
      return res.status(403).json({
        success: false,
        message: 'هذا النوع من المستندات غير متاح للرفع من قبل مديري الفروع'
      });
    }

    // Validate healthcare-specific documents can only be uploaded to healthcare centers
    const healthcareOnlyDocuments = [
      'operational_plan',
      'decision_obligation',
      'decision_commitment',
      'staff_cadre',
      'owner_civil_id_copy',
      'disclosure_commitment',
      'certification_commitment_form',
      'financial_platform_declaration',
      'financial_claim_form',
      'student_cadre_file',
      'dropped_students',
      'free_seats',
      'acceptance_notifications'
    ];
    if (healthcareOnlyDocuments.includes(document_type) && branch.branch_type !== 'healthcare_center') {
      return res.status(400).json({
        success: false,
        message: 'هذا النوع من المستندات متاح فقط لمراكز الرعاية الصحية'
      });
    }

    // Fix filename encoding for Arabic characters BEFORE upload
    // This ensures correct encoding for both blob path and database record
    const fixedFileName = fixFilenameEncoding(req.file.originalname);

    // Upload file to Vercel Blob Storage
    // Note: uploadBranchDocumentToBlob uses generateFileName which sanitizes the filename
    // This ensures blob paths are safe for Vercel Blob Storage (no special characters)
    const blobUrl = await uploadBranchDocumentToBlob(
      req.file.buffer,
      fixedFileName, // Use fixed filename for consistent encoding
      req.file.mimetype,
      parseInt(branch_id),
      document_type
    );

    // Get valid user ID for uploaded_by field
    const uploadedById = await getUploadedByUserId(req.user?.id);
    if (!uploadedById) {
      return res.status(500).json({
        success: false,
        message: 'No valid user found for uploaded_by field. Please ensure at least one user exists in the system.'
      });
    }

    // Use the fixed filename for database record
    const fileName = fixedFileName;

    // Date conversion and validation is handled by validateDateFields middleware
    const finalIssueDate = issue_date || null;
    const finalIssueDateHijri = issue_date_hijri || null;
    const finalExpiryDate = expiry_date || null;
    const finalExpiryDateHijri = expiry_date_hijri || null;

    // Create document record - store blob URL
    const document = await BranchDocument.create({
      branch_id: parseInt(branch_id),
      document_type: document_type,
      file_name: fileName,
      file_path: blobUrl, // Store blob URL instead of local path
      file_size: req.file.size,
      mime_type: req.file.mimetype,
      file_extension: getExtensionFromMimeType(req.file.mimetype),
      description: description || null,
      document_number: document_number || null,
      issue_date: finalIssueDate,
      issue_date_hijri: finalIssueDateHijri,
      expiry_date: finalExpiryDate,
      expiry_date_hijri: finalExpiryDateHijri,
      iban_number: iban_number || null,
      bank_name: bank_name || null,
      uploaded_by: uploadedById // Always set - either user.id or branch_id
    });

    // Invalidate dashboard & branch statistics caches for this branch
    clearByPrefix(`dashboard:summary:${branch_id}`);
    clearByPrefix('branch-statistics');

    res.status(201).json({
      success: true,
      message: 'Branch document uploaded successfully',
      data: document
    });
  } catch (error) {
    console.error('Error uploading branch document:', error);
    res.status(500).json({
      success: false,
      message: 'فشل رفع مستند الفرع',
      error: error.message
    });
  }
});

/**
 * Download branch document file
 * GET /api/branch-documents/:id/download
 * NOTE: This must come BEFORE the generic /:id route to avoid conflicts
 * Requires: X-Branch-Documents-Password header or branch_documents_password query parameter
 */
router.get('/:id/download', verifyBranchDocumentsPassword, async (req, res) => {
  try {
    const idResult = parseDocumentId(req);
    if (idResult.error) {
      return res.status(400).json({ success: false, message: idResult.error });
    }

    const document = await BranchDocument.findById(idResult.documentId);

    if (!document) {
      return res.status(404).json({
        success: false,
        message: 'Document not found'
      });
    }

    // Check branch access
    if (req.user.role === 'branch_manager' && req.user.branch_id !== document.branch_id) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    // Validate file_path exists
    if (!document.file_path) {
      return res.status(404).json({
        success: false,
        message: 'File path not found in database'
      });
    }

    // Helper function to sanitize filename for Content-Disposition header
    const sanitizeFilename = (filename) => {
      // Remove control characters, newlines, and other invalid header characters
      return filename.replace(/[\x00-\x1F\x7F-\x9F]/g, '').replace(/[\r\n]/g, '');
    };

    // If file_path is a URL (Blob), fetch and proxy it to maintain password protection
    if (document.file_path.startsWith('http://') || document.file_path.startsWith('https://')) {
      try {
        const { buffer, contentType } = await fetchFromBlob(document.file_path);
        const safeFilename = sanitizeFilename(document.file_name);
        res.setHeader('Content-Type', contentType || document.mime_type);
        res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(safeFilename)}"`);
        return res.send(buffer);
      } catch (error) {
        console.error('Error fetching blob file:', error);
        return res.status(500).json({
          success: false,
          message: 'فشل جلب ملف المستند',
          error: error.message
        });
      }
    }

    // Fallback for local files (backward compatibility)
    const filePath = resolveFilePath(document.file_path);
    if (!filePath) {
      return res.status(404).json({
        success: false,
        message: 'File not found on server'
      });
    }

    const safeFilename = sanitizeFilename(document.file_name);
    res.setHeader('Content-Type', document.mime_type);
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(safeFilename)}"`);
    res.sendFile(path.resolve(filePath));
  } catch (error) {
    console.error('Error downloading branch document:', error);
    res.status(500).json({
      success: false,
      message: 'فشل تحميل المستند',
      error: error.message
    });
  }
});

/**
 * Get branch document preview/thumbnail
 * GET /api/branch-documents/:id/preview
 * NOTE: This must come BEFORE the generic /:id route to avoid conflicts
 * Requires: X-Branch-Documents-Password header or branch_documents_password query parameter
 */
router.get('/:id/preview', verifyBranchDocumentsPassword, async (req, res) => {
  try {
    const documentId = parseInt(req.params?.id);
    if (isNaN(documentId)) {
      return res.status(400).json({
        success: false,
        message: 'معرف المستند غير صحيح'
      });
    }

    const document = await BranchDocument.findById(documentId);
    if (!document) {
      return res.status(404).json({
        success: false,
        message: 'Document not found'
      });
    }

    // Check branch access
    if (req.user.role === 'branch_manager' && req.user.branch_id !== document.branch_id) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    // For images, return the file directly
    if (document.mime_type && document.mime_type.startsWith('image/')) {
      // If file_path is a URL (Blob Storage), return it in JSON response for frontend to use
      if (document.file_path && (document.file_path.startsWith('http://') || document.file_path.startsWith('https://'))) {
        return res.json({
          success: true,
          data: {
            id: document.id,
            file_name: document.file_name,
            mime_type: document.mime_type,
            file_url: document.file_path
          }
        });
      }

      // Fallback for local files
      const filePath = resolveFilePath(document.file_path);
      if (filePath) {
        res.setHeader('Content-Type', document.mime_type);
        res.sendFile(path.resolve(filePath));
        return;
      }
    }

    // For PDFs or if preview not available, return document info
    res.json({
      success: true,
      message: 'معاينة غير متاحة لهذا النوع من المستندات',
      data: {
        id: document.id,
        file_name: document.file_name,
        mime_type: document.mime_type,
        download_url: `/api/branch-documents/${document.id}/download`,
        file_url: document.file_path && (document.file_path.startsWith('http://') || document.file_path.startsWith('https://'))
          ? document.file_path
          : null
      }
    });
  } catch (error) {
    console.error('Error getting branch document preview:', error);
    res.status(500).json({
      success: false,
      message: 'فشل الحصول على معاينة المستند',
      error: error.message
    });
  }
});

/**
 * Get branch document by ID
 * GET /api/branch-documents/:id
 * NOTE: This must come AFTER specific routes like /:id/download and /:id/preview
 * Requires: X-Branch-Documents-Password header or branch_documents_password query parameter
 */
router.get('/:id', verifyBranchDocumentsPassword, async (req, res) => {
  try {
    const documentId = parseInt(req.params?.id);
    if (isNaN(documentId)) {
      return res.status(400).json({
        success: false,
        message: 'معرف المستند غير صحيح'
      });
    }

    const document = await BranchDocument.findById(documentId);
    if (!document) {
      return res.status(404).json({
        success: false,
        message: 'Document not found'
      });
    }

    // Check branch access
    if (req.user?.role === 'branch_manager' && req.user.branch_id !== document.branch_id) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    res.json({ success: true, data: document });
  } catch (error) {
    console.error('Error fetching branch document:', error);
    res.status(500).json({
      success: false,
      message: 'فشل جلب المستند',
      error: error.message
    });
  }
});

/**
 * Verify branch document
 * POST /api/branch-documents/:id/verify
 * Requires: X-Branch-Documents-Password header or branch_documents_password query parameter
 */
router.post('/:id/verify', verifyBranchDocumentsPassword, async (req, res) => {
  try {
    const idResult = parseDocumentId(req);
    if (idResult.error) {
      return res.status(400).json({ success: false, message: idResult.error });
    }

    const document = await BranchDocument.findById(idResult.documentId);
    if (!document) {
      return res.status(404).json({
        success: false,
        message: 'Document not found'
      });
    }

    // Only main manager can verify
    if (req.user?.role !== 'main_manager') {
      return res.status(403).json({
        success: false,
        message: 'Only main manager can verify documents'
      });
    }

    const verifiedDocument = await BranchDocument.verify(idResult.documentId, req.user.id);

    res.json({
      success: true,
      message: 'Document verified successfully',
      data: verifiedDocument
    });
  } catch (error) {
    console.error('Error verifying branch document:', error);
    res.status(500).json({
      success: false,
      message: 'فشل التحقق من المستند',
      error: error.message
    });
  }
});

/**
 * Update branch document (replace file or update metadata)
 * PUT /api/branch-documents/:id
 * If file is provided, it will replace the old file and deactivate old documents of same type
 * Requires: X-Branch-Documents-Password header or branch_documents_password query parameter
 */
router.put('/:id', 
  verifyBranchDocumentsPassword, 
  uploadSingle,
  validateDateFields({
    'issue_date_hijri': { calendarType: 'hijri', dateType: 'general', required: false },
    'expiry_date_hijri': { calendarType: 'hijri', dateType: 'general', required: false }
  }),
  async (req, res) => {
    try {
      const idResult = parseDocumentId(req);
    if (idResult.error) {
      return res.status(400).json({ success: false, message: idResult.error });
    }

    const document = await BranchDocument.findById(idResult.documentId);
    if (!document) {
      return res.status(404).json({
        success: false,
        message: 'Document not found'
      });
    }

    // Check branch access
    if (req.user?.role === 'branch_manager' && req.user.branch_id !== document.branch_id) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    let updatedDocument;

    // If file is provided, replace the document file
    if (req.file) {
      // Validate file if provided
      const { isValidMimeType, isValidFileSize } = await import('../utils/validators.js');

      if (!isValidMimeType(req.file.mimetype)) {
        return res.status(400).json({
          success: false,
          message: 'نوع الملف غير مدعوم. يُسمح فقط بملفات PDF والصور.'
        });
      }

      // Determine max file size based on document type
      const highCapacityDocs = ['operational_plan', 'acceptance_notifications'];
      const maxFileSize = highCapacityDocs.includes(document.document_type) ? 15 : 1;

      if (!isValidFileSize(req.file.size, maxFileSize)) {
        const sizeLimitMsg = maxFileSize === 15 ? '15 ميجابايت' : '1 ميجابايت';
        return res.status(400).json({
          success: false,
          message: `حجم الملف يتجاوز الحد الأقصى المسموح به (${sizeLimitMsg})`
        });
      }

      // Fix filename encoding for Arabic characters BEFORE upload
      const fixedFileName = fixFilenameEncoding(req.file.originalname);

      // Upload new file to Blob Storage
      // Note: uploadBranchDocumentToBlob uses generateFileName which sanitizes the filename
      // This ensures blob paths are safe for Vercel Blob Storage (no special characters)
      const blobUrl = await uploadBranchDocumentToBlob(
        req.file.buffer,
        fixedFileName, // Use fixed filename for consistent encoding
        req.file.mimetype,
        document.branch_id,
        document.document_type
      );

      // For license type documents, deactivate old documents of the same type
      if (document.document_type === 'license') {
        await BranchDocument.deactivateByBranchAndType(
          document.branch_id,
          document.document_type,
          document.id
        );
      }

      // Delete old file from Blob Storage if it exists
      if (document.file_path) {
        await deleteFromBlob(document.file_path);
      }

      // Use the fixed filename for database record
      const fileName = fixedFileName;

      // Date conversion and validation is handled by validateDateFields middleware
      const finalIssueDate = req.body.issue_date !== undefined ? req.body.issue_date : document.issue_date;
      const finalIssueDateHijri = req.body.issue_date_hijri !== undefined ? req.body.issue_date_hijri : document.issue_date_hijri;
      const finalExpiryDate = req.body.expiry_date !== undefined ? req.body.expiry_date : document.expiry_date;
      const finalExpiryDateHijri = req.body.expiry_date_hijri !== undefined ? req.body.expiry_date_hijri : document.expiry_date_hijri;

      // Update document with new file
      updatedDocument = await BranchDocument.updateFile(
        idResult.documentId,
        {
          file_name: fileName,
          file_path: blobUrl, // Store blob URL
          file_size: req.file.size,
          mime_type: req.file.mimetype,
          file_extension: getExtensionFromMimeType(req.file.mimetype),
          description: req.body.description !== undefined ? req.body.description : document.description,
          document_number: req.body.document_number !== undefined ? req.body.document_number : document.document_number,
          issue_date: finalIssueDate,
          issue_date_hijri: finalIssueDateHijri,
          expiry_date: finalExpiryDate,
          expiry_date_hijri: finalExpiryDateHijri,
          iban_number: req.body.iban_number !== undefined ? req.body.iban_number : document.iban_number,
          bank_name: req.body.bank_name !== undefined ? req.body.bank_name : document.bank_name
        }
      );
    } else {
      // Just update metadata
      // Date conversion and validation is handled by validateDateFields middleware
      const finalIssueDate = req.body.issue_date !== undefined ? req.body.issue_date : document.issue_date;
      const finalIssueDateHijri = req.body.issue_date_hijri !== undefined ? req.body.issue_date_hijri : document.issue_date_hijri;
      const finalExpiryDate = req.body.expiry_date !== undefined ? req.body.expiry_date : document.expiry_date;
      const finalExpiryDateHijri = req.body.expiry_date_hijri !== undefined ? req.body.expiry_date_hijri : document.expiry_date_hijri;

      updatedDocument = await BranchDocument.update(idResult.documentId, {
        description: req.body.description,
        document_number: req.body.document_number,
        issue_date: finalIssueDate,
        issue_date_hijri: finalIssueDateHijri,
        expiry_date: finalExpiryDate,
        expiry_date_hijri: finalExpiryDateHijri,
        iban_number: req.body.iban_number,
        bank_name: req.body.bank_name
      });
    }

    res.json({
      success: true,
      message: 'Document updated successfully',
      data: updatedDocument
    });
  } catch (error) {
    console.error('Error updating branch document:', error);
    res.status(500).json({
      success: false,
      message: 'فشل تحديث المستند',
      error: error.message
    });
  }
});

/**
 * Delete branch document (soft delete)
 * DELETE /api/branch-documents/:id
 * Requires: X-Branch-Documents-Password header or branch_documents_password query parameter
 */
router.delete('/:id', verifyBranchDocumentsPassword, async (req, res) => {
  try {
    const idResult = parseDocumentId(req);
    if (idResult.error) {
      return res.status(400).json({ success: false, message: idResult.error });
    }

    const document = await BranchDocument.findById(idResult.documentId);
    if (!document) {
      return res.status(404).json({
        success: false,
        message: 'Document not found'
      });
    }

    // Check branch access - branch managers can delete their own branch documents
    if (req.user?.role === 'branch_manager' && req.user.branch_id !== document.branch_id) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    await BranchDocument.delete(idResult.documentId);

    res.json({
      success: true,
      message: 'Document deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting branch document:', error);
    res.status(500).json({
      success: false,
      message: 'فشل حذف المستند',
      error: error.message
    });
  }
});

/**
 * Generate PDF report for monthly documents (payrolls)
 * POST /api/branch-documents/generate-payroll-report
 * Body: { document_type: string, branch_ids: number[] }
 * Only accessible by main managers
 */
router.post('/generate-payroll-report', authenticate, async (req, res) => {
  try {
    // Only main managers can generate reports
    if (req.user.role !== 'main_manager') {
      return res.status(403).json({
        success: false,
        message: 'تم رفض الوصول. يمكن للمديرين الرئيسيين فقط إنشاء التقارير.'
      });
    }

    const { document_type, branch_ids } = req.body;

    if (!document_type) {
      return res.status(400).json({
        success: false,
        message: 'نوع المستند مطلوب'
      });
    }

    // This report only supports payroll_file. salary_deposit_file is deprecated/removed.
    if (document_type !== 'payroll_file') {
      return res.status(400).json({
        success: false,
        message: 'نوع المستند غير مدعوم'
      });
    }

    if (!branch_ids || !Array.isArray(branch_ids) || branch_ids.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'At least one branch must be selected'
      });
    }

    // Document type labels
    const documentTypeLabels = {
      payroll_file: 'ملف مسيرات الرواتب'
    };

    const documentLabel = documentTypeLabels[document_type] || document_type;

    // Get branches - filter by IDs
    const allBranches = await Branch.findAll({ is_active: true });
    const branches = allBranches.filter(b => branch_ids.includes(b.id));

    if (branches.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'No active branches found'
      });
    }

    // Get current month documents for selected branches
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();

    // Query documents for all selected branches
    const allDocuments = await sql`
      SELECT bd.*, b.branch_name 
      FROM branch_documents bd
      INNER JOIN branches b ON bd.branch_id = b.id
      WHERE bd.is_active = true
      AND bd.branch_id = ANY(${branch_ids})
      AND bd.document_type = ${document_type}
      ORDER BY bd.uploaded_at DESC
    `;

    // Filter documents for current month
    const currentMonthDocuments = allDocuments.filter(doc => {
      const uploadDate = new Date(doc.uploaded_at);
      return uploadDate.getMonth() === currentMonth &&
        uploadDate.getFullYear() === currentYear;
    });

    // Create a map of branch_id to document
    const branchDocumentMap = new Map();
    currentMonthDocuments.forEach(doc => {
      branchDocumentMap.set(doc.branch_id, doc);
    });

    // Load all document files and convert to base64 for embedding
    const documentFilesMap = {}; // Map of document_id -> {base64, mimeType, buffer}
    const images = {}; // Images object for pdfmake

    for (const doc of currentMonthDocuments) {
      try {
        if (!doc.file_path) {
          console.warn(`Document ${doc.id} has no file_path`);
          continue;
        }

        let fileBuffer;

        // If file_path is a URL (Blob Storage)
        if (doc.file_path.startsWith('http://') || doc.file_path.startsWith('https://')) {
          try {
            const result = await fetchFromBlob(doc.file_path);
            fileBuffer = result.buffer;
          } catch (blobError) {
            console.error(`Failed to fetch from blob for document ${doc.id}:`, blobError.message);
            continue;
          }
        } else {
          // Local file path (backward compatibility)
          // Note: On Vercel serverless, local files are not accessible
          if (process.env.VERCEL === '1') {
            console.warn(`Document ${doc.id} uses local file path which is not accessible on Vercel: ${doc.file_path}`);
            continue;
          }

          let filePath;
          if (path.isAbsolute(doc.file_path)) {
            filePath = doc.file_path;
          } else {
            let relativePath = doc.file_path;
            if (relativePath.startsWith('express-app/')) {
              relativePath = relativePath.replace(/^express-app\//, '');
            }
            filePath = path.join(__dirname, '..', relativePath);
          }

          if (!fs.existsSync(filePath)) {
            const altPath = doc.file_path.replace(/^express-app\//, '');
            const altFilePath = path.join(__dirname, '..', altPath);
            filePath = fs.existsSync(altFilePath) ? altFilePath : filePath;
          }

          if (!fs.existsSync(filePath)) {
            console.warn(`File not found for document ${doc.id}: ${doc.file_path}`);
            continue;
          }

          try {
            fileBuffer = fs.readFileSync(filePath);
          } catch (readError) {
            console.error(`Failed to read file for document ${doc.id}:`, readError.message);
            continue;
          }
        }

        if (!fileBuffer || fileBuffer.length === 0) {
          console.warn(`Empty file buffer for document ${doc.id}`);
          continue;
        }

        // Convert to base64
        const base64 = fileBuffer.toString('base64');
        const mimeType = doc.mime_type || 'application/octet-stream';

        documentFilesMap[doc.id] = {
          base64: base64,
          base64DataUri: `data:${mimeType};base64,${base64}`,
          mimeType: mimeType,
          buffer: fileBuffer
        };

        // Register image if it's an image type
        if (mimeType.startsWith('image/')) {
          const imageKey = `doc_${doc.id}`;
          // pdfmake needs data URI format: data:mimeType;base64,base64String
          images[imageKey] = `data:${mimeType};base64,${base64}`;
        }
      } catch (error) {
        console.error(`Failed to load document file ${doc.id}:`, error.message);
        // Continue with other documents even if one fails
      }
    }

    // Helper function to remove parentheses from text
    const removeParentheses = (text) => {
      if (!text || typeof text !== 'string') return text;
      return text.replace(/[()]/g, '');
    };

    // Use unified formatDate function for consistent dd/mm/yyyy format

    // Prepare PDF content (header only - title and info)
    const reportDate = formatDate(now);
    const content = [
      // Title
      {
        text: removeParentheses(documentLabel),
        style: 'title'
      },
      // Report info
      {
        text: [
          { text: 'تاريخ التقرير: ', direction: 'rtl' },
          { text: reportDate, direction: 'ltr' }
        ],
        style: 'info'
      },
      {
        text: [
          { text: 'عدد الفروع: ', direction: 'rtl' },
          { text: String(branches.length), direction: 'ltr' }
        ],
        style: 'info',
        margin: [0, 0, 0, 20]
      }
    ];

    // PDF document definition
    const docDefinition = {
      pageSize: 'A4',
      pageMargins: [40, 60, 40, 60],
      images: images, // Register images for embedding
      defaultStyle: {
        font: 'Roboto',
        fontSize: 10,
        color: 'black'
      },
      styles: {
        title: {
          font: 'Roboto',
          fontSize: 18,
          bold: true,
          alignment: 'center',
          margin: [0, 0, 0, 20]
        },
        info: {
          font: 'Roboto',
          fontSize: 10,
          alignment: 'right',
          margin: [0, 0, 0, 10]
        },
        branchHeader: {
          font: 'Roboto',
          fontSize: 14,
          bold: true,
          alignment: 'right',
          margin: [0, 0, 0, 5]
        },
        documentInfo: {
          font: 'Roboto',
          fontSize: 11,
          alignment: 'right',
          margin: [0, 0, 0, 3]
        },
        documentDescription: {
          font: 'Roboto',
          fontSize: 10,
          alignment: 'right',
          color: '#666',
          margin: [0, 0, 0, 3]
        }
      },
      content: content
    };

    // Helper function to create PDF for a single branch
    const createBranchPdf = async (branch, document) => {
      return new Promise((resolve, reject) => {
        try {
          const branchContent = [
            {
              text: `الفرع: ${removeParentheses(branch.branch_name)}`,
              style: 'branchHeader',
              margin: [0, 0, 0, 5]
            }
          ];

          if (document) {
            branchContent.push({
              text: `المستند: ${removeParentheses(document.file_name)}`,
              style: 'documentInfo'
            });
            if (document.description) {
              branchContent.push({
                text: `الوصف: ${removeParentheses(document.description || '')}`,
                style: 'documentDescription'
              });
            }
            branchContent.push({
              text: `تاريخ الرفع: ${formatDate(document.uploaded_at)}`,
              style: 'documentInfo',
              margin: [0, 0, 0, 10]
            });

            // Embed document file if available
            const docFileData = documentFilesMap[document.id];
            if (docFileData) {
              const mimeType = docFileData.mimeType;

              // Check if it's an image
              if (mimeType.startsWith('image/')) {
                try {
                  const imageKey = `doc_${document.id}`;
                  branchContent.push({
                    image: imageKey,
                    width: 500,
                    alignment: 'center',
                    margin: [0, 10, 0, 20],
                    fit: [500, 700]
                  });
                } catch (error) {
                  console.error(`Error embedding image for document ${document.id}:`, error);
                  try {
                    branchContent.push({
                      image: docFileData.base64DataUri,
                      width: 500,
                      alignment: 'center',
                      margin: [0, 10, 0, 20],
                      fit: [500, 700]
                    });
                  } catch (fallbackError) {
                    branchContent.push({
                      text: removeParentheses(`[خطأ في تحميل الصورة: ${document.file_name}]`),
                      style: 'documentDescription',
                      margin: [0, 10, 0, 20]
                    });
                  }
                }
              }
            } else {
              branchContent.push({
                text: removeParentheses('[لم يتم العثور على ملف المستند]'),
                style: 'documentDescription',
                margin: [0, 10, 0, 20],
                color: '#d32f2f'
              });
            }
          } else {
            branchContent.push({
              text: 'المستند: غير متوفر',
              style: 'documentInfo',
              color: '#666',
              margin: [0, 0, 0, 20]
            });
          }

          const branchDocDefinition = {
            pageSize: 'A4',
            pageMargins: [40, 60, 40, 60],
            images: images,
            defaultStyle: {
              font: 'Roboto',
              fontSize: 10,
              color: 'black'
            },
            styles: {
              branchHeader: {
                font: 'Roboto',
                fontSize: 14,
                bold: true,
                alignment: 'right',
                margin: [0, 0, 0, 5]
              },
              documentInfo: {
                font: 'Roboto',
                fontSize: 11,
                alignment: 'right',
                margin: [0, 0, 0, 3]
              },
              documentDescription: {
                font: 'Roboto',
                fontSize: 10,
                alignment: 'right',
                color: '#666',
                margin: [0, 0, 0, 3]
              }
            },
            content: branchContent
          };

          const branchPdfDoc = printer.createPdfKitDocument(branchDocDefinition);
          const chunks = [];

          branchPdfDoc.on('data', (chunk) => {
            chunks.push(chunk);
          });

          branchPdfDoc.on('end', () => {
            const buffer = Buffer.concat(chunks);
            resolve(buffer);
          });

          branchPdfDoc.on('error', (error) => {
            reject(error);
          });

          branchPdfDoc.end();
        } catch (error) {
          reject(error);
        }
      });
    };

    // Helper function to merge PDF documents in order
    const mergePdfDocuments = async (headerPdfBuffer) => {
      try {
        // Load header PDF (title and info)
        const finalPdf = await PDFDocument.load(headerPdfBuffer);

        // For each branch, create its PDF and merge it
        for (const branch of branches) {
          const document = branchDocumentMap.get(branch.id);

          try {
            // Create PDF for this branch
            const branchPdfBuffer = await createBranchPdf(branch, document);
            const branchPdf = await PDFDocument.load(branchPdfBuffer);

            // Copy all pages from branch PDF to final PDF
            const pages = await finalPdf.copyPages(branchPdf, branchPdf.getPageIndices());
            pages.forEach((page) => {
              finalPdf.addPage(page);
            });

            // If branch has a PDF document, merge it too
            if (document) {
              const docFileData = documentFilesMap[document.id];
              if (docFileData && docFileData.mimeType === 'application/pdf') {
                try {
                  const pdfToMerge = await PDFDocument.load(docFileData.buffer);
                  const pdfPages = await finalPdf.copyPages(pdfToMerge, pdfToMerge.getPageIndices());
                  pdfPages.forEach((page) => {
                    finalPdf.addPage(page);
                  });
                } catch (error) {
                  console.error(`Error merging PDF document ${document.id}:`, error);
                }
              }
            }
          } catch (error) {
            console.error(`Error creating PDF for branch ${branch.id}:`, error);
            // Continue with other branches even if one fails
          }
        }

        // Save the merged PDF
        const mergedPdfBytes = await finalPdf.save();
        return Buffer.from(mergedPdfBytes);
      } catch (error) {
        console.error('Error in mergePdfDocuments:', error);
        throw error;
      }
    };

    // Generate PDF
    return new Promise((resolve, reject) => {
      let responseSent = false;

      const sendError = (error) => {
        if (!responseSent) {
          responseSent = true;
          console.error('PDF generation error:', error);
          try {
            if (!res.headersSent) {
              res.status(500).json({
                success: false,
                message: 'فشل إنشاء تقرير PDF',
                error: error.message
              });
            }
          } catch (sendErr) {
            console.error('Error sending error response:', sendErr);
          }
          reject(error);
        }
      };

      try {
        const pdfDoc = printer.createPdfKitDocument(docDefinition);

        const chunks = [];
        pdfDoc.on('data', (chunk) => {
          chunks.push(chunk);
        });

        pdfDoc.on('end', async () => {
          if (!responseSent) {
            responseSent = true;
            try {
              const mainPdfBuffer = Buffer.concat(chunks);

              // Merge PDF documents into main PDF
              let finalPdfBuffer;
              try {
                finalPdfBuffer = await mergePdfDocuments(mainPdfBuffer);
              } catch (mergeError) {
                console.error('Error merging PDFs, using main PDF only:', mergeError);
                // If merging fails, return main PDF without merged documents
                finalPdfBuffer = mainPdfBuffer;
              }

              if (!res.headersSent) {
                res.setHeader('Content-Type', 'application/pdf');
                res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(documentLabel)}.pdf"`);
                res.send(finalPdfBuffer);
              }
              resolve();
            } catch (error) {
              console.error('Error sending PDF response:', error);
              reject(error);
            }
          }
        });

        pdfDoc.on('error', (error) => {
          sendError(error);
        });

        pdfDoc.end();
      } catch (error) {
        sendError(error);
      }
    });

  } catch (error) {
    console.error('Error generating payroll report:', error);
    if (!res.headersSent) {
      res.status(500).json({
        success: false,
        message: 'فشل إنشاء التقرير',
        error: error.message
      });
    }
  }
});

export default router;

