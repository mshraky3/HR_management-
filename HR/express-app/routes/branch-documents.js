/**
 * Branch Document Routes
 * Upload, download, list, and manage branch documents
 */

import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { authenticate } from '../middleware/auth.js';
import { uploadSingle, validateUploadedFile, moveFileToFinalLocation } from '../middleware/upload.js';
import { BranchDocument } from '../models/BranchDocument.js';
import { Branch } from '../models/Branch.js';
import { getDocumentPath, deleteFile, getExtensionFromMimeType } from '../utils/fileUpload.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();

// All routes require authentication
router.use(authenticate);

/**
 * Get all branch documents (with filters)
 * GET /api/branch-documents?branch_id=123&document_type=license&is_verified=false
 */
router.get('/', async (req, res) => {
  try {
    const filters = {};

    if (req.query.branch_id) {
      filters.branch_id = parseInt(req.query.branch_id);
    }

    if (req.query.document_type) {
      filters.document_type = req.query.document_type;
    }

    if (req.query.mime_type) {
      filters.mime_type = req.query.mime_type;
    }

    if (req.query.is_verified !== undefined) {
      filters.is_verified = req.query.is_verified === 'true';
    }

    let documents = [];

    // Branch managers only see their branch documents
    if (req.user.role === 'branch_manager' && req.user.branch_id) {
      documents = await BranchDocument.findByBranchId(req.user.branch_id, filters);
    } else if (req.user.role === 'main_manager') {
      // Main manager can see all branch documents
      documents = await BranchDocument.findAll(filters);
    } else {
      documents = [];
    }

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
 */
router.post('/', uploadSingle, validateUploadedFile, async (req, res) => {
  try {
    const { branch_id, document_type, description, expiry_date } = req.body;

    if (!branch_id || !document_type || !req.file) {
      if (req.file) {
        deleteFile(req.file.path);
      }
      return res.status(400).json({
        success: false,
        message: 'branch_id, document_type, and file are required'
      });
    }

    // Check branch exists and user has access
    const branch = await Branch.findById(parseInt(branch_id));
    if (!branch) {
      if (req.file) {
        deleteFile(req.file.path);
      }
      return res.status(404).json({
        success: false,
        message: 'Branch not found'
      });
    }

    // Branch managers can only upload to their branch
    if (req.user.role === 'branch_manager' && req.user.branch_id !== parseInt(branch_id)) {
      if (req.file) {
        deleteFile(req.file.path);
      }
      return res.status(403).json({
        success: false,
        message: 'You can only upload documents for your branch'
      });
    }

    // Move file to final location (store in branches/{branch_id}/documents/{document_type}/)
    const fileName = req.file.filename;
    const relativePath = await moveFileToFinalLocation(
      req.file.path,
      parseInt(branch_id),
      document_type,
      fileName,
      'branches' // Use 'branches' prefix instead of 'employees'
    );
    
    // Store relative path - normalize the path format
    // moveFileToFinalLocation returns path like: express-app/storage/uploads/documents/branches/...
    // We need: storage/uploads/documents/branches/...
    let finalPath = relativePath;
    
    // Remove 'express-app/' prefix if exists
    if (finalPath.startsWith('express-app/')) {
      finalPath = finalPath.replace(/^express-app\//, '');
    }
    
    // Remove 'storage/' prefix if exists (we'll add it back)
    if (finalPath.startsWith('storage/')) {
      finalPath = finalPath.replace(/^storage\//, '');
    }
    
    // Ensure it starts with 'storage/'
    finalPath = `storage/${finalPath}`;

    // Verify user exists before setting uploaded_by
    let uploadedByUserId = null;
    if (req.user && req.user.id) {
      try {
        // Check if user exists in database (without is_active check)
        const sql = (await import('../config/database.js')).default;
        const [user] = await sql`
          SELECT id FROM users WHERE id = ${req.user.id}
        `;
        if (user && user.id) {
          uploadedByUserId = req.user.id;
        } else {
          console.warn(`User with ID ${req.user.id} not found in database, setting uploaded_by to null`);
        }
      } catch (error) {
        console.error('Error verifying user:', error);
        // Continue with null if user verification fails
      }
    }

    // Create document record
    const document = await BranchDocument.create({
      branch_id: parseInt(branch_id),
      document_type: document_type,
      file_name: req.file.originalname,
      file_path: finalPath,
      file_size: req.file.size,
      mime_type: req.file.mimetype,
      file_extension: getExtensionFromMimeType(req.file.mimetype),
      description: description || null,
      expiry_date: expiry_date || null,
      uploaded_by: uploadedByUserId
    });

    res.status(201).json({
      success: true,
      message: 'Branch document uploaded successfully',
      data: document
    });
  } catch (error) {
    console.error('Error uploading branch document:', error);
    
    // Clean up uploaded file on error
    if (req.file) {
      deleteFile(req.file.path);
    }

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
 */
router.get('/:id/download', async (req, res) => {
  try {
    const document = await BranchDocument.findById(parseInt(req.params.id));
    
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

    // Check if file exists - handle both absolute paths and relative paths
    let filePath;
    if (path.isAbsolute(document.file_path)) {
      filePath = document.file_path;
    } else {
      // Handle different path formats
      let relativePath = document.file_path;
      
      // Remove 'express-app/' prefix if it exists
      if (relativePath.startsWith('express-app/')) {
        relativePath = relativePath.replace(/^express-app\//, '');
      }
      
      // If path starts with 'storage/', use it directly
      // Otherwise, try to build the path
      if (relativePath.startsWith('storage/')) {
        filePath = path.join(__dirname, '..', relativePath);
      } else {
        // Try with storage/ prefix
        filePath = path.join(__dirname, '..', 'storage', relativePath);
      }
    }
    
    if (!fs.existsSync(filePath)) {
      // Try alternative paths
      const alternatives = [
        path.join(__dirname, '..', document.file_path),
        path.join(__dirname, '..', document.file_path.replace(/^express-app\//, '')),
        path.join(__dirname, '..', 'storage', document.file_path.replace(/^storage\//, '').replace(/^express-app\//, '')),
      ];
      
      let found = false;
      for (const altPath of alternatives) {
        if (fs.existsSync(altPath)) {
          filePath = altPath;
          found = true;
          break;
        }
      }
      
      if (!found) {
        console.error(`[DOWNLOAD] File not found. Tried: ${filePath} and alternatives`);
        return res.status(404).json({
          success: false,
          message: 'File not found on server'
        });
      }
    }

    // Set headers and send file
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
 */
router.get('/:id/preview', async (req, res) => {
  try {
    const document = await BranchDocument.findById(parseInt(req.params.id));
    
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
      let filePath;
      if (path.isAbsolute(document.file_path)) {
        filePath = document.file_path;
      } else {
        let relativePath = document.file_path;
        if (relativePath.startsWith('express-app/')) {
          relativePath = relativePath.replace(/^express-app\//, '');
        }
        if (relativePath.startsWith('storage/')) {
          filePath = path.join(__dirname, '..', relativePath);
        } else {
          filePath = path.join(__dirname, '..', 'storage', relativePath);
        }
      }
      
      if (fs.existsSync(filePath)) {
        res.setHeader('Content-Type', document.mime_type);
        res.sendFile(path.resolve(filePath));
        return;
      } else {
        // Try alternative paths
        const alternatives = [
          path.join(__dirname, '..', document.file_path),
          path.join(__dirname, '..', document.file_path.replace(/^express-app\//, '')),
          path.join(__dirname, '..', 'storage', document.file_path.replace(/^storage\//, '').replace(/^express-app\//, '')),
        ];
        
        for (const altPath of alternatives) {
          if (fs.existsSync(altPath)) {
            res.setHeader('Content-Type', document.mime_type);
            res.sendFile(path.resolve(altPath));
            return;
          }
        }
      }
    }

    // For PDFs or if thumbnail doesn't exist, return document info
    res.json({
      success: true,
      message: 'Preview not available for this document type',
      data: {
        id: document.id,
        file_name: document.file_name,
        mime_type: document.mime_type,
        download_url: `/api/branch-documents/${document.id}/download`
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
 */
router.get('/:id', async (req, res) => {
  try {
    const document = await BranchDocument.findById(parseInt(req.params.id));
    
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
 */
router.post('/:id/verify', async (req, res) => {
  try {
    const document = await BranchDocument.findById(parseInt(req.params.id));
    
    if (!document) {
      return res.status(404).json({
        success: false,
        message: 'Document not found'
      });
    }

    // Only main manager can verify
    if (req.user.role !== 'main_manager') {
      return res.status(403).json({
        success: false,
        message: 'Only main manager can verify documents'
      });
    }

    const verifiedDocument = await BranchDocument.verify(parseInt(req.params.id), req.user.id);

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
 */
router.put('/:id', uploadSingle, async (req, res) => {
  try {
    const document = await BranchDocument.findById(parseInt(req.params.id));
    
    if (!document) {
      if (req.file) {
        deleteFile(req.file.path);
      }
      return res.status(404).json({
        success: false,
        message: 'Document not found'
      });
    }

    // Check branch access
    if (req.user.role === 'branch_manager' && req.user.branch_id !== document.branch_id) {
      if (req.file) {
        deleteFile(req.file.path);
      }
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
        deleteFile(req.file.path);
        return res.status(400).json({
          success: false,
          message: 'Invalid file type. Only PDF and image files are allowed.'
        });
      }

      if (!isValidFileSize(req.file.size)) {
        deleteFile(req.file.path);
        return res.status(400).json({
          success: false,
          message: 'File size exceeds maximum limit of 10MB'
        });
      }

      // Move new file to final location
      const fileName = req.file.filename;
      const relativePath = await moveFileToFinalLocation(
        req.file.path,
        document.branch_id,
        document.document_type,
        fileName,
        'branches'
      );
      
      // Normalize the path format
      let finalPath = relativePath;
      if (finalPath.startsWith('express-app/')) {
        finalPath = finalPath.replace(/^express-app\//, '');
      }
      if (finalPath.startsWith('storage/')) {
        finalPath = finalPath.replace(/^storage\//, '');
      }
      finalPath = `storage/${finalPath}`;

      // For license type documents, deactivate old documents of the same type
      if (document.document_type === 'license') {
        await BranchDocument.deactivateByBranchAndType(
          document.branch_id,
          document.document_type,
          document.id
        );
      }

      // Delete old file if it exists
      const oldFilePath = path.join(__dirname, '..', document.file_path);
      if (fs.existsSync(oldFilePath)) {
        try {
          fs.unlinkSync(oldFilePath);
        } catch (error) {
          console.error('Error deleting old file:', error);
          // Continue even if old file deletion fails
        }
      }

      // Update document with new file
      updatedDocument = await BranchDocument.updateFile(
        parseInt(req.params.id),
        {
          file_name: req.file.originalname,
          file_path: finalPath,
          file_size: req.file.size,
          mime_type: req.file.mimetype,
          file_extension: getExtensionFromMimeType(req.file.mimetype),
          description: req.body.description !== undefined ? req.body.description : document.description,
          expiry_date: req.body.expiry_date !== undefined ? req.body.expiry_date : document.expiry_date
        }
      );
    } else {
      // Just update metadata
      updatedDocument = await BranchDocument.update(parseInt(req.params.id), {
        description: req.body.description,
        expiry_date: req.body.expiry_date
      });
    }

    res.json({
      success: true,
      message: 'Document updated successfully',
      data: updatedDocument
    });
  } catch (error) {
    console.error('Error updating branch document:', error);
    
    // Clean up uploaded file on error
    if (req.file) {
      deleteFile(req.file.path);
    }

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
 */
router.delete('/:id', async (req, res) => {
  try {
    const document = await BranchDocument.findById(parseInt(req.params.id));
    
    if (!document) {
      return res.status(404).json({
        success: false,
        message: 'Document not found'
      });
    }

    // Check branch access - branch managers can delete their own branch documents
    if (req.user.role === 'branch_manager' && req.user.branch_id !== document.branch_id) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    await BranchDocument.delete(parseInt(req.params.id));

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

