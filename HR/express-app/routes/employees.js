/**
 * Employee Routes
 * CRUD operations for employees
 */

import express from "express";
import { authenticate } from "../middleware/auth.js";
import {
  checkBranchAccess,
  requireMainManager,
  requireManager,
} from "../middleware/authorization.js";
import {
  validateRequired,
  validateEmployeeName,
  validateEmail,
} from "../middleware/validation.js";
import { validateDateFields } from "../middleware/dateValidation.js";
import { Document } from "../models/Document.js";
import { sql } from "../db-helpers.js";
import { log } from "../utils/logger.js";
import { clearByPrefix } from "../utils/simpleCache.js";
import multer from "multer";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import PdfPrinter from "@digicole/pdfmake-rtl";
import { PDFDocument } from "pdf-lib";
import {
  formatDate,
  gregorianToHijri as convertGregorianToHijri,
  formatHijriToString,
} from "../utils/dateConverter.js";

const router = express.Router();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Setup PDF fonts for certificate generation (similar to employee-file.js)
const fontsDir = path.join(__dirname, "..", "fonts");
const notoSansArabicDir = path.join(fontsDir, "Noto_Sans_Arabic");
const notoSansArabicVariable = path.join(
  notoSansArabicDir,
  "NotoSansArabic-VariableFont_wdth,wght.ttf",
);
const notoSansArabicStatic = path.join(notoSansArabicDir, "static");
let arabicFontPath = null;

try {
  if (fs.existsSync(notoSansArabicVariable)) {
    arabicFontPath = notoSansArabicVariable;
  } else if (fs.existsSync(notoSansArabicStatic)) {
    try {
      const staticFiles = fs.readdirSync(notoSansArabicStatic);
      const regularFont = staticFiles.find(
        (f) => f.includes("Regular") && f.endsWith(".ttf"),
      );
      if (regularFont) {
        arabicFontPath = path.join(notoSansArabicStatic, regularFont);
      }
    } catch (e) {
      console.warn("Error reading static fonts directory:", e.message);
    }
  }
} catch (error) {
  console.warn(
    "Font files not accessible, will use fallback fonts:",
    error.message,
  );
}

const hasArabicFont =
  arabicFontPath !== null &&
  (() => {
    try {
      return fs.existsSync(arabicFontPath);
    } catch {
      return false;
    }
  })();

let certificateFonts;
if (hasArabicFont) {
  const notoSansStatic = path.join(notoSansArabicDir, "static");
  const regularFont = path.join(notoSansStatic, "NotoSansArabic-Regular.ttf");
  const boldFont = path.join(notoSansStatic, "NotoSansArabic-Bold.ttf");
  const mediumFont = path.join(notoSansStatic, "NotoSansArabic-Medium.ttf");

  const fontExists = (fontPath) => {
    try {
      return fs.existsSync(fontPath);
    } catch {
      return false;
    }
  };

  certificateFonts = {
    Roboto: {
      normal: fontExists(regularFont) ? regularFont : arabicFontPath,
      bold: fontExists(boldFont)
        ? boldFont
        : fontExists(mediumFont)
          ? mediumFont
          : arabicFontPath,
      italics: fontExists(regularFont) ? regularFont : arabicFontPath,
      bolditalics: fontExists(boldFont)
        ? boldFont
        : fontExists(mediumFont)
          ? mediumFont
          : arabicFontPath,
    },
    Nillima: {
      normal: fontExists(regularFont) ? regularFont : arabicFontPath,
      bold: fontExists(boldFont)
        ? boldFont
        : fontExists(mediumFont)
          ? mediumFont
          : arabicFontPath,
      italics: fontExists(regularFont) ? regularFont : arabicFontPath,
      bolditalics: fontExists(boldFont)
        ? boldFont
        : fontExists(mediumFont)
          ? mediumFont
          : arabicFontPath,
    },
  };
} else {
  certificateFonts = {
    Roboto: {
      normal: "Helvetica",
      bold: "Helvetica-Bold",
      italics: "Helvetica-Oblique",
      bolditalics: "Helvetica-BoldOblique",
    },
    Nillima: {
      normal: "Helvetica",
      bold: "Helvetica-Bold",
      italics: "Helvetica-Oblique",
      bolditalics: "Helvetica-BoldOblique",
    },
  };
}

const certificatePrinter = new PdfPrinter(certificateFonts);

const employeeHasBranchAccess = (employee, branchId) => {
  if (!employee || !branchId) return false;
  if (
    employee.branch_id &&
    employee.branch_id.toString() === branchId.toString()
  )
    return true;
  if (Array.isArray(employee.branches)) {
    return employee.branches.some(
      (b) => b.branch_id && b.branch_id.toString() === branchId.toString(),
    );
  }
  return false;
};

// All routes require authentication
router.use(authenticate);

// List duplicate clusters (main manager only)
router.get("/duplicates", requireMainManager, async (req, res) => {
  try {
    const { Employee } = await import("../models/Employee.js");
    const clusters = await Employee.findDuplicateClusters();
    return res.json({ success: true, data: clusters });
  } catch (error) {
    log.error("Error listing duplicate employees", { error: error.message });
    return res.status(500).json({
      success: false,
      message: "فشل جلب الموظفين المكررين",
      error: error.message,
    });
  }
});

// Merge duplicate employees into canonical (main manager only)
router.post("/merge-duplicates", requireMainManager, async (req, res) => {
  try {
    const { canonical_id: canonicalId, duplicate_ids: duplicateIds } = req.body;
    if (
      !canonicalId ||
      !Array.isArray(duplicateIds) ||
      duplicateIds.length === 0
    ) {
      return res.status(400).json({
        success: false,
        message: "يجب تحديد معرف الموظف الأساسي وقائمة المعرفات المكررة",
      });
    }
    const { Employee } = await import("../models/Employee.js");
    const merged = await Employee.mergeEmployees(
      parseInt(canonicalId),
      duplicateIds,
    );
    return res.json({
      success: true,
      data: merged,
      message: "تم دمج السجلات المكررة",
    });
  } catch (error) {
    log.error("Error merging duplicate employees", { error: error.message });
    return res.status(500).json({
      success: false,
      message: "فشل دمج الموظفين المكررين",
      error: error.message,
    });
  }
});

// List employees that have multiple documents of the same type (main manager only)
router.get("/duplicate-documents", requireMainManager, async (req, res) => {
  try {
    const { limit = 100, offset = 0 } = req.query;
    const docTypesAllowedMultiple = [
      "training_certificate",
      "experience_certificate",
      "additional_courses",
      "other",
    ];

    const rows = await sql`
      SELECT employee_id, document_type, COUNT(*) as doc_count,
             array_agg(json_build_object(
               'id', id,
               'file_name', file_name,
               'uploaded_at', uploaded_at,
               'is_active', is_active
             )) AS documents
      FROM employee_documents
      WHERE is_active = true
      GROUP BY employee_id, document_type
      HAVING COUNT(*) > 1
      ORDER BY employee_id
      LIMIT ${parseInt(limit)} OFFSET ${parseInt(offset)}
    `;

    // Filter out allowed-multiple types
    const data = rows.filter(
      (row) => !docTypesAllowedMultiple.includes(row.document_type),
    );

    return res.json({ success: true, data });
  } catch (error) {
    log.error("Error listing duplicate documents", { error: error.message });
    return res.status(500).json({
      success: false,
      message: "فشل جلب المستندات المكررة",
      error: error.message,
    });
  }
});

// Merge duplicate documents for an employee (keep newest by uploaded_at)
router.post(
  "/merge-duplicate-documents",
  requireMainManager,
  async (req, res) => {
    try {
      const {
        employee_id: employeeId,
        document_type: documentType,
        keep_id: keepId,
      } = req.body;
      if (!employeeId || !documentType || !keepId) {
        return res.status(400).json({
          success: false,
          message:
            "يجب تحديد الموظف، نوع المستند، ومعرف المستند المراد الاحتفاظ به",
        });
      }

      // Allowed multiple types are skipped from merge
      const docTypesAllowedMultiple = [
        "training_certificate",
        "experience_certificate",
        "additional_courses",
        "other",
      ];
      if (docTypesAllowedMultiple.includes(documentType)) {
        return res.status(400).json({
          success: false,
          message: "هذا النوع يسمح بتعدد المستندات ولن يتم دمجه",
        });
      }

      await sql.begin(async (trx) => {
        // Deactivate or delete other docs of same type for this employee
        await trx`
        DELETE FROM employee_documents
        WHERE employee_id = ${employeeId}
          AND document_type = ${documentType}
          AND id != ${keepId}
      `;
        // Ensure kept doc is active
        await trx`
        UPDATE employee_documents
        SET is_active = true
        WHERE id = ${keepId}
      `;
      });

      return res.json({
        success: true,
        message: "تم دمج المستندات المكررة لهذا النوع",
      });
    } catch (error) {
      log.error("Error merging duplicate documents", { error: error.message });
      return res.status(500).json({
        success: false,
        message: "فشل دمج المستندات المكررة",
        error: error.message,
      });
    }
  },
);

// List employees with medical insurance docs while contract_type = 'ورقي'
router.get(
  "/paper-contract-insurance",
  requireMainManager,
  async (req, res) => {
    try {
      const docType = req.query.doc_type || "تأمين طبي";
      const rows = await sql`
      SELECT e.id AS employee_id,
             e.first_name, e.second_name, e.third_name, e.fourth_name,
             e.contract_type,
             array_agg(json_build_object('id', d.id, 'file_name', d.file_name, 'uploaded_at', d.uploaded_at)) AS documents
      FROM employees e
      INNER JOIN employee_documents d ON d.employee_id = e.id
      WHERE e.contract_type = 'ورقي'
        AND d.document_type = ${docType}
        AND d.is_active = true
      GROUP BY e.id
      ORDER BY e.id
    `;
      return res.json({ success: true, data: rows });
    } catch (error) {
      log.error("Error listing paper contract insurance docs", {
        error: error.message,
      });
      return res.status(500).json({
        success: false,
        message: "فشل جلب المستندات غير المطلوبة",
        error: error.message,
      });
    }
  },
);

// Delete medical insurance docs for paper contract employees (bulk)
router.post(
  "/paper-contract-insurance/delete",
  requireMainManager,
  async (req, res) => {
    try {
      const {
        employee_ids: employeeIds = [],
        doc_type: docType = "تأمين طبي",
      } = req.body;
      const ids = Array.isArray(employeeIds)
        ? employeeIds.map((id) => parseInt(id)).filter(Boolean)
        : [];
      if (ids.length === 0) {
        return res.status(400).json({
          success: false,
          message: "يجب تحديد الموظفين",
        });
      }

      await sql.begin(async (trx) => {
        await trx`
        DELETE FROM employee_documents
        WHERE employee_id = ANY(${ids})
          AND document_type = ${docType}
      `;
      });

      return res.json({
        success: true,
        message: "تم حذف مستندات التأمين الطبي للموظفين المحددين",
      });
    } catch (error) {
      log.error("Error deleting paper contract insurance docs", {
        error: error.message,
      });
      return res.status(500).json({
        success: false,
        message: "فشل حذف المستندات",
        error: error.message,
      });
    }
  },
);

// ---------------------------------------------------------------------------
// Missing required data (contract dates + qualification doc)
// ---------------------------------------------------------------------------
const QUAL_DOC_LEVELS = ["دبلوم", "بكالوريوس", "ماجستير", "دكتوراه"];

router.get("/missing-required-data", requireManager, async (req, res) => {
  try {
    const branchFilter =
      req.user.role === "branch_manager"
        ? req.user.branch_id
        : req.query.branch_id
          ? parseInt(req.query.branch_id)
          : null;
    const rows = await sql`
      WITH qual_docs AS (
        SELECT employee_id, COUNT(*) FILTER (WHERE document_type = 'primary_qualification' AND is_active = true) AS qual_count
        FROM employee_documents
        GROUP BY employee_id
      )
      SELECT
        e.id,
        e.branch_id,
        b.branch_name,
        e.first_name, e.second_name, e.third_name, e.fourth_name,
        e.employee_id_number,
        e.educational_qualification,
        e.contract_start_date_hijri,
        e.contract_start_date_gregorian,
        e.contract_end_date_hijri,
        e.contract_end_date_gregorian,
        (e.contract_start_date_gregorian IS NULL) AS missing_start,
        (e.contract_end_date_gregorian IS NULL) AS missing_end,
        (
          e.educational_qualification IN ${sql(QUAL_DOC_LEVELS)}
          AND COALESCE(q.qual_count, 0) = 0
        ) AS missing_qualification_doc
      FROM employees e
      LEFT JOIN branches b ON b.id = e.branch_id
      LEFT JOIN qual_docs q ON q.employee_id = e.id
      WHERE e.is_active = true
        AND (e.status IS NULL OR e.status IN ('active','pending'))
        ${branchFilter ? sql`AND e.branch_id = ${branchFilter}` : sql``}
        AND (
          e.contract_start_date_gregorian IS NULL
          OR e.contract_end_date_gregorian IS NULL
          OR (
            e.educational_qualification IN ${sql(QUAL_DOC_LEVELS)}
            AND COALESCE(q.qual_count, 0) = 0
          )
        )
      ORDER BY e.branch_id, e.id
    `;

    return res.json({
      success: true,
      data: rows,
      has_missing: rows.length > 0,
    });
  } catch (error) {
    log.error("Error fetching missing required data", { error: error.message });
    return res.status(500).json({
      success: false,
      message: "فشل جلب البيانات الناقصة",
      error: error.message,
    });
  }
});

// Configure multer for qualification upload within this endpoint
// In serverless (e.g., Vercel) the filesystem is read-only except /tmp
const tempStorage = multer({ dest: "/tmp/uploads" });

router.post(
  "/missing-required-data",
  requireManager,
  tempStorage.any(),
  async (req, res) => {
    try {
      // Multer may attach files; ensure req.files exists
      const files = req.files || {};

      const entriesRaw = req.body.entries;
      let entries = [];
      if (typeof entriesRaw === "string") {
        try {
          entries = JSON.parse(entriesRaw);
        } catch (e) {
          entries = [];
        }
      } else if (Array.isArray(entriesRaw)) {
        entries = entriesRaw;
      }
      if (entries.length === 0) {
        return res
          .status(400)
          .json({ success: false, message: "لا توجد بيانات للحفظ" });
      }

      await sql.begin(async (trx) => {
        for (const entry of entries) {
          const employeeId = parseInt(entry.employee_id);
          if (!employeeId) continue;

          const [employee] =
            await trx`SELECT * FROM employees WHERE id = ${employeeId}`;
          if (!employee) continue;

          // Access control for branch managers
          if (
            req.user.role === "branch_manager" &&
            req.user.branch_id !== employee.branch_id
          ) {
            continue;
          }

          const updates = {};
          if (entry.contract_start_date_gregorian)
            updates.contract_start_date_gregorian =
              entry.contract_start_date_gregorian;
          if (entry.contract_start_date_hijri)
            updates.contract_start_date_hijri = entry.contract_start_date_hijri;
          if (entry.contract_end_date_gregorian)
            updates.contract_end_date_gregorian =
              entry.contract_end_date_gregorian;
          if (entry.contract_end_date_hijri)
            updates.contract_end_date_hijri = entry.contract_end_date_hijri;

          if (Object.keys(updates).length > 0) {
            updates.updated_at = new Date();
            await trx`
            UPDATE employees
            SET ${sql(updates)}
            WHERE id = ${employeeId}
          `;
          }

          // Handle uploaded qualification file from multipart (if any)
          // Files are named file_<index> with accompanying file_employee_<index>
          if (files) {
            for (const [fieldName, fileArr] of Object.entries(files)) {
              if (!fieldName.startsWith("file_")) continue;
              const idx = fieldName.replace("file_", "");
              const targetEmployeeId = parseInt(
                req.body[`file_employee_${idx}`],
              );
              if (targetEmployeeId !== employeeId) continue;
              const file = Array.isArray(fileArr) ? fileArr[0] : fileArr;
              if (!file) continue;
              const filePath = file.path;
              const fileName = file.originalname;
              const mimeType = file.mimetype;
              const fileSize = file.size;
              const extension = (
                file.originalname.split(".").pop() || ""
              ).toLowerCase();

              await trx`
              INSERT INTO employee_documents (
                employee_id, document_type, file_name, file_path, file_size,
                mime_type, file_extension, is_active, uploaded_at
              )
              VALUES (
                ${employeeId}, 'primary_qualification', ${fileName}, ${filePath}, ${fileSize},
                ${mimeType}, ${extension}, true, CURRENT_TIMESTAMP
              )
            `;
            }
          }
        }
      });

      return res.json({ success: true, message: "تم حفظ البيانات الناقصة" });
    } catch (error) {
      log.error("Error saving missing required data", { error: error.message });
      return res.status(500).json({
        success: false,
        message: "فشل حفظ البيانات",
        error: error.message,
      });
    }
  },
);

// Get employees with server-side pagination (optimized for large datasets)
router.get("/paginated", async (req, res) => {
  try {
    const { Employee } = await import("../models/Employee.js");

    // Parse pagination params
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const pageSize = Math.min(
      100,
      Math.max(10, parseInt(req.query.pageSize) || 50),
    );

    // Handle branch_id
    let branchId = null;
    if (req.user.role === "branch_manager") {
      branchId = req.user.branch_id;
    } else if (req.query.branch_id) {
      if (Array.isArray(req.query.branch_id)) {
        branchId = req.query.branch_id
          .map((id) => parseInt(id))
          .filter((id) => !isNaN(id));
      } else if (
        typeof req.query.branch_id === "string" &&
        req.query.branch_id.includes(",")
      ) {
        branchId = req.query.branch_id
          .split(",")
          .map((id) => parseInt(id.trim()))
          .filter((id) => !isNaN(id));
      } else {
        branchId = parseInt(req.query.branch_id);
        if (isNaN(branchId)) branchId = null;
      }
    }

    const filters = {
      branch_id: branchId,
      occupation: req.query.occupation,
      data_completion_status: req.query.data_completion_status,
      status: req.query.status,
      search_name: req.query.search_name,
      search_id: req.query.search_id,
      search_phone: req.query.search_phone,
    };

    const result = await Employee.findAllPaginated(filters, page, pageSize);

    res.json({
      success: true,
      ...result,
    });
  } catch (error) {
    log.error("Error fetching paginated employees", { error: error.message });
    res.status(500).json({
      success: false,
      message: "فشل جلب الموظفين",
      error: error.message,
    });
  }
});

/**
 * GET /api/employees/statistics
 * Get aggregated employee statistics
 * Accessible to main managers (all branches) and branch managers (their branch only)
 */
router.get("/statistics", async (req, res) => {
  try {
    // Determine branch filter
    let branchId = null;
    let branchIds = null;
    if (req.user.role === "branch_manager") {
      branchId = req.user.branch_id;
    } else if (req.query.branch_id) {
      // Support single branch or multiple branches for main managers
      if (Array.isArray(req.query.branch_id)) {
        branchIds = req.query.branch_id
          .map((id) => parseInt(id))
          .filter((id) => !isNaN(id));
      } else if (
        typeof req.query.branch_id === "string" &&
        req.query.branch_id.includes(",")
      ) {
        branchIds = req.query.branch_id
          .split(",")
          .map((id) => parseInt(id.trim()))
          .filter((id) => !isNaN(id));
      } else {
        branchId = parseInt(req.query.branch_id);
        if (isNaN(branchId)) branchId = null;
      }
    }

    // Build branch filter for SQL
    const branchFilter = branchId
      ? sql`AND branch_id = ${branchId}`
      : branchIds && branchIds.length > 0
        ? sql`AND branch_id = ANY(${sql(branchIds)})`
        : sql``;

    // Get overview statistics
    const overviewQuery = sql`
      SELECT
        COUNT(*)::int as total,
        COUNT(*) FILTER (WHERE gender = 'male')::int as male,
        COUNT(*) FILTER (WHERE gender = 'female')::int as female,
        COUNT(*) FILTER (WHERE status = 'active')::int as active_count,
        COUNT(*) FILTER (WHERE status = 'pending')::int as pending_count,
        AVG(salary)::numeric(10,2) as avg_salary,
        SUM(salary)::numeric(10,2) as total_salary_budget,
        COUNT(*) FILTER (WHERE data_completion_status = 'complete')::int as complete_count,
        MIN(salary)::numeric(10,2) as min_salary,
        MAX(salary)::numeric(10,2) as max_salary
      FROM employees
      WHERE (status IN ('active', 'pending') OR status IS NULL)
      ${branchFilter}
    `;

    // Gender distribution
    const genderQuery = sql`
      SELECT
        gender,
        COUNT(*)::int as count
      FROM employees
      WHERE (status IN ('active', 'pending') OR status IS NULL)
      ${branchFilter}
      AND gender IS NOT NULL
      GROUP BY gender
    `;

    // Salary by gender
    const salaryByGenderQuery = sql`
      SELECT
        gender,
        AVG(salary)::numeric(10,2) as average,
        COUNT(*)::int as count
      FROM employees
      WHERE (status IN ('active', 'pending') OR status IS NULL)
      ${branchFilter}
      AND salary IS NOT NULL AND salary > 0 AND gender IS NOT NULL
      GROUP BY gender
    `;

    // Salary ranges
    const salaryRangesQuery = sql`
      SELECT
        CASE
          WHEN salary < 5000 THEN '0-5000'
          WHEN salary < 10000 THEN '5000-10000'
          WHEN salary < 15000 THEN '10000-15000'
          WHEN salary < 20000 THEN '15000-20000'
          ELSE '20000+'
        END as range,
        COUNT(*)::int as count
      FROM employees
      WHERE (status IN ('active', 'pending') OR status IS NULL)
      ${branchFilter}
      AND salary IS NOT NULL AND salary > 0
      GROUP BY range
      ORDER BY MIN(salary)
    `;

    // Salary by job title
    const salaryByJobTitleQuery = sql`
      SELECT
        COALESCE(job_title, occupation, 'غير محدد') as job_title,
        AVG(salary)::numeric(10,2) as average,
        COUNT(*)::int as count
      FROM employees
      WHERE (status IN ('active', 'pending') OR status IS NULL)
      ${branchFilter}
      AND salary IS NOT NULL AND salary > 0
      GROUP BY COALESCE(job_title, occupation, 'غير محدد')
      HAVING COUNT(*) > 0
      ORDER BY average DESC
      LIMIT 20
    `;

    // Top paid employees
    const topPaidQuery = sql`
      SELECT
        employee_id_number as employee_id,
        CONCAT(first_name, ' ', second_name, ' ', third_name, ' ', fourth_name) as name,
        salary::numeric(10,2)
      FROM employees
      WHERE (status IN ('active', 'pending') OR status IS NULL)
      ${branchFilter}
      AND salary IS NOT NULL AND salary > 0
      ORDER BY salary DESC
      LIMIT 10
    `;

    // Job titles distribution (no limit to show all)
    // Handle both NULL and empty strings by converting empty strings to NULL first
    const jobTitlesQuery = sql`
      SELECT
        COALESCE(NULLIF(job_title, ''), NULLIF(occupation, ''), 'غير محدد') as job_title,
        COUNT(*)::int as count
      FROM employees
      WHERE (status IN ('active', 'pending') OR status IS NULL)
      ${branchFilter}
      GROUP BY COALESCE(NULLIF(job_title, ''), NULLIF(occupation, ''), 'غير محدد')
      ORDER BY count DESC
    `;

    // Contract types
    const contractTypesQuery = sql`
      SELECT
        COALESCE(contract_type, 'غير محدد') as contract_type,
        COUNT(*)::int as count
      FROM employees
      WHERE (status IN ('active', 'pending') OR status IS NULL)
      ${branchFilter}
      GROUP BY COALESCE(contract_type, 'غير محدد')
      ORDER BY count DESC
    `;

    // Marital status
    const maritalStatusQuery = sql`
      SELECT
        COALESCE(marital_status, 'غير محدد') as status,
        COUNT(*)::int as count
      FROM employees
      WHERE (status IN ('active', 'pending') OR status IS NULL)
      ${branchFilter}
      GROUP BY COALESCE(marital_status, 'غير محدد')
      ORDER BY count DESC
    `;

    // Nationalities (top 15)
    const nationalitiesQuery = sql`
      SELECT
        nationality,
        COUNT(*)::int as count
      FROM employees
      WHERE (status IN ('active', 'pending') OR status IS NULL)
      ${branchFilter}
      AND nationality IS NOT NULL
      GROUP BY nationality
      ORDER BY count DESC
      LIMIT 15
    `;

    // Educational qualifications
    const qualificationsQuery = sql`
      SELECT
        COALESCE(educational_qualification, 'غير محدد') as qualification,
        COUNT(*)::int as count
      FROM employees
      WHERE (status IN ('active', 'pending') OR status IS NULL)
      ${branchFilter}
      GROUP BY COALESCE(educational_qualification, 'غير محدد')
      ORDER BY count DESC
    `;

    // Status distribution
    const statusQuery = sql`
      SELECT
        COALESCE(status, 'active') as status,
        COUNT(*)::int as count
      FROM employees
      WHERE (status IN ('active', 'pending') OR status IS NULL)
      ${branchFilter}
      GROUP BY COALESCE(status, 'active')
      ORDER BY count DESC
    `;

    // Branch distribution (only if main manager)
    let branchDistributionQuery = null;
    if (!branchId && (!branchIds || branchIds.length === 0)) {
      branchDistributionQuery = sql`
        SELECT
          b.branch_name,
          b.id as branch_id,
          COUNT(e.id)::int as count
        FROM branches b
        LEFT JOIN employees e ON e.branch_id = b.id AND (e.status IN ('active', 'pending') OR e.status IS NULL)
        WHERE b.is_active = true
        GROUP BY b.id, b.branch_name
        HAVING COUNT(e.id) > 0
        ORDER BY count DESC
      `;
    }

    // Age groups (if date_of_birth_gregorian available)
    const ageGroupsQuery = sql`
      SELECT
        CASE
          WHEN EXTRACT(YEAR FROM AGE(date_of_birth_gregorian)) < 25 THEN 'أقل من 25'
          WHEN EXTRACT(YEAR FROM AGE(date_of_birth_gregorian)) < 30 THEN '25-30'
          WHEN EXTRACT(YEAR FROM AGE(date_of_birth_gregorian)) < 35 THEN '30-35'
          WHEN EXTRACT(YEAR FROM AGE(date_of_birth_gregorian)) < 40 THEN '35-40'
          WHEN EXTRACT(YEAR FROM AGE(date_of_birth_gregorian)) < 45 THEN '40-45'
          WHEN EXTRACT(YEAR FROM AGE(date_of_birth_gregorian)) < 50 THEN '45-50'
          WHEN EXTRACT(YEAR FROM AGE(date_of_birth_gregorian)) < 55 THEN '50-55'
          ELSE '55+'
        END as age_group,
        COUNT(*)::int as count
      FROM employees
      WHERE (status IN ('active', 'pending') OR status IS NULL)
      ${branchFilter}
      AND date_of_birth_gregorian IS NOT NULL
      GROUP BY age_group
      ORDER BY MIN(EXTRACT(YEAR FROM AGE(date_of_birth_gregorian)))
    `;

    // Experience levels
    const experienceQuery = sql`
      SELECT
        CASE
          WHEN years_of_experience_in_same_institution IS NULL OR years_of_experience_in_same_institution < 2 THEN '0-2'
          WHEN years_of_experience_in_same_institution < 5 THEN '2-5'
          WHEN years_of_experience_in_same_institution < 10 THEN '5-10'
          WHEN years_of_experience_in_same_institution < 15 THEN '10-15'
          ELSE '15+'
        END as experience_range,
        COUNT(*)::int as count
      FROM employees
      WHERE (status IN ('active', 'pending') OR status IS NULL)
      ${branchFilter}
      GROUP BY experience_range
      ORDER BY MIN(COALESCE(years_of_experience_in_same_institution, 0))
    `;

    // ID Type distribution (citizen vs resident)
    const idTypeQuery = sql`
      SELECT
        COALESCE(id_type, 'غير محدد') as id_type,
        COUNT(*)::int as count
      FROM employees
      WHERE (status IN ('active', 'pending') OR status IS NULL)
      ${branchFilter}
      GROUP BY COALESCE(id_type, 'غير محدد')
      ORDER BY count DESC
    `;

    // Experience in company (years_of_experience_in_company)
    const companyExperienceQuery = sql`
      SELECT
        CASE
          WHEN years_of_experience_in_company IS NULL OR years_of_experience_in_company < 1 THEN 'أقل من سنة'
          WHEN years_of_experience_in_company < 2 THEN '1-2'
          WHEN years_of_experience_in_company < 3 THEN '2-3'
          WHEN years_of_experience_in_company < 5 THEN '3-5'
          WHEN years_of_experience_in_company < 10 THEN '5-10'
          ELSE '10+'
        END as experience_range,
        COUNT(*)::int as count
      FROM employees
      WHERE (status IN ('active', 'pending') OR status IS NULL)
      ${branchFilter}
      GROUP BY experience_range
      ORDER BY MIN(COALESCE(years_of_experience_in_company, 0))
    `;

    // Salary by branch (only if main manager)
    let salaryByBranchQuery = null;
    if (!branchId && (!branchIds || branchIds.length === 0)) {
      salaryByBranchQuery = sql`
        SELECT
          b.branch_name,
          b.id as branch_id,
          AVG(e.salary)::numeric(10,2) as average_salary,
          COUNT(e.id)::int as count
        FROM branches b
        LEFT JOIN employees e ON e.branch_id = b.id
          AND (e.status IN ('active', 'pending') OR e.status IS NULL)
          AND e.salary IS NOT NULL AND e.salary > 0
        WHERE b.is_active = true
        GROUP BY b.id, b.branch_name
        HAVING COUNT(e.id) > 0
        ORDER BY average_salary DESC
      `;
    }

    // Execute all queries in parallel
    const [
      overviewResult,
      genderResult,
      salaryByGenderResult,
      salaryRangesResult,
      salaryByJobTitleResult,
      topPaidResult,
      jobTitlesResult,
      contractTypesResult,
      maritalStatusResult,
      nationalitiesResult,
      qualificationsResult,
      statusResult,
      ageGroupsResult,
      experienceResult,
      branchDistributionResult,
      idTypeResult,
      companyExperienceResult,
      salaryByBranchResult,
    ] = await Promise.all([
      overviewQuery,
      genderQuery,
      salaryByGenderQuery,
      salaryRangesQuery,
      salaryByJobTitleQuery,
      topPaidQuery,
      jobTitlesQuery,
      contractTypesQuery,
      maritalStatusQuery,
      nationalitiesQuery,
      qualificationsQuery,
      statusQuery,
      ageGroupsQuery,
      experienceQuery,
      branchDistributionQuery || Promise.resolve([]),
      idTypeQuery,
      companyExperienceQuery,
      salaryByBranchQuery || Promise.resolve([]),
    ]);

    const overview = overviewResult[0] || {};
    const total = parseInt(overview.total || 0);
    const completionRate =
      total > 0
        ? Math.round((parseInt(overview.complete_count || 0) / total) * 100)
        : 0;

    // Calculate gender percentages
    const genderData = (genderResult || []).map((item) => ({
      gender: item.gender === "male" ? "male" : "female",
      count: parseInt(item.count || 0),
      percentage:
        total > 0
          ? Math.round((parseInt(item.count || 0) / total) * 100 * 10) / 10
          : 0,
    }));

    // Build salary by gender object
    const salaryByGender = {};
    (salaryByGenderResult || []).forEach((item) => {
      salaryByGender[item.gender] = {
        average: parseFloat(item.average || 0),
        count: parseInt(item.count || 0),
      };
    });

    res.json({
      success: true,
      data: {
        overview: {
          total,
          male: parseInt(overview.male || 0),
          female: parseInt(overview.female || 0),
          active: parseInt(overview.active_count || 0),
          pending: parseInt(overview.pending_count || 0),
          avgSalary: parseFloat(overview.avg_salary || 0),
          totalSalaryBudget: parseFloat(overview.total_salary_budget || 0),
          completionRate,
          minSalary: parseFloat(overview.min_salary || 0),
          maxSalary: parseFloat(overview.max_salary || 0),
        },
        gender: genderData,
        salary: {
          average: parseFloat(overview.avg_salary || 0),
          min: parseFloat(overview.min_salary || 0),
          max: parseFloat(overview.max_salary || 0),
          byGender: salaryByGender,
          ranges: (salaryRangesResult || []).map((item) => ({
            range: item.range,
            count: parseInt(item.count || 0),
          })),
          byJobTitle: (salaryByJobTitleResult || []).map((item) => ({
            job_title: item.job_title,
            average: parseFloat(item.average || 0),
            count: parseInt(item.count || 0),
          })),
          topPaid: (topPaidResult || []).map((item) => ({
            employee_id: item.employee_id,
            name: item.name,
            salary: parseFloat(item.salary || 0),
          })),
        },
        jobTitles: (jobTitlesResult || []).map((item) => ({
          job_title: item.job_title,
          count: parseInt(item.count || 0),
        })),
        contractTypes: (contractTypesResult || []).map((item) => ({
          contract_type: item.contract_type,
          count: parseInt(item.count || 0),
        })),
        maritalStatus: (maritalStatusResult || []).map((item) => ({
          status: item.status,
          count: parseInt(item.count || 0),
        })),
        nationalities: (nationalitiesResult || []).map((item) => ({
          nationality: item.nationality,
          count: parseInt(item.count || 0),
        })),
        educationalQualifications: (qualificationsResult || []).map((item) => ({
          qualification: item.qualification,
          count: parseInt(item.count || 0),
        })),
        status: (statusResult || []).map((item) => ({
          status: item.status,
          count: parseInt(item.count || 0),
        })),
        ageGroups: (ageGroupsResult || []).map((item) => ({
          age_group: item.age_group,
          count: parseInt(item.count || 0),
        })),
        experienceLevels: (experienceResult || []).map((item) => ({
          experience_range: item.experience_range,
          count: parseInt(item.count || 0),
        })),
        idTypes: (idTypeResult || []).map((item) => ({
          id_type: item.id_type,
          count: parseInt(item.count || 0),
        })),
        companyExperience: (companyExperienceResult || []).map((item) => ({
          experience_range: item.experience_range,
          count: parseInt(item.count || 0),
        })),
        ...(branchDistributionResult && branchDistributionResult.length > 0
          ? {
            branches: (branchDistributionResult || []).map((item) => ({
              branch_name: item.branch_name,
              branch_id: parseInt(item.branch_id),
              count: parseInt(item.count || 0),
            })),
          }
          : {}),
        ...(salaryByBranchResult && salaryByBranchResult.length > 0
          ? {
            salaryByBranch: (salaryByBranchResult || []).map((item) => ({
              branch_name: item.branch_name,
              branch_id: parseInt(item.branch_id),
              average_salary: parseFloat(item.average_salary || 0),
              count: parseInt(item.count || 0),
            })),
          }
          : {}),
      },
    });
  } catch (error) {
    log.error("Error fetching employee statistics", { error: error.message });
    res.status(500).json({
      success: false,
      message: "فشل جلب إحصائيات الموظفين",
      error: error.message,
    });
  }
});

// Get all employees (filtered by branch for branch managers)
router.get("/", async (req, res) => {
  try {
    const { Employee } = await import("../models/Employee.js");
    const { updateEmployeeCompletionStatus } =
      await import("../utils/employeeDataCompletion.js");

    // Handle branch_id - support single value or array
    let branchId = null;
    if (req.user.role === "branch_manager") {
      branchId = req.user.branch_id;
    } else if (req.query.branch_id) {
      // Check if it's an array (comma-separated values)
      if (Array.isArray(req.query.branch_id)) {
        branchId = req.query.branch_id
          .map((id) => parseInt(id))
          .filter((id) => !isNaN(id));
      } else if (
        typeof req.query.branch_id === "string" &&
        req.query.branch_id.includes(",")
      ) {
        // Comma-separated string
        branchId = req.query.branch_id
          .split(",")
          .map((id) => parseInt(id.trim()))
          .filter((id) => !isNaN(id));
      } else {
        // Single value
        branchId = parseInt(req.query.branch_id);
        if (isNaN(branchId)) branchId = null;
      }
    }

    // Helper to parse array filters from query params
    const parseArrayFilter = (value) => {
      if (!value) return undefined;
      if (Array.isArray(value)) return value;
      if (typeof value === "string" && value.includes(",")) {
        return value
          .split(",")
          .map((v) => v.trim())
          .filter((v) => v);
      }
      return [value];
    };

    const filters = {
      branch_id: branchId,
      occupation: req.query.occupation,
      is_active:
        req.query.is_active !== undefined
          ? req.query.is_active === "true"
          : undefined,
      data_completion_status: parseArrayFilter(
        req.query.data_completion_status,
      ),
      status: req.query.status,
      // Array filters for payrolls
      nationality: parseArrayFilter(req.query.nationality),
      job_title: parseArrayFilter(req.query.job_title),
      gender: parseArrayFilter(req.query.gender),
      marital_status: parseArrayFilter(req.query.marital_status),
      educational_qualification: parseArrayFilter(
        req.query.educational_qualification,
      ),
      contract_type: parseArrayFilter(req.query.contract_type),
      // Search filters (only for main manager)
      search_name: req.query.search_name,
      search_id: req.query.search_id,
      search_phone: req.query.search_phone,
      // Pagination support (optional, for future use)
      limit: req.query.limit,
      offset: req.query.offset,
    };

    const employees = await Employee.findAll(filters);

    // NOTE: On-read completion recalculation is disabled for performance.
    // Use admin endpoint POST /api/admin/recalculate-branch (main manager) to schedule background recalculation,
    // or POST /api/employees/:id/update-completion-status for single employee updates.
    res.json({ success: true, data: employees });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "فشل جلب الموظفين",
      error: error.message,
    });
  }
});

// Update employee completion status - MUST be before /:id route
router.post("/:id/update-completion-status", async (req, res) => {
  try {
    const { updateEmployeeCompletionStatus } =
      await import("../utils/employeeDataCompletion.js");
    const updatedEmployee = await updateEmployeeCompletionStatus(
      parseInt(req.params.id),
    );
    res.json({ success: true, data: updatedEmployee });
  } catch (error) {
    log.error("Error updating completion status", { error: error.message });
    res.status(500).json({
      success: false,
      message: "فشل تحديث حالة الإكمال",
      error: error.message,
    });
  }
});

// Get employee documents - MUST be before /:id route
router.get("/:id/documents", async (req, res) => {
  try {
    const { Employee } = await import("../models/Employee.js");
    const employee = await Employee.findById(parseInt(req.params.id));

    if (!employee) {
      return res.status(404).json({
        success: false,
        message: "الموظف غير موجود",
      });
    }

    // Check branch access (multi-branch aware)
    if (
      req.user.role === "branch_manager" &&
      !employeeHasBranchAccess(employee, req.user.branch_id)
    ) {
      return res.status(403).json({
        success: false,
        message: "تم رفض الوصول",
      });
    }

    const filters = {
      document_type: req.query.document_type,
      mime_type: req.query.mime_type,
      is_verified:
        req.query.is_verified !== undefined
          ? req.query.is_verified === "true"
          : undefined,
    };

    const documents = await Document.findByEmployeeId(
      parseInt(req.params.id),
      filters,
    );
    res.json({ success: true, data: documents });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "فشل جلب مستندات الموظف",
      error: error.message,
    });
  }
});

// Get employee missing data - MUST be before /:id route
router.get("/:id/missing-data", async (req, res) => {
  try {
    const { Employee } = await import("../models/Employee.js");
    const { checkEmployeeDataCompletion } =
      await import("../utils/employeeDataCompletion.js");

    const employee = await Employee.findById(parseInt(req.params.id));

    if (!employee) {
      return res.status(404).json({
        success: false,
        message: "الموظف غير موجود",
      });
    }

    // Check branch access
    if (
      req.user.role === "branch_manager" &&
      req.user.branch_id !== employee.branch_id
    ) {
      return res.status(403).json({
        success: false,
        message: "تم رفض الوصول",
      });
    }

    // Get documents, classifications, and certificates
    const sql = (await import("../config/database.js")).default;
    const [documents, classifications, certificates] = await Promise.all([
      sql`SELECT document_type FROM employee_documents WHERE employee_id = ${employee.id} AND is_active = true`,
      sql`SELECT profession FROM employee_professional_classifications WHERE employee_id = ${employee.id}`,
      sql`SELECT course_type FROM employee_course_certificates WHERE employee_id = ${employee.id}`,
    ]);

    // Check completion
    const completion = await checkEmployeeDataCompletion(employee, {
      documents,
      classifications,
      certificates,
    });

    res.json({
      success: true,
      data: {
        isComplete: completion.isComplete,
        missingFields: completion.missingFields,
      },
    });
  } catch (error) {
    log.error("Error fetching missing data", { error: error.message });
    res.status(500).json({
      success: false,
      message: "فشل جلب البيانات المفقودة",
      error: error.message,
    });
  }
});

// Get employee by ID - MUST be after specific routes like /:id/missing-data
router.get("/:id", async (req, res) => {
  try {
    const { Employee } = await import("../models/Employee.js");
    const employee = await Employee.findById(parseInt(req.params.id));

    if (!employee) {
      return res.status(404).json({
        success: false,
        message: "الموظف غير موجود",
      });
    }

    // Check branch access (check if employee is linked to user's branch)
    if (req.user.role === "branch_manager") {
      let branchIds = [];
      try {
        branchIds = await Employee.getBranchIds(employee.id);
        // Fallback to primary branch_id if getBranchIds fails or returns empty
        if (branchIds.length === 0 && employee.branch_id) {
          branchIds = [employee.branch_id];
        }
      } catch (error) {
        // If employee_branches table doesn't exist, use branch_id
        if (employee.branch_id) {
          branchIds = [employee.branch_id];
        }
      }

      if (!branchIds.includes(req.user.branch_id)) {
        return res.status(403).json({
          success: false,
          message: "تم رفض الوصول",
        });
      }
    }

    res.json({ success: true, data: employee });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "فشل جلب الموظف",
      error: error.message,
    });
  }
});

// Check for duplicate employees (before creating)
router.post("/check-duplicate", async (req, res) => {
  try {
    const { Employee } = await import("../models/Employee.js");
    const {
      id_or_residency_number,
      date_of_birth_hijri,
      date_of_birth_gregorian,
    } = req.body;

    if (!id_or_residency_number) {
      return res.status(400).json({
        success: false,
        message: "رقم الهوية أو الإقامة مطلوب",
      });
    }

    const duplicates = await Employee.findDuplicates(
      id_or_residency_number,
      date_of_birth_hijri,
      date_of_birth_gregorian,
    );

    res.json({
      success: true,
      hasDuplicates: duplicates.length > 0,
      duplicates: duplicates,
    });
  } catch (error) {
    log.error("Error checking for duplicates", { error: error.message });
    res.status(500).json({
      success: false,
      message: "فشل التحقق من التكرار",
      error: error.message,
    });
  }
});

// Create employee
router.post(
  "/",
  validateRequired([
    "first_name",
    "second_name",
    "third_name",
    "fourth_name",
    "id_or_residency_number",
    "job_title",
    "phone_number",
    "email",
    "gender",
    "bank_iban",
    "bank_name",
    "national_address",
  ]),
  validateEmployeeName,
  validateEmail,
  validateDateFields({
    date_of_birth_hijri: {
      calendarType: "hijri",
      dateType: "birth_date",
      required: true,
    },
    id_expiry_date_hijri: {
      calendarType: "hijri",
      dateType: "general",
      required: false,
    },
  }),
  async (req, res) => {
    console.log("========================================");
    console.log("[EMPLOYEE CREATE] Starting employee creation");
    console.log("[EMPLOYEE CREATE] User:", {
      id: req.user.id,
      role: req.user.role,
      branch_id: req.user.branch_id,
    });
    console.log("[EMPLOYEE CREATE] Request body keys:", Object.keys(req.body));
    console.log(
      "[EMPLOYEE CREATE] Employee ID/Residency:",
      req.body.id_or_residency_number,
    );
    console.log(
      "[EMPLOYEE CREATE] Name:",
      `${req.body.first_name} ${req.body.second_name} ${req.body.third_name} ${req.body.fourth_name}`,
    );
    console.log("[EMPLOYEE CREATE] Branch ID from body:", req.body.branch_id);

    try {
      const { Employee } = await import("../models/Employee.js");
      const { updateEmployeeCompletionStatus } =
        await import("../utils/employeeDataCompletion.js");
      const { isSaudi } = await import("../utils/employeeHelpers.js");

      console.log("[EMPLOYEE CREATE] Imports loaded successfully");

      // Date validation is handled by validateDateFields middleware
      console.log("[EMPLOYEE CREATE] Date validation passed");

      // For branch managers, force branch_id to their branch (prevent manipulation)
      if (req.user.role === "branch_manager") {
        console.log(
          "[EMPLOYEE CREATE] Branch manager detected - checking branch access",
        );
        if (req.body.branch_id && req.body.branch_id !== req.user.branch_id) {
          console.log(
            "[EMPLOYEE CREATE] ERROR: Branch manager trying to add employee to different branch",
          );
          return res.status(403).json({
            success: false,
            message: "You can only add employees to your own branch",
          });
        }
        // Force branch_id to their branch
        req.body.branch_id = req.user.branch_id;
        console.log(
          "[EMPLOYEE CREATE] Branch ID forced to:",
          req.body.branch_id,
        );
      }

      // Date normalization is handled by validateDateFields middleware
      console.log("[EMPLOYEE CREATE] Starting field length validation");

      // Validate field lengths before insertion
      const fieldLengths = {
        first_name: 100,
        second_name: 100,
        third_name: 100,
        fourth_name: 100,
        occupation: 100,
        nationality: 100,
        religion: 100,
        marital_status: 50,
        educational_qualification: 200,
        specialization: 200,
        bank_name: 200,
        email: 255,
        phone_number: 50,
        contract_type: 100,
        id_or_residency_number: 100,
        employee_id_number: 100,
      };

      for (const [field, maxLength] of Object.entries(fieldLengths)) {
        if (
          req.body[field] &&
          typeof req.body[field] === "string" &&
          req.body[field].length > maxLength
        ) {
          console.log(
            "[EMPLOYEE CREATE] ERROR: Field length validation failed:",
            field,
            "length:",
            req.body[field].length,
            "max:",
            maxLength,
          );
          return res.status(400).json({
            success: false,
            message: `الحقل "${field}" يتجاوز الحد الأقصى لعدد الأحرف (${maxLength} حرف)`,
          });
        }
      }
      console.log("[EMPLOYEE CREATE] Field length validation passed");

      // Set created_by to branch_id (never null)
      // For branch managers: use their branch_id
      // For main managers: use the employee's branch_id
      let createdByBranchId = req.body.branch_id;
      console.log(
        "[EMPLOYEE CREATE] Initial createdByBranchId:",
        createdByBranchId,
      );

      // If branch manager, force to their branch_id
      if (req.user.role === "branch_manager" && req.user.branch_id) {
        createdByBranchId = req.user.branch_id;
        console.log(
          "[EMPLOYEE CREATE] Updated createdByBranchId for branch manager:",
          createdByBranchId,
        );
      }

      // Ensure branch_id is set (should never be null at this point)
      if (!createdByBranchId) {
        console.log(
          "[EMPLOYEE CREATE] ERROR: createdByBranchId is null or undefined",
        );
        return res.status(400).json({
          success: false,
          message: "لا يمكن تحديد الفرع. الرجاء المحاولة مرة أخرى.",
        });
      }
      console.log(
        "[EMPLOYEE CREATE] Final createdByBranchId:",
        createdByBranchId,
      );

      // Check if this is linking to an existing employee (via existing_employee_id)
      if (req.body.existing_employee_id && req.body.link_to_branch) {
        console.log(
          "[EMPLOYEE CREATE] Linking to existing employee:",
          req.body.existing_employee_id,
        );
        const existingEmployeeId = parseInt(req.body.existing_employee_id);
        const linkBranchId =
          req.body.link_to_branch === "true" ? createdByBranchId : null;

        if (linkBranchId) {
          try {
            console.log(
              "[EMPLOYEE CREATE] Attempting to link employee to branch",
            );
            await Employee.linkToBranch(
              existingEmployeeId,
              linkBranchId,
              req.user.id,
            );
            const updatedEmployee = await Employee.findById(existingEmployeeId);
            clearByPrefix(`dashboard:summary:${linkBranchId}`);
            clearByPrefix("branch-statistics");
            console.log(
              "[EMPLOYEE CREATE] Successfully linked existing employee to branch",
            );
            return res.status(200).json({
              success: true,
              data: updatedEmployee,
              message: "تم ربط الموظف بالفرع الجديد بنجاح",
            });
          } catch (linkError) {
            console.log(
              "[EMPLOYEE CREATE] WARNING: Could not link employee to branch:",
              linkError.message,
            );
            log.warn(
              "Could not link employee to branch (table may not exist)",
              { error: linkError.message },
            );
          }
        }
      }

      console.log("[EMPLOYEE CREATE] Creating new employee in database...");
      console.log("[EMPLOYEE CREATE] Employee data being sent to model:", {
        employee_id_number: req.body.employee_id_number,
        branch_id: req.body.branch_id,
        first_name: req.body.first_name,
        id_or_residency_number: req.body.id_or_residency_number,
        created_by: createdByBranchId,
        updated_by: createdByBranchId,
        contract_start_date_hijri: req.body.contract_start_date_hijri,
        contract_end_date_hijri: req.body.contract_end_date_hijri,
      });

      const employee = await Employee.create({
        ...req.body,
        created_by: createdByBranchId,
        updated_by: createdByBranchId, // For new records, updated_by = created_by
        data_completion_status: "incomplete", // Default to incomplete
      });

      console.log(
        "[EMPLOYEE CREATE] Employee created successfully with ID:",
        employee.id,
      );

      // Link employee to branch in employee_branches table
      try {
        console.log(
          "[EMPLOYEE CREATE] Linking employee to branch in employee_branches table",
        );
        await Employee.linkToBranch(
          employee.id,
          createdByBranchId,
          req.user.id,
        );
        console.log("[EMPLOYEE CREATE] Successfully linked employee to branch");
      } catch (linkError) {
        console.log(
          "[EMPLOYEE CREATE] WARNING: Could not link employee to branch (table may not exist yet):",
          linkError.message,
        );
        log.warn(
          "Could not link employee to branch (table may not exist yet)",
          { error: linkError.message },
        );
      }

      // Check and update completion status
      try {
        console.log("[EMPLOYEE CREATE] Updating employee completion status");
        await updateEmployeeCompletionStatus(employee.id);
        // Reload employee to get updated status
        const updatedEmployee = await Employee.findById(employee.id);
        console.log("[EMPLOYEE CREATE] Employee completion status updated");
        // Invalidate caches for this branch and branch statistics
        clearByPrefix(`dashboard:summary:${updatedEmployee.branch_id}`);
        clearByPrefix("branch-statistics");
        console.log(
          "[EMPLOYEE CREATE] SUCCESS: Employee created and processed successfully",
        );
        console.log("========================================");
        res.status(201).json({ success: true, data: updatedEmployee });
      } catch (completionError) {
        console.log(
          "[EMPLOYEE CREATE] WARNING: Error checking completion status:",
          completionError.message,
        );
        log.warn("Error checking completion status", {
          error: completionError.message,
        });
        // Invalidate caches for safety
        clearByPrefix(`dashboard:summary:${createdByBranchId}`);
        clearByPrefix("branch-statistics");
        // Still return success, but with original employee data
        console.log(
          "[EMPLOYEE CREATE] SUCCESS: Employee created (completion status check failed)",
        );
        console.log("========================================");
        res.status(201).json({ success: true, data: employee });
      }
    } catch (error) {
      console.log("[EMPLOYEE CREATE] ERROR:", error.message);
      console.log("[EMPLOYEE CREATE] Error stack:", error.stack);
      console.log("========================================");
      log.error("Error creating employee", {
        error: error.message,
        stack: error.stack,
      });
      res.status(500).json({
        success: false,
        message: "فشل إنشاء الموظف",
        error: error.message,
      });
    }
  },
);

// Update employee
router.put(
  "/:id",
  validateEmployeeName,
  validateDateFields({
    date_of_birth_hijri: {
      calendarType: "hijri",
      dateType: "birth_date",
      required: true,
    },
    id_expiry_date_hijri: {
      calendarType: "hijri",
      dateType: "general",
      required: false,
    },
    contract_start_date_hijri: {
      calendarType: "hijri",
      dateType: "contract_date",
      required: false,
    },
    contract_end_date_hijri: {
      calendarType: "hijri",
      dateType: "contract_date",
      required: false,
    },
  }),
  async (req, res) => {
    console.log("========================================");
    console.log("[EMPLOYEE UPDATE] Starting employee update");
    console.log("[EMPLOYEE UPDATE] Employee ID:", req.params.id);
    console.log("[EMPLOYEE UPDATE] User:", {
      id: req.user.id,
      role: req.user.role,
      branch_id: req.user.branch_id,
    });
    console.log("[EMPLOYEE UPDATE] Update fields:", Object.keys(req.body));

    try {
      const { Employee } = await import("../models/Employee.js");

      // Check if employee exists and user has access
      console.log("[EMPLOYEE UPDATE] Checking if employee exists...");
      const existingEmployee = await Employee.findById(parseInt(req.params.id));
      if (!existingEmployee) {
        console.log("[EMPLOYEE UPDATE] ERROR: Employee not found");
        return res.status(404).json({
          success: false,
          message: "الموظف غير موجود",
        });
      }
      console.log(
        "[EMPLOYEE UPDATE] Employee found:",
        existingEmployee.id,
        existingEmployee.branch_id,
      );

      if (
        req.user.role === "branch_manager" &&
        !employeeHasBranchAccess(existingEmployee, req.user.branch_id)
      ) {
        console.log(
          "[EMPLOYEE UPDATE] ERROR: Branch manager trying to update employee from different branch",
        );
        return res.status(403).json({
          success: false,
          message: "تم رفض الوصول",
        });
      }

      // For branch managers, prevent changing branch_id (force it to their branch)
      if (req.user.role === "branch_manager") {
        if (req.body.branch_id && req.body.branch_id !== req.user.branch_id) {
          return res.status(403).json({
            success: false,
            message: "لا يمكنك تغيير فرع الموظف",
          });
        }
        req.body.branch_id = req.user.branch_id;
      }

      // Set updated_by to branch_id (never null)
      // For branch managers: use their branch_id
      // For main managers: use the employee's branch_id (from existing employee or request)
      let updatedByBranchId = req.body.branch_id || existingEmployee.branch_id;

      // If branch manager, force to their branch_id
      if (req.user.role === "branch_manager" && req.user.branch_id) {
        updatedByBranchId = req.user.branch_id;
      }

      // Ensure branch_id is set (should never be null at this point)
      if (!updatedByBranchId) {
        return res.status(400).json({
          success: false,
          message: "لا يمكن تحديد الفرع. الرجاء المحاولة مرة أخرى.",
        });
      }

      // Date normalization is handled by validateDateFields middleware
      console.log("[EMPLOYEE UPDATE] Updated by branch ID:", updatedByBranchId);
      console.log("[EMPLOYEE UPDATE] Calling Employee.update()...");

      const employee = await Employee.update(
        parseInt(req.params.id),
        req.body,
        updatedByBranchId,
      );

      console.log(
        "[EMPLOYEE UPDATE] Employee updated successfully:",
        employee.id,
      );

      // Check and update completion status after update
      try {
        console.log("[EMPLOYEE UPDATE] Updating completion status...");
        const { updateEmployeeCompletionStatus } =
          await import("../utils/employeeDataCompletion.js");
        await updateEmployeeCompletionStatus(employee.id);
        // Reload employee to get updated status
        const updatedEmployee = await Employee.findById(employee.id);
        console.log("[EMPLOYEE UPDATE] Completion status updated");
        // Invalidate caches for this branch and branch statistics
        clearByPrefix(`dashboard:summary:${updatedEmployee.branch_id}`);
        clearByPrefix("branch-statistics");
        console.log("[EMPLOYEE UPDATE] SUCCESS: Employee updated successfully");
        console.log("========================================");
        res.json({ success: true, data: updatedEmployee });
      } catch (completionError) {
        console.log(
          "[EMPLOYEE UPDATE] WARNING: Error checking completion status:",
          completionError.message,
        );
        log.warn("Error checking completion status", {
          error: completionError.message,
        });
        // Invalidate caches for safety
        clearByPrefix(
          `dashboard:summary:${req.body.branch_id || existingEmployee.branch_id}`,
        );
        clearByPrefix("branch-statistics");
        // Still return success, but with original employee data
        console.log(
          "[EMPLOYEE UPDATE] SUCCESS: Employee updated (completion status check failed)",
        );
        console.log("========================================");
        res.json({ success: true, data: employee });
      }
    } catch (error) {
      console.log("[EMPLOYEE UPDATE] ERROR:", error.message);
      console.log("[EMPLOYEE UPDATE] Error stack:", error.stack);
      console.log("========================================");
      res.status(500).json({
        success: false,
        message: "فشل تحديث الموظف",
        error: error.message,
      });
    }
  },
);

// Delete employee (soft delete - archives employee)
router.delete("/:id", async (req, res) => {
  try {
    const { Employee } = await import("../models/Employee.js");

    const employeeId = parseInt(req.params.id);

    // Only main manager can delete employees
    if (req.user.role !== "main_manager") {
      return res.status(403).json({
        success: false,
        message: "Only main manager can delete employees",
      });
    }

    // Check if employee exists
    const employee = await Employee.findById(employeeId);
    if (!employee) {
      return res.status(404).json({
        success: false,
        message: "الموظف غير موجود",
      });
    }

    // Archive employee by setting status to 'other' with deactivation reason
    // Use employee's branch_id as statusChangedBy
    const updatedEmployee = await Employee.updateStatus(
      employeeId,
      "other",
      employee.branch_id,
      "تم إلغاء التفعيل",
    );

    // Invalidate dashboard & branch statistics caches for this branch
    clearByPrefix(`dashboard:summary:${employee.branch_id}`);
    clearByPrefix("branch-statistics");

    res.json({
      success: true,
      message: "تم إلغاء تفعيل الموظف بنجاح",
      data: updatedEmployee,
    });
  } catch (error) {
    log.error("Error deleting employee", { error: error.message });
    res.status(500).json({
      success: false,
      message: "فشل إلغاء تفعيل الموظف",
      error: error.message,
    });
  }
});

// Update employee status (instead of delete - employees are archived, not deleted)
router.put("/:id/status", async (req, res) => {
  try {
    const { Employee } = await import("../models/Employee.js");
    const { Branch } = await import("../models/Branch.js");

    const employeeId = parseInt(req.params.id);
    const { status, reason } = req.body;

    // Validation
    const validStatuses = [
      "active",
      "pending",
      "terminated_article_80",
      "terminated_article_77",
      "resigned",
      "contract_ended",
      "non_renewal",
      "other",
    ];
    if (!status || !validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: "حالة غير صحيحة",
      });
    }

    // Check if employee exists and user has access
    const employee = await Employee.findById(employeeId);
    if (!employee) {
      return res.status(404).json({
        success: false,
        message: "الموظف غير موجود",
      });
    }

    // Check access: branch managers can only update their branch employees
    if (
      req.user.role === "branch_manager" &&
      req.user.branch_id !== employee.branch_id
    ) {
      return res.status(403).json({
        success: false,
        message: "غير مصرح لك بتغيير حالة هذا الموظف",
      });
    }

    // Determine who changed the status
    let statusChangedBy = employee.branch_id; // Default to employee's branch
    if (req.user.role === "branch_manager" && req.user.branch_id) {
      statusChangedBy = req.user.branch_id;
    }

    // Update status
    const updatedEmployee = await Employee.updateStatus(
      employeeId,
      status,
      statusChangedBy,
      reason || null,
    );

    res.json({
      success: true,
      message: "تم تحديث حالة الموظف بنجاح",
      data: updatedEmployee,
    });
  } catch (error) {
    log.error("Error updating employee status", { error: error.message });
    res.status(500).json({
      success: false,
      message: "فشل تحديث حالة الموظف",
      error: error.message,
    });
  }
});

// Renew employee (pending -> active) - Branch Manager only
router.post("/:id/renew", async (req, res) => {
  try {
    const { Employee } = await import("../models/Employee.js");
    const { Document } = await import("../models/Document.js");
    const { Branch } = await import("../models/Branch.js");
    const { Term } = await import("../models/Term.js");
    const { AcademicYear } = await import("../models/AcademicYear.js");

    const employeeId = parseInt(req.params.id);

    // Check if user is branch manager
    if (req.user.role !== "branch_manager" || !req.user.branch_id) {
      return res.status(403).json({
        success: false,
        message: "فقط مديرو الفروع يمكنهم تجديد عقود الموظفين",
      });
    }

    // Get employee
    const employee = await Employee.findById(employeeId);
    if (!employee) {
      return res.status(404).json({
        success: false,
        message: "الموظف غير موجود",
      });
    }

    // Check access
    if (employee.branch_id !== req.user.branch_id) {
      return res.status(403).json({
        success: false,
        message: "غير مصرح لك بتجديد عقد هذا الموظف",
      });
    }

    // Check if employee is pending
    if (employee.status !== "pending") {
      return res.status(400).json({
        success: false,
        message: "هذا الموظف ليس في حالة انتظار التجديد",
      });
    }

    // Get branch to determine branch type
    const branch = await Branch.findById(employee.branch_id);
    if (!branch) {
      return res.status(404).json({
        success: false,
        message: "الفرع غير موجود",
      });
    }

    // Get current academic year and term
    const currentYear = await AcademicYear.getCurrentYear(branch.branch_type);
    if (!currentYear) {
      return res.status(400).json({
        success: false,
        message: "لا توجد سنة دراسية حالية لهذا النوع من الفروع",
      });
    }

    const currentTerm = await Term.getCurrentTerm(branch.branch_type);
    if (!currentTerm) {
      return res.status(400).json({
        success: false,
        message: "لا يوجد فصل دراسي حالياً",
      });
    }

    // Get employee documents
    const documents = await Document.findByEmployeeId(employeeId);
    const documentTypes = documents.map((d) => d.document_type);

    // Validate required documents for renewal
    const requiredDocs = ["employment_contract", "employment_letter"];
    if (employee.gender === "female") {
      requiredDocs.push("medical_examination");
    }

    const missingDocs = requiredDocs.filter(
      (docType) =>
        !documentTypes.includes(docType) &&
        !documentTypes.includes(docType.replace("_", "_")), // Handle variations
    );

    // Check if documents are recent (uploaded/updated in last 90 days)
    const now = new Date();
    const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);

    const recentDocs = documents.filter((doc) => {
      if (!requiredDocs.includes(doc.document_type)) return false;
      const uploadDate = new Date(doc.uploaded_at);
      return uploadDate >= ninetyDaysAgo;
    });

    if (missingDocs.length > 0 || recentDocs.length < requiredDocs.length) {
      return res.status(400).json({
        success: false,
        message: `يجب تحديث المستندات التالية: ${requiredDocs.join(", ")}`,
        missing_documents: missingDocs,
        required_documents: requiredDocs,
      });
    }

    // Renew employee
    const renewedEmployee = await Employee.renewEmployee(
      employeeId,
      currentYear.year_label,
      currentTerm.id,
      req.user.branch_id,
    );

    if (!renewedEmployee) {
      return res.status(400).json({
        success: false,
        message: 'فشل تجديد العقد. تأكد من أن حالة الموظف هي "قيد الانتظار"',
      });
    }

    res.json({
      success: true,
      message: "تم تجديد عقد الموظف بنجاح",
      data: renewedEmployee,
    });
  } catch (error) {
    log.error("Error renewing employee", { error: error.message });
    res.status(500).json({
      success: false,
      message: "فشل تجديد العقد",
      error: error.message,
    });
  }
});

// Non-renewal (pending -> archived status) - Branch Manager only
router.post("/:id/non-renewal", async (req, res) => {
  try {
    const { Employee } = await import("../models/Employee.js");

    const employeeId = parseInt(req.params.id);
    const { status, reason } = req.body;

    // Check if user is branch manager
    if (req.user.role !== "branch_manager" || !req.user.branch_id) {
      return res.status(403).json({
        success: false,
        message: "فقط مديرو الفروع يمكنهم تحديد عدم التجديد",
      });
    }

    // Get employee
    const employee = await Employee.findById(employeeId);
    if (!employee) {
      return res.status(404).json({
        success: false,
        message: "الموظف غير موجود",
      });
    }

    // Check access
    if (employee.branch_id !== req.user.branch_id) {
      return res.status(403).json({
        success: false,
        message: "غير مصرح لك بتحديد عدم التجديد لهذا الموظف",
      });
    }

    // Check if employee is pending
    if (employee.status !== "pending") {
      return res.status(400).json({
        success: false,
        message: "هذا الموظف ليس في حالة انتظار التجديد",
      });
    }

    // Validate status (must be an archived status, not active or pending)
    const archivedStatuses = [
      "terminated_article_80",
      "terminated_article_77",
      "resigned",
      "contract_ended",
      "non_renewal",
      "other",
    ];
    if (!status || !archivedStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: "يجب اختيار حالة أرشيفية (مثل: إنهاء العقد، الاستقالة، إلخ)",
      });
    }

    // Update status to archived status
    const updatedEmployee = await Employee.updateStatus(
      employeeId,
      status,
      req.user.branch_id,
      reason || "عدم تجديد العقد",
    );

    res.json({
      success: true,
      message: "تم نقل الموظف إلى الأرشيف بنجاح",
      data: updatedEmployee,
    });
  } catch (error) {
    log.error("Error processing non-renewal", { error: error.message });
    res.status(500).json({
      success: false,
      message: "فشل تحديد عدم التجديد",
      error: error.message,
    });
  }
});

/**
 * POST /api/employees/certificates/generate
 * Generate experience certificate for an employee
 * Main manager only
 */
router.post("/certificates/generate", requireMainManager, async (req, res) => {
  try {
    const { employee_id, certificate_type, certificate_data } = req.body;

    if (!employee_id) {
      return res.status(400).json({
        success: false,
        message: "معرف الموظف مطلوب",
      });
    }

    if (certificate_type !== "experience" && certificate_type !== "salary" && certificate_type !== "specialties") {
      return res.status(400).json({
        success: false,
        message: "نوع الشهادة غير مدعوم",
      });
    }

    // Fetch employee
    const { Employee } = await import("../models/Employee.js");
    const employee = await Employee.findById(parseInt(employee_id));

    if (!employee) {
      return res.status(404).json({
        success: false,
        message: "الموظف غير موجود",
      });
    }

    // Get employee data (use provided certificate_data if available, otherwise use employee data)
    const employeeFullName =
      certificate_data?.full_name ||
      `${employee.first_name || ""} ${employee.second_name || ""} ${employee.third_name || ""} ${employee.fourth_name || ""}`.trim();
    const employeeIdNumber =
      certificate_data?.id_number || employee.id_or_residency_number || "";
    const nationality =
      certificate_data?.nationality || employee.nationality || "";
    const jobTitle =
      certificate_data?.job_title ||
      employee.job_title ||
      employee.occupation ||
      "";
    // For specialties certificate, use profession field or fallback to jobTitle
    const profession =
      certificate_data?.profession || jobTitle || "";
    const employeeGender = employee.gender || "male"; // Get gender for هو/هي
    const employeeSalary = certificate_data?.salary || employee.salary || "";
    const basicSalary = certificate_data?.basic_salary || "";
    const housingAllowance = certificate_data?.housing_allowance || "";
    const transportationAllowance =
      certificate_data?.transportation_allowance || "";
    const otherAllowances = certificate_data?.other_allowances || "";
    const recipient = certificate_data?.recipient || "الي من يهمه الامر";
    const employer = certificate_data?.employer || "شركة الرعاية المتناهية";

    // Format date to English format (dd-mm-yyyy) - no "م" for table
    const formatDateEnglish = (gregorianDate) => {
      if (!gregorianDate) return "";
      try {
        const date = new Date(gregorianDate);
        if (isNaN(date.getTime())) return "";
        const day = date.getDate();
        const month = date.getMonth() + 1;
        const year = date.getFullYear();
        return `${day}-${month}-${year}`;
      } catch (error) {
        return "";
      }
    };

    // Get contract dates (use provided dates if available)
    const contractStartDateGregorian =
      certificate_data?.contract_start_date ||
      employee.contract_start_date_gregorian ||
      null;
    const contractEndDateGregorian =
      certificate_data?.contract_end_date ||
      employee.contract_end_date_gregorian ||
      null;

    // Format dates in English for certificate (dd-mm-yyyy م)
    const contractStartDateFormatted = contractStartDateGregorian
      ? formatDateEnglish(contractStartDateGregorian)
      : null;
    const contractEndDateFormatted = contractEndDateGregorian
      ? formatDateEnglish(contractEndDateGregorian)
      : null;
    
    // Format date as yyyy-mm-dd for specialties certificate table
    const formatDateForSpecialtiesTable = (gregorianDate) => {
      if (!gregorianDate) return "";
      try {
        const date = new Date(gregorianDate);
        if (isNaN(date.getTime())) return "";
        const day = date.getDate();
        const month = date.getMonth() + 1;
        const year = date.getFullYear();
        return `${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
      } catch (error) {
        return "";
      }
    };
    const contractStartDateForSpecialties = contractStartDateGregorian
      ? formatDateForSpecialtiesTable(contractStartDateGregorian)
      : null;

    // Determine ID/Residency label based on nationality
    // Check if nationality is Saudi (سعودي, السعودية, Saudi, etc.)
    const nationalityLower = (nationality || "").toLowerCase().trim();
    const isSaudi =
      nationalityLower === "سعودي" ||
      nationalityLower === "السعودية" ||
      nationalityLower === "saudi" ||
      nationalityLower === "saudi arabia" ||
      nationalityLower.includes("سعودي");
    const idLabel = isSaudi ? "الهوية" : "الإقامة";

    // Determine gender-specific words
    const isFemale = employeeGender === "female";
    const employeeWord = isFemale ? "الموظفة" : "الموظف";
    const mentionedWord = isFemale ? "المذكورة" : "المذكور";
    const hisHerWork = isFemale ? "عملها" : "عمله";
    const hisHerPerformance = isFemale ? "أداؤها" : "أداؤه";
    const madeHimHer = isFemale ? "جعلها" : "جعله";
    const hisHerRequest = isFemale ? "طلبها" : "طلبه";
    
    // Gender-specific words for specialties certificate
    const mentionedBelow = isFemale ? "الموضحة بياناتها" : "الموضح بياناته";
    const worksWord = isFemale ? "تعمل" : "يعمل";
    const hisHerRequestSpecialties = isFemale ? "طلبها" : "طلبه";

    // Load background PNG image (preferred) or PDF
    // Use multiple path resolution strategies for compatibility with different environments
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);

    // Try multiple possible paths (for local dev and Vercel deployment)
    const possibleBasePaths = [
      path.join(__dirname, ".."),
      path.join(process.cwd()),
      path.join(process.cwd(), "express-app"),
    ];

    let backgroundImageBytes = null;
    let backgroundPdfBytes = null;
    let usePngBackground = false;

    // Try to find and load background PNG
    for (const basePath of possibleBasePaths) {
      const backgroundPngPath = path.join(basePath, "files", "bg.png");
      if (fs.existsSync(backgroundPngPath)) {
        try {
          backgroundImageBytes = fs.readFileSync(backgroundPngPath);
          usePngBackground = true;
          console.log(`✓ Background PNG loaded from: ${backgroundPngPath}`);
          break;
        } catch (error) {
          console.error(
            `✗ Error reading PNG from ${backgroundPngPath}:`,
            error.message,
          );
        }
      }
    }

    // Fallback to PDF if PNG not available
    if (!usePngBackground) {
      for (const basePath of possibleBasePaths) {
        const backgroundPdfPath = path.join(basePath, "files", "bg.pdf");
        if (fs.existsSync(backgroundPdfPath)) {
          try {
            backgroundPdfBytes = fs.readFileSync(backgroundPdfPath);
            console.log(`✓ Background PDF loaded from: ${backgroundPdfPath}`);
            break;
          } catch (error) {
            console.error(
              `✗ Error reading PDF from ${backgroundPdfPath}:`,
              error.message,
            );
          }
        }
      }
    }

    // Log warning if assets are missing (but continue - PDF will still be generated)
    if (!backgroundImageBytes && !backgroundPdfBytes) {
      console.warn(
        "⚠ Warning: No background image found. Certificate will be generated without background.",
      );
    }

    // Create certificate content using pdfmake with table layout
    const certificateContent = [];

    // Title - different for each certificate type
    const titleText =
      certificate_type === "salary" ? "خطاب تعريف راتب" :
      certificate_type === "specialties" ? "تعريف هيئة التخصصات" :
      "شهادة خبرة";
    certificateContent.push({
      text: titleText,
      style: "certificateTitle",
      alignment: "center",
      margin: [0, 20, 0, 15],
    });

    // For salary certificate, add recipient and employer info
    if (certificate_type === "salary") {
      const recipientTable = {
        table: {
          widths: ["auto", "*"],
          body: [
            [
              {
                text: "إلى:",
                style: "infoLabel",
                alignment: "right",
                border: [true, true, false, true],
              },
              {
                text: recipient || "",
                style: "infoValue",
                alignment: "right",
                border: [false, true, true, true],
              },
            ],
            [
              {
                text: "جهة العمل:",
                style: "infoLabel",
                alignment: "right",
                border: [true, false, false, true],
              },
              {
                text: employer,
                style: "infoValue",
                alignment: "right",
                border: [false, false, true, true],
              },
            ],
          ],
        },
        layout: {
          paddingLeft: () => 6,
          paddingRight: () => 6,
          paddingTop: () => 6,
          paddingBottom: () => 6,
          hLineWidth: (i, node) =>
            i === 0 || i === node.table.body.length ? 1 : 0.5,
          vLineWidth: (i, node) =>
            i === 0 || i === node.table.widths.length ? 1 : 0.5,
          hLineColor: () => "#000000",
          vLineColor: () => "#000000",
        },
        margin: [40, 0, 40, 15],
      };
      certificateContent.push(recipientTable);

      // Employee details section title
      certificateContent.push({
        text: "تفاصيل الموظف",
        style: "sectionTitle",
        alignment: "right",
        margin: [40, 0, 40, 10],
        bold: true,
      });
    }

    // For specialties certificate, add recipient info
    if (certificate_type === "specialties") {
      const recipientTable = {
        table: {
          widths: ["auto", "*"],
          body: [
            [
              {
                text: "إلى:",
                style: "infoLabel",
                alignment: "right",
                border: [true, true, false, true],
              },
              {
                text: "سعادة مدير / هيئة التخصصات الطبية",
                style: "infoValue",
                alignment: "right",
                border: [false, true, true, true],
              },
            ],
          ],
        },
        layout: {
          paddingLeft: () => 6,
          paddingRight: () => 6,
          paddingTop: () => 6,
          paddingBottom: () => 6,
          hLineWidth: (i, node) =>
            i === 0 || i === node.table.body.length ? 1 : 0.5,
          vLineWidth: (i, node) =>
            i === 0 || i === node.table.widths.length ? 1 : 0.5,
          hLineColor: () => "#000000",
          vLineColor: () => "#000000",
        },
        margin: [40, 0, 40, 15],
      };
      certificateContent.push(recipientTable);
    }

    // Handle profession gender variation for specialties certificate
    let professionWithGender = profession;
    if (certificate_type === "specialties" && profession) {
      // Convert masculine profession to feminine if employee is female
      // Example: "اخصائي نفسي" -> "اخصائية نفسية"
      if (isFemale) {
        // Replace "اخصائي" with "اخصائية"
        professionWithGender = profession.replace(/اخصائي/g, "اخصائية");
        // If profession ends with a masculine form, try to convert to feminine
        // This is a basic conversion - may need refinement based on actual profession names
      }
    }

    // Employee Information Table - Different structure for specialties certificate
    let employeeInfoTable;
    
    if (certificate_type === "specialties") {
      // Specialties certificate uses a 5-column table
      const specialtiesTableBody = [
        // Header row
        [
          {
            text: `رقم ${idLabel}`,
            style: "infoLabel",
            alignment: "right",
            border: [true, true, true, true],
          },
          {
            text: "الاسم",
            style: "infoLabel",
            alignment: "right",
            border: [true, true, true, true],
          },
          {
            text: "المهنة",
            style: "infoLabel",
            alignment: "right",
            border: [true, true, true, true],
          },
          {
            text: "الجنسية",
            style: "infoLabel",
            alignment: "right",
            border: [true, true, true, true],
          },
          {
            text: "تاريخ المباشرة",
            style: "infoLabel",
            alignment: "right",
            border: [true, true, true, true],
          },
        ],
        // Data row
        [
          {
            text: employeeIdNumber || "",
            style: "infoValue",
            alignment: "right",
            border: [true, true, true, true],
          },
          {
            text: employeeFullName || "",
            style: "infoValue",
            alignment: "right",
            border: [true, true, true, true],
          },
          {
            text: professionWithGender || "غير محدد",
            style: "infoValue",
            alignment: "right",
            border: [true, true, true, true],
          },
          {
            text: nationality || "",
            style: "infoValue",
            alignment: "right",
            border: [true, true, true, true],
          },
          {
            text: contractStartDateForSpecialties || "غير محدد",
            style: "infoValue",
            alignment: "right",
            border: [true, true, true, true],
          },
        ],
      ];
      
      employeeInfoTable = {
        table: {
          widths: ["*", "*", "*", "*", "*"],
          body: specialtiesTableBody,
        },
        layout: {
          paddingLeft: () => 6,
          paddingRight: () => 6,
          paddingTop: () => 6,
          paddingBottom: () => 6,
          hLineWidth: (i, node) =>
            i === 0 || i === node.table.body.length ? 1 : 0.5,
          vLineWidth: () => 0.5,
          hLineColor: () => "#000000",
          vLineColor: () => "#000000",
        },
        margin: [40, 0, 40, 15],
      };
    } else {
      // Original 2-column table for experience and salary certificates
      const employeeInfoTableBody = [
      [
        {
          text: certificate_type === "salary" ? "الموظف:" : "الاسم الكامل:",
          style: "infoLabel",
          alignment: "right",
          border: [true, true, false, true],
        },
        {
          text: employeeFullName,
          style: "infoValue",
          alignment: "right",
          border: [false, true, true, true],
        },
      ],
      [
        {
          text: "الجنسية:",
          style: "infoLabel",
          alignment: "right",
          border: [true, false, false, false],
        },
        {
          text: nationality,
          style: "infoValue",
          alignment: "right",
          border: [false, false, true, false],
        },
      ],
      [
        {
          text: `رقم ${idLabel}:`,
          style: "infoLabel",
          alignment: "right",
          border: [true, false, false, false],
        },
        {
          text: employeeIdNumber,
          style: "infoValue",
          alignment: "right",
          border: [false, false, true, false],
        },
      ],
      [
        {
          text: "المسمى الوظيفي:",
          style: "infoLabel",
          alignment: "right",
          border: [true, false, false, false],
        },
        {
          text: jobTitle || "غير محدد",
          style: "infoValue",
          alignment: "right",
          border: [false, false, true, false],
        },
      ],
    ];

    // Add occupation/job title row for salary certificate
    if (certificate_type === "salary") {
      employeeInfoTableBody.push([
        {
          text: "المهنة:",
          style: "infoLabel",
          alignment: "right",
          border: [true, false, false, false],
        },
        {
          text: jobTitle || "غير محدد",
          style: "infoValue",
          alignment: "right",
          border: [false, false, true, false],
        },
      ]);
    }

    // Add working since date for salary certificate, or contract dates for experience
    if (certificate_type === "salary") {
      employeeInfoTableBody.push([
        {
          text: "تاريخ الالتحاق:",
          style: "infoLabel",
          alignment: "right",
          border: [true, false, false, true],
        },
        {
          text: contractStartDateFormatted || "غير محدد",
          style: "infoValue",
          alignment: "right",
          border: [false, false, true, true],
        },
      ]);
    } else {
      // Experience certificate - add both contract dates
      employeeInfoTableBody.push(
        [
          {
            text: "تاريخ بداية العقد:",
            style: "infoLabel",
            alignment: "right",
            border: [true, false, false, false],
          },
          {
            text: contractStartDateFormatted || "غير محدد",
            style: "infoValue",
            alignment: "right",
            border: [false, false, true, false],
          },
        ],
        [
          {
            text: "تاريخ نهاية العقد:",
            style: "infoLabel",
            alignment: "right",
            border: [true, false, false, true],
          },
          {
            text: contractEndDateFormatted || "غير محدد",
            style: "infoValue",
            alignment: "right",
            border: [false, false, true, true],
          },
        ],
      );
    }

      employeeInfoTable = {
        table: {
          widths: ["auto", "*"],
          body: employeeInfoTableBody,
        },
        layout: {
          paddingLeft: (i) => (i === 0 || i === 5 ? 6 : 6),
          paddingRight: (i) => (i === 0 || i === 5 ? 6 : 6),
          paddingTop: (i) => (i === 0 ? 6 : 4),
          paddingBottom: (i) => (i === 5 ? 6 : 4),
          hLineWidth: (i, node) =>
            i === 0 || i === node.table.body.length ? 1 : 0.5,
          vLineWidth: (i, node) =>
            i === 0 || i === node.table.widths.length ? 1 : 0.5,
          hLineColor: () => "#000000",
          vLineColor: () => "#000000",
        },
        margin: [40, 0, 40, 15],
      };
    }

    certificateContent.push(employeeInfoTable);

    // Add salary details section for salary certificate
    if (certificate_type === "salary") {
      certificateContent.push({
        text: "تفاصيل الراتب",
        style: "sectionTitle",
        alignment: "right",
        margin: [40, 15, 40, 10],
        bold: true,
      });

      const salaryTableBody = [];

      // Add basic salary row if provided
      if (basicSalary) {
        salaryTableBody.push([
          {
            text: "الراتب الأساسي:",
            style: "infoLabel",
            alignment: "right",
            border: [true, true, false, false],
          },
          {
            text: `﷼ ${basicSalary}`,
            style: "infoValue",
            alignment: "right",
            border: [false, true, true, false],
          },
        ]);
      }

      // Add housing allowance row if provided
      if (housingAllowance) {
        salaryTableBody.push([
          {
            text: "بدل السكن:",
            style: "infoLabel",
            alignment: "right",
            border: [true, false, false, false],
          },
          {
            text: `﷼ ${housingAllowance}`,
            style: "infoValue",
            alignment: "right",
            border: [false, false, true, false],
          },
        ]);
      }

      // Add transportation allowance row if provided
      if (transportationAllowance) {
        salaryTableBody.push([
          {
            text: "بدل النقل:",
            style: "infoLabel",
            alignment: "right",
            border: [true, false, false, false],
          },
          {
            text: `﷼ ${transportationAllowance}`,
            style: "infoValue",
            alignment: "right",
            border: [false, false, true, false],
          },
        ]);
      }

      // Add other allowances row if provided
      if (otherAllowances) {
        salaryTableBody.push([
          {
            text: "بدلات أخرى:",
            style: "infoLabel",
            alignment: "right",
            border: [true, false, false, false],
          },
          {
            text: `﷼ ${otherAllowances}`,
            style: "infoValue",
            alignment: "right",
            border: [false, false, true, false],
          },
        ]);
      }

      // Add total salary row
      salaryTableBody.push([
        {
          text: "الراتب الإجمالي:",
          style: "infoLabelBold",
          alignment: "right",
          border: [true, false, false, true],
        },
        {
          text: employeeSalary ? `﷼ ${employeeSalary}` : "غير محدد",
          style: "infoValueBold",
          alignment: "right",
          border: [false, false, true, true],
        },
      ]);

      const salaryTable = {
        table: {
          widths: ["auto", "*"],
          body: salaryTableBody,
        },
        layout: {
          paddingLeft: () => 6,
          paddingRight: () => 6,
          paddingTop: (i) => (i === 0 ? 6 : 4),
          paddingBottom: (i, node) =>
            i === node.table.body.length - 1 ? 6 : 4,
          hLineWidth: (i, node) =>
            i === 0 || i === node.table.body.length ? 1 : 0.5,
          vLineWidth: (i, node) =>
            i === 0 || i === node.table.widths.length ? 1 : 0.5,
          hLineColor: () => "#000000",
          vLineColor: () => "#000000",
        },
        margin: [40, 0, 40, 15],
      };

      certificateContent.push(salaryTable);
    }

    // Main certificate text - different for each type
    let certificateTextContent;

    if (certificate_type === "salary") {
      // Salary certificate text - no elaborate description
      certificateTextContent = "";
    } else if (certificate_type === "specialties") {
      // Specialties certificate text with gender variations
      certificateTextContent = `نفيدكم نحن شركة الرعاية المتناهية للتأهيل بان ${mentionedBelow} ادناه ${worksWord} لدينا وما زال على راس العمل وقد اعطي هذا التعريف بناء على ${hisHerRequestSpecialties} لغرض الحصول على تصنيف ${professionWithGender} ولا مانع لدينا من ذلك دون ادنى مسؤولية على الشركة .`;
    } else {
      // Experience certificate text
      const verbShowed = isFemale ? "أظهرت" : "أظهر";
      const verbCharacterized = isFemale ? "اتسمت" : "اتسم";
      const verbWas = isFemale ? "كانت" : "كان";

      certificateTextContent = `تفيد شركة الرعاية المتناهية للتأهيل بأن ${employeeWord} ${mentionedWord} في الجدول أعلاه قد عمل لدى الشركة. وقد ${verbShowed} ${mentionedWord} خلال فترة ${hisHerWork} التزامًا مهنيًا، وتعاونًا مثاليًا، كما ${verbCharacterized} ${hisHerPerformance} بالاحترافية، و${verbWas} مثالاً في حسن السيرة والسلوك، مما ${madeHimHer} محل تقدير إدارة الشركة. وقد أصدرت هذه الشهادة بناءً على ${hisHerRequest}، دون أدنى مسؤولية قانونية أو مدنية على الشركة تجاه أي جهة كانت.`;
    }

    if (certificateTextContent) {
      const certificateText = {
        text: certificateTextContent,
        style: "certificateBody",
        alignment: "right",
        margin: [40, 0, 40, 15],
      };
      certificateContent.push(certificateText);
    }

    // Closing - only for experience certificate
    if (certificate_type === "experience") {
      certificateContent.push({
        text: "مع خالص التحية والتقدير",
        style: "certificateClosing",
        alignment: "center",
        margin: [0, 15, 0, 20],
      });
    }

    // Signature and stamp are now included in the background image
    // Get today's date in both calendars for header
    const today = new Date();
    const todayGregorian = formatDate(today.toISOString().split('T')[0]);
    const todayHijri = convertGregorianToHijri(today.toISOString().split('T')[0]);
    const todayHijriFormatted = todayHijri ? formatHijriToString(todayHijri) : '';
    
    // For specialties certificate, format date as dd-mm-yyyy م
    let dateText;
    let documentNumber;
    if (certificate_type === "specialties") {
      // Get document number from certificate_data or auto-generate
      documentNumber = certificate_data?.document_number || "1";
      // Format date as dd-mm-yyyy م (e.g., "٨-٥ - ٢٠٢٥ م")
      const todayFormattedEnglish = formatDateEnglish(today.toISOString().split('T')[0]);
      dateText = `التاريخ : ${todayFormattedEnglish} م`;
    } else {
      dateText = todayHijriFormatted
        ? `تاريخ اليوم: ${todayHijriFormatted} / ${todayGregorian}`
        : `تاريخ اليوم: ${todayGregorian}`;
    }

    const certificateDocDefinition = {
      pageSize: "A4",
      pageMargins: [40, 50, 40, 120], // Increased top margin to accommodate header
      header: function (currentPage, pageCount, pageSize) {
        if (certificate_type === "specialties") {
          // Special header for specialties certificate with document number and date
          return [
            {
              text: `الرقم : ${documentNumber}`,
              alignment: "right",
              margin: [40, 10, 40, 0],
              fontSize: 10,
              color: "#000000"
            },
            {
              text: dateText,
              alignment: "right",
              margin: [40, 2, 40, 0],
              fontSize: 10,
              color: "#000000"
            },
            {
              text: "سعادة مدير / هيئة التخصصات الطبية",
              alignment: "right",
              margin: [40, 5, 40, 0],
              fontSize: 10,
              color: "#000000"
            },
            {
              text: "السلام عليكم ورحمة الله وبركاته",
              alignment: "right",
              margin: [40, 2, 40, 0],
              fontSize: 10,
              color: "#000000"
            }
          ];
        } else {
          // Standard header for other certificate types
          return {
            text: dateText,
            alignment: "right",
            margin: [40, 10, 40, 0],
            fontSize: 10,
            color: "#000000"
          };
        }
      },
      defaultStyle: {
        font: "Roboto",
        fontSize: 12,
        color: "black",
      },
      styles: {
        certificateTitle: {
          fontSize: 20,
          bold: true,
          alignment: "center",
        },
        certificateBody: {
          fontSize: 11,
          lineHeight: 1.6,
        },
        certificateClosing: {
          fontSize: 12,
        },
        infoLabel: {
          fontSize: 12,
          bold: true,
          color: "#000000",
        },
        infoValue: {
          fontSize: 12,
        },
        infoLabelBold: {
          fontSize: 12,
          bold: true,
          color: "#000000",
        },
        infoValueBold: {
          fontSize: 12,
          bold: true,
          color: "#000000",
        },
        sectionTitle: {
          fontSize: 14,
          bold: true,
          color: "#000000",
        },
      },
      content: certificateContent,
      // Ensure single page
      pageBreakBefore: () => false,
    };

    // Generate PDF with pdfmake
    const certificatePdfDoc = certificatePrinter.createPdfKitDocument(
      certificateDocDefinition,
    );
    const chunks = [];

    certificatePdfDoc.on("data", (chunk) => {
      chunks.push(chunk);
    });

    const certificatePdfBuffer = await new Promise((resolve, reject) => {
      certificatePdfDoc.on("end", () => {
        resolve(Buffer.concat(chunks));
      });
      certificatePdfDoc.on("error", reject);
      certificatePdfDoc.end();
    });

    // Load certificate PDF and merge with background (which includes signature and stamp)
    // IMPORTANT: To put background BEHIND text, we need to:
    // 1. Create a new PDF
    // 2. Draw background first
    // 3. Copy content pages on top

    let finalPdfBytes = certificatePdfBuffer;

    // If we have background, merge it with content
    if (backgroundImageBytes || backgroundPdfBytes) {
      // Load content PDF
      const contentPdf = await PDFDocument.load(certificatePdfBuffer);
      const contentPages = contentPdf.getPages();

      // Create new PDF for final result
      const finalPdf = await PDFDocument.create();

      // Load background (PNG preferred, PDF fallback)
      let embeddedBackgroundImage = null;
      let embeddedBackgroundPage = null;
      let bgPageSize = null;

      if (usePngBackground && backgroundImageBytes) {
        try {
          // Embed PNG image
          embeddedBackgroundImage =
            await finalPdf.embedPng(backgroundImageBytes);
          // A4 size in points (595.28 x 841.89)
          bgPageSize = { width: 595.28, height: 841.89 };
        } catch (error) {
          console.warn("Error embedding background PNG:", error.message);
        }
      } else if (backgroundPdfBytes) {
        try {
          const backgroundPdfDoc = await PDFDocument.load(backgroundPdfBytes);
          if (backgroundPdfDoc.getPageCount() > 0) {
            // Get the first page of background PDF to get its size
            const backgroundPageObj = backgroundPdfDoc.getPage(0);
            bgPageSize = backgroundPageObj.getSize();

            // Embed the background page (will be drawn first, behind content)
            embeddedBackgroundPage = await finalPdf.embedPage(
              backgroundPageObj,
              {
                left: 0,
                bottom: 0,
                right: bgPageSize.width,
                top: bgPageSize.height,
              },
            );
          }
        } catch (error) {
          console.warn("Error loading background PDF:", error.message);
          console.error("Full error:", error);
        }
      }

      // Process each content page
      for (let i = 0; i < contentPages.length; i++) {
        const contentPage = contentPages[i];
        const { width, height } = contentPage.getSize();

        // Add a new page to final PDF
        const newPage = finalPdf.addPage([width, height]);

        // Draw background FIRST (behind content) - PNG or PDF
        if (embeddedBackgroundImage && bgPageSize) {
          try {
            // Draw PNG background
            newPage.drawImage(embeddedBackgroundImage, {
              x: 0,
              y: 0,
              width: width,
              height: height,
            });
          } catch (error) {
            console.warn(
              "Error drawing background PNG on page:",
              error.message,
            );
          }
        } else if (embeddedBackgroundPage && bgPageSize) {
          try {
            // Draw PDF background
            newPage.drawPage(embeddedBackgroundPage, {
              x: 0,
              y: 0,
              width: width,
              height: height,
              xScale: width / bgPageSize.width,
              yScale: height / bgPageSize.height,
            });
          } catch (error) {
            console.warn(
              "Error drawing background PDF on page:",
              error.message,
            );
            console.error("Full error:", error);
          }
        }

        // Embed and draw content page on top of background
        try {
          // Embed the content page
          const embeddedContentPage = await finalPdf.embedPage(contentPage, {
            left: 0,
            bottom: 0,
            right: width,
            top: height,
          });

          // Draw the embedded content page on top of background
          newPage.drawPage(embeddedContentPage, {
            x: 0,
            y: 0,
            width: width,
            height: height,
          });
        } catch (error) {
          console.warn("Error embedding content page:", error.message);
          console.error("Full error:", error);
        }
      }

      // Save final PDF
      finalPdfBytes = await finalPdf.save();
    }

    // Clean filename for Content-Disposition header (remove special characters)
    const cleanFileName = employeeFullName
      .replace(/[^\w\s-]/g, "") // Remove special characters except spaces and hyphens
      .replace(/\s+/g, "_") // Replace spaces with underscores
      .substring(0, 50); // Limit length
    const safeFileName = encodeURIComponent(`شهادة_خبرة_${cleanFileName}.pdf`);

    // Return PDF
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename*=UTF-8''${safeFileName}`,
    );
    res.send(Buffer.from(finalPdfBytes));
  } catch (error) {
    log.error("Error generating certificate", { error: error.message });
    console.error("Certificate generation error:", error);
    if (!res.headersSent) {
      res.status(500).json({
        success: false,
        message: "فشل إنشاء الشهادة",
        error: error.message,
      });
    }
  }
});

export default router;
