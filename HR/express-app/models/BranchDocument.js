    /**
 * Branch Document Model
 * Handles database operations for branch documents
 */

import sql from '../config/database.js';

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
      console.error('Error finding branch document by ID:', error);
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
      console.error('Error finding branch documents:', error);
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
      console.error('Error finding branch documents by branch ID:', error);
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
      console.error('Error finding branch documents by branch and type:', error);
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
      console.error('Error deactivating branch documents:', error);
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
          expiry_date, uploaded_by
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
          ${documentData.expiry_date || null},
          ${documentData.uploaded_by || null}
        )
        RETURNING *
      `;
      return document;
    } catch (error) {
      console.error('Error creating branch document:', error);
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
          expiry_date = ${updateData.expiry_date !== undefined ? updateData.expiry_date : sql`expiry_date`},
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ${id} AND is_active = true
        RETURNING *
      `;
      return document || null;
    } catch (error) {
      console.error('Error updating branch document:', error);
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
          description = ${updateData.description !== undefined ? updateData.description : sql`description`},
          expiry_date = ${updateData.expiry_date !== undefined ? updateData.expiry_date : sql`expiry_date`},
          uploaded_at = CURRENT_TIMESTAMP,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ${id} AND is_active = true
        RETURNING *
      `;
      return document || null;
    } catch (error) {
      console.error('Error updating branch document file:', error);
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
      console.error('Error verifying branch document:', error);
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
      console.error('Error deleting branch document:', error);
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
        WHERE expiry_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '${days} days'
        AND is_active = true
        ORDER BY expiry_date ASC
      `;
      return documents;
    } catch (error) {
      console.error('Error finding expiring branch documents:', error);
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
      console.error('Error finding unverified branch documents:', error);
      throw error;
    }
  }
};

