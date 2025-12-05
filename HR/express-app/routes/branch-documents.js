/**
 * Branch Document Routes
 * Upload, download, list, and manage branch documents
 */

import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { authenticate } from '../middleware/auth.js';
import { uploadSingle, validateUploadedFile } from '../middleware/upload.js';
import { verifyBranchDocumentsPassword } from '../middleware/branchDocumentsPassword.js';
import { BranchDocument } from '../models/BranchDocument.js';
import { Branch } from '../models/Branch.js';
import { getExtensionFromMimeType, fixFilenameEncoding } from '../utils/fileUpload.js';
import { uploadBranchDocumentToBlob, deleteFromBlob, fetchFromBlob } from '../utils/blobStorage.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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
        message: 'branch_id and password are required'
      });
    }

    const parsedBranchId = parseInt(branch_id);
    if (isNaN(parsedBranchId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid branch ID format'
      });
    }

    // Get branch
    const branch = await Branch.findById(parsedBranchId);
    if (!branch) {
      return res.status(404).json({ success: false, message: 'Branch not found' });
    }

    // Check access - branch managers can only verify their own branch
    if (req.user.role === 'branch_manager' && req.user.branch_id !== parsedBranchId) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    // Verify password
    if (branch.branch_documents_password !== password) {
      return res.status(401).json({ success: false, message: 'Invalid password' });
    }

    res.json({ success: true, message: 'Password verified successfully' });
  } catch (error) {
    console.error('Error verifying password:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to verify password',
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
      message: 'Failed to fetch branch documents',
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
router.post('/', verifyBranchDocumentsPassword, uploadSingle, validateUploadedFile, async (req, res) => {
  try {
    const { branch_id, document_type, description, document_number, issue_date, expiry_date, iban_number, bank_name } = req.body;

    if (!branch_id || !document_type || !req.file) {
      return res.status(400).json({
        success: false,
        message: 'branch_id, document_type, and file are required'
      });
    }

    // Check branch exists and user has access
    const branch = await Branch.findById(parseInt(branch_id));
    if (!branch) {
      return res.status(404).json({
        success: false,
        message: 'Branch not found'
      });
    }

    // Branch managers can only upload to their branch
    if (req.user.role === 'branch_manager' && req.user.branch_id !== parseInt(branch_id)) {
      return res.status(403).json({
        success: false,
        message: 'You can only upload documents for your branch'
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
        message: 'This document type is only available for healthcare centers'
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
      issue_date: issue_date || null,
      expiry_date: expiry_date || null,
      iban_number: iban_number || null,
      bank_name: bank_name || null,
      uploaded_by: uploadedById // Always set - either user.id or branch_id
    });

    res.status(201).json({
      success: true,
      message: 'Branch document uploaded successfully',
      data: document
    });
  } catch (error) {
    console.error('Error uploading branch document:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to upload branch document',
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

    // If file_path is a URL (Blob), fetch and proxy it to maintain password protection
    if (document.file_path.startsWith('http://') || document.file_path.startsWith('https://')) {
      try {
        const { buffer, contentType } = await fetchFromBlob(document.file_path);
        res.setHeader('Content-Type', contentType || document.mime_type);
        res.setHeader('Content-Disposition', `attachment; filename="${document.file_name}"`);
        return res.send(buffer);
      } catch (error) {
        console.error('Error fetching blob file:', error);
        return res.status(500).json({
          success: false,
          message: 'Failed to fetch document file',
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

    res.setHeader('Content-Type', document.mime_type);
    res.setHeader('Content-Disposition', `attachment; filename="${document.file_name}"`);
    res.sendFile(path.resolve(filePath));
  } catch (error) {
    console.error('Error downloading branch document:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to download document',
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
        message: 'Invalid document ID'
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
      message: 'Preview not available for this document type',
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
      message: 'Failed to get document preview',
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
        message: 'Invalid document ID'
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
      message: 'Failed to fetch document',
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
      message: 'Failed to verify document',
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
router.put('/:id', verifyBranchDocumentsPassword, uploadSingle, async (req, res) => {
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
          message: 'Invalid file type. Only PDF and image files are allowed.'
        });
      }

      if (!isValidFileSize(req.file.size)) {
        return res.status(400).json({
          success: false,
          message: 'File size exceeds maximum limit of 1MB'
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
          issue_date: req.body.issue_date !== undefined ? req.body.issue_date : document.issue_date,
          expiry_date: req.body.expiry_date !== undefined ? req.body.expiry_date : document.expiry_date,
          iban_number: req.body.iban_number !== undefined ? req.body.iban_number : document.iban_number,
          bank_name: req.body.bank_name !== undefined ? req.body.bank_name : document.bank_name
        }
      );
    } else {
      // Just update metadata
      updatedDocument = await BranchDocument.update(idResult.documentId, {
        description: req.body.description,
        document_number: req.body.document_number,
        issue_date: req.body.issue_date,
        expiry_date: req.body.expiry_date,
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
      message: 'Failed to update document',
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
      message: 'Failed to delete document',
      error: error.message
    });
  }
});

export default router;

