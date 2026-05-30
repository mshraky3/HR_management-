/**
 * Document Routes
 * Upload, download, list, and manage employee documents
 */

import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { authenticate } from '../middleware/auth.js';
import { checkBranchAccess, requireManager } from '../middleware/authorization.js';
import { uploadSingle, validateUploadedFile } from '../middleware/upload.js';
import { Document } from '../models/Document.js';
import { Employee } from '../models/Employee.js';
import { isValidDocumentType } from '../utils/validators.js';
import { getExtensionFromMimeType } from '../utils/fileUpload.js';
import { uploadToBlob, deleteFromBlob, fetchBlobWithFallback, copyBlob, fixDoubleExtensionUrl } from '../utils/blobStorage.js';
import { mirrorVercelFileToR2 } from '../utils/dualStorage.js';
import { handleRouteError } from '../utils/routeErrorHandler.js';
import { log } from '../utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();

// All routes require authentication + manager role (blocks branch_operations_manager)
router.use(authenticate);
router.use(requireManager);

/**
 * Get all documents (with filters)
 * GET /api/documents?employee_id=123&document_type=id_or_residency&mime_type=application/pdf&is_verified=false
 */
router.get('/', async (req, res) => {
  try {
    // Ensure user is authenticated
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'يجب تسجيل الدخول'
      });
    }


    const filters = {
      document_type: req.query.document_type,
      mime_type: req.query.mime_type,
      is_verified: req.query.is_verified !== undefined ? req.query.is_verified === 'true' : undefined
    };

    // Remove undefined values from filters
    Object.keys(filters).forEach(key => {
      if (filters[key] === undefined) delete filters[key];
    });

    let documents = [];

    if (req.query.employee_id && req.query.employee_id !== 'null' && req.query.employee_id !== '') {
      const employeeId = parseInt(req.query.employee_id);

      // Check branch access
      const employee = await Employee.findById(employeeId);
      if (!employee) {
        return res.status(404).json({
          success: false,
          message: 'الموظف غير موجود'
        });
      }

      if (req.user.role === 'branch_manager' && req.user.branch_id !== employee.branch_id) {
        return res.status(403).json({
          success: false,
          message: 'تم رفض الوصول'
        });
      }

      documents = await Document.findByEmployeeId(employeeId, filters);
    } else if (req.query.search) {
      // Search by filename
      const employeeId = req.query.employee_id && req.query.employee_id !== 'null' && req.query.employee_id !== ''
        ? parseInt(req.query.employee_id)
        : null;
      documents = await Document.searchByFilename(req.query.search, employeeId);
    } else if (req.query.expiring === 'true' || req.query.expiring === true) {
      // Get expiring documents
      const days = parseInt(req.query.days) || 30;
      documents = await Document.findExpiring(days);
    } else if (req.query.unverified === 'true') {
      // Get unverified documents
      const employeeId = req.query.employee_id && req.query.employee_id !== 'null' && req.query.employee_id !== ''
        ? parseInt(req.query.employee_id)
        : null;
      documents = await Document.findUnverified(employeeId);
    } else {
      // No specific filter provided - return documents based on user role
      if (req.user.role === 'branch_manager' && req.user.branch_id) {
        // Branch manager: return documents for their branch employees only
        try {
          documents = await Document.findByBranchId(req.user.branch_id, filters);
        } catch (error) {
          log.error('Error fetching branch documents:', error);
          documents = [];
        }
      } else {
        // Main manager with no filter - return empty array
        // This is expected behavior when no specific filter is provided
        documents = [];
      }
    }

    // Always return success with data array (even if empty)
    return res.json({ success: true, data: documents || [] });
  } catch (error) {
    log.error('Error fetching documents:', error);
    handleRouteError(error, req, res, 'فشل جلب المستندات');
  }
});

/**
 * Upload document
 * POST /api/documents
 * Form data: file, employee_id, document_type, description, expiry_date
 */
router.post('/', uploadSingle, validateUploadedFile, async (req, res) => {
  try {
    const { employee_id, document_type, description, expiry_date } = req.body;

    if (!employee_id || !document_type) {
      return res.status(400).json({
        success: false,
        message: 'معرف الموظف ونوع المستند مطلوبان'
      });
    }

    // Validate document type
    if (!isValidDocumentType(document_type)) {
      return res.status(400).json({
        success: false,
        message: 'نوع المستند غير صحيح'
      });
    }

    // Check employee exists and user has access
    const employee = await Employee.findById(parseInt(employee_id));
    if (!employee) {
      return res.status(404).json({
        success: false,
        message: 'الموظف غير موجود'
      });
    }

    if (req.user.role === 'branch_manager' && req.user.branch_id !== employee.branch_id) {
      return res.status(403).json({
        success: false,
        message: 'يمكنك فقط رفع مستندات لموظفي فرعك'
      });
    }

    // Silently validate document type is allowed for this employee
    // Don't show error messages - just accept silently (UI should prevent invalid uploads)
    // This is a safety net - the UI should prevent invalid document types from being uploaded
    try {
      const { validateDocumentType } = await import('../utils/employeeHelpers.js');

      // Derive branch_type from already-loaded employee.branches (avoids extra DB query)
      const primaryBranch = employee.branches?.find(b => b.branch_id === employee.branch_id)
        || employee.branches?.[0];

      const validation = validateDocumentType(document_type, {
        nationality: employee.nationality,
        job_title: employee.job_title,
        branch_type: primaryBranch?.branch_type || null
      });

      // Silently accept even if not allowed (UI prevents this, but we don't want to break anything)
      // Just log for debugging
      if (!validation.allowed) {
        log.warn(`Document type ${document_type} not allowed for employee ${employee_id}, but accepting silently (UI should prevent this)`);
        // Continue with upload anyway - UI should have prevented this
      }
    } catch (validationError) {
      // If validation fails, silently allow (backward compatibility)
      log.warn('Document type validation error:', validationError);
    }

    // Upload file to Vercel Blob Storage
    const { url: blobUrl, r2Url } = await uploadToBlob(
      req.file.buffer, // File buffer from memory storage
      req.file.originalname,
      req.file.mimetype,
      parseInt(employee_id),
      document_type
    );

    // Set uploaded_by to user ID — requires authenticated user, no fallback allowed
    if (!req.user || !req.user.id) {
      return res.status(401).json({ success: false, message: 'المصادقة مطلوبة لرفع المستندات' });
    }
    const uploadedById = req.user.id;

    // Fix filename encoding for Arabic characters
    // Multer may receive filename in wrong encoding, so we need to decode it properly
    let fileName = req.file.originalname;
    try {
      // Check if filename appears to be incorrectly encoded (contains Latin-1 bytes that should be UTF-8)
      // If filename contains bytes in range 0x80-0xFF but no Arabic characters, it's likely misencoded
      if (/[\x80-\xFF]/.test(fileName) && !/[\u0600-\u06FF]/.test(fileName)) {
        // Try to decode from Latin-1 to UTF-8
        // Convert each byte to its UTF-8 equivalent
        const buffer = Buffer.from(fileName, 'latin1');
        fileName = buffer.toString('utf8');
      }
    } catch (error) {
      log.warn('Error fixing filename encoding:', error);
      // If decoding fails, use original filename
    }

    // Archive (deactivate) old documents of the same type for this employee
    // This ensures only the latest document is active, while old ones are archived
    // Note: For multi-file document types (like experience_certificate, additional_courses),
    // we don't archive - those can have multiple active documents
    const singleFileDocumentTypes = [
      'id_or_residency', 'direct_letter', 'bank_iban', 'primary_qualification',
      'employment_contract', 'passport', 'professional_license', 'classification',
      'speech_therapy_course', 'physical_therapy_course', 'medical_disclosure_form',
      'speech_therapy_70_hours_course', 'therapy_40_hours_course', 'medical_insurance'
    ];

    if (singleFileDocumentTypes.includes(document_type)) {
      try {
        // Archive old documents of this type BEFORE creating the new one
        // We'll exclude the new document ID after creation, but for now archive all
        await Document.archiveByEmployeeAndType(parseInt(employee_id), document_type);
      } catch (archiveError) {
        log.error('Error archiving old documents:', archiveError);
        // Continue with upload even if archiving fails
      }
    }

    // Create document record - store blob URL in file_path
    const document = await Document.create({
      employee_id: parseInt(employee_id),
      document_type: document_type,
      file_name: fileName,
      file_path: blobUrl, // Store blob URL instead of local path
      file_size: req.file.size,
      mime_type: req.file.mimetype,
      file_extension: getExtensionFromMimeType(req.file.mimetype),
      description: description || null,
      expiry_date: expiry_date || null,
      uploaded_by: uploadedById, // Always set - either user.id or branch_id
      r2_file_path: r2Url || null
    });

    // Update employee completion status after document upload
    try {
      const { updateEmployeeCompletionStatus } = await import('../utils/employeeDataCompletion.js');
      await updateEmployeeCompletionStatus(parseInt(employee_id));
    } catch (completionError) {
      log.error('Error updating completion status after document upload:', completionError);
      // Don't fail the upload if completion status update fails
    }

    res.status(201).json({
      success: true,
      message: 'Document uploaded successfully',
      data: document
    });
  } catch (error) {
    log.error('Error uploading document:', error);
    handleRouteError(error, req, res, 'فشل رفع المستند');
  }
});

/**
 * Download document file
 * GET /api/documents/:id/download
 * NOTE: This must come BEFORE the generic /:id route to avoid conflicts
 */
router.get('/:id/download', async (req, res) => {
  try {
    const document = await Document.findById(parseInt(req.params.id));

    if (!document) {
      return res.status(404).json({
        success: false,
        message: 'المستند غير موجود'
      });
    }

    // Check branch access
    const employee = await Employee.findById(document.employee_id);
    if (!employee) {
      return res.status(404).json({
        success: false,
        message: 'الموظف المرتبط بهذا المستند غير موجود'
      });
    }
    if (req.user.role === 'branch_manager' && req.user.branch_id !== employee.branch_id) {
      return res.status(403).json({
        success: false,
        message: 'تم رفض الوصول'
      });
    }

    // Validate file_path exists
    if (!document.file_path) {
      return res.status(404).json({
        success: false,
        message: 'مسار الملف غير موجود في قاعدة البيانات'
      });
    }

    // If file_path is a URL (Blob), proxy the content through the backend
    if (document.file_path.startsWith('http://') || document.file_path.startsWith('https://')) {
      try {
        const { buffer, contentType, fixedUrl, source } = await fetchBlobWithFallback(document.file_path, document.r2_file_path);

        // If a fixed URL was used, try to permanently fix the blob path
        if (fixedUrl) {
          try {
            // Check if fixedUrl has double extension (blob found at doubled path)
            // In that case, copy to the clean path and update DB with clean URL
            const doubleExtRegex = /\.(pdf|jpg|jpeg|png|gif|doc|docx|xls|xlsx)\.\1$/i;
            if (doubleExtRegex.test(fixedUrl)) {
              // fixedUrl is the doubled path where blob actually lives
              // document.file_path is the clean path we want
              // Copy blob from doubled path to clean path
              const cleanUrl = fixDoubleExtensionUrl(fixedUrl);
              if (cleanUrl) {
                const pathname = new URL(cleanUrl).pathname.replace(/^\//, '');
                const newBlobUrl = await copyBlob(fixedUrl, pathname);
                await Document.update(document.id, { file_path: newBlobUrl });
                log.info(`Auto-fixed: copied blob to clean path for document ${document.id}`);
              }
            } else {
              // fixedUrl is the clean path (double extension was removed)
              await Document.update(document.id, { file_path: fixedUrl });
              log.info(`Auto-fixed double-extension URL for document ${document.id}`);
            }
          } catch (updateErr) {
            log.warn(`Could not auto-fix URL for document ${document.id}:`, updateErr.message);
          }
        }

        // Lazy migration: mirror to R2 on first Vercel hit
        if (source === 'vercel' && !document.r2_file_path) {
          setImmediate(async () => {
            try {
              const r2Url = await mirrorVercelFileToR2(document.file_path, buffer, contentType);
              if (r2Url) await Document.update(document.id, { r2_file_path: r2Url });
            } catch (e) { /* non-blocking */ }
          });
        }

        res.setHeader('Content-Type', document.mime_type || contentType);
        res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(document.file_name || 'document')}"`);
        return res.send(buffer);
      } catch (blobError) {
        log.error(`Blob fetch failed for document ${document.id}:`, blobError.message);
        return res.status(404).json({
          success: false,
          message: 'الملف غير متوفر في التخزين السحابي. قد يحتاج هذا الملف إلى إعادة الرفع.',
          error: blobError.message
        });
      }
    }

    // Fallback for local files (backward compatibility during migration)
    // Note: On Vercel serverless, local file system is read-only and files may not be accessible
    // All files should be migrated to Blob Storage
    if (process.env.VERCEL === '1') {
      // On Vercel, local files are not accessible
      return res.status(404).json({
        success: false,
        message: 'الملف غير موجود. قد يحتاج هذا الملف إلى إعادة الرفع إلى Blob Storage.',
        error: 'الوصول إلى الملفات المحلية غير متاح على منصة serverless'
      });
    }

    // Local development fallback
    let filePath;
    if (path.isAbsolute(document.file_path)) {
      filePath = document.file_path;
    } else {
      let relativePath = document.file_path;
      if (relativePath.startsWith('express-app/')) {
        relativePath = relativePath.replace(/^express-app\//, '');
      }
      filePath = path.join(__dirname, '..', relativePath);
    }

    if (!fs.existsSync(filePath)) {
      const altPath = document.file_path.replace(/^express-app\//, '');
      const altFilePath = path.join(__dirname, '..', altPath);
      if (fs.existsSync(altFilePath)) {
        filePath = altFilePath;
      } else {
        return res.status(404).json({
          success: false,
          message: 'الملف غير موجود على الخادم'
        });
      }
    }

    res.setHeader('Content-Type', document.mime_type);
    res.setHeader('Content-Disposition', `attachment; filename="${document.file_name}"`);
    res.sendFile(path.resolve(filePath));
  } catch (error) {
    log.error('Error downloading document:', error);
    handleRouteError(error, req, res, 'فشل تحميل المستند');
  }
});

/**
 * Get document preview/thumbnail
 * GET /api/documents/:id/preview
 * NOTE: This must come BEFORE the generic /:id route to avoid conflicts
 */
router.get('/:id/preview', async (req, res) => {
  try {
    const document = await Document.findById(parseInt(req.params.id));

    if (!document) {
      return res.status(404).json({
        success: false,
        message: 'المستند غير موجود'
      });
    }

    // Check branch access
    const employee = await Employee.findById(document.employee_id);
    if (!employee) {
      return res.status(404).json({
        success: false,
        message: 'الموظف المرتبط بهذا المستند غير موجود'
      });
    }
    if (req.user.role === 'branch_manager' && req.user.branch_id !== employee.branch_id) {
      return res.status(403).json({
        success: false,
        message: 'تم رفض الوصول'
      });
    }

    // For images, proxy the content through backend using authenticated access
    if (document.mime_type && document.mime_type.startsWith('image/')) {
      // If file_path is a URL (Blob Storage), fetch via authenticated fetchBlobWithFallback
      if (document.file_path && (document.file_path.startsWith('http://') || document.file_path.startsWith('https://'))) {
        try {
          const { buffer, contentType, fixedUrl, source } = await fetchBlobWithFallback(document.file_path, document.r2_file_path);

          // If a fixed URL was used, update DB for future requests
          if (fixedUrl) {
            try {
              await Document.update(document.id, { file_path: fixedUrl });
              log.info(`Auto-fixed preview URL for document ${document.id}`);
            } catch (updateErr) {
              log.warn(`Could not update fixed URL for document ${document.id}:`, updateErr.message);
            }
          }

          // Lazy migration: mirror to R2 on first Vercel preview hit
          if (source === 'vercel' && !document.r2_file_path) {
            setImmediate(async () => {
              try {
                const r2Url = await mirrorVercelFileToR2(document.file_path, buffer, contentType);
                if (r2Url) await Document.update(document.id, { r2_file_path: r2Url });
              } catch (e) { /* non-blocking */ }
            });
          }

          res.setHeader('Content-Type', document.mime_type || contentType);
          return res.send(buffer);
        } catch (fetchErr) {
          log.error(`Preview fetch failed for document ${document.id}:`, fetchErr.message);
          return res.status(404).json({
            success: false,
            message: 'الملف غير متوفر في التخزين السحابي. قد يحتاج هذا الملف إلى إعادة الرفع.',
            error: fetchErr.message
          });
        }
      }

      // Fallback for local files (backward compatibility)
      // Note: On Vercel serverless, local file system is read-only
      if (document.file_path) {
        if (process.env.VERCEL === '1') {
          // On Vercel, local files are not accessible
          return res.status(404).json({
            success: false,
            message: 'معاينة الملف غير متاحة. قد يحتاج هذا الملف إلى إعادة الرفع إلى Blob Storage.',
            error: 'الوصول إلى الملفات المحلية غير متاح على منصة serverless'
          });
        }

        let filePath;
        if (path.isAbsolute(document.file_path)) {
          filePath = document.file_path;
        } else {
          let relativePath = document.file_path;
          if (relativePath.startsWith('express-app/')) {
            relativePath = relativePath.replace(/^express-app\//, '');
          }
          filePath = path.join(__dirname, '..', relativePath);
        }

        if (fs.existsSync(filePath)) {
          res.setHeader('Content-Type', document.mime_type);
          res.sendFile(path.resolve(filePath));
          return;
        } else {
          const altPath = document.file_path.replace(/^express-app\//, '');
          const altFilePath = path.join(__dirname, '..', altPath);
          if (fs.existsSync(altFilePath)) {
            res.setHeader('Content-Type', document.mime_type);
            res.sendFile(path.resolve(altFilePath));
            return;
          }
        }
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
        download_url: `/api/documents/${document.id}/download`,
        file_url: document.file_path && (document.file_path.startsWith('http://') || document.file_path.startsWith('https://'))
          ? document.file_path
          : null
      }
    });
  } catch (error) {
    log.error('Error getting document preview:', error);
    handleRouteError(error, req, res, 'فشل الحصول على معاينة المستند');
  }
});

/**
 * Get document by ID
 * GET /api/documents/:id
 * NOTE: This must come AFTER specific routes like /:id/download and /:id/preview
 * The order ensures that specific routes are matched first
 */
router.get('/:id', async (req, res) => {
  try {
    const document = await Document.findById(parseInt(req.params.id));

    if (!document) {
      return res.status(404).json({
        success: false,
        message: 'المستند غير موجود'
      });
    }

    // Check branch access
    const employee = await Employee.findById(document.employee_id);
    if (!employee) {
      return res.status(404).json({
        success: false,
        message: 'الموظف غير موجود'
      });
    }

    if (req.user.role === 'branch_manager' && req.user.branch_id !== employee.branch_id) {
      return res.status(403).json({
        success: false,
        message: 'تم رفض الوصول'
      });
    }

    res.json({ success: true, data: document });
  } catch (error) {
    log.error('Error fetching document:', error);
    handleRouteError(error, req, res, 'فشل جلب المستند');
  }
});

/**
 * Update document metadata
 * PUT /api/documents/:id
 */
router.put('/:id', async (req, res) => {
  try {
    const document = await Document.findById(parseInt(req.params.id));

    if (!document) {
      return res.status(404).json({
        success: false,
        message: 'المستند غير موجود'
      });
    }

    // Check branch access
    const employee = await Employee.findById(document.employee_id);
    if (!employee) {
      return res.status(404).json({
        success: false,
        message: 'الموظف المرتبط بهذا المستند غير موجود'
      });
    }
    if (req.user.role === 'branch_manager' && req.user.branch_id !== employee.branch_id) {
      return res.status(403).json({
        success: false,
        message: 'تم رفض الوصول'
      });
    }

    const updates = {};
    if (req.body.description !== undefined) updates.description = req.body.description;
    if (req.body.expiry_date !== undefined) updates.expiry_date = req.body.expiry_date;

    const updatedDocument = await Document.update(parseInt(req.params.id), updates);

    res.json({
      success: true,
      message: 'Document updated successfully',
      data: updatedDocument
    });
  } catch (error) {
    log.error('Error updating document:', error);
    handleRouteError(error, req, res, 'فشل تحديث المستند');
  }
});

/**
 * Verify document
 * POST /api/documents/:id/verify
 */
router.post('/:id/verify', async (req, res) => {
  try {
    const document = await Document.findById(parseInt(req.params.id));

    if (!document) {
      return res.status(404).json({
        success: false,
        message: 'المستند غير موجود'
      });
    }

    // Only main manager can verify documents
    if (req.user.role !== 'main_manager') {
      return res.status(403).json({
        success: false,
        message: 'يمكن للمدير الرئيسي فقط التحقق من المستندات'
      });
    }

    // Verify user exists before verifying document
    let verifiedByUserId = null;
    if (req.user && req.user.id) {
      try {
        const sql = (await import('../config/database.js')).default;
        const [user] = await sql`
          SELECT id FROM users WHERE id = ${req.user.id}
        `;
        if (user && user.id) {
          verifiedByUserId = req.user.id;
        } else {
          log.warn(`User with ID ${req.user.id} not found in database, setting verified_by to null`);
        }
      } catch (error) {
        log.error('Error verifying user:', error);
      }
    }

    const verifiedDocument = await Document.verify(parseInt(req.params.id), verifiedByUserId);

    res.json({
      success: true,
      message: 'تم التحقق من المستند بنجاح',
      data: verifiedDocument
    });
  } catch (error) {
    log.error('Error verifying document:', error);
    handleRouteError(error, req, res, 'Failed to verify document');
  }
});

/**
 * Delete document (soft delete)
 * DELETE /api/documents/:id
 */
router.delete('/:id', async (req, res) => {
  try {
    const document = await Document.findById(parseInt(req.params.id));

    if (!document) {
      return res.status(404).json({
        success: false,
        message: 'المستند غير موجود'
      });
    }

    // Check branch access
    const employee = await Employee.findById(document.employee_id);
    if (!employee) {
      return res.status(404).json({
        success: false,
        message: 'الموظف المرتبط بهذا المستند غير موجود'
      });
    }
    if (req.user.role === 'branch_manager' && req.user.branch_id !== employee.branch_id) {
      return res.status(403).json({
        success: false,
        message: 'تم رفض الوصول'
      });
    }

    // Only main manager can delete documents
    if (req.user.role !== 'main_manager') {
      return res.status(403).json({
        success: false,
        message: 'يمكن للمدير الرئيسي فقط حذف المستندات'
      });
    }

    const deletedDocument = await Document.softDelete(parseInt(req.params.id));

    // Delete physical file from Blob Storage if requested
    if (req.query.deleteFile === 'true') {
      await deleteFromBlob(document.file_path);
      // Also delete from R2
      if (document.r2_file_path) {
        const { deleteFromR2Mirror } = await import('../utils/dualStorage.js');
        await deleteFromR2Mirror(document.r2_file_path);
      }
    }

    // Update employee completion status after document deletion
    try {
      const { updateEmployeeCompletionStatus } = await import('../utils/employeeDataCompletion.js');
      await updateEmployeeCompletionStatus(document.employee_id);
    } catch (completionError) {
      log.error('Error updating completion status after document deletion:', completionError);
      // Don't fail the deletion if completion status update fails
    }

    res.json({
      success: true,
      message: 'تم حذف المستند بنجاح',
      data: deletedDocument
    });
  } catch (error) {
    log.error('Error deleting document:', error);
    handleRouteError(error, req, res, 'Failed to delete document');
  }
});

export default router;

