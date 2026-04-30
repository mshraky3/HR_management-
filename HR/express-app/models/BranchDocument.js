/**
* Branch Document Model
* Handles database operations for branch documents
*/

import sql from '../config/database.js';
import { log } from '../utils/logger.js';

export const BranchDocument = {
  /**
   * Find branch document by ID
   */
  async findById(id) {
    try {
      const [document] = await sql`
        SELECT * FROM branch_documents 
        WHERE id = ${id} AND is_active = true
      `;
      return document || null;
    } catch (error) {
      log.error('Error finding branch document by ID:', { error: error.message });
      throw error;
    }
  },

  /**
   * Find all branch documents (with optional filters)
   */
  async findAll(filters = {}) {
    try {
      let query = sql`
        SELECT bd.*, b.branch_name 
        FROM branch_documents bd
        INNER JOIN branches b ON bd.branch_id = b.id
        WHERE bd.is_active = true
      `;

      if (filters.branch_id) {
        query = sql`${query} AND bd.branch_id = ${filters.branch_id}`;
      }

      if (filters.document_type) {
        query = sql`${query} AND bd.document_type = ${filters.document_type}`;
      }

      if (filters.mime_type) {
        query = sql`${query} AND bd.mime_type = ${filters.mime_type}`;
      }

      if (filters.is_verified !== undefined) {
        query = sql`${query} AND bd.is_verified = ${filters.is_verified}`;
      }

      query = sql`${query} ORDER BY bd.uploaded_at DESC`;

      return await query;
    } catch (error) {
      log.error('Error finding branch documents:', { error: error.message });
      throw error;
    }
  },

  /**
   * Find branch documents by branch ID
   */
  async findByBranchId(branchId, filters = {}) {
    try {
      let query = sql`
        SELECT bd.*, b.branch_name 
        FROM branch_documents bd
        INNER JOIN branches b ON bd.branch_id = b.id
        WHERE bd.branch_id = ${branchId} AND bd.is_active = true
      `;

      if (filters.document_type) {
        query = sql`${query} AND bd.document_type = ${filters.document_type}`;
      }

      if (filters.mime_type) {
        query = sql`${query} AND bd.mime_type = ${filters.mime_type}`;
      }

      if (filters.is_verified !== undefined) {
        query = sql`${query} AND bd.is_verified = ${filters.is_verified}`;
      }

      query = sql`${query} ORDER BY bd.uploaded_at DESC`;

      return await query;
    } catch (error) {
      log.error('Error finding branch documents by branch ID:', { error: error.message });
      throw error;
    }
  },

  /**
   * Find active documents by branch ID and document type
   */
  async findByBranchAndType(branchId, documentType) {
    try {
      const documents = await sql`
        SELECT * FROM branch_documents 
        WHERE branch_id = ${branchId} 
        AND document_type = ${documentType} 
        AND is_active = true
        ORDER BY uploaded_at DESC
      `;
      return documents;
    } catch (error) {
      log.error('Error finding branch documents by branch and type:', { error: error.message });
      throw error;
    }
  },

  /**
   * Soft delete documents by branch ID and document type (for replacing documents)
   */
  async deactivateByBranchAndType(branchId, documentType, excludeId = null) {
    try {
      let query = sql`
        UPDATE branch_documents
        SET is_active = false, updated_at = CURRENT_TIMESTAMP
        WHERE branch_id = ${branchId} 
        AND document_type = ${documentType}
        AND is_active = true
      `;

      if (excludeId) {
        query = sql`${query} AND id != ${excludeId}`;
      }

      const result = await query;
      return result;
    } catch (error) {
      log.error('Error deactivating branch documents:', { error: error.message });
      throw error;
    }
  },

  /**
   * Create new branch document record
   */
  async create(documentData) {
    try {
      const [document] = await sql`
        INSERT INTO branch_documents (
          branch_id, document_type, file_name, file_path, file_size,
          mime_type, file_extension, thumbnail_path, description,
          document_number, issue_date, issue_date_hijri, expiry_date, expiry_date_hijri, iban_number, bank_name, uploaded_by,
          r2_file_path
        )
        VALUES (
          ${documentData.branch_id},
          ${documentData.document_type},
          ${documentData.file_name},
          ${documentData.file_path},
          ${documentData.file_size || null},
          ${documentData.mime_type},
          ${documentData.file_extension || null},
          ${documentData.thumbnail_path || null},
          ${documentData.description || null},
          ${documentData.document_number || null},
          ${documentData.issue_date || null},
          ${documentData.issue_date_hijri || null},
          ${documentData.expiry_date || null},
          ${documentData.expiry_date_hijri || null},
          ${documentData.iban_number || null},
          ${documentData.bank_name || null},
          ${documentData.uploaded_by || null},
          ${documentData.r2_file_path || null}
        )
        RETURNING *
      `;
      return document;
    } catch (error) {
      log.error('Error creating branch document:', { error: error.message });
      throw error;
    }
  },

  /**
   * Update branch document metadata
   */
  async update(id, updateData) {
    try {
      const [document] = await sql`
        UPDATE branch_documents
        SET 
          description = ${updateData.description !== undefined ? updateData.description : sql`description`},
          document_number = ${updateData.document_number !== undefined ? updateData.document_number : sql`document_number`},
          issue_date = ${updateData.issue_date !== undefined ? updateData.issue_date : sql`issue_date`},
          issue_date_hijri = ${updateData.issue_date_hijri !== undefined ? updateData.issue_date_hijri : sql`issue_date_hijri`},
          expiry_date = ${updateData.expiry_date !== undefined ? updateData.expiry_date : sql`expiry_date`},
          expiry_date_hijri = ${updateData.expiry_date_hijri !== undefined ? updateData.expiry_date_hijri : sql`expiry_date_hijri`},
          iban_number = ${updateData.iban_number !== undefined ? updateData.iban_number : sql`iban_number`},
          bank_name = ${updateData.bank_name !== undefined ? updateData.bank_name : sql`bank_name`},
          file_path = ${updateData.file_path !== undefined ? updateData.file_path : sql`file_path`},
          r2_file_path = ${updateData.r2_file_path !== undefined ? updateData.r2_file_path : sql`r2_file_path`},
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ${id} AND is_active = true
        RETURNING *
      `;
      return document || null;
    } catch (error) {
      log.error('Error updating branch document:', { error: error.message });
      throw error;
    }
  },

  /**
   * Update branch document file and metadata
   */
  async updateFile(id, updateData) {
    try {
      const [document] = await sql`
        UPDATE branch_documents
        SET 
          file_name = ${updateData.file_name},
          file_path = ${updateData.file_path},
          file_size = ${updateData.file_size || null},
          mime_type = ${updateData.mime_type},
          file_extension = ${updateData.file_extension || null},
          r2_file_path = ${updateData.r2_file_path !== undefined ? updateData.r2_file_path : sql`r2_file_path`},
          description = ${updateData.description !== undefined ? updateData.description : sql`description`},
          document_number = ${updateData.document_number !== undefined ? updateData.document_number : sql`document_number`},
          issue_date = ${updateData.issue_date !== undefined ? updateData.issue_date : sql`issue_date`},
          issue_date_hijri = ${updateData.issue_date_hijri !== undefined ? updateData.issue_date_hijri : sql`issue_date_hijri`},
          expiry_date = ${updateData.expiry_date !== undefined ? updateData.expiry_date : sql`expiry_date`},
          expiry_date_hijri = ${updateData.expiry_date_hijri !== undefined ? updateData.expiry_date_hijri : sql`expiry_date_hijri`},
          uploaded_at = CURRENT_TIMESTAMP,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ${id} AND is_active = true
        RETURNING *
      `;
      return document || null;
    } catch (error) {
      log.error('Error updating branch document file:', { error: error.message });
      throw error;
    }
  },

  /**
   * Verify branch document
   */
  async verify(id, verifiedBy) {
    try {
      const [document] = await sql`
        UPDATE branch_documents
        SET 
          is_verified = true,
          verified_at = CURRENT_TIMESTAMP,
          verified_by = ${verifiedBy}
        WHERE id = ${id} AND is_active = true
        RETURNING *
      `;
      return document || null;
    } catch (error) {
      log.error('Error verifying branch document:', { error: error.message });
      throw error;
    }
  },

  /**
   * Soft delete branch document
   */
  async delete(id) {
    try {
      const [document] = await sql`
        UPDATE branch_documents
        SET is_active = false, updated_at = CURRENT_TIMESTAMP
        WHERE id = ${id}
        RETURNING *
      `;
      return document || null;
    } catch (error) {
      log.error('Error deleting branch document:', { error: error.message });
      throw error;
    }
  },

  /**
   * Find expiring branch documents
   */
  async findExpiring(days = 30) {
    try {
      const documents = await sql`
        SELECT * FROM branch_documents
        WHERE expiry_date BETWEEN CURRENT_DATE AND CURRENT_DATE + ${days} * INTERVAL '1 day'
        AND is_active = true
        ORDER BY expiry_date ASC
      `;
      return documents;
    } catch (error) {
      log.error('Error finding expiring branch documents:', { error: error.message });
      throw error;
    }
  },

  /**
   * Find unverified branch documents
   */
  async findUnverified(branchId = null) {
    try {
      let query = sql`
        SELECT * FROM branch_documents
        WHERE is_verified = false AND is_active = true
      `;

      if (branchId) {
        query = sql`${query} AND branch_id = ${branchId}`;
      }

      query = sql`${query} ORDER BY uploaded_at DESC`;

      return await query;
    } catch (error) {
      log.error('Error finding unverified branch documents:', { error: error.message });
      throw error;
    }
  },

  /**
   * Archive expired branch documents
   * Checks both Gregorian and Hijri expiry dates
   * Sets is_active = false for documents where either expiry date is in the past
   * @returns {Object} { archivedCount: number, archivedIds: number[] }
   */
  async archiveExpiredDocuments() {
    try {
      const { hijriToGregorian, parseHijriString } = await import('../utils/dateConverter.js');
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      // Get all active documents with expiry dates
      const activeDocuments = await sql`
        SELECT id, expiry_date, expiry_date_hijri
        FROM branch_documents
        WHERE is_active = true
        AND (expiry_date IS NOT NULL OR expiry_date_hijri IS NOT NULL)
      `;

      const expiredIds = [];

      for (const doc of activeDocuments) {
        let isExpired = false;

        // Check Gregorian expiry date
        if (doc.expiry_date) {
          const expiryDate = new Date(doc.expiry_date);
          expiryDate.setHours(0, 0, 0, 0);
          if (expiryDate < today) {
            isExpired = true;
          }
        }

        // Check Hijri expiry date (convert to Gregorian for comparison)
        if (!isExpired && doc.expiry_date_hijri && doc.expiry_date_hijri !== '') {
          const hijriParts = parseHijriString(doc.expiry_date_hijri);
          if (hijriParts) {
            const gregorianExpiry = hijriToGregorian(hijriParts.day, hijriParts.month, hijriParts.year);
            if (gregorianExpiry) {
              const expiryDate = new Date(gregorianExpiry);
              expiryDate.setHours(0, 0, 0, 0);
              if (expiryDate < today) {
                isExpired = true;
              }
            }
          }
        }

        if (isExpired) {
          expiredIds.push(doc.id);
        }
      }

      // Archive expired documents
      if (expiredIds.length > 0) {
        await sql`
          UPDATE branch_documents
          SET is_active = false, updated_at = CURRENT_TIMESTAMP
          WHERE id = ANY(${expiredIds})
        `;
      }

      return {
        archivedCount: expiredIds.length,
        archivedIds: expiredIds
      };
    } catch (error) {
      log.error('Error archiving expired branch documents:', { error: error.message });
      throw error;
    }
  }
};

