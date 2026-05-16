/**
 * Suggestion Model
 * Handles all database operations for the suggestions table
 */

import sql from '../config/database.js';
import { log } from '../utils/logger.js';

// Importance levels with Arabic labels
const IMPORTANCE_LEVELS = {
    very_impactful: 'مؤثر جداً',
    useful: 'مفيد',
    urgent_important: 'عاجل ومهم',
    not_impactful: 'غير مؤثر'
};

// Status options with Arabic labels
const STATUS_OPTIONS = {
    pending: 'قيد الانتظار',
    reviewed: 'تمت المراجعة',
    implemented: 'تم التنفيذ',
    rejected: 'مرفوض'
};

const Suggestion = {
    /**
     * Get all importance levels
     */
    getImportanceLevels() {
        return IMPORTANCE_LEVELS;
    },

    /**
     * Get all status options
     */
    getStatusOptions() {
        return STATUS_OPTIONS;
    },

    /**
     * Find all suggestions with optional filters
     */
    async findAll(filters = {}) {
        try {
            let query = sql`
        SELECT 
          s.*,
          b.branch_name
        FROM suggestions s
        LEFT JOIN branches b ON s.branch_id = b.id
        WHERE 1=1
      `;

            if (filters.branch_id) {
                query = sql`${query} AND s.branch_id = ${filters.branch_id}`;
            }
            if (filters.importance_level) {
                query = sql`${query} AND s.importance_level = ${filters.importance_level}`;
            }
            if (filters.status) {
                query = sql`${query} AND s.status = ${filters.status}`;
            }

            query = sql`${query} ORDER BY s.created_at DESC`;

            const suggestions = await query;
            return suggestions;
        } catch (error) {
            log.error('Error finding all suggestions', { error: error.message });
            throw error;
        }
    },

    /**
     * Find suggestion by ID
     */
    async findById(id) {
        try {
            const [suggestion] = await sql`
        SELECT 
          s.*,
          b.branch_name
        FROM suggestions s
        LEFT JOIN branches b ON s.branch_id = b.id
        WHERE s.id = ${id}
      `;
            return suggestion;
        } catch (error) {
            log.error('Error finding suggestion by ID', { id, error: error.message });
            throw error;
        }
    },

    /**
     * Create new suggestion
     */
    async create(suggestionData) {
        try {
            const { branch_id, suggestion_text, importance_level } = suggestionData;

            const [suggestion] = await sql`
        INSERT INTO suggestions (branch_id, suggestion_text, importance_level)
        VALUES (${branch_id}, ${suggestion_text}, ${importance_level || 'useful'})
        RETURNING *
      `;

            return suggestion;
        } catch (error) {
            log.error('Error creating suggestion', { error: error.message });
            throw error;
        }
    },

    /**
     * Update suggestion
     */
    async update(id, updateData) {
        try {
            const { suggestion_text, importance_level, status, admin_notes } = updateData;

            const [suggestion] = await sql`
        UPDATE suggestions
        SET 
          suggestion_text = COALESCE(${suggestion_text}, suggestion_text),
          importance_level = COALESCE(${importance_level}, importance_level),
          status = COALESCE(${status}, status),
          admin_notes = COALESCE(${admin_notes}, admin_notes),
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ${id}
        RETURNING *
      `;

            return suggestion;
        } catch (error) {
            log.error('Error updating suggestion', { id, error: error.message });
            throw error;
        }
    },

    /**
     * Delete suggestion
     */
    async delete(id) {
        try {
            const [suggestion] = await sql`
        DELETE FROM suggestions
        WHERE id = ${id}
        RETURNING *
      `;
            return suggestion;
        } catch (error) {
            log.error('Error deleting suggestion', { id, error: error.message });
            throw error;
        }
    },

    /**
     * Get statistics by importance level
     */
    async getStatsByImportance() {
        try {
            const stats = await sql`
        SELECT 
          importance_level,
          COUNT(*) as count
        FROM suggestions
        GROUP BY importance_level
        ORDER BY 
          CASE importance_level
            WHEN 'urgent_important' THEN 1
            WHEN 'very_impactful' THEN 2
            WHEN 'useful' THEN 3
            WHEN 'not_impactful' THEN 4
          END
      `;
            return stats;
        } catch (error) {
            log.error('Error getting stats by importance', { error: error.message });
            throw error;
        }
    },

    /**
     * Get statistics by status
     */
    async getStatsByStatus() {
        try {
            const stats = await sql`
        SELECT 
          status,
          COUNT(*) as count
        FROM suggestions
        GROUP BY status
        ORDER BY 
          CASE status
            WHEN 'pending' THEN 1
            WHEN 'reviewed' THEN 2
            WHEN 'implemented' THEN 3
            WHEN 'rejected' THEN 4
          END
      `;
            return stats;
        } catch (error) {
            log.error('Error getting stats by status', { error: error.message });
            throw error;
        }
    },

    /**
     * Get statistics by branch
     */
    async getStatsByBranch() {
        try {
            const stats = await sql`
        SELECT 
          b.id as branch_id,
          b.branch_name,
          COUNT(s.id) as count
        FROM branches b
        LEFT JOIN suggestions s ON b.id = s.branch_id
        GROUP BY b.id, b.branch_name
        HAVING COUNT(s.id) > 0
        ORDER BY count DESC
      `;
            return stats;
        } catch (error) {
            log.error('Error getting stats by branch', { error: error.message });
            throw error;
        }
    },

    /**
     * Get overall statistics
     */
    async getOverallStats() {
        try {
            const [overall] = await sql`
        SELECT 
          COUNT(*) as total,
          COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending_count,
          COUNT(CASE WHEN status = 'reviewed' THEN 1 END) as reviewed_count,
          COUNT(CASE WHEN status = 'implemented' THEN 1 END) as implemented_count,
          COUNT(CASE WHEN status = 'rejected' THEN 1 END) as rejected_count
        FROM suggestions
      `;
            return overall;
        } catch (error) {
            log.error('Error getting overall stats', { error: error.message });
            throw error;
        }
    }
};

export default Suggestion;
