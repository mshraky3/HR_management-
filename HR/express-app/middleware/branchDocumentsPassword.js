/**
 * Middleware to verify branch documents password
 * This middleware checks if the user has provided the correct password
 * for accessing branch documents
 */

import { Branch } from '../models/Branch.js';
import { BranchDocument } from '../models/BranchDocument.js';

/**
 * Extract branch ID from request
 */
const extractBranchId = async (req) => {
  // Check query, params, or body (with null checks)
  let branchId = req.query?.branch_id || req.params?.branch_id || req.body?.branch_id;
  
  // If not found and we have a document ID, fetch from document
  if (!branchId && req.params?.id) {
    try {
      const documentId = parseInt(req.params.id);
      if (!isNaN(documentId)) {
        const document = await BranchDocument.findById(documentId);
        if (document?.branch_id) {
          branchId = document.branch_id;
        }
      }
    } catch (error) {
      console.error('Error fetching document for branch_id:', error);
    }
  }
  
  // For branch managers, use their branch_id if not provided
  if (!branchId && req.user?.role === 'branch_manager' && req.user?.branch_id) {
    branchId = req.user.branch_id;
  }
  
  return branchId;
};

/**
 * Extract password from request
 */
const extractPassword = (req) => {
  return req.headers?.['x-branch-documents-password'] || 
         req.query?.branch_documents_password ||
         req.body?.branch_documents_password;
};

/**
 * Validate and parse branch ID
 */
const parseBranchId = (branchId) => {
  if (!branchId) {
    return { error: 'Branch ID is required. Please provide branch_id in query, params, or ensure document exists.' };
  }
  
  const parsedId = parseInt(branchId);
  if (isNaN(parsedId)) {
    return { error: 'Invalid branch ID format' };
  }
  
  return { branchId: parsedId };
};

/**
 * Middleware to verify branch documents password
 * Expects password in header: X-Branch-Documents-Password
 * Or in query parameter: branch_documents_password
 * 
 * For routes with document ID (/:id), branch_id will be fetched from the document
 */
export const verifyBranchDocumentsPassword = async (req, res, next) => {
  try {
    // Main managers don't need password verification
    if (req.user?.role === 'main_manager') {
      return next();
    }

    // Extract and validate branch ID
    const branchId = await extractBranchId(req);
    const branchIdResult = parseBranchId(branchId);
    if (branchIdResult.error) {
      return res.status(400).json({ success: false, message: branchIdResult.error });
    }
    
    const parsedBranchId = branchIdResult.branchId;
    
    // Extract password
    const password = extractPassword(req);
    if (!password) {
      return res.status(401).json({
        success: false,
        message: 'Branch documents password is required. Please provide password in X-Branch-Documents-Password header or branch_documents_password parameter.'
      });
    }

    // Get branch
    const branch = await Branch.findById(parsedBranchId);
    if (!branch) {
      console.error(`Branch with ID ${parsedBranchId} not found`);
      return res.status(404).json({ success: false, message: 'Branch not found' });
    }

    // Validate branch has password configured
    if (!branch.branch_documents_password) {
      console.error(`Branch ${parsedBranchId} does not have branch_documents_password set`);
      return res.status(500).json({
        success: false,
        message: 'Branch documents password is not configured for this branch. Please contact administrator.'
      });
    }

    // Check access - branch managers can only access their own branch
    if (req.user?.role === 'branch_manager' && req.user.branch_id !== parsedBranchId) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    // Verify password
    if (branch.branch_documents_password !== password) {
      return res.status(401).json({ success: false, message: 'Invalid branch documents password' });
    }

    // Password is correct, continue
    next();
  } catch (error) {
    console.error('Error verifying branch documents password:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to verify password',
      error: error.message
    });
  }
};

export default verifyBranchDocumentsPassword;

