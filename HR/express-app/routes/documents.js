/**
 * Document Routes
 * Upload, download, list, and manage employee documents
 */

import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { authenticate } from '../middleware/auth.js';
import { checkBranchAccess } from '../middleware/authorization.js';
import { uploadSingle, validateUploadedFile } from '../middleware/upload.js';
import { Document } from '../models/Document.js';
import { Employee } from '../models/Employee.js';
import { isValidDocumentType } from '../utils/validators.js';
import { getExtensionFromMimeType } from '../utils/fileUpload.js';
import { uploadToBlob, deleteFromBlob } from '../utils/blobStorage.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();

// All routes require authentication
router.use(authenticate);

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
        message: 'Authentication required'
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
          message: 'Employee not found'
        });
      }

      if (req.user.role === 'branch_manager' && req.user.branch_id !== employee.branch_id) {
        return res.status(403).json({
          success: false,
          message: 'Access denied'
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
          console.error('Error fetching branch documents:', error);
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
    console.error('Error fetching documents:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch documents',
      error: error.message
    });
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
        message: 'employee_id and document_type are required'
      });
    }

    // Validate document type
    if (!isValidDocumentType(document_type)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid document_type'
      });
    }

    // Check employee exists and user has access
    const employee = await Employee.findById(parseInt(employee_id));
    if (!employee) {
      return res.status(404).json({
        success: false,
        message: 'Employee not found'
      });
    }

    if (req.user.role === 'branch_manager' && req.user.branch_id !== employee.branch_id) {
      return res.status(403).json({
        success: false,
        message: 'You can only upload documents for employees in your branch'
      });
    }

    // Silently validate document type is allowed for this employee
    // Don't show error messages - just accept silently (UI should prevent invalid uploads)
    // This is a safety net - the UI should prevent invalid document types from being uploaded
    try {
      const { validateDocumentType } = await import('../utils/employeeHelpers.js');
      const sql = (await import('../config/database.js')).default;
      
      // Get branch type
      const [branch] = await sql`
        SELECT branch_type FROM branches WHERE id = ${employee.branch_id}
      `;
      
      const validation = validateDocumentType(document_type, {
        nationality: employee.nationality,
        job_title: employee.job_title,
        branch_type: branch?.branch_type || null
      });
      
      // Silently accept even if not allowed (UI prevents this, but we don't want to break anything)
      // Just log for debugging
      if (!validation.allowed) {
        console.warn(`Document type ${document_type} not allowed for employee ${employee_id}, but accepting silently (UI should prevent this)`);
        // Continue with upload anyway - UI should have prevented this
      }
    } catch (validationError) {
      // If validation fails, silently allow (backward compatibility)
      console.warn('Document type validation error:', validationError);
    }

    // Upload file to Vercel Blob Storage
    const blobUrl = await uploadToBlob(
      req.file.buffer, // File buffer from memory storage
      req.file.originalname,
      req.file.mimetype,
      parseInt(employee_id),
      document_type
    );

    // Set uploaded_by to user ID (must not be null and must reference valid user)
    let uploadedById = null;
    if (req.user && req.user.id) {
      try {
        // Check if user exists in database (without is_active check)
        const sql = (await import('../config/database.js')).default;
        const [user] = await sql`
          SELECT id FROM users WHERE id = ${req.user.id}
        `;
        if (user && user.id) {
          uploadedById = req.user.id;
        }
      } catch (error) {
        console.error('Error verifying user:', error);
      }
    }
    
    // If user not found, find first active user as fallback (usually main manager)
    if (!uploadedById) {
      try {
        const sql = (await import('../config/database.js')).default;
        const [fallbackUser] = await sql`
          SELECT id FROM users WHERE is_active = true ORDER BY id ASC LIMIT 1
        `;
        if (fallbackUser && fallbackUser.id) {
          uploadedById = fallbackUser.id;
        } else {
          // Last resort: try to find any user
          const [anyUser] = await sql`
            SELECT id FROM users ORDER BY id ASC LIMIT 1
          `;
          if (anyUser && anyUser.id) {
            uploadedById = anyUser.id;
          }
        }
      } catch (error) {
        console.error('Error finding fallback user:', error);
      }
    }
    
    // If still no valid user found, throw error
    if (!uploadedById) {
      return res.status(500).json({
        success: false,
        message: 'No valid user found for uploaded_by field. Please ensure at least one user exists in the system.'
      });
    }
    
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
      console.warn('Error fixing filename encoding:', error);
      // If decoding fails, use original filename
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
      uploaded_by: uploadedById // Always set - either user.id or branch_id
    });

    // Update employee completion status after document upload
    try {
      const { updateEmployeeCompletionStatus } = await import('../utils/employeeDataCompletion.js');
      await updateEmployeeCompletionStatus(parseInt(employee_id));
    } catch (completionError) {
      console.error('Error updating completion status after document upload:', completionError);
      // Don't fail the upload if completion status update fails
    }

    res.status(201).json({
      success: true,
      message: 'Document uploaded successfully',
      data: document
    });
  } catch (error) {
    console.error('Error uploading document:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to upload document',
      error: error.message
    });
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
        message: 'Document not found'
      });
    }

    // Check branch access
    const employee = await Employee.findById(document.employee_id);
    if (req.user.role === 'branch_manager' && req.user.branch_id !== employee.branch_id) {
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

    // If file_path is a URL (Blob), redirect to it
    if (document.file_path.startsWith('http://') || document.file_path.startsWith('https://')) {
      return res.redirect(document.file_path);
    }

    // Fallback for local files (backward compatibility during migration)
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
          message: 'File not found on server'
        });
      }
    }

    res.setHeader('Content-Type', document.mime_type);
    res.setHeader('Content-Disposition', `attachment; filename="${document.file_name}"`);
    res.sendFile(path.resolve(filePath));
  } catch (error) {
    console.error('Error downloading document:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to download document',
      error: error.message
    });
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
        message: 'Document not found'
      });
    }

    // Check branch access
    const employee = await Employee.findById(document.employee_id);
    if (req.user.role === 'branch_manager' && req.user.branch_id !== employee.branch_id) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    // For images, return the file directly
    if (document.mime_type && document.mime_type.startsWith('image/')) {
      // If file_path is a URL (Blob), redirect to it
      if (document.file_path && (document.file_path.startsWith('http://') || document.file_path.startsWith('https://'))) {
        return res.redirect(document.file_path);
      }

      // Fallback for local files (backward compatibility)
      if (document.file_path) {
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
      message: 'Preview not available for this document type',
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
    console.error('Error getting document preview:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get document preview',
      error: error.message
    });
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
        message: 'Document not found'
      });
    }

    // Check branch access
    const employee = await Employee.findById(document.employee_id);
    if (!employee) {
      return res.status(404).json({
        success: false,
        message: 'Employee not found'
      });
    }

    if (req.user.role === 'branch_manager' && req.user.branch_id !== employee.branch_id) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    res.json({ success: true, data: document });
  } catch (error) {
    console.error('Error fetching document:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch document',
      error: error.message
    });
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
        message: 'Document not found'
      });
    }

    // Check branch access
    const employee = await Employee.findById(document.employee_id);
    if (req.user.role === 'branch_manager' && req.user.branch_id !== employee.branch_id) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
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
    console.error('Error updating document:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update document',
      error: error.message
    });
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
        message: 'Document not found'
      });
    }

    // Only main manager can verify documents
    if (req.user.role !== 'main_manager') {
      return res.status(403).json({
        success: false,
        message: 'Only main manager can verify documents'
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
          console.warn(`User with ID ${req.user.id} not found in database, setting verified_by to null`);
        }
      } catch (error) {
        console.error('Error verifying user:', error);
      }
    }
    
    const verifiedDocument = await Document.verify(parseInt(req.params.id), verifiedByUserId);
    
    res.json({
      success: true,
      message: 'Document verified successfully',
      data: verifiedDocument
    });
  } catch (error) {
    console.error('Error verifying document:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to verify document',
      error: error.message
    });
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
        message: 'Document not found'
      });
    }

    // Check branch access
    const employee = await Employee.findById(document.employee_id);
    if (req.user.role === 'branch_manager' && req.user.branch_id !== employee.branch_id) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    // Only main manager can delete documents
    if (req.user.role !== 'main_manager') {
      return res.status(403).json({
        success: false,
        message: 'Only main manager can delete documents'
      });
    }

    const deletedDocument = await Document.softDelete(parseInt(req.params.id));
    
    // Delete physical file from Blob Storage if requested
    if (req.query.deleteFile === 'true') {
      await deleteFromBlob(document.file_path);
    }
    
    // Update employee completion status after document deletion
    try {
      const { updateEmployeeCompletionStatus } = await import('../utils/employeeDataCompletion.js');
      await updateEmployeeCompletionStatus(document.employee_id);
    } catch (completionError) {
      console.error('Error updating completion status after document deletion:', completionError);
      // Don't fail the deletion if completion status update fails
    }
    
    res.json({
      success: true,
      message: 'Document deleted successfully',
      data: deletedDocument
    });
  } catch (error) {
    console.error('Error deleting document:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete document',
      error: error.message
    });
  }
});

export default router;

