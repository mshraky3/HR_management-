/**
 * File Upload Utilities
 * Handles file uploads and storage
 * TODO: Implement multer configuration when multer package is added
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Storage directories
export const STORAGE_BASE = path.join(__dirname, '../storage');
export const DOCUMENTS_DIR = path.join(STORAGE_BASE, 'uploads/documents');
export const THUMBNAILS_DIR = path.join(STORAGE_BASE, 'uploads/thumbnails');
export const TEMP_DIR = path.join(STORAGE_BASE, 'uploads/temp');

/**
 * Ensure storage directories exist
 */
export function ensureDirectoriesExist() {
  const dirs = [STORAGE_BASE, DOCUMENTS_DIR, THUMBNAILS_DIR, TEMP_DIR];
  
  dirs.forEach(dir => {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
      console.log(`Created directory: ${dir}`);
    }
  });
}

/**
 * Generate unique filename
 * Format: {YYYYMMDD_HHMMSS}_{sanitized_original_name}.{ext}
 */
export function generateFileName(originalName) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19).replace('T', '_');
  const sanitized = originalName.replace(/[^a-zA-Z0-9.-]/g, '_');
  const ext = path.extname(originalName);
  return `${timestamp}_${sanitized}${ext}`;
}

/**
 * Get document storage path for an employee
 */
export function getDocumentPath(employeeId, documentType, fileName) {
  const employeeDir = path.join(DOCUMENTS_DIR, employeeId.toString(), documentType);
  
  // Ensure directory exists
  if (!fs.existsSync(employeeDir)) {
    fs.mkdirSync(employeeDir, { recursive: true });
  }
  
  return path.join(employeeDir, fileName);
}

/**
 * Get branch document storage path
 */
export function getBranchDocumentPath(branchId, documentType, fileName) {
  const branchDir = path.join(DOCUMENTS_DIR, 'branches', branchId.toString(), documentType);
  
  // Ensure directory exists
  if (!fs.existsSync(branchDir)) {
    fs.mkdirSync(branchDir, { recursive: true });
  }
  
  return path.join(branchDir, fileName);
}

/**
 * Get thumbnail path
 */
export function getThumbnailPath(employeeId, documentType, fileName) {
  const thumbnailDir = path.join(THUMBNAILS_DIR, employeeId.toString(), documentType);
  
  // Ensure directory exists
  if (!fs.existsSync(thumbnailDir)) {
    fs.mkdirSync(thumbnailDir, { recursive: true });
  }
  
  return path.join(thumbnailDir, fileName.replace(/\.[^.]+$/, '_thumb.jpg'));
}

/**
 * Delete file
 */
export function deleteFile(filePath) {
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      return true;
    }
    return false;
  } catch (error) {
    console.error('Error deleting file:', error);
    return false;
  }
}

/**
 * Get file extension from MIME type
 */
export function getExtensionFromMimeType(mimeType) {
  const mimeToExt = {
    'application/pdf': '.pdf',
    'image/jpeg': '.jpg',
    'image/jpg': '.jpg',
    'image/png': '.png',
    'image/gif': '.gif'
  };
  return mimeToExt[mimeType] || '';
}

// Initialize directories on import
ensureDirectoriesExist();

