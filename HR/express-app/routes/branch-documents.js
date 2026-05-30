/**
 * Branch Document Routes
 * Upload, download, list, and manage branch documents
 */

import express from "express";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { PDFDocument } from "pdf-lib";
import sql from "../config/database.js";
import { authenticate } from "../middleware/auth.js";
import { uploadSingle, validateUploadedFile } from "../middleware/upload.js";
import { BranchDocument } from "../models/BranchDocument.js";
import { Branch } from "../models/Branch.js";
import { loadAssignedBranches } from "../middleware/authorization.js";
import {
  getExtensionFromMimeType,
  fixFilenameEncoding,
} from "../utils/fileUpload.js";
import {
  uploadBranchDocumentToBlob,
  deleteFromBlob,
  fetchBlobWithFallback,
  copyBlob,
  fixDoubleExtensionUrl,
} from "../utils/blobStorage.js";
import { mirrorVercelFileToR2 } from "../utils/dualStorage.js";
import { clearByPrefix } from "../utils/simpleCache.js";
import { formatDate } from "../utils/dateConverter.js";
import { validateDateFields } from "../middleware/dateValidation.js";
import { validateBranchDocumentDates } from "../middleware/branchDocumentDateValidation.js";
import { getScopedBranchFilter, resolveBranchAccessFromScope } from "../utils/policyScope.js";
import { printer } from "../utils/pdfFonts.js";
import { handleRouteError } from '../utils/routeErrorHandler.js';
import { log } from '../utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();

/**
 * Get valid user ID for uploaded_by field
 */
const getUploadedByUserId = async (userId) => {
  if (!userId) return null;

  try {
    const [user] = await sql`SELECT id FROM users WHERE id = ${userId}`;
    if (user?.id) return user.id;
  } catch (error) {
    log.error("Error verifying user:", error);
  }

  // Fallback: find first active user
  try {
    const [fallbackUser] = await sql`
      SELECT id FROM users WHERE is_active = true ORDER BY id ASC LIMIT 1
    `;
    if (fallbackUser?.id) return fallbackUser.id;

    // Last resort: find any user
    const [anyUser] = await sql`SELECT id FROM users ORDER BY id ASC LIMIT 1`;
    return anyUser?.id || null;
  } catch (error) {
    log.error("Error finding fallback user:", error);
    return null;
  }
};

/**
 * Safely parse document ID from request params
 */
const parseDocumentId = (req) => {
  const id = parseInt(req.params?.id);
  if (isNaN(id)) {
    return { error: "Invalid document ID" };
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
  if (filePath.startsWith("http://") || filePath.startsWith("https://")) {
    return null;
  }

  // If absolute path, use as is
  if (path.isAbsolute(filePath)) {
    return fs.existsSync(filePath) ? filePath : null;
  }

  // Try different relative path combinations (for legacy files only)
  const alternatives = [
    path.join(__dirname, "..", filePath),
    path.join(__dirname, "..", filePath.replace(/^express-app\//, "")),
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
router.use(loadAssignedBranches);

/**
 * Get all branch documents (with filters)
 * GET /api/branch-documents?branch_id=123&document_type=license&is_verified=false
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
    filters.is_verified = query.is_verified === "true";
  }

  return filters;
};

/**
 * Get documents based on user scope
 */
const getDocumentsByRole = async (req, filters) => {
  const scopedBranch = getScopedBranchFilter(req, { allowMultiple: true });

  if (scopedBranch === null || scopedBranch === undefined) {
    // main_manager: no restriction
    return await BranchDocument.findAll(filters);
  }

  const allowedIds = Array.isArray(scopedBranch) ? scopedBranch : [scopedBranch];

  if (filters.branch_id) {
    if (!allowedIds.includes(parseInt(filters.branch_id))) return [];
    return await BranchDocument.findByBranchId(filters.branch_id, filters);
  }

  if (allowedIds.length === 1) {
    return await BranchDocument.findByBranchId(allowedIds[0], filters);
  }

  // Multiple branches (ops_manager)
  const allDocs = [];
  for (const branchId of allowedIds) {
    const docs = await BranchDocument.findByBranchId(branchId, filters);
    allDocs.push(...(docs || []));
  }
  return allDocs;
};

router.get("/", async (req, res) => {
  try {
    // Archive expired documents before loading (on-demand check)
    const archiveResult = await BranchDocument.archiveExpiredDocuments();
    if (archiveResult.archivedCount > 0) {
      log.info(
        `[BRANCH DOCS] Auto-archived ${archiveResult.archivedCount} expired documents`,
      );
    }

    const filters = buildFilters(req.query);
    const documents = await getDocumentsByRole(req, filters);

    // Filter documents to only include those with valid file paths
    // This ensures uploaded files are actually present
    const validDocuments = (documents || []).filter((doc) => {
      // Check if file_path exists and is valid (blob URL or local path)
      const hasValidFile =
        doc.file_path &&
        (doc.file_path.startsWith("https://") ||
          doc.file_path.startsWith("http://") ||
          doc.file_path.length > 0);
      return hasValidFile;
    });

    return res.json({
      success: true,
      data: validDocuments,
      metadata: {
        archivedCount: archiveResult.archivedCount,
        totalReturned: validDocuments.length,
        filteredOut: (documents || []).length - validDocuments.length,
      },
    });
  } catch (error) {
    log.error("Error fetching branch documents:", error);
    handleRouteError(error, req, res, 'فشل جلب مستندات الفرع');
  }
});

/**
 * Upload branch document
 * POST /api/branch-documents
 * Form data: branch_id, document_type, file, description (optional), expiry_date (optional)
 */
router.post(
  "/",
  uploadSingle,
  validateUploadedFile,
  validateDateFields({
    issue_date_hijri: {
      calendarType: "hijri",
      dateType: "general",
      required: false,
    },
    expiry_date_hijri: {
      calendarType: "hijri",
      dateType: "expiry_date",
      required: false,
    },
  }),
  validateBranchDocumentDates,
  async (req, res) => {
    try {
      const {
        branch_id,
        document_type,
        description,
        document_number,
        issue_date,
        issue_date_hijri,
        expiry_date,
        expiry_date_hijri,
        iban_number,
        bank_name,
      } = req.body;

      let normalizedDocumentType =
        typeof document_type === "string" ? document_type.trim() : document_type;

      if (normalizedDocumentType === "insurance_print") {
        normalizedDocumentType = "insurance_statement";
      }

      if (!branch_id || !normalizedDocumentType || !req.file) {
        return res.status(400).json({
          success: false,
          message: "معرف الفرع ونوع المستند والملف مطلوبة",
        });
      }

      // Check branch exists and user has access
      const branch = await Branch.findById(parseInt(branch_id));
      if (!branch) {
        return res.status(404).json({
          success: false,
          message: "الفرع غير موجود",
        });
      }

      // Enforce branch access via scope
      const uploadBranchAccess = resolveBranchAccessFromScope(req.scope, parseInt(branch_id));
      if (!uploadBranchAccess.allowed) {
        return res.status(403).json({
          success: false,
          message: "ليس لديك صلاحية رفع مستندات لهذا الفرع",
        });
      }

      // Restrict certain document types from branch managers
      const restrictedDocumentTypes = [
        "staff_cadre",
        "dropped_students",
        "free_seats",
        "acceptance_notifications",
        "other",
      ];

      if (
        req.user.role === "branch_manager" &&
        restrictedDocumentTypes.includes(normalizedDocumentType)
      ) {
        return res.status(403).json({
          success: false,
          message: "هذا النوع من المستندات غير متاح للرفع من قبل مديري الفروع",
        });
      }

      // Validate healthcare-specific documents can only be uploaded to healthcare centers
      const healthcareOnlyDocuments = [
        "operational_plan",
        "decision_obligation",
        "decision_commitment",
        "staff_cadre",
        "owner_civil_id_copy",
        "disclosure_commitment",
        "certification_commitment_form",
        "financial_platform_declaration",
        "financial_claim_form",
        "student_cadre_file",
        "dropped_students",
        "free_seats",
        "acceptance_notifications",
      ];
      if (
        healthcareOnlyDocuments.includes(normalizedDocumentType) &&
        branch.branch_type !== "healthcare_center"
      ) {
        return res.status(400).json({
          success: false,
          message: "هذا النوع من المستندات متاح فقط لمراكز الرعاية الصحية",
        });
      }

      // Fix filename encoding for Arabic characters BEFORE upload
      // This ensures correct encoding for both blob path and database record
      const fixedFileName = fixFilenameEncoding(req.file.originalname);

      // Upload file to Vercel Blob Storage
      // Note: uploadBranchDocumentToBlob uses generateFileName which sanitizes the filename
      // This ensures blob paths are safe for Vercel Blob Storage (no special characters)
      const { url: blobUrl, r2Url } = await uploadBranchDocumentToBlob(
        req.file.buffer,
        fixedFileName, // Use fixed filename for consistent encoding
        req.file.mimetype,
        parseInt(branch_id),
        normalizedDocumentType,
      );

      // Get valid user ID for uploaded_by field
      const uploadedById = await getUploadedByUserId(req.user?.id);
      if (!uploadedById) {
        return res.status(500).json({
          success: false,
          message: 'No valid user found for uploaded_by field. Please ensure at least one user exists in the system.',
        });
      }

      // Use the fixed filename for database record
      const fileName = fixedFileName;

      // Date conversion and validation is handled by validateDateFields middleware
      // IMPORTANT: Use req.body values after validation middleware has normalized both dates
      // The middleware ensures both Hijri and Gregorian are set even if only one was provided
      const finalIssueDate = req.body.issue_date || null;
      const finalIssueDateHijri = req.body.issue_date_hijri || null;
      const finalExpiryDate = req.body.expiry_date || null;
      const finalExpiryDateHijri = req.body.expiry_date_hijri || null;

      // Log date conversion for verification
      log.info("[BRANCH DOC UPLOAD] Dates after validation:", {
        issue_date: finalIssueDate,
        issue_date_hijri: finalIssueDateHijri,
        expiry_date: finalExpiryDate,
        expiry_date_hijri: finalExpiryDateHijri,
      });

      // Create document record - store blob URL
      const document = await BranchDocument.create({
        branch_id: parseInt(branch_id),
        document_type: normalizedDocumentType,
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
        uploaded_by: uploadedById, // Always set - either user.id or branch_id
        r2_file_path: r2Url || null,
      });

      // Invalidate dashboard & branch statistics caches for this branch
      clearByPrefix(`dashboard:summary:${branch_id}`);
      clearByPrefix("branch-statistics");

      res.status(201).json({
        success: true,
        message: "Branch document uploaded successfully",
        data: document,
      });
    } catch (error) {
      log.error("Error uploading branch document:", error);
      handleRouteError(error, req, res, 'فشل رفع مستند الفرع');
    }
  },
);

/**
 * Download branch document file
 * GET /api/branch-documents/:id/download
 * NOTE: This must come BEFORE the generic /:id route to avoid conflicts
 */
router.get("/:id/download", async (req, res) => {
  try {
    const idResult = parseDocumentId(req);
    if (idResult.error) {
      return res.status(400).json({ success: false, message: idResult.error });
    }

    const document = await BranchDocument.findById(idResult.documentId);

    if (!document) {
      return res.status(404).json({
        success: false,
        message: "Document not found",
      });
    }

    // Check branch access
    if (
      req.user.role === "branch_manager" &&
      req.user.branch_id !== document.branch_id
    ) {
      return res.status(403).json({
        success: false,
        message: "Access denied",
      });
    }

    // Validate file_path exists
    if (!document.file_path) {
      return res.status(404).json({
        success: false,
        message: "File path not found in database",
      });
    }

    // Helper function to sanitize filename for Content-Disposition header
    const sanitizeFilename = (filename) => {
      // Remove control characters, newlines, and other invalid header characters
      return filename
        .replace(/[\x00-\x1F\x7F-\x9F]/g, "")
        .replace(/[\r\n]/g, "");
    };

    // If file_path is a URL (Blob), fetch and proxy it to maintain password protection
    if (
      document.file_path.startsWith("http://") ||
      document.file_path.startsWith("https://")
    ) {
      try {
        const { buffer, contentType, fixedUrl, source } = await fetchBlobWithFallback(document.file_path, document.r2_file_path);

        // Auto-fix double-extension URL in database
        if (fixedUrl) {
          try {
            const doubleExtRegex = /\.(pdf|jpg|jpeg|png|gif|doc|docx|xls|xlsx)\.\1$/i;
            if (doubleExtRegex.test(fixedUrl)) {
              // Blob found at doubled path, copy to clean path
              const cleanUrl = fixDoubleExtensionUrl(fixedUrl);
              if (cleanUrl) {
                const pathname = new URL(cleanUrl).pathname.replace(/^\//, '');
                const newBlobUrl = await copyBlob(fixedUrl, pathname);
                await sql`UPDATE branch_documents SET file_path = ${newBlobUrl}, updated_at = CURRENT_TIMESTAMP WHERE id = ${document.id}`;
                log.info(`Auto-fixed: copied blob to clean path for branch document ${document.id}`);
              }
            } else {
              await sql`UPDATE branch_documents SET file_path = ${fixedUrl}, updated_at = CURRENT_TIMESTAMP WHERE id = ${document.id}`;
              log.info(`Auto-fixed double-extension URL for branch document ${document.id}`);
            }
          } catch (updateErr) {
            log.warn(`Could not auto-fix URL for branch document ${document.id}:`, updateErr.message);
          }
        }

        // Lazy migration: mirror to R2 on first Vercel hit
        if (source === 'vercel' && !document.r2_file_path) {
          setImmediate(async () => {
            try {
              const r2Url = await mirrorVercelFileToR2(document.file_path, buffer, contentType);
              if (r2Url) await sql`UPDATE branch_documents SET r2_file_path = ${r2Url}, updated_at = CURRENT_TIMESTAMP WHERE id = ${document.id}`;
            } catch (e) { /* non-blocking */ }
          });
        }

        const safeFilename = sanitizeFilename(document.file_name);
        res.setHeader("Content-Type", contentType || document.mime_type);
        res.setHeader(
          "Content-Disposition",
          `attachment; filename="${encodeURIComponent(safeFilename)}"`,
        );
        return res.send(buffer);
      } catch (error) {
        log.error("Error fetching blob file:", error);
        return handleRouteError(error, req, res, 'فشل جلب ملف المستند');
      }
    }

    // Fallback for local files (backward compatibility)
    const filePath = resolveFilePath(document.file_path);
    if (!filePath) {
      return res.status(404).json({
        success: false,
        message: "File not found on server",
      });
    }

    const safeFilename = sanitizeFilename(document.file_name);
    res.setHeader("Content-Type", document.mime_type);
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${encodeURIComponent(safeFilename)}"`,
    );
    res.sendFile(path.resolve(filePath));
  } catch (error) {
    log.error("Error downloading branch document:", error);
    handleRouteError(error, req, res, 'فشل تحميل المستند');
  }
});

/**
 * Get branch document preview/thumbnail
 * GET /api/branch-documents/:id/preview
 * NOTE: This must come BEFORE the generic /:id route to avoid conflicts
 */
router.get("/:id/preview", async (req, res) => {
  try {
    const documentId = parseInt(req.params?.id);
    if (isNaN(documentId)) {
      return res.status(400).json({
        success: false,
        message: "معرف المستند غير صحيح",
      });
    }

    const document = await BranchDocument.findById(documentId);
    if (!document) {
      return res.status(404).json({
        success: false,
        message: "Document not found",
      });
    }

    // Check branch access
    if (
      req.user.role === "branch_manager" &&
      req.user.branch_id !== document.branch_id
    ) {
      return res.status(403).json({
        success: false,
        message: "Access denied",
      });
    }

    // For images, proxy the content through backend using authenticated access
    if (document.mime_type && document.mime_type.startsWith("image/")) {
      // If file_path is a URL (Blob Storage), fetch via authenticated fetchBlobWithFallback
      if (
        document.file_path &&
        (document.file_path.startsWith("http://") ||
          document.file_path.startsWith("https://"))
      ) {
        try {
          const { buffer, contentType, fixedUrl, source } = await fetchBlobWithFallback(document.file_path, document.r2_file_path);

          // If a fixed URL was used, update DB for future requests
          if (fixedUrl) {
            try {
              await BranchDocument.update(document.id, { file_path: fixedUrl });
              log.info(`Auto-fixed preview URL for branch document ${document.id}`);
            } catch (updateErr) {
              log.warn(`Could not update fixed URL for branch document ${document.id}:`, updateErr.message);
            }
          }

          // Lazy migration: mirror to R2 on first Vercel preview hit
          if (source === 'vercel' && !document.r2_file_path) {
            setImmediate(async () => {
              try {
                const r2Url = await mirrorVercelFileToR2(document.file_path, buffer, contentType);
                if (r2Url) await sql`UPDATE branch_documents SET r2_file_path = ${r2Url}, updated_at = CURRENT_TIMESTAMP WHERE id = ${document.id}`;
              } catch (e) { /* non-blocking */ }
            });
          }

          res.setHeader("Content-Type", document.mime_type || contentType);
          return res.send(buffer);
        } catch (fetchErr) {
          log.error(`Preview fetch failed for branch document ${document.id}:`, fetchErr.message);
          return res.status(404).json({
            success: false,
            message: "الملف غير متوفر في التخزين السحابي. قد يحتاج هذا الملف إلى إعادة الرفع.",
            error: fetchErr.message,
          });
        }
      }

      // Fallback for local files
      const filePath = resolveFilePath(document.file_path);
      if (filePath) {
        res.setHeader("Content-Type", document.mime_type);
        res.sendFile(path.resolve(filePath));
        return;
      }
    }

    // For PDFs or if preview not available, return document info
    res.json({
      success: true,
      message: "معاينة غير متاحة لهذا النوع من المستندات",
      data: {
        id: document.id,
        file_name: document.file_name,
        mime_type: document.mime_type,
        download_url: `/api/branch-documents/${document.id}/download`,
        file_url:
          document.file_path &&
            (document.file_path.startsWith("http://") ||
              document.file_path.startsWith("https://"))
            ? document.file_path
            : null,
      },
    });
  } catch (error) {
    log.error("Error getting branch document preview:", error);
    handleRouteError(error, req, res, 'فشل الحصول على معاينة المستند');
  }
});

/**
 * Get branch document by ID
 * GET /api/branch-documents/:id
 * NOTE: This must come AFTER specific routes like /:id/download and /:id/preview
 */
router.get("/:id", async (req, res) => {
  try {
    const documentId = parseInt(req.params?.id);
    if (isNaN(documentId)) {
      return res.status(400).json({
        success: false,
        message: "معرف المستند غير صحيح",
      });
    }

    const document = await BranchDocument.findById(documentId);
    if (!document) {
      return res.status(404).json({
        success: false,
        message: "Document not found",
      });
    }

    // Check branch access
    if (
      req.user?.role === "branch_manager" &&
      req.user.branch_id !== document.branch_id
    ) {
      return res.status(403).json({
        success: false,
        message: "Access denied",
      });
    }

    res.json({ success: true, data: document });
  } catch (error) {
    log.error("Error fetching branch document:", error);
    handleRouteError(error, req, res, 'فشل جلب المستند');
  }
});

/**
 * Verify branch document
 * POST /api/branch-documents/:id/verify
 */
router.post("/:id/verify", async (req, res) => {
  try {
    const idResult = parseDocumentId(req);
    if (idResult.error) {
      return res.status(400).json({ success: false, message: idResult.error });
    }

    const document = await BranchDocument.findById(idResult.documentId);
    if (!document) {
      return res.status(404).json({
        success: false,
        message: "Document not found",
      });
    }

    // Only main manager can verify
    if (req.user?.role !== "main_manager") {
      return res.status(403).json({
        success: false,
        message: "Only main manager can verify documents",
      });
    }

    const verifiedDocument = await BranchDocument.verify(
      idResult.documentId,
      req.user.id,
    );

    res.json({
      success: true,
      message: "Document verified successfully",
      data: verifiedDocument,
    });
  } catch (error) {
    log.error("Error verifying branch document:", error);
    handleRouteError(error, req, res, 'فشل التحقق من المستند');
  }
});

/**
 * Update branch document (replace file or update metadata)
 * PUT /api/branch-documents/:id
 * If file is provided, it will replace the old file and deactivate old documents of same type
 */
router.put(
  "/:id",
  uploadSingle,
  validateDateFields({
    issue_date_hijri: {
      calendarType: "hijri",
      dateType: "general",
      required: false,
    },
    expiry_date_hijri: {
      calendarType: "hijri",
      dateType: "expiry_date",
      required: false,
    },
  }),
  validateBranchDocumentDates,
  async (req, res) => {
    try {
      const idResult = parseDocumentId(req);
      if (idResult.error) {
        return res
          .status(400)
          .json({ success: false, message: idResult.error });
      }

      const document = await BranchDocument.findById(idResult.documentId);
      if (!document) {
        return res.status(404).json({
          success: false,
          message: "Document not found",
        });
      }

      // Check branch access
      if (
        req.user?.role === "branch_manager" &&
        req.user.branch_id !== document.branch_id
      ) {
        return res.status(403).json({
          success: false,
          message: "Access denied",
        });
      }

      let updatedDocument;

      // If file is provided, replace the document file
      if (req.file) {
        // Validate file if provided
        const { isValidMimeType, isValidFileSize } =
          await import("../utils/validators.js");

        if (!isValidMimeType(req.file.mimetype)) {
          return res.status(400).json({
            success: false,
            message: "نوع الملف غير مدعوم. يُسمح فقط بملفات PDF والصور.",
          });
        }

        // Determine max file size based on document type
        const highCapacityDocs = [
          "operational_plan",
          "acceptance_notifications",
        ];
        const maxFileSize = highCapacityDocs.includes(document.document_type)
          ? 15
          : 1;

        if (!isValidFileSize(req.file.size, maxFileSize)) {
          const sizeLimitMsg =
            maxFileSize === 15 ? "15 ميجابايت" : "1 ميجابايت";
          return res.status(400).json({
            success: false,
            message: `حجم الملف يتجاوز الحد الأقصى المسموح به (${sizeLimitMsg})`,
          });
        }

        // Fix filename encoding for Arabic characters BEFORE upload
        const fixedFileName = fixFilenameEncoding(req.file.originalname);

        // Upload new file to Blob Storage
        // Note: uploadBranchDocumentToBlob uses generateFileName which sanitizes the filename
        // This ensures blob paths are safe for Vercel Blob Storage (no special characters)
        const { url: blobUrl, r2Url } = await uploadBranchDocumentToBlob(
          req.file.buffer,
          fixedFileName, // Use fixed filename for consistent encoding
          req.file.mimetype,
          document.branch_id,
          document.document_type,
        );

        // For license type documents, deactivate old documents of the same type
        if (document.document_type === "license") {
          await BranchDocument.deactivateByBranchAndType(
            document.branch_id,
            document.document_type,
            document.id,
          );
        }

        // Delete old file from Blob Storage if it exists
        if (document.file_path) {
          await deleteFromBlob(document.file_path);
        }
        // Delete old file from R2 if it exists
        if (document.r2_file_path) {
          const { deleteFromR2Mirror } = await import('../utils/dualStorage.js');
          await deleteFromR2Mirror(document.r2_file_path);
        }

        // Use the fixed filename for database record
        const fileName = fixedFileName;

        // Date conversion and validation is handled by validateDateFields middleware
        const finalIssueDate =
          req.body.issue_date !== undefined
            ? req.body.issue_date
            : document.issue_date;
        const finalIssueDateHijri =
          req.body.issue_date_hijri !== undefined
            ? req.body.issue_date_hijri
            : document.issue_date_hijri;
        const finalExpiryDate =
          req.body.expiry_date !== undefined
            ? req.body.expiry_date
            : document.expiry_date;
        const finalExpiryDateHijri =
          req.body.expiry_date_hijri !== undefined
            ? req.body.expiry_date_hijri
            : document.expiry_date_hijri;

        // Update document with new file
        updatedDocument = await BranchDocument.updateFile(idResult.documentId, {
          file_name: fileName,
          file_path: blobUrl, // Store blob URL
          file_size: req.file.size,
          mime_type: req.file.mimetype,
          file_extension: getExtensionFromMimeType(req.file.mimetype),
          r2_file_path: r2Url || null,
          description:
            req.body.description !== undefined
              ? req.body.description
              : document.description,
          document_number:
            req.body.document_number !== undefined
              ? req.body.document_number
              : document.document_number,
          issue_date: finalIssueDate,
          issue_date_hijri: finalIssueDateHijri,
          expiry_date: finalExpiryDate,
          expiry_date_hijri: finalExpiryDateHijri,
          iban_number:
            req.body.iban_number !== undefined
              ? req.body.iban_number
              : document.iban_number,
          bank_name:
            req.body.bank_name !== undefined
              ? req.body.bank_name
              : document.bank_name,
        });
      } else {
        // Just update metadata
        // Date conversion and validation is handled by validateDateFields middleware
        const finalIssueDate =
          req.body.issue_date !== undefined
            ? req.body.issue_date
            : document.issue_date;
        const finalIssueDateHijri =
          req.body.issue_date_hijri !== undefined
            ? req.body.issue_date_hijri
            : document.issue_date_hijri;
        const finalExpiryDate =
          req.body.expiry_date !== undefined
            ? req.body.expiry_date
            : document.expiry_date;
        const finalExpiryDateHijri =
          req.body.expiry_date_hijri !== undefined
            ? req.body.expiry_date_hijri
            : document.expiry_date_hijri;

        updatedDocument = await BranchDocument.update(idResult.documentId, {
          description: req.body.description,
          document_number: req.body.document_number,
          issue_date: finalIssueDate,
          issue_date_hijri: finalIssueDateHijri,
          expiry_date: finalExpiryDate,
          expiry_date_hijri: finalExpiryDateHijri,
          iban_number: req.body.iban_number,
          bank_name: req.body.bank_name,
        });
      }

      res.json({
        success: true,
        message: "Document updated successfully",
        data: updatedDocument,
      });
    } catch (error) {
      log.error("Error updating branch document:", error);
      handleRouteError(error, req, res, 'فشل تحديث المستند');
    }
  },
);

/**
 * Delete branch document (soft delete)
 * DELETE /api/branch-documents/:id
 */
router.delete("/:id", async (req, res) => {
  try {
    const idResult = parseDocumentId(req);
    if (idResult.error) {
      return res.status(400).json({ success: false, message: idResult.error });
    }

    const document = await BranchDocument.findById(idResult.documentId);
    if (!document) {
      return res.status(404).json({
        success: false,
        message: "Document not found",
      });
    }

    // Check branch access - branch managers can delete their own branch documents
    if (
      req.user?.role === "branch_manager" &&
      req.user.branch_id !== document.branch_id
    ) {
      return res.status(403).json({
        success: false,
        message: "Access denied",
      });
    }

    await BranchDocument.delete(idResult.documentId);

    res.json({
      success: true,
      message: "Document deleted successfully",
    });
  } catch (error) {
    log.error("Error deleting branch document:", error);
    handleRouteError(error, req, res, 'فشل حذف المستند');
  }
});

/**
 * Generate PDF report for monthly documents (payrolls)
 * POST /api/branch-documents/generate-payroll-report
 * Body: { document_type: string, branch_ids: number[] }
 * Only accessible by main managers
 */
router.post("/generate-payroll-report", authenticate, async (req, res) => {
  try {
    // Only main managers can generate reports
    if (req.user.role !== "main_manager") {
      return res.status(403).json({
        success: false,
        message: "تم رفض الوصول. يمكن للمديرين الرئيسيين فقط إنشاء التقارير.",
      });
    }

    const { document_type, branch_ids } = req.body;

    if (!document_type) {
      return res.status(400).json({
        success: false,
        message: "نوع المستند مطلوب",
      });
    }

    // This report only supports payroll_file. salary_deposit_file is deprecated/removed.
    if (document_type !== "payroll_file") {
      return res.status(400).json({
        success: false,
        message: "نوع المستند غير مدعوم",
      });
    }

    if (!branch_ids || !Array.isArray(branch_ids) || branch_ids.length === 0) {
      return res.status(400).json({
        success: false,
        message: "At least one branch must be selected",
      });
    }

    // Document type labels
    const documentTypeLabels = {
      payroll_file: "ملف مسيرات الرواتب",
    };

    const documentLabel = documentTypeLabels[document_type] || document_type;

    // Get branches - filter by IDs
    const allBranches = await Branch.findAll({ is_active: true });
    const branches = allBranches.filter((b) => branch_ids.includes(b.id));

    if (branches.length === 0) {
      return res.status(404).json({
        success: false,
        message: "No active branches found",
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
    const currentMonthDocuments = allDocuments.filter((doc) => {
      const uploadDate = new Date(doc.uploaded_at);
      return (
        uploadDate.getMonth() === currentMonth &&
        uploadDate.getFullYear() === currentYear
      );
    });

    // Create a map of branch_id to document
    const branchDocumentMap = new Map();
    currentMonthDocuments.forEach((doc) => {
      branchDocumentMap.set(doc.branch_id, doc);
    });

    // Load all document files and convert to base64 for embedding
    const documentFilesMap = {}; // Map of document_id -> {base64, mimeType, buffer}
    const images = {}; // Images object for pdfmake

    for (const doc of currentMonthDocuments) {
      try {
        if (!doc.file_path) {
          log.warn(`Document ${doc.id} has no file_path`);
          continue;
        }

        let fileBuffer;

        // If file_path is a URL (Blob Storage)
        if (
          doc.file_path.startsWith("http://") ||
          doc.file_path.startsWith("https://")
        ) {
          try {
            const result = await fetchBlobWithFallback(doc.file_path, doc.r2_file_path);
            fileBuffer = result.buffer;
          } catch (blobError) {
            log.error(
              `Failed to fetch from blob for document ${doc.id}:`,
              blobError.message,
            );
            continue;
          }
        } else {
          // Local file path (backward compatibility)
          // Note: On Vercel serverless, local files are not accessible
          if (process.env.VERCEL === "1") {
            log.warn(
              `Document ${doc.id} uses local file path which is not accessible on Vercel: ${doc.file_path}`,
            );
            continue;
          }

          let filePath;
          if (path.isAbsolute(doc.file_path)) {
            filePath = doc.file_path;
          } else {
            let relativePath = doc.file_path;
            if (relativePath.startsWith("express-app/")) {
              relativePath = relativePath.replace(/^express-app\//, "");
            }
            filePath = path.join(__dirname, "..", relativePath);
          }

          if (!fs.existsSync(filePath)) {
            const altPath = doc.file_path.replace(/^express-app\//, "");
            const altFilePath = path.join(__dirname, "..", altPath);
            filePath = fs.existsSync(altFilePath) ? altFilePath : filePath;
          }

          if (!fs.existsSync(filePath)) {
            log.warn(
              `File not found for document ${doc.id}: ${doc.file_path}`,
            );
            continue;
          }

          try {
            fileBuffer = fs.readFileSync(filePath);
          } catch (readError) {
            log.error(
              `Failed to read file for document ${doc.id}:`,
              readError.message,
            );
            continue;
          }
        }

        if (!fileBuffer || fileBuffer.length === 0) {
          log.warn(`Empty file buffer for document ${doc.id}`);
          continue;
        }

        // Convert to base64
        const base64 = fileBuffer.toString("base64");
        const mimeType = doc.mime_type || "application/octet-stream";

        documentFilesMap[doc.id] = {
          base64: base64,
          base64DataUri: `data:${mimeType};base64,${base64}`,
          mimeType: mimeType,
          buffer: fileBuffer,
        };

        // Register image if it's an image type
        if (mimeType.startsWith("image/")) {
          const imageKey = `doc_${doc.id}`;
          // pdfmake needs data URI format: data:mimeType;base64,base64String
          images[imageKey] = `data:${mimeType};base64,${base64}`;
        }
      } catch (error) {
        log.error(`Failed to load document file ${doc.id}:`, error.message);
        // Continue with other documents even if one fails
      }
    }

    // Helper function to remove parentheses from text
    const removeParentheses = (text) => {
      if (!text || typeof text !== "string") return text;
      return text.replace(/[()]/g, "");
    };

    // Use unified formatDate function for consistent dd/mm/yyyy format

    // Prepare PDF content (header only - title and info)
    const reportDate = formatDate(now);
    const content = [
      // Title
      {
        text: removeParentheses(documentLabel),
        style: "title",
      },
      // Report info
      {
        text: [
          { text: "تاريخ التقرير: ", direction: "rtl" },
          { text: reportDate, direction: "ltr" },
        ],
        style: "info",
      },
      {
        text: [
          { text: "عدد الفروع: ", direction: "rtl" },
          { text: String(branches.length), direction: "ltr" },
        ],
        style: "info",
        margin: [0, 0, 0, 20],
      },
    ];

    // PDF document definition
    const docDefinition = {
      pageSize: "A4",
      pageMargins: [40, 60, 40, 60],
      images: images, // Register images for embedding
      defaultStyle: {
        font: "Roboto",
        fontSize: 10,
        color: "black",
      },
      styles: {
        title: {
          font: "Roboto",
          fontSize: 18,
          bold: true,
          alignment: "center",
          margin: [0, 0, 0, 20],
        },
        info: {
          font: "Roboto",
          fontSize: 10,
          alignment: "right",
          margin: [0, 0, 0, 10],
        },
        branchHeader: {
          font: "Roboto",
          fontSize: 14,
          bold: true,
          alignment: "right",
          margin: [0, 0, 0, 5],
        },
        documentInfo: {
          font: "Roboto",
          fontSize: 11,
          alignment: "right",
          margin: [0, 0, 0, 3],
        },
        documentDescription: {
          font: "Roboto",
          fontSize: 10,
          alignment: "right",
          color: "#666",
          margin: [0, 0, 0, 3],
        },
      },
      content: content,
    };

    // Helper function to create PDF for a single branch
    const createBranchPdf = async (branch, document) => {
      return new Promise((resolve, reject) => {
        try {
          const branchContent = [
            {
              text: `الفرع: ${removeParentheses(branch.branch_name)}`,
              style: "branchHeader",
              margin: [0, 0, 0, 5],
            },
          ];

          if (document) {
            branchContent.push({
              text: `المستند: ${removeParentheses(document.file_name)}`,
              style: "documentInfo",
            });
            if (document.description) {
              branchContent.push({
                text: `الوصف: ${removeParentheses(document.description || "")}`,
                style: "documentDescription",
              });
            }
            branchContent.push({
              text: `تاريخ الرفع: ${formatDate(document.uploaded_at)}`,
              style: "documentInfo",
              margin: [0, 0, 0, 10],
            });

            // Embed document file if available
            const docFileData = documentFilesMap[document.id];
            if (docFileData) {
              const mimeType = docFileData.mimeType;

              // Check if it's an image
              if (mimeType.startsWith("image/")) {
                try {
                  const imageKey = `doc_${document.id}`;
                  branchContent.push({
                    image: imageKey,
                    width: 500,
                    alignment: "center",
                    margin: [0, 10, 0, 20],
                    fit: [500, 700],
                  });
                } catch (error) {
                  log.error(
                    `Error embedding image for document ${document.id}:`,
                    error,
                  );
                  try {
                    branchContent.push({
                      image: docFileData.base64DataUri,
                      width: 500,
                      alignment: "center",
                      margin: [0, 10, 0, 20],
                      fit: [500, 700],
                    });
                  } catch (fallbackError) {
                    branchContent.push({
                      text: removeParentheses(
                        `[خطأ في تحميل الصورة: ${document.file_name}]`,
                      ),
                      style: "documentDescription",
                      margin: [0, 10, 0, 20],
                    });
                  }
                }
              }
            } else {
              branchContent.push({
                text: removeParentheses("[لم يتم العثور على ملف المستند]"),
                style: "documentDescription",
                margin: [0, 10, 0, 20],
                color: "#d32f2f",
              });
            }
          } else {
            branchContent.push({
              text: "المستند: غير متوفر",
              style: "documentInfo",
              color: "#666",
              margin: [0, 0, 0, 20],
            });
          }

          const branchDocDefinition = {
            pageSize: "A4",
            pageMargins: [40, 60, 40, 60],
            images: images,
            defaultStyle: {
              font: "Roboto",
              fontSize: 10,
              color: "black",
            },
            styles: {
              branchHeader: {
                font: "Roboto",
                fontSize: 14,
                bold: true,
                alignment: "right",
                margin: [0, 0, 0, 5],
              },
              documentInfo: {
                font: "Roboto",
                fontSize: 11,
                alignment: "right",
                margin: [0, 0, 0, 3],
              },
              documentDescription: {
                font: "Roboto",
                fontSize: 10,
                alignment: "right",
                color: "#666",
                margin: [0, 0, 0, 3],
              },
            },
            content: branchContent,
          };

          const branchPdfDoc =
            printer.createPdfKitDocument(branchDocDefinition);
          const chunks = [];

          branchPdfDoc.on("data", (chunk) => {
            chunks.push(chunk);
          });

          branchPdfDoc.on("end", () => {
            const buffer = Buffer.concat(chunks);
            resolve(buffer);
          });

          branchPdfDoc.on("error", (error) => {
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
            const pages = await finalPdf.copyPages(
              branchPdf,
              branchPdf.getPageIndices(),
            );
            pages.forEach((page) => {
              finalPdf.addPage(page);
            });

            // If branch has a PDF document, merge it too
            if (document) {
              const docFileData = documentFilesMap[document.id];
              if (docFileData && docFileData.mimeType === "application/pdf") {
                try {
                  const pdfToMerge = await PDFDocument.load(docFileData.buffer);
                  const pdfPages = await finalPdf.copyPages(
                    pdfToMerge,
                    pdfToMerge.getPageIndices(),
                  );
                  pdfPages.forEach((page) => {
                    finalPdf.addPage(page);
                  });
                } catch (error) {
                  log.error(
                    `Error merging PDF document ${document.id}:`,
                    error,
                  );
                }
              }
            }
          } catch (error) {
            log.error(`Error creating PDF for branch ${branch.id}:`, error);
            // Continue with other branches even if one fails
          }
        }

        // Save the merged PDF
        const mergedPdfBytes = await finalPdf.save();
        return Buffer.from(mergedPdfBytes);
      } catch (error) {
        log.error("Error in mergePdfDocuments:", error);
        throw error;
      }
    };

    // Generate PDF
    return new Promise((resolve, reject) => {
      let responseSent = false;

      const sendError = (error) => {
        if (!responseSent) {
          responseSent = true;
          log.error("PDF generation error:", error);
          try {
            if (!res.headersSent) {
              handleRouteError(error, req, res, 'فشل إنشاء تقرير PDF');
            }
          } catch (sendErr) {
            log.error("Error sending error response:", sendErr);
          }
          reject(error);
        }
      };

      try {
        const pdfDoc = printer.createPdfKitDocument(docDefinition);

        const chunks = [];
        pdfDoc.on("data", (chunk) => {
          chunks.push(chunk);
        });

        pdfDoc.on("end", async () => {
          if (!responseSent) {
            responseSent = true;
            try {
              const mainPdfBuffer = Buffer.concat(chunks);

              // Merge PDF documents into main PDF
              let finalPdfBuffer;
              try {
                finalPdfBuffer = await mergePdfDocuments(mainPdfBuffer);
              } catch (mergeError) {
                log.error(
                  "Error merging PDFs, using main PDF only:",
                  mergeError,
                );
                // If merging fails, return main PDF without merged documents
                finalPdfBuffer = mainPdfBuffer;
              }

              if (!res.headersSent) {
                res.setHeader("Content-Type", "application/pdf");
                res.setHeader(
                  "Content-Disposition",
                  `attachment; filename="${encodeURIComponent(documentLabel)}.pdf"`,
                );
                res.send(finalPdfBuffer);
              }
              resolve();
            } catch (error) {
              log.error("Error sending PDF response:", error);
              reject(error);
            }
          }
        });

        pdfDoc.on("error", (error) => {
          sendError(error);
        });

        pdfDoc.end();
      } catch (error) {
        sendError(error);
      }
    });
  } catch (error) {
    log.error("Error generating payroll report:", error);
    if (!res.headersSent) {
      handleRouteError(error, req, res, 'فشل إنشاء التقرير');
    }
  }
});

/**
 * Generate PDF for a single document type across all branches
 * POST /api/branch-documents/generate-pdf-by-type
 * Body: { document_type: string }
 * Only accessible by main managers
 */
router.post("/generate-pdf-by-type", authenticate, async (req, res) => {
  // Helper to create PDF buffer from pdfmake
  const createPdfBuffer = (printer, docDefinition) => {
    return new Promise((resolve, reject) => {
      const pdfDoc = printer.createPdfKitDocument(docDefinition);
      const chunks = [];
      pdfDoc.on("data", (chunk) => chunks.push(chunk));
      pdfDoc.on("end", () => resolve(Buffer.concat(chunks)));
      pdfDoc.on("error", reject);
      pdfDoc.end();
    });
  };

  try {
    // Only main managers can generate reports
    if (req.user.role !== "main_manager") {
      return res.status(403).json({
        success: false,
        message: "تم رفض الوصول. يمكن للمديرين الرئيسيين فقط إنشاء التقارير.",
      });
    }

    const { document_type } = req.body;

    if (!document_type) {
      return res.status(400).json({
        success: false,
        message: "نوع المستند مطلوب",
      });
    }

    // Get all active branches
    let branches = await Branch.findAll({ is_active: true });
    // Sort by branch name
    branches.sort((a, b) => (a.branch_name || "").localeCompare(b.branch_name || "", "ar"));

    // Query documents for this type
    const documents = await sql`
      SELECT bd.*
      FROM branch_documents bd
      WHERE bd.is_active = true
        AND bd.document_type = ${document_type}
    `;

    // Map documents by branch_id
    const branchDocumentMap = new Map();
    documents.forEach((doc) => {
      // If multiple docs for same branch/type, take the latest uploaded
      if (
        !branchDocumentMap.has(doc.branch_id) ||
        new Date(doc.uploaded_at) >
        new Date(branchDocumentMap.get(doc.branch_id).uploaded_at)
      ) {
        branchDocumentMap.set(doc.branch_id, doc);
      }
    });

    // Document type labels
    const documentTypeLabels = {
      license: "الترخيص",
      permit: "التصريح",
      insurance: "التأمين",
      insurance_print: "كشف التأمينات",
      contract: "العقد",
      rental_contract: "عقد الايجار",
      registration: "السجل التجاري",
      security_contract: "عقد الامن والسلامة",
      civil_defense_certificate: "شهادة الدفاع المدني",
      municipality_certificate: "شهادة بلدي",
      insurance_certificate: "شهادة التامينات",
      insurance_statement: "كشف التأمينات",
      operational_plan: "الخطة التشغلية",
      owner_civil_id_copy: "نسخة هوية المالك",
      disclosure_commitment: "إفصاح وتعهد",
      certification_commitment_form: "نموذج تصديق وتعاقد",
      financial_platform_declaration: "ملف إقرار المنصة المالية",
      financial_claim_form: "نموذج مطالبة مالية",
      student_cadre_file: "بيانات الطلاب",
      dropped_students: "الطلاب المنقطعين",
      free_seats: "المقاعد المتاحة",
      acceptance_notifications: "إشعارات القبول",
      payroll_file: "ملف مسيرات الرواتب",
    };

    const documentLabel = documentTypeLabels[document_type] || document_type;

    // Helper function to remove parentheses
    const removeParentheses = (text) => {
      if (!text || typeof text !== "string") return text;
      return text.replace(/[()]/g, "");
    };

    // Create a new PDF Document (final merged document)
    const finalPdf = await PDFDocument.create();

    const reportDate = formatDate(new Date());

    // Iterate through branches and build the PDF
    for (const branch of branches) {
      const doc = branchDocumentMap.get(branch.id);

      // Prepare content for this branch's section (Metadata Page)
      const content = [];
      const images = {};

      // Header
      content.push({
        text: removeParentheses(`تقرير: ${documentLabel}`),
        style: "title",
      });

      content.push({
        text: [
          { text: "تاريخ التقرير: ", direction: "rtl" },
          { text: reportDate, direction: "ltr" },
        ],
        style: "info",
      });

      content.push({
        text: `الفرع: ${removeParentheses(branch.branch_name)}`,
        style: "branchHeader",
        margin: [0, 10, 0, 5],
      });

      let attachmentBuffer = null;
      let isPdfAttachment = false;

      if (doc) {
        // Document Info
        content.push({
          text: `المستند: ${removeParentheses(doc.file_name)}`,
          style: "documentInfo",
        });

        if (doc.description) {
          content.push({
            text: `الوصف: ${removeParentheses(doc.description || "")}`,
            style: "documentDescription",
          });
        }

        content.push({
          text: `تاريخ الرفع: ${formatDate(doc.uploaded_at)}`,
          style: "documentInfo",
          margin: [0, 0, 0, 10],
        });

        // ---------------------------------------------------------
        // Fetch File Content
        // ---------------------------------------------------------
        if (doc.file_path) {
          try {
            let fileBuffer;
            // Fetch file from blob or local storage
            if (
              doc.file_path.startsWith("http://") ||
              doc.file_path.startsWith("https://")
            ) {
              const result = await fetchBlobWithFallback(doc.file_path, doc.r2_file_path);
              fileBuffer = result.buffer;
            } else {
              // Local file logic
              if (process.env.VERCEL !== "1") {
                let filePath;
                if (path.isAbsolute(doc.file_path)) {
                  filePath = doc.file_path;
                } else {
                  let relativePath = doc.file_path;
                  if (relativePath.startsWith("express-app/")) {
                    relativePath = relativePath.replace(/^express-app\//, "");
                  }
                  filePath = path.join(__dirname, "..", relativePath);
                }

                if (!fs.existsSync(filePath)) {
                  const altPath = doc.file_path.replace(/^express-app\//, "");
                  const altFilePath = path.join(__dirname, "..", altPath);
                  filePath = fs.existsSync(altFilePath) ? altFilePath : filePath;
                }

                if (fs.existsSync(filePath)) {
                  fileBuffer = fs.readFileSync(filePath);
                }
              }
            }

            if (fileBuffer && fileBuffer.length > 0) {
              const mimeType = doc.mime_type || "application/octet-stream";

              if (mimeType.startsWith("image/")) {
                // It's an image - embed in pdfmake
                const base64 = fileBuffer.toString("base64");
                const imageKey = `doc_${doc.id}`;
                images[imageKey] = `data:${mimeType};base64,${base64}`;

                content.push({
                  image: imageKey,
                  width: 500,
                  alignment: "center",
                  margin: [0, 10, 0, 20],
                  fit: [500, 700],
                });
              } else if (mimeType === "application/pdf") {
                // It's a PDF - save buffer to append later
                attachmentBuffer = fileBuffer;
                isPdfAttachment = true;

                content.push({
                  text: "--- (تم إرفاق ملف PDF في الصفحات التالية) ---",
                  style: "documentDescription",
                  alignment: "center",
                  color: "#4988c4",
                  margin: [0, 20, 0, 20],
                  bold: true
                });
              } else {
                // Unsupported type
                content.push({
                  text: `[نوع الملف غير مدعوم للعرض المباشر: ${mimeType}]`,
                  style: "documentDescription",
                  color: "#d32f2f"
                });
              }
            } else {
              content.push({
                text: "[لم يتم العثور على محتوى الملف]",
                style: "documentDescription",
                color: "#d32f2f"
              });
            }

          } catch (err) {
            log.error(`Error fetching document ${doc.id}:`, err);
            content.push({
              text: "[خطأ في جلب الملف]",
              style: "documentDescription",
              color: "#d32f2f"
            });
          }
        }

      } else {
        // Missing
        content.push({
          text: "⚠ المستند غير متوفر - لم يتم رفع هذا المستند",
          style: "missingDocument",
          margin: [0, 5, 0, 10],
        });
      }

      // Generate the "Cover Page" using pdfmake
      const docDefinition = {
        pageSize: "A4",
        pageMargins: [40, 60, 40, 60],
        images: images,
        defaultStyle: {
          font: "Roboto",
          fontSize: 14, // Adjusted base size
          color: "black",
        },
        styles: {
          title: {
            font: "Roboto",
            fontSize: 16, // Title 16 Bold
            bold: true,
            alignment: "center",
            margin: [0, 0, 0, 20],
          },
          info: {
            font: "Roboto",
            fontSize: 14,
            alignment: "right",
            margin: [0, 0, 0, 10],
          },
          branchHeader: {
            font: "Roboto",
            fontSize: 16, // Title 16 Bold
            bold: true,
            alignment: "right",
            margin: [0, 0, 0, 5],
          },
          documentInfo: {
            font: "Roboto",
            fontSize: 14,
            alignment: "right",
            margin: [0, 0, 0, 3],
          },
          documentDescription: {
            font: "Roboto",
            fontSize: 14,
            alignment: "right",
            color: "#666",
            margin: [0, 0, 0, 3],
          },
          missingDocument: {
            font: "Roboto",
            fontSize: 14,
            bold: true,
            alignment: "right",
            color: "#d32f2f",
            margin: [0, 5, 0, 10],
          },
        },
        content: content,
      };

      try {
        const coverPdfBuffer = await createPdfBuffer(printer, docDefinition);
        const coverPdfDoc = await PDFDocument.load(coverPdfBuffer);
        const copiedPages = await finalPdf.copyPages(coverPdfDoc, coverPdfDoc.getPageIndices());
        copiedPages.forEach((page) => finalPdf.addPage(page));

        // If there is a PDF attachment, append its pages
        if (isPdfAttachment && attachmentBuffer) {
          try {
            // We need to catch invalid PDF errors
            const attachmentPdf = await PDFDocument.load(attachmentBuffer);
            const attachmentPages = await finalPdf.copyPages(attachmentPdf, attachmentPdf.getPageIndices());
            attachmentPages.forEach((page) => finalPdf.addPage(page));
          } catch (pdfErr) {
            log.error("Error merging attached PDF:", pdfErr);
          }
        }
      } catch (genError) {
        log.error("Error generating cover page:", genError);
      }
    }

    // Serialize the final PDF
    const pdfBytes = await finalPdf.save();
    const buffer = Buffer.from(pdfBytes);

    res.setHeader("Content-Type", "application/pdf");
    const filename = `${documentLabel}_جميع_الفروع.pdf`;
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="document.pdf"; filename*=UTF-8''${encodeURIComponent(filename)}`,
    );
    res.send(buffer);

  } catch (error) {
    log.error("Error generating PDF by type:", error);
    if (!res.headersSent) {
      handleRouteError(error, req, res, 'فشل إنشاء ملف PDF');
    }
  }
});

/**
 * Generate PDF for all documents of a single branch
 * POST /api/branch-documents/generate-pdf-by-branch
 * Body: { branch_id: number }
 * Only accessible by main managers
 */
router.post("/generate-pdf-by-branch", authenticate, async (req, res) => {
  // Helper to create PDF buffer from pdfmake
  const createPdfBuffer = (printer, docDefinition) => {
    return new Promise((resolve, reject) => {
      const pdfDoc = printer.createPdfKitDocument(docDefinition);
      const chunks = [];
      pdfDoc.on("data", (chunk) => chunks.push(chunk));
      pdfDoc.on("end", () => resolve(Buffer.concat(chunks)));
      pdfDoc.on("error", reject);
      pdfDoc.end();
    });
  };

  try {
    // Only main managers can generate reports
    if (req.user.role !== "main_manager") {
      return res.status(403).json({
        success: false,
        message: "تم رفض الوصول. يمكن للمديرين الرئيسيين فقط إنشاء التقارير.",
      });
    }

    const { branch_id } = req.body;

    if (!branch_id) {
      return res.status(400).json({
        success: false,
        message: "معرف الفرع مطلوب",
      });
    }

    // Get branch
    const branch = await Branch.findById(branch_id);
    if (!branch) {
      return res.status(404).json({
        success: false,
        message: "الفرع غير موجود",
      });
    }

    // Query all documents for this branch
    const documents = await sql`
      SELECT bd.*
      FROM branch_documents bd
      WHERE bd.is_active = true
        AND bd.branch_id = ${branch_id}
      ORDER BY bd.document_type ASC, bd.uploaded_at DESC
    `;

    // Get required documents for this branch type
    const { getRequiredBranchDocuments } =
      await import("../utils/dataCompletionUtils.js");
    const requiredDocTypes = getRequiredBranchDocuments(branch.branch_type);

    // Create a map of document_type to document (get latest of each type)
    const documentTypeMap = new Map();
    documents.forEach((doc) => {
      const normalizedType =
        doc.document_type === "insurance_print"
          ? "insurance_statement"
          : doc.document_type;
      if (!documentTypeMap.has(normalizedType)) {
        documentTypeMap.set(normalizedType, doc);
      }
    });

    // Document type labels
    const documentTypeLabels = {
      license: "الترخيص",
      permit: "التصريح",
      insurance: "التأمين",
      insurance_print: "كشف التأمينات",
      contract: "العقد",
      rental_contract: "عقد الايجار",
      registration: "السجل التجاري",
      security_contract: "عقد الامن والسلامة",
      civil_defense_certificate: "شهادة الدفاع المدني",
      municipality_certificate: "شهادة بلدي",
      insurance_certificate: "شهادة التامينات",
      insurance_statement: "كشف التأمينات",
      operational_plan: "الخطة التشغلية",
      owner_civil_id_copy: "نسخة هوية المالك",
      disclosure_commitment: "إفصاح وتعهد",
      certification_commitment_form: "نموذج تصديق وتعاقد",
      financial_platform_declaration: "ملف إقرار المنصة المالية",
      financial_claim_form: "نموذج مطالبة مالية",
      student_cadre_file: "بيانات الطلاب",
      dropped_students: "الطلاب المنقطعين",
      free_seats: "المقاعد المتاحة",
      acceptance_notifications: "إشعارات القبول",
      payroll_file: "ملف مسيرات الرواتب",
    };

    // Helper function to remove parentheses
    const removeParentheses = (text) => {
      if (!text || typeof text !== "string") return text;
      return text.replace(/[()]/g, "");
    };

    const reportDate = formatDate(new Date());

    // Build PDF content
    const uploadedCount = requiredDocTypes.filter((type) =>
      documentTypeMap.has(type),
    ).length;

    // Create a new PDF Document (final merged document)
    const finalPdf = await PDFDocument.create();

    // Loop through required doc types (or uploaded docs if we prefer showing only uploaded? 
    // The requirement says "contains the documents", implying all relevant ones.)
    // We will show all required docs, indicating missing ones.

    // First, let's create a Summary Page (optional, or just start with first doc)
    // Actually, let's stick to the pattern: For each doc, create a cover page.
    // Maybe a main cover page for the whole report?
    // The previous implementation had a summary at the start of the single PDF. 
    // We can do the same: First "Item" is the summary page.

    // Summary Page Content
    const summaryContent = [
      {
        text: removeParentheses(`تقرير مستندات: ${branch.branch_name}`),
        style: "title",
      },
      {
        text: [
          { text: "تاريخ التقرير: ", direction: "rtl" },
          { text: reportDate, direction: "ltr" },
        ],
        style: "info",
      },
      {
        text: [
          { text: "المستندات المطلوبة: ", direction: "rtl" },
          { text: String(requiredDocTypes.length), direction: "ltr" },
        ],
        style: "info",
      },
      {
        text: [
          { text: "المستندات المرفوعة: ", direction: "rtl" },
          { text: String(uploadedCount), direction: "ltr" },
        ],
        style: "info",
      },
      {
        text: [
          { text: "المستندات الناقصة: ", direction: "rtl" },
          {
            text: String(requiredDocTypes.length - uploadedCount),
            direction: "ltr",
          },
        ],
        style: "info",
        margin: [0, 0, 0, 20],
      },
    ];

    const summaryDocDefinition = {
      pageSize: "A4",
      pageMargins: [40, 60, 40, 60],
      defaultStyle: { font: "Roboto", fontSize: 14, color: "black" },
      styles: {
        title: { font: "Roboto", fontSize: 18, bold: true, alignment: "center", margin: [0, 0, 0, 20] },
        info: { font: "Roboto", fontSize: 14, alignment: "right", margin: [0, 0, 0, 10] },
      },
      content: summaryContent
    };

    try {
      const summaryPdfBuffer = await createPdfBuffer(printer, summaryDocDefinition);
      const summaryDoc = await PDFDocument.load(summaryPdfBuffer);
      const pages = await finalPdf.copyPages(summaryDoc, summaryDoc.getPageIndices());
      pages.forEach(page => finalPdf.addPage(page));
    } catch (err) {
      log.error("Error creating summary page:", err);
    }

    // Now iterate required documents
    for (const docType of requiredDocTypes) {
      const docLabel = documentTypeLabels[docType] || docType;
      const doc = documentTypeMap.get(docType);

      // Prepare Cover Page for this Document
      const content = [];
      const images = {};
      let attachmentBuffer = null;
      let isPdfAttachment = false;

      content.push({
        text: `نوع المستند: ${removeParentheses(docLabel)}`,
        style: "branchHeader",
        margin: [0, 10, 0, 5],
      });

      if (doc) {
        // Document exists
        content.push({
          text: `اسم الملف: ${removeParentheses(doc.file_name)}`,
          style: "documentInfo",
        });

        if (doc.description) {
          content.push({
            text: `الوصف: ${removeParentheses(doc.description || "")}`,
            style: "documentDescription",
          });
        }

        content.push({
          text: `تاريخ الرفع: ${formatDate(doc.uploaded_at)}`,
          style: "documentInfo",
          margin: [0, 0, 0, 10],
        });

        // Fetch File
        if (doc.file_path) {
          try {
            let fileBuffer;
            if (doc.file_path.startsWith("http://") || doc.file_path.startsWith("https://")) {
              const result = await fetchBlobWithFallback(doc.file_path, doc.r2_file_path);
              fileBuffer = result.buffer;
            } else {
              if (process.env.VERCEL !== "1") {
                let filePath;
                if (path.isAbsolute(doc.file_path)) {
                  filePath = doc.file_path;
                } else {
                  let relativePath = doc.file_path;
                  if (relativePath.startsWith("express-app/")) {
                    relativePath = relativePath.replace(/^express-app\//, "");
                  }
                  filePath = path.join(__dirname, "..", relativePath);
                }

                if (!fs.existsSync(filePath)) {
                  const altPath = doc.file_path.replace(/^express-app\//, "");
                  const altFilePath = path.join(__dirname, "..", altPath);
                  filePath = fs.existsSync(altFilePath) ? altFilePath : filePath;
                }

                if (fs.existsSync(filePath)) {
                  fileBuffer = fs.readFileSync(filePath);
                }
              }
            }

            if (fileBuffer && fileBuffer.length > 0) {
              const mimeType = doc.mime_type || "application/octet-stream";

              if (mimeType.startsWith("image/")) {
                const base64 = fileBuffer.toString("base64");
                const imageKey = `doc_${doc.id}`;
                images[imageKey] = `data:${mimeType};base64,${base64}`;
                content.push({
                  image: imageKey,
                  width: 500,
                  alignment: "center",
                  margin: [0, 10, 0, 20],
                  fit: [500, 700],
                });
              } else if (mimeType === "application/pdf") {
                attachmentBuffer = fileBuffer;
                isPdfAttachment = true;
                content.push({
                  text: "--- (تم إرفاق ملف PDF في الصفحات التالية) ---",
                  style: "documentDescription",
                  alignment: "center",
                  color: "#4988c4",
                  margin: [0, 20, 0, 20],
                  bold: true
                });
              } else {
                content.push({
                  text: `[نوع الملف غير مدعوم للعرض المباشر: ${mimeType}]`,
                  style: "documentDescription",
                  color: "#d32f2f"
                });
              }
            } else {
              content.push({
                text: "[لم يتم العثور على محتوى الملف]",
                style: "documentDescription",
                color: "#d32f2f"
              });
            }
          } catch (err) {
            log.error(`Error fetching doc ${doc.id}:`, err);
            content.push({ text: "[خطأ في جلب الملف]", style: "documentDescription", color: "#d32f2f" });
          }
        }

      } else {
        // Document is missing
        content.push({
          text: "⚠ المستند غير متوفر - لم يتم رفع هذا المستند",
          style: "missingDocument",
          margin: [0, 5, 0, 10],
        });
      }

      // Generate Cover Page for this doc
      const docDefinition = {
        pageSize: "A4",
        pageMargins: [40, 60, 40, 60],
        images: images,
        defaultStyle: { font: "Roboto", fontSize: 14, color: "black" },
        styles: {
          title: { font: "Roboto", fontSize: 16, bold: true, alignment: "center", margin: [0, 0, 0, 20] },
          branchHeader: { font: "Roboto", fontSize: 16, bold: true, alignment: "right", margin: [0, 0, 0, 5] },
          documentInfo: { font: "Roboto", fontSize: 14, alignment: "right", margin: [0, 0, 0, 3] },
          documentDescription: { font: "Roboto", fontSize: 14, alignment: "right", color: "#666", margin: [0, 0, 0, 3] },
          missingDocument: { font: "Roboto", fontSize: 14, bold: true, alignment: "right", color: "#d32f2f", margin: [0, 5, 0, 10] },
        },
        content: content,
      };

      try {
        const coverPdfBuffer = await createPdfBuffer(printer, docDefinition);
        const coverPdfDoc = await PDFDocument.load(coverPdfBuffer);
        const copiedPages = await finalPdf.copyPages(coverPdfDoc, coverPdfDoc.getPageIndices());
        copiedPages.forEach((page) => finalPdf.addPage(page));

        if (isPdfAttachment && attachmentBuffer) {
          try {
            const attachmentPdf = await PDFDocument.load(attachmentBuffer);
            const attachmentPages = await finalPdf.copyPages(attachmentPdf, attachmentPdf.getPageIndices());
            attachmentPages.forEach((page) => finalPdf.addPage(page));
          } catch (pdfErr) {
            log.error("Error merging attached PDF:", pdfErr);
          }
        }
      } catch (genError) {
        log.error("Error generating doc page:", genError);
      }
    }

    const pdfBytes = await finalPdf.save();
    const buffer = Buffer.from(pdfBytes);

    res.setHeader("Content-Type", "application/pdf");
    const filename = `مستندات_${branch.branch_name}.pdf`;
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="document.pdf"; filename*=UTF-8''${encodeURIComponent(filename)}`,
    );
    res.send(buffer);

  } catch (error) {
    log.error("Error generating PDF by branch:", error);
    if (!res.headersSent) {
      handleRouteError(error, req, res, 'فشل إنشاء ملف PDF');
    }
  }
});

/**
 * POST /api/branch-documents/generate-pdf-stats
 * Generate PDF report with statistics about document expiration
 * Body: { branch_ids: number[], days_threshold: number }
 * Only accessible by main managers
 */
router.post("/generate-pdf-stats", authenticate, async (req, res) => {
  const createPdfBuffer = (printer, docDefinition) => {
    return new Promise((resolve, reject) => {
      const pdfDoc = printer.createPdfKitDocument(docDefinition);
      const chunks = [];
      pdfDoc.on("data", (chunk) => chunks.push(chunk));
      pdfDoc.on("end", () => resolve(Buffer.concat(chunks)));
      pdfDoc.on("error", reject);
      pdfDoc.end();
    });
  };

  try {
    // Only main managers can generate reports
    if (req.user.role !== "main_manager") {
      return res.status(403).json({
        success: false,
        message: "تم رفض الوصول. يمكن للمديرين الرئيسيين فقط إنشاء التقارير.",
      });
    }

    const { branch_ids = [], days_threshold = 30 } = req.body;
    const now = new Date();

    // Get all branches if no specific ones selected
    let branches = await Branch.findAll({ is_active: true });
    if (branch_ids.length > 0) {
      branches = branches.filter(b => branch_ids.includes(b.id));
    }

    // Get all active branch documents
    const documents = await sql`
      SELECT bd.*
      FROM branch_documents bd
      WHERE bd.is_active = true
      ORDER BY bd.expiry_date ASC
    `;

    // Calculate statistics
    const stats = {
      total: 0,
      expired: 0,
      expiring: 0,
      byBranch: {},
    };

    const selectedBranchIds = branches.map(b => b.id);

    documents.forEach(doc => {
      if (!selectedBranchIds.includes(doc.branch_id)) return;

      stats.total++;
      if (!stats.byBranch[doc.branch_id]) {
        stats.byBranch[doc.branch_id] = { total: 0, expired: 0, expiring: 0 };
      }
      stats.byBranch[doc.branch_id].total++;

      if (doc.expiry_date) {
        const expiryDate = new Date(doc.expiry_date);
        const daysUntilExpiry = Math.ceil((expiryDate - now) / (1000 * 60 * 60 * 24));

        if (daysUntilExpiry < 0) {
          stats.expired++;
          stats.byBranch[doc.branch_id].expired++;
        } else if (daysUntilExpiry <= days_threshold) {
          stats.expiring++;
          stats.byBranch[doc.branch_id].expiring++;
        }
      }
    });

    // Build PDF content
    const reportDate = formatDate(new Date());
    const summaryData = [
      { text: 'إجمالي المستندات', bold: true },
      { text: stats.total.toString() },
      { text: 'المستندات منتهية الصلاحية', bold: true },
      { text: stats.expired.toString() },
      { text: `المستندات قريبة الانتهاء (${days_threshold} يوم)`, bold: true },
      { text: stats.expiring.toString() },
    ];

    const branchStatsData = branches.map(branch => {
      const branchStat = stats.byBranch[branch.id] || { total: 0, expired: 0, expiring: 0 };
      return [
        branch.branch_name,
        branchStat.total.toString(),
        branchStat.expired.toString(),
        branchStat.expiring.toString(),
      ];
    });

    const docDefinition = {
      pageSize: 'A4',
      pageMargins: [40, 40, 40, 40],
      content: [
        { text: 'تقرير إحصائيات مستندات الفروع', style: 'header', alignment: 'center' },
        { text: `تاريخ التقرير: ${reportDate}`, style: 'subheader', alignment: 'center' },
        { text: '\n' },
        { text: 'ملخص الإحصائيات', style: 'subheader' },
        {
          table: {
            headerRows: 0,
            widths: ['60%', '40%'],
            body: [
              ['إجمالي المستندات', stats.total.toString()],
              ['المستندات منتهية الصلاحية', stats.expired.toString()],
              [`المستندات قريبة الانتهاء (${days_threshold} يوم)`, stats.expiring.toString()],
            ],
          },
        },
        { text: '\n' },
        { text: 'الإحصائيات حسب الفرع', style: 'subheader' },
        {
          table: {
            headerRows: 1,
            widths: ['40%', '20%', '20%', '20%'],
            body: [
              ['الفرع', 'إجمالي', 'منتهي', 'قريب'],
              ...branchStatsData,
            ],
          },
        },
      ],
      styles: {
        header: { fontSize: 18, bold: true, margin: [0, 0, 0, 10] },
        subheader: { fontSize: 12, bold: true, margin: [0, 10, 0, 5] },
      },
      defaultStyle: { font: 'Roboto', fontSize: 10 },
    };

    const pdfBuffer = await createPdfBuffer(printer, docDefinition);
    res.setHeader("Content-Type", "application/pdf");
    const filename = `تقرير-مستندات-الفروع-${reportDate}.pdf`;
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="document.pdf"; filename*=UTF-8''${encodeURIComponent(filename)}`
    );
    res.send(pdfBuffer);

  } catch (error) {
    log.error("Error generating stats PDF:", error);
    if (!res.headersSent) {
      handleRouteError(error, req, res, 'فشل إنشاء ملف PDF');
    }
  }
});

/**
 * POST /api/branch-documents/generate-pdf-documents
 * Generate PDF report with documents close to expiration
 * Body: { branch_ids: number[], days_threshold: number }
 * Only accessible by main managers
 */
router.post("/generate-pdf-documents", authenticate, async (req, res) => {
  const createPdfBuffer = (printer, docDefinition) => {
    return new Promise((resolve, reject) => {
      const pdfDoc = printer.createPdfKitDocument(docDefinition);
      const chunks = [];
      pdfDoc.on("data", (chunk) => chunks.push(chunk));
      pdfDoc.on("end", () => resolve(Buffer.concat(chunks)));
      pdfDoc.on("error", reject);
      pdfDoc.end();
    });
  };

  try {
    // Only main managers can generate reports
    if (req.user.role !== "main_manager") {
      return res.status(403).json({
        success: false,
        message: "تم رفض الوصول. يمكن للمديرين الرئيسيين فقط إنشاء التقارير.",
      });
    }

    const { branch_ids = [], days_threshold = 30 } = req.body;
    const now = new Date();

    // Get all branches if no specific ones selected
    let branches = await Branch.findAll({ is_active: true });
    if (branch_ids.length > 0) {
      branches = branches.filter(b => branch_ids.includes(b.id));
    }

    // Get all active branch documents
    const documents = await sql`
      SELECT bd.*
      FROM branch_documents bd
      WHERE bd.is_active = true
      ORDER BY bd.expiry_date ASC
    `;

    // Filter documents that are expired or expiring
    const selectedBranchIds = branches.map(b => b.id);
    const relevantDocs = documents.filter(doc => {
      if (!selectedBranchIds.includes(doc.branch_id)) return false;
      if (!doc.expiry_date) return false;

      const expiryDate = new Date(doc.expiry_date);
      const daysUntilExpiry = Math.ceil((expiryDate - now) / (1000 * 60 * 60 * 24));

      return daysUntilExpiry <= days_threshold; // Include both expired and expiring
    }).sort((a, b) => new Date(a.expiry_date) - new Date(b.expiry_date));

    // Create branch name lookup
    const branchLookup = new Map(branches.map(b => [b.id, b.branch_name]));

    // Build table data
    const tableData = [
      ['الفرع', 'نوع المستند', 'رقم المستند', 'تاريخ الإصدار', 'تاريخ الانتهاء', 'الحالة'],
      ...relevantDocs.map(doc => {
        const branchName = branchLookup.get(doc.branch_id) || 'غير محدد';
        const expiryDate = new Date(doc.expiry_date);
        const daysUntilExpiry = Math.ceil((expiryDate - now) / (1000 * 60 * 60 * 24));
        const status = daysUntilExpiry < 0 ? `منتهي (${Math.abs(daysUntilExpiry)} يوم)` : `${daysUntilExpiry} يوم`;

        // Document type labels mapping
        const documentTypeLabels = {
          license: 'الترخيص',
          permit: 'التصريح',
          insurance: 'التأمين',
          insurance_print: 'كشف التأمينات',
          contract: 'العقد',
          rental_contract: 'عقد الايجار',
          registration: 'السجل التجاري',
          security_contract: 'عقد الامن والسلامة',
          civil_defense_certificate: 'شهادة الدفاع المدني',
          municipality_certificate: 'شهادة بلدي',
          insurance_certificate: 'شهادة التامينات',
          insurance_statement: 'كشف التأمينات',
          operational_plan: 'الخطة التشغلية',
          owner_civil_id_copy: 'نسخة هوية المالك',
          disclosure_commitment: 'إفصاح وتعهد',
          certification_commitment_form: 'نموذج تصديق وتعاقد',
          financial_platform_declaration: 'ملف إقرار المنصة المالية',
          financial_claim_form: 'نموذج مطالبة مالية',
          student_cadre_file: 'بيانات الطلاب',
          dropped_students: 'الطلاب المنقطعين',
          free_seats: 'المقاعد المتاحة',
          acceptance_notifications: 'إشعارات القبول',
          payroll_file: 'ملف مسيرات الرواتب',
        };

        const docTypeLabel = documentTypeLabels[doc.document_type] || doc.document_type;

        return [
          branchName,
          docTypeLabel,
          doc.document_number || '-',
          doc.issue_date ? formatDate(new Date(doc.issue_date)) : '-',
          doc.expiry_date ? formatDate(new Date(doc.expiry_date)) : '-',
          status,
        ];
      }),
    ];

    const reportDate = formatDate(new Date());

    const docDefinition = {
      pageSize: 'A4',
      pageOrientation: 'landscape',
      pageMargins: [30, 30, 30, 30],
      content: [
        { text: 'المستندات المنتهية والقريبة من الانتهاء', style: 'header', alignment: 'center' },
        { text: `تاريخ التقرير: ${reportDate}`, style: 'subheader', alignment: 'center' },
        { text: '\n' },
        {
          table: {
            headerRows: 1,
            widths: ['15%', '15%', '12%', '12%', '12%', '17%'],
            body: tableData,
          },
        },
      ],
      styles: {
        header: { fontSize: 16, bold: true, margin: [0, 0, 0, 10] },
        subheader: { fontSize: 10, margin: [0, 5, 0, 5] },
      },
      defaultStyle: { font: 'Roboto', fontSize: 9 },
    };

    if (relevantDocs.length === 0) {
      docDefinition.content.push({ text: 'لا توجد مستندات منتهية أو قريبة من الانتهاء', style: 'subheader' });
    }

    const pdfBuffer = await createPdfBuffer(printer, docDefinition);
    res.setHeader("Content-Type", "application/pdf");
    const filename = `مستندات-الفروع-${reportDate}.pdf`;
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="document.pdf"; filename*=UTF-8''${encodeURIComponent(filename)}`
    );
    res.send(pdfBuffer);

  } catch (error) {
    log.error("Error generating documents PDF:", error);
    if (!res.headersSent) {
      handleRouteError(error, req, res, 'فشل إنشاء ملف PDF');
    }
  }
});

export default router;
