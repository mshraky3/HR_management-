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
import sql from "../config/database.js";
import { log } from "../utils/logger.js";
import { clearByPrefix, getCache, setCache } from "../utils/simpleCache.js";
import multer from "multer";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { PDFDocument } from "pdf-lib";
import {
  formatDate,
} from "../utils/dateConverter.js";
import { getScopedBranchFilter, resolveBranchAccessFromScope } from "../utils/policyScope.js";
import { printer as certificatePrinter } from "../utils/pdfFonts.js";
import { handleRouteError } from '../utils/routeErrorHandler.js';

const router = express.Router();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Calculate comprehensive employee statistics
 * Used for statistics reporting and PDF generation
 */
const calculateEmployeeStatistics = (employees) => {
  const stats = {
    overview: {
      total: employees.length,
      male: 0,
      female: 0,
      avgSalary: 0,
      totalSalaryBudget: 0,
      completionRate: 0,
      active: 0,
      pending: 0,
      minSalary: 0,
      maxSalary: 0,
    },
    gender: [],
    salary: {
      min: 0,
      max: 0,
      avg: 0,
      ranges: [],
    },
    jobTitles: [],
    contractTypes: [],
    maritalStatus: [],
    nationalities: [],
    educationalQualifications: [],
    status: [],
    ageGroups: [],
    experienceLevels: [],
    companyExperience: [],
    branches: [],
    idTypes: [],
    salaryByBranch: [],
  };

  if (!employees || employees.length === 0) return stats;

  const genderMap = {};
  const jobTitleMap = {};
  const contractMap = {};
  const maritalMap = {};
  const nationalityMap = {};
  const eduMap = {};
  const statusMap = {};
  const ageGroupMap = {};
  const experienceLevelMap = {};
  const branchMap = {};
  const salaryRanges = { '0-5000': 0, '5000-10000': 0, '10000-20000': 0, '20000+': 0 };
  const salaryByBranchMap = {};
  let totalSalary = 0;
  let salaryCount = 0;
  let completionCount = 0;

  employees.forEach((emp) => {
    // Gender
    const gender = (emp.gender || 'unknown').toLowerCase();
    genderMap[gender] = (genderMap[gender] || 0) + 1;
    if (gender === 'male') stats.overview.male++;
    else if (gender === 'female') stats.overview.female++;

    // Salary calculations (from base_salary + other_allowances)
    const baseSalary = parseFloat(emp.base_salary || 0);
    const allowances = parseFloat(emp.other_allowances || 0);
    const empSalary = baseSalary + allowances;

    if (empSalary > 0) {
      totalSalary += empSalary;
      salaryCount++;

      // Salary ranges (use integer part for bucketing)
      const salary = Math.floor(empSalary);
      if (salary < 5000) salaryRanges['0-5000']++;
      else if (salary < 10000) salaryRanges['5000-10000']++;
      else if (salary < 20000) salaryRanges['10000-20000']++;
      else salaryRanges['20000+']++;

      // Min/Max salary
      if (!stats.salary.min || salary < stats.salary.min) stats.salary.min = salary;
      if (!stats.salary.max || salary > stats.salary.max) stats.salary.max = salary;
    }

    // Job titles
    const jobTitle = emp.job_title || 'بدون مسمى';
    jobTitleMap[jobTitle] = (jobTitleMap[jobTitle] || 0) + 1;

    // Contract types
    const contractType = emp.contract_type || 'بدون';
    contractMap[contractType] = (contractMap[contractType] || 0) + 1;

    // Marital status
    const maritalStatus = emp.marital_status || 'بدون';
    maritalMap[maritalStatus] = (maritalMap[maritalStatus] || 0) + 1;

    // Nationality
    const nationality = emp.nationality || 'بدون';
    nationalityMap[nationality] = (nationalityMap[nationality] || 0) + 1;

    // Educational qualification
    const edu = emp.educational_qualification || 'بدون';
    eduMap[edu] = (eduMap[edu] || 0) + 1;

    // Status
    const empStatus = emp.status || 'pending';
    statusMap[empStatus] = (statusMap[empStatus] || 0) + 1;
    if (empStatus === 'active') stats.overview.active++;
    else if (empStatus === 'pending') stats.overview.pending++;

    // Completion status
    if (emp.data_completion_status === 'complete') completionCount++;

    // Branch distribution
    if (emp.branch_id) {
      branchMap[emp.branch_id] = (branchMap[emp.branch_id] || 0) + 1;

      // Salary by branch
      if (!salaryByBranchMap[emp.branch_id]) {
        salaryByBranchMap[emp.branch_id] = {
          branch_id: emp.branch_id,
          totalSalary: 0,
          salaryCount: 0,
          avgSalary: 0,
        };
      }

      // Calculate salary from base_salary + other_allowances
      const baseSalary = parseFloat(emp.base_salary || 0);
      const allowances = parseFloat(emp.other_allowances || 0);
      const empTotalSalary = baseSalary + allowances;

      if (empTotalSalary > 0) {
        salaryByBranchMap[emp.branch_id].totalSalary += empTotalSalary;
        salaryByBranchMap[emp.branch_id].salaryCount++;
        salaryByBranchMap[emp.branch_id].avgSalary = Math.round(
          salaryByBranchMap[emp.branch_id].totalSalary / salaryByBranchMap[emp.branch_id].salaryCount
        );
      }
    }

    // Age groups
    if (emp.age) {
      let ageGroup = '18-25';
      if (emp.age >= 26 && emp.age <= 35) ageGroup = '26-35';
      else if (emp.age >= 36 && emp.age <= 45) ageGroup = '36-45';
      else if (emp.age >= 46 && emp.age <= 55) ageGroup = '46-55';
      else if (emp.age > 55) ageGroup = '55+';

      ageGroupMap[ageGroup] = (ageGroupMap[ageGroup] || 0) + 1;
    }

    // Experience levels
    const experienceYears = emp.years_of_experience_in_company || 0;
    let experienceLevel = 'junior';
    if (experienceYears >= 1 && experienceYears < 3) experienceLevel = 'junior';
    else if (experienceYears >= 3 && experienceYears < 7) experienceLevel = 'mid-level';
    else if (experienceYears >= 7) experienceLevel = 'senior';

    experienceLevelMap[experienceLevel] = (experienceLevelMap[experienceLevel] || 0) + 1;
  });

  // Calculate averages
  stats.overview.avgSalary = salaryCount > 0 ? Math.round(totalSalary / salaryCount) : 0;
  stats.overview.totalSalaryBudget = totalSalary;
  stats.overview.completionRate = employees.length > 0 ? Math.round((completionCount / employees.length) * 100) : 0;

  // Convert maps to arrays
  stats.gender = Object.entries(genderMap).map(([gender, count]) => ({
    gender,
    count,
    percentage: ((count / employees.length) * 100).toFixed(1),
  }));

  stats.salary.ranges = Object.entries(salaryRanges).map(([range, count]) => ({
    range,
    count,
  }));

  stats.jobTitles = Object.entries(jobTitleMap)
    .map(([job_title, count]) => ({ job_title, count }))
    .sort((a, b) => b.count - a.count);

  stats.contractTypes = Object.entries(contractMap)
    .map(([contract_type, count]) => ({ contract_type, count }))
    .sort((a, b) => b.count - a.count);

  stats.maritalStatus = Object.entries(maritalMap)
    .map(([status, count]) => ({ status, count }))
    .sort((a, b) => b.count - a.count);

  stats.nationalities = Object.entries(nationalityMap)
    .map(([nationality, count]) => ({ nationality, count }))
    .sort((a, b) => b.count - a.count);

  stats.educationalQualifications = Object.entries(eduMap)
    .map(([qualification, count]) => ({ qualification, count }))
    .sort((a, b) => b.count - a.count);

  stats.status = Object.entries(statusMap)
    .map(([status, count]) => ({ status, count }))
    .sort((a, b) => b.count - a.count);

  stats.ageGroups = Object.entries(ageGroupMap)
    .map(([age_group, count]) => ({ age_group, count }))
    .sort((a, b) => {
      const order = ['18-25', '26-35', '36-45', '46-55', '55+'];
      return order.indexOf(a.age_group) - order.indexOf(b.age_group);
    });

  stats.experienceLevels = Object.entries(experienceLevelMap)
    .map(([level, count]) => ({ level, count }))
    .sort((a, b) => {
      const order = ['junior', 'mid-level', 'senior'];
      return order.indexOf(a.level) - order.indexOf(b.level);
    });

  stats.branches = Object.entries(branchMap)
    .map(([branch_id, count]) => ({ branch_id: parseInt(branch_id), count }))
    .sort((a, b) => b.count - a.count);

  stats.salaryByBranch = Object.values(salaryByBranchMap)
    .sort((a, b) => b.totalSalary - a.totalSalary);

  return stats;
};

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
    return handleRouteError(error, req, res, 'فشل جلب الموظفين المكررين');
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
    return handleRouteError(error, req, res, 'فشل دمج الموظفين المكررين');
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

    // Only include documents from active employees in active branches
    const rows = await sql`
      SELECT ed.employee_id, ed.document_type, COUNT(*) as doc_count,
             array_agg(json_build_object(
               'id', ed.id,
               'file_name', ed.file_name,
               'uploaded_at', ed.uploaded_at,
               'is_active', ed.is_active
             )) AS documents
      FROM employee_documents ed
      INNER JOIN employees e ON ed.employee_id = e.id
      LEFT JOIN branches b ON e.branch_id = b.id
      WHERE ed.is_active = true
        AND (e.status IS NULL OR e.status IN ('active', 'pending'))
        AND (b.is_active = true OR b.is_active IS NULL)
      GROUP BY ed.employee_id, ed.document_type
      HAVING COUNT(*) > 1
      ORDER BY ed.employee_id
      LIMIT ${parseInt(limit)} OFFSET ${parseInt(offset)}
    `;

    // Filter out allowed-multiple types
    const data = rows.filter(
      (row) => !docTypesAllowedMultiple.includes(row.document_type),
    );

    return res.json({ success: true, data });
  } catch (error) {
    log.error("Error listing duplicate documents", { error: error.message });
    return handleRouteError(error, req, res, 'فشل جلب المستندات المكررة');
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
        // Verify keepId belongs to this employee and document type
        const [keepDoc] = await trx`
          SELECT id FROM employee_documents
          WHERE id = ${keepId} AND employee_id = ${employeeId} AND document_type = ${documentType}
        `;
        if (!keepDoc) {
          throw Object.assign(new Error('المستند المحدد للاحتفاظ به غير موجود لهذا الموظف'), { statusCode: 400 });
        }

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
      const statusCode = error.statusCode || 500;
      return res.status(statusCode).json({
        success: false,
        message: error.statusCode ? error.message : "فشل دمج المستندات المكررة",
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
      // Only include active employees from active branches
      const rows = await sql`
      SELECT e.id AS employee_id,
             e.first_name, e.second_name, e.third_name, e.fourth_name,
             e.contract_type,
             array_agg(json_build_object('id', d.id, 'file_name', d.file_name, 'uploaded_at', d.uploaded_at)) AS documents
      FROM employees e
      INNER JOIN employee_documents d ON d.employee_id = e.id
      LEFT JOIN branches b ON e.branch_id = b.id
      WHERE e.contract_type = 'ورقي'
        AND d.document_type = ${docType}
        AND d.is_active = true
        AND (e.status IS NULL OR e.status IN ('active', 'pending'))
        AND (b.is_active = true OR b.is_active IS NULL)
      GROUP BY e.id
      ORDER BY e.id
    `;
      return res.json({ success: true, data: rows });
    } catch (error) {
      log.error("Error listing paper contract insurance docs", {
        error: error.message,
      });
      return handleRouteError(error, req, res, 'فشل جلب المستندات غير المطلوبة');
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
      return handleRouteError(error, req, res, 'فشل حذف المستندات');
    }
  },
);

// ---------------------------------------------------------------------------
// Missing required data (contract dates + qualification doc)
// ---------------------------------------------------------------------------
const QUAL_DOC_LEVELS = ["دبلوم", "بكالوريوس", "ماجستير", "دكتوراه"];

router.get("/missing-required-data", requireManager, async (req, res) => {
  try {
    const branchFilter = getScopedBranchFilter(req, { allowMultiple: false });
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
    return handleRouteError(error, req, res, 'فشل جلب البيانات الناقصة');
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

              const uploadedByForDoc = req.user?.existsInDb ? req.user.id : null;
              await trx`
              INSERT INTO employee_documents (
                employee_id, document_type, file_name, file_path, file_size,
                mime_type, file_extension, is_active, uploaded_at, uploaded_by
              )
              VALUES (
                ${employeeId}, 'primary_qualification', ${fileName}, ${filePath}, ${fileSize},
                ${mimeType}, ${extension}, true, CURRENT_TIMESTAMP, ${uploadedByForDoc}
              )
            `;
            }
          }
        }
      });

      return res.json({ success: true, message: "تم حفظ البيانات الناقصة" });
    } catch (error) {
      log.error("Error saving missing required data", { error: error.message });
      return handleRouteError(error, req, res, 'فشل حفظ البيانات');
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
    const branchId = getScopedBranchFilter(req, { allowMultiple: true });

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
    handleRouteError(error, req, res, 'فشل جلب الموظفين');
  }
});

/**
 * GET /api/employees/statistics
 * Get aggregated employee statistics
 * Accessible to main managers (all branches) and branch managers (their branch only)
 */
router.get("/statistics", async (req, res) => {
  try {
    // Build cache key from query params and user context
    const scopedBranch = getScopedBranchFilter(req, { allowMultiple: true });
    const cacheKeyParts = ['stats', req.user.role, req.scope?.branch?.primaryId || 'all'];
    if (scopedBranch !== null && scopedBranch !== undefined) {
      cacheKeyParts.push(Array.isArray(scopedBranch) ? [...scopedBranch].sort().join(',') : String(scopedBranch));
    }
    const cacheKey = cacheKeyParts.join(':');

    // Check cache first (1 minute TTL for statistics - they don't change frequently)
    const cachedStats = getCache(cacheKey);
    if (cachedStats) {
      return res.json(cachedStats);
    }

    // Build branch filter for SQL using scope
    const branchFilter = scopedBranch === null || scopedBranch === undefined
      ? sql`AND e.branch_id IN (SELECT id FROM branches WHERE is_active = true)`
      : Array.isArray(scopedBranch)
        ? sql`AND e.branch_id = ANY(${sql(scopedBranch)})`
        : sql`AND e.branch_id = ${scopedBranch}`;

    // Helper: Total salary = computed total_salary column (sum of all allowances)
    // The total_salary column is automatically computed by the database

    // Get overview statistics (using computed total_salary column)
    const overviewQuery = sql`
      SELECT
        COUNT(*)::int as total,
        COUNT(*) FILTER (WHERE e.gender = 'male')::int as male,
        COUNT(*) FILTER (WHERE e.gender = 'female')::int as female,
        COUNT(*) FILTER (WHERE e.status = 'active')::int as active_count,
        COUNT(*) FILTER (WHERE e.status = 'pending')::int as pending_count,
        AVG(COALESCE(e.total_salary, 0))::numeric(10,2) as avg_salary,
        SUM(COALESCE(e.total_salary, 0))::numeric(10,2) as total_salary_budget,
        COUNT(*) FILTER (WHERE e.data_completion_status = 'complete')::int as complete_count,
        MIN(COALESCE(e.total_salary, 0))::numeric(10,2) as min_salary,
        MAX(COALESCE(e.total_salary, 0))::numeric(10,2) as max_salary
      FROM employees e
      WHERE (e.status IN ('active', 'pending') OR e.status IS NULL)
      ${branchFilter}
    `;

    // Gender distribution
    const genderQuery = sql`
      SELECT
        e.gender,
        COUNT(*)::int as count
      FROM employees e
      WHERE (e.status IN ('active', 'pending') OR e.status IS NULL)
      ${branchFilter}
      AND e.gender IS NOT NULL
      GROUP BY e.gender
    `;

    // Salary by gender (using computed total_salary column)
    const salaryByGenderQuery = sql`
      SELECT
        e.gender,
        AVG(COALESCE(e.total_salary, 0))::numeric(10,2) as average,
        COUNT(*)::int as count
      FROM employees e
      WHERE (e.status IN ('active', 'pending') OR e.status IS NULL)
      ${branchFilter}
      AND COALESCE(e.total_salary, 0) > 0 AND e.gender IS NOT NULL
      GROUP BY e.gender
    `;

    // Salary ranges (using computed total_salary column)
    const salaryRangesQuery = sql`
      SELECT
        CASE
          WHEN COALESCE(e.total_salary, 0) < 5000 THEN '0-5000'
          WHEN COALESCE(e.total_salary, 0) < 10000 THEN '5000-10000'
          WHEN COALESCE(e.total_salary, 0) < 15000 THEN '10000-15000'
          WHEN COALESCE(e.total_salary, 0) < 20000 THEN '15000-20000'
          ELSE '20000+'
        END as range,
        COUNT(*)::int as count
      FROM employees e
      WHERE (e.status IN ('active', 'pending') OR e.status IS NULL)
      ${branchFilter}
      AND COALESCE(e.total_salary, 0) > 0
      GROUP BY range
      ORDER BY MIN(COALESCE(e.total_salary, 0))
    `;

    // Salary by job title (using computed total_salary column)
    const salaryByJobTitleQuery = sql`
      SELECT
        COALESCE(e.job_title, e.occupation, 'غير محدد') as job_title,
        AVG(COALESCE(e.total_salary, 0))::numeric(10,2) as average,
        COUNT(*)::int as count
      FROM employees e
      WHERE (e.status IN ('active', 'pending') OR e.status IS NULL)
      ${branchFilter}
      AND COALESCE(e.total_salary, 0) > 0
      GROUP BY COALESCE(e.job_title, e.occupation, 'غير محدد')
      HAVING COUNT(*) > 0
      ORDER BY average DESC
      LIMIT 20
    `;

    // Top paid employees (using computed total_salary column)
    const topPaidQuery = sql`
      SELECT
        e.employee_id_number as employee_id,
        CONCAT(e.first_name, ' ', e.second_name, ' ', e.third_name, ' ', e.fourth_name) as name,
        COALESCE(e.total_salary, 0)::numeric(10,2) as salary
      FROM employees e
      WHERE (e.status IN ('active', 'pending') OR e.status IS NULL)
      ${branchFilter}
      AND COALESCE(e.total_salary, 0) > 0
      ORDER BY salary DESC
      LIMIT 10
    `;

    // Job titles distribution (no limit to show all)
    // Handle both NULL and empty strings by converting empty strings to NULL first
    const jobTitlesQuery = sql`
      SELECT
        COALESCE(NULLIF(e.job_title, ''), NULLIF(e.occupation, ''), 'غير محدد') as job_title,
        COUNT(*)::int as count
      FROM employees e
      WHERE (e.status IN ('active', 'pending') OR e.status IS NULL)
      ${branchFilter}
      GROUP BY COALESCE(NULLIF(e.job_title, ''), NULLIF(e.occupation, ''), 'غير محدد')
      ORDER BY count DESC
    `;

    // Contract types
    const contractTypesQuery = sql`
      SELECT
        COALESCE(e.contract_type, 'غير محدد') as contract_type,
        COUNT(*)::int as count
      FROM employees e
      WHERE (e.status IN ('active', 'pending') OR e.status IS NULL)
      ${branchFilter}
      GROUP BY COALESCE(e.contract_type, 'غير محدد')
      ORDER BY count DESC
    `;

    // Marital status
    const maritalStatusQuery = sql`
      SELECT
        COALESCE(e.marital_status, 'غير محدد') as status,
        COUNT(*)::int as count
      FROM employees e
      WHERE (e.status IN ('active', 'pending') OR e.status IS NULL)
      ${branchFilter}
      GROUP BY COALESCE(e.marital_status, 'غير محدد')
      ORDER BY count DESC
    `;

    // Nationalities (top 15)
    const nationalitiesQuery = sql`
      SELECT
        e.nationality,
        COUNT(*)::int as count
      FROM employees e
      WHERE (e.status IN ('active', 'pending') OR e.status IS NULL)
      ${branchFilter}
      AND e.nationality IS NOT NULL
      GROUP BY e.nationality
      ORDER BY count DESC
      LIMIT 15
    `;

    // Nationality breakdown by gender (top 10)
    const nationalityGenderQuery = sql`
      SELECT
        e.nationality,
        COUNT(*) FILTER (WHERE e.gender = 'male')::int as male_count,
        COUNT(*) FILTER (WHERE e.gender = 'female')::int as female_count
      FROM employees e
      WHERE (e.status IN ('active', 'pending') OR e.status IS NULL)
      ${branchFilter}
      AND e.nationality IS NOT NULL
      GROUP BY e.nationality
      ORDER BY (COUNT(*)) DESC
      LIMIT 10
    `;

    // Educational qualifications
    const qualificationsQuery = sql`
      SELECT
        COALESCE(e.educational_qualification, 'غير محدد') as qualification,
        COUNT(*)::int as count
      FROM employees e
      WHERE (e.status IN ('active', 'pending') OR e.status IS NULL)
      ${branchFilter}
      GROUP BY COALESCE(e.educational_qualification, 'غير محدد')
      ORDER BY count DESC
    `;

    // Status distribution
    const statusQuery = sql`
      SELECT
        COALESCE(e.status, 'active') as status,
        COUNT(*)::int as count
      FROM employees e
      WHERE (e.status IN ('active', 'pending') OR e.status IS NULL)
      ${branchFilter}
      GROUP BY COALESCE(e.status, 'active')
      ORDER BY count DESC
    `;

    // Branch distribution (only if main manager)
    let branchDistributionQuery = null;
    if (scopedBranch === null || scopedBranch === undefined) {
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
          WHEN EXTRACT(YEAR FROM AGE(e.date_of_birth_gregorian)) < 25 THEN 'أقل من 25'
          WHEN EXTRACT(YEAR FROM AGE(e.date_of_birth_gregorian)) < 30 THEN '25-30'
          WHEN EXTRACT(YEAR FROM AGE(e.date_of_birth_gregorian)) < 35 THEN '30-35'
          WHEN EXTRACT(YEAR FROM AGE(e.date_of_birth_gregorian)) < 40 THEN '35-40'
          WHEN EXTRACT(YEAR FROM AGE(e.date_of_birth_gregorian)) < 45 THEN '40-45'
          WHEN EXTRACT(YEAR FROM AGE(e.date_of_birth_gregorian)) < 50 THEN '45-50'
          WHEN EXTRACT(YEAR FROM AGE(e.date_of_birth_gregorian)) < 55 THEN '50-55'
          ELSE '55+'
        END as age_group,
        COUNT(*)::int as count
      FROM employees e
      WHERE (e.status IN ('active', 'pending') OR e.status IS NULL)
      ${branchFilter}
      AND e.date_of_birth_gregorian IS NOT NULL
      GROUP BY age_group
      ORDER BY MIN(EXTRACT(YEAR FROM AGE(e.date_of_birth_gregorian)))
    `;

    // Experience levels
    const experienceQuery = sql`
      SELECT
        CASE
          WHEN e.years_of_experience_in_same_institution IS NULL OR e.years_of_experience_in_same_institution < 2 THEN '0-2'
          WHEN e.years_of_experience_in_same_institution < 5 THEN '2-5'
          WHEN e.years_of_experience_in_same_institution < 10 THEN '5-10'
          WHEN e.years_of_experience_in_same_institution < 15 THEN '10-15'
          ELSE '15+'
        END as experience_range,
        COUNT(*)::int as count
      FROM employees e
      WHERE (e.status IN ('active', 'pending') OR e.status IS NULL)
      ${branchFilter}
      GROUP BY experience_range
      ORDER BY MIN(COALESCE(e.years_of_experience_in_same_institution, 0))
    `;

    // ID Type distribution (citizen vs resident)
    const idTypeQuery = sql`
      SELECT
        COALESCE(e.id_type, 'غير محدد') as id_type,
        COUNT(*)::int as count
      FROM employees e
      WHERE (e.status IN ('active', 'pending') OR e.status IS NULL)
      ${branchFilter}
      GROUP BY COALESCE(e.id_type, 'غير محدد')
      ORDER BY count DESC
    `;

    // Experience in company (years_of_experience_in_company)
    const companyExperienceQuery = sql`
      SELECT
        CASE
          WHEN e.years_of_experience_in_company IS NULL OR e.years_of_experience_in_company < 1 THEN 'أقل من سنة'
          WHEN e.years_of_experience_in_company < 2 THEN '1-2'
          WHEN e.years_of_experience_in_company < 3 THEN '2-3'
          WHEN e.years_of_experience_in_company < 5 THEN '3-5'
          WHEN e.years_of_experience_in_company < 10 THEN '5-10'
          ELSE '10+'
        END as experience_range,
        COUNT(*)::int as count
      FROM employees e
      WHERE (e.status IN ('active', 'pending') OR e.status IS NULL)
      ${branchFilter}
      GROUP BY experience_range
      ORDER BY MIN(COALESCE(e.years_of_experience_in_company, 0))
    `;

    // Salary by branch (only if main manager) - using computed total_salary column
    let salaryByBranchQuery = null;
    if (scopedBranch === null || scopedBranch === undefined) {
      salaryByBranchQuery = sql`
        SELECT
          b.branch_name,
          b.id as branch_id,
          AVG(COALESCE(e.total_salary, 0))::numeric(10,2) as average_salary,
          COUNT(e.id)::int as count
        FROM branches b
        LEFT JOIN employees e ON e.branch_id = b.id
          AND (e.status IN ('active', 'pending') OR e.status IS NULL)
          AND COALESCE(e.total_salary, 0) > 0
        WHERE b.is_active = true
        GROUP BY b.id, b.branch_name
        HAVING COUNT(e.id) > 0
        ORDER BY average_salary DESC
      `;

      // Median salary by branch (using computed total_salary column)
      var salaryMedianByBranchQuery = sql`
        SELECT
          b.branch_name,
          b.id as branch_id,
          PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY COALESCE(e.total_salary, 0))::numeric(10,2) as median_salary,
          COUNT(e.id)::int as count
        FROM branches b
        LEFT JOIN employees e ON e.branch_id = b.id
          AND (e.status IN ('active', 'pending') OR e.status IS NULL)
          AND COALESCE(e.total_salary, 0) > 0
        WHERE b.is_active = true
        GROUP BY b.id, b.branch_name
        HAVING COUNT(e.id) > 0
        ORDER BY median_salary DESC
      `;
    }

    // Religious distribution
    const religionsQuery = sql`
      SELECT
        COALESCE(e.religion, 'غير محدد') as religion,
        COUNT(*)::int as count
      FROM employees e
      WHERE (e.status IN ('active', 'pending') OR e.status IS NULL)
      ${branchFilter}
      GROUP BY COALESCE(e.religion, 'غير محدد')
      ORDER BY count DESC
    `;

    // Salary by contract type (using computed total_salary column)
    const salaryByContractTypeQuery = sql`
      SELECT
        COALESCE(e.contract_type, 'غير محدد') as contract_type,
        AVG(COALESCE(e.total_salary, 0))::numeric(10,2) as average_salary,
        COUNT(*)::int as count
      FROM employees e
      WHERE (e.status IN ('active', 'pending') OR e.status IS NULL)
      ${branchFilter}
      AND COALESCE(e.total_salary, 0) > 0
      GROUP BY COALESCE(e.contract_type, 'غير محدد')
      ORDER BY average_salary DESC
    `;

    // Gender distribution by branch (only if main manager)
    let genderByBranchQuery = null;
    if (scopedBranch === null || scopedBranch === undefined) {
      genderByBranchQuery = sql`
        SELECT
          b.branch_name,
          b.id as branch_id,
          COUNT(*) FILTER (WHERE e.gender = 'male')::int as male_count,
          COUNT(*) FILTER (WHERE e.gender = 'female')::int as female_count
        FROM branches b
        LEFT JOIN employees e ON e.branch_id = b.id
          AND (e.status IN ('active', 'pending') OR e.status IS NULL)
        WHERE b.is_active = true
        GROUP BY b.id, b.branch_name
        HAVING COUNT(e.id) > 0
        ORDER BY b.branch_name
      `;
    }

    // Top 10 highest paid employees with job title and branch (only if main manager) - using computed total_salary column
    let topPaidEmployeesQuery = null;
    if (scopedBranch === null || scopedBranch === undefined) {
      topPaidEmployeesQuery = sql`
        SELECT
          e.employee_id_number as employee_id,
          CONCAT(e.first_name, ' ', e.second_name, ' ', e.third_name, ' ', e.fourth_name) as name,
          COALESCE(e.job_title, e.occupation) as job_title,
          b.branch_name,
          COALESCE(e.total_salary, 0)::numeric(10,2) as salary
        FROM employees e
        LEFT JOIN branches b ON e.branch_id = b.id
        WHERE (e.status IN ('active', 'pending') OR e.status IS NULL)
        AND b.is_active = true
        AND COALESCE(e.total_salary, 0) > 0
        ORDER BY salary DESC
        LIMIT 10
      `;
    }

    // Salary by educational qualification (using computed total_salary column)
    const salaryByQualificationQuery = sql`
      SELECT
        COALESCE(e.educational_qualification, 'غير محدد') as qualification,
        AVG(COALESCE(e.total_salary, 0))::numeric(10,2) as average_salary,
        COUNT(*)::int as count
      FROM employees e
      WHERE (e.status IN ('active', 'pending') OR e.status IS NULL)
      ${branchFilter}
      AND COALESCE(e.total_salary, 0) > 0
      GROUP BY COALESCE(e.educational_qualification, 'غير محدد')
      ORDER BY average_salary DESC
    `;

    // Average salary by nationality (top 10) - using computed total_salary column
    const salaryByNationalityQuery = sql`
      SELECT
        e.nationality,
        AVG(COALESCE(e.total_salary, 0))::numeric(10,2) as average_salary,
        COUNT(*)::int as count
      FROM employees e
      WHERE (e.status IN ('active', 'pending') OR e.status IS NULL)
      ${branchFilter}
      AND COALESCE(e.total_salary, 0) > 0
      AND e.nationality IS NOT NULL
      GROUP BY e.nationality
      ORDER BY count DESC
      LIMIT 10
    `;

    // Total salary by nationality (top 10) - using computed total_salary column
    const totalSalaryByNationalityQuery = sql`
      SELECT
        e.nationality,
        SUM(COALESCE(e.total_salary, 0))::numeric(10,2) as total_salary,
        COUNT(*)::int as count
      FROM employees e
      WHERE (e.status IN ('active', 'pending') OR e.status IS NULL)
      ${branchFilter}
      AND COALESCE(e.total_salary, 0) > 0
      AND e.nationality IS NOT NULL
      GROUP BY e.nationality
      ORDER BY total_salary DESC
      LIMIT 10
    `;

    // Salary breakdown by allowances (average) - keep individual allowance breakdown
    const salaryBreakdownQuery = sql`
      SELECT
        AVG(e.base_salary)::numeric(10,2) as avg_base_salary,
        AVG(e.housing_allowance)::numeric(10,2) as avg_housing_allowance,
        AVG(e.transportation_allowance)::numeric(10,2) as avg_transportation_allowance,
        AVG(e.end_of_service_allowance)::numeric(10,2) as avg_end_of_service_allowance,
        AVG(e.annual_leave_allowance)::numeric(10,2) as avg_annual_leave_allowance,
        AVG(e.other_allowances)::numeric(10,2) as avg_other_allowances,
        AVG(e.total_salary)::numeric(10,2) as avg_total_salary,
        COUNT(*) FILTER (WHERE e.base_salary IS NOT NULL AND e.base_salary > 0)::int as base_salary_count,
        COUNT(*) FILTER (WHERE e.housing_allowance IS NOT NULL AND e.housing_allowance > 0)::int as housing_allowance_count,
        COUNT(*) FILTER (WHERE e.transportation_allowance IS NOT NULL AND e.transportation_allowance > 0)::int as transportation_allowance_count,
        COUNT(*) FILTER (WHERE e.end_of_service_allowance IS NOT NULL AND e.end_of_service_allowance > 0)::int as end_of_service_allowance_count,
        COUNT(*) FILTER (WHERE e.annual_leave_allowance IS NOT NULL AND e.annual_leave_allowance > 0)::int as annual_leave_allowance_count,
        COUNT(*) FILTER (WHERE e.other_allowances IS NOT NULL AND e.other_allowances > 0)::int as other_allowances_count
      FROM employees e
      WHERE (e.status IN ('active', 'pending') OR e.status IS NULL)
      ${branchFilter}
    `;

    // Total salary budget by gender (using computed total_salary column)
    const totalSalaryByGenderQuery = sql`
      SELECT
        e.gender,
        SUM(COALESCE(e.total_salary, 0))::numeric(10,2) as total_salary,
        COUNT(*)::int as count
      FROM employees e
      WHERE (e.status IN ('active', 'pending') OR e.status IS NULL)
      ${branchFilter}
      AND COALESCE(e.total_salary, 0) > 0
      AND e.gender IS NOT NULL
      GROUP BY e.gender
    `;

    // Contract expiration timeline (next 3, 6, 12 months and expired)
    const contractExpirationQuery = sql`
      SELECT
        CASE
          WHEN e.contract_end_date_gregorian < CURRENT_DATE THEN 'منتهي'
          WHEN e.contract_end_date_gregorian <= CURRENT_DATE + INTERVAL '3 months' THEN 'خلال 3 أشهر'
          WHEN e.contract_end_date_gregorian <= CURRENT_DATE + INTERVAL '6 months' THEN 'خلال 6 أشهر'
          WHEN e.contract_end_date_gregorian <= CURRENT_DATE + INTERVAL '12 months' THEN 'خلال سنة'
          ELSE 'أكثر من سنة'
        END as expiration_period,
        COUNT(*)::int as count,
        MIN(CASE
          WHEN e.contract_end_date_gregorian < CURRENT_DATE THEN 1
          WHEN e.contract_end_date_gregorian <= CURRENT_DATE + INTERVAL '3 months' THEN 2
          WHEN e.contract_end_date_gregorian <= CURRENT_DATE + INTERVAL '6 months' THEN 3
          WHEN e.contract_end_date_gregorian <= CURRENT_DATE + INTERVAL '12 months' THEN 4
          ELSE 5
        END) as sort_order
      FROM employees e
      WHERE (e.status IN ('active', 'pending') OR e.status IS NULL)
      ${branchFilter}
      AND e.contract_end_date_gregorian IS NOT NULL
      GROUP BY 
        CASE
          WHEN e.contract_end_date_gregorian < CURRENT_DATE THEN 'منتهي'
          WHEN e.contract_end_date_gregorian <= CURRENT_DATE + INTERVAL '3 months' THEN 'خلال 3 أشهر'
          WHEN e.contract_end_date_gregorian <= CURRENT_DATE + INTERVAL '6 months' THEN 'خلال 6 أشهر'
          WHEN e.contract_end_date_gregorian <= CURRENT_DATE + INTERVAL '12 months' THEN 'خلال سنة'
          ELSE 'أكثر من سنة'
        END
      ORDER BY sort_order
    `;

    // Data completion by field (which fields are most incomplete) - using computed total_salary column
    const incompleteDataQuery = sql`
      SELECT
        COUNT(*) FILTER (WHERE e.phone_number IS NULL OR e.phone_number = '')::int as missing_phone,
        COUNT(*) FILTER (WHERE e.email IS NULL OR e.email = '')::int as missing_email,
        COUNT(*) FILTER (WHERE e.bank_iban IS NULL OR e.bank_iban = '')::int as missing_iban,
        COUNT(*) FILTER (WHERE e.educational_qualification IS NULL OR e.educational_qualification = '')::int as missing_qualification,
        COUNT(*) FILTER (WHERE e.specialization IS NULL OR e.specialization = '')::int as missing_specialization,
        COUNT(*) FILTER (WHERE e.national_address IS NULL OR e.national_address = '')::int as missing_address,
        COUNT(*) FILTER (WHERE e.date_of_birth_gregorian IS NULL)::int as missing_birthdate,
        COUNT(*) FILTER (WHERE COALESCE(e.total_salary, 0) = 0)::int as missing_salary,
        COUNT(*) FILTER (WHERE e.contract_start_date_gregorian IS NULL)::int as missing_contract_start,
        COUNT(*) FILTER (WHERE e.contract_end_date_gregorian IS NULL)::int as missing_contract_end
      FROM employees e
      WHERE (e.status IN ('active', 'pending') OR e.status IS NULL)
      ${branchFilter}
    `;

    // Salary percentiles (25th, 50th/median, 75th) - using computed total_salary column
    const salaryPercentilesQuery = sql`
      SELECT
        PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY COALESCE(e.total_salary, 0))::numeric(10,2) as p25,
        PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY COALESCE(e.total_salary, 0))::numeric(10,2) as p50,
        PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY COALESCE(e.total_salary, 0))::numeric(10,2) as p75
      FROM employees e
      WHERE (e.status IN ('active', 'pending') OR e.status IS NULL)
      ${branchFilter}
      AND COALESCE(e.total_salary, 0) > 0
    `;

    // Gender distribution in top 5 job titles
    const genderByJobTitleQuery = sql`
      WITH top_jobs AS (
        SELECT COALESCE(e2.job_title, e2.occupation, 'غير محدد') as job_title
        FROM employees e2
        WHERE (e2.status IN ('active', 'pending') OR e2.status IS NULL)
        AND e2.branch_id IN (SELECT id FROM branches WHERE is_active = true)
        GROUP BY COALESCE(e2.job_title, e2.occupation, 'غير محدد')
        ORDER BY COUNT(*) DESC
        LIMIT 5
      )
      SELECT
        COALESCE(e.job_title, e.occupation, 'غير محدد') as job_title,
        COUNT(*) FILTER (WHERE e.gender = 'male')::int as male_count,
        COUNT(*) FILTER (WHERE e.gender = 'female')::int as female_count
      FROM employees e
      INNER JOIN top_jobs tj ON COALESCE(e.job_title, e.occupation, 'غير محدد') = tj.job_title
      WHERE (e.status IN ('active', 'pending') OR e.status IS NULL)
      ${branchFilter}
      GROUP BY COALESCE(e.job_title, e.occupation, 'غير محدد')
      ORDER BY (COUNT(*)) DESC
    `;

    // ID expiration warnings (IDs expiring in next 6 months)
    const idExpirationQuery = sql`
      SELECT
        CASE
          WHEN e.id_expiry_date_gregorian < CURRENT_DATE THEN 'منتهية'
          WHEN e.id_expiry_date_gregorian <= CURRENT_DATE + INTERVAL '1 month' THEN 'خلال شهر'
          WHEN e.id_expiry_date_gregorian <= CURRENT_DATE + INTERVAL '3 months' THEN 'خلال 3 أشهر'
          WHEN e.id_expiry_date_gregorian <= CURRENT_DATE + INTERVAL '6 months' THEN 'خلال 6 أشهر'
          ELSE 'أكثر من 6 أشهر'
        END as expiration_period,
        COUNT(*)::int as count,
        MIN(CASE
          WHEN e.id_expiry_date_gregorian < CURRENT_DATE THEN 1
          WHEN e.id_expiry_date_gregorian <= CURRENT_DATE + INTERVAL '1 month' THEN 2
          WHEN e.id_expiry_date_gregorian <= CURRENT_DATE + INTERVAL '3 months' THEN 3
          WHEN e.id_expiry_date_gregorian <= CURRENT_DATE + INTERVAL '6 months' THEN 4
          ELSE 5
        END) as sort_order
      FROM employees e
      WHERE (e.status IN ('active', 'pending') OR e.status IS NULL)
      ${branchFilter}
      AND e.id_expiry_date_gregorian IS NOT NULL
      GROUP BY 
        CASE
          WHEN e.id_expiry_date_gregorian < CURRENT_DATE THEN 'منتهية'
          WHEN e.id_expiry_date_gregorian <= CURRENT_DATE + INTERVAL '1 month' THEN 'خلال شهر'
          WHEN e.id_expiry_date_gregorian <= CURRENT_DATE + INTERVAL '3 months' THEN 'خلال 3 أشهر'
          WHEN e.id_expiry_date_gregorian <= CURRENT_DATE + INTERVAL '6 months' THEN 'خلال 6 أشهر'
          ELSE 'أكثر من 6 أشهر'
        END
      ORDER BY sort_order
    `;

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
      nationalityGenderResult,
      qualificationsResult,
      statusResult,
      ageGroupsResult,
      experienceResult,
      branchDistributionResult,
      idTypeResult,
      companyExperienceResult,
      salaryByBranchResult,
      salaryMedianByBranchResult,
      religionsResult,
      salaryByContractTypeResult,
      genderByBranchResult,
      topPaidEmployeesResult,
      salaryByQualificationResult,
      salaryByNationalityResult,
      totalSalaryByNationalityResult,
      salaryBreakdownResult,
      totalSalaryByGenderResult,
      contractExpirationResult,
      incompleteDataResult,
      salaryPercentilesResult,
      genderByJobTitleResult,
      idExpirationResult,
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
      nationalityGenderQuery,
      qualificationsQuery,
      statusQuery,
      ageGroupsQuery,
      experienceQuery,
      branchDistributionQuery || Promise.resolve([]),
      idTypeQuery,
      companyExperienceQuery,
      salaryByBranchQuery || Promise.resolve([]),
      salaryMedianByBranchQuery || Promise.resolve([]),
      religionsQuery,
      salaryByContractTypeQuery,
      genderByBranchQuery || Promise.resolve([]),
      topPaidEmployeesQuery || Promise.resolve([]),
      salaryByQualificationQuery,
      salaryByNationalityQuery,
      totalSalaryByNationalityQuery,
      salaryBreakdownQuery,
      totalSalaryByGenderQuery,
      contractExpirationQuery,
      incompleteDataQuery,
      salaryPercentilesQuery,
      genderByJobTitleQuery,
      idExpirationQuery,
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

    const response = {
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
        nationalityGender: (nationalityGenderResult || []).map((item) => ({
          nationality: item.nationality,
          male_count: parseInt(item.male_count || 0),
          female_count: parseInt(item.female_count || 0),
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
        religions: (religionsResult || []).map((item) => ({
          religion: item.religion,
          count: parseInt(item.count || 0),
        })),
        salaryByContractType: (salaryByContractTypeResult || []).map((item) => ({
          contract_type: item.contract_type,
          average_salary: parseFloat(item.average_salary || 0),
          count: parseInt(item.count || 0),
        })),
        salaryByQualification: (salaryByQualificationResult || []).map((item) => ({
          qualification: item.qualification,
          average_salary: parseFloat(item.average_salary || 0),
          count: parseInt(item.count || 0),
        })),
        salaryByNationality: (salaryByNationalityResult || []).map((item) => ({
          nationality: item.nationality,
          average_salary: parseFloat(item.average_salary || 0),
          count: parseInt(item.count || 0),
        })),
        totalSalaryByNationality: (totalSalaryByNationalityResult || []).map((item) => ({
          nationality: item.nationality,
          total_salary: parseFloat(item.total_salary || 0),
          count: parseInt(item.count || 0),
        })),
        salaryBreakdown: salaryBreakdownResult && salaryBreakdownResult[0] ? {
          avg_base_salary: parseFloat(salaryBreakdownResult[0].avg_base_salary || 0),
          avg_housing_allowance: parseFloat(salaryBreakdownResult[0].avg_housing_allowance || 0),
          avg_transportation_allowance: parseFloat(salaryBreakdownResult[0].avg_transportation_allowance || 0),
          avg_other_allowances: parseFloat(salaryBreakdownResult[0].avg_other_allowances || 0),
          base_salary_count: parseInt(salaryBreakdownResult[0].base_salary_count || 0),
          housing_allowance_count: parseInt(salaryBreakdownResult[0].housing_allowance_count || 0),
          transportation_allowance_count: parseInt(salaryBreakdownResult[0].transportation_allowance_count || 0),
          other_allowances_count: parseInt(salaryBreakdownResult[0].other_allowances_count || 0),
        } : null,
        totalSalaryByGender: (totalSalaryByGenderResult || []).map((item) => ({
          gender: item.gender,
          total_salary: parseFloat(item.total_salary || 0),
          count: parseInt(item.count || 0),
        })),
        contractExpiration: (contractExpirationResult || []).map((item) => ({
          period: item.expiration_period,
          count: parseInt(item.count || 0),
        })),
        incompleteData: incompleteDataResult && incompleteDataResult[0] ? {
          missing_phone: parseInt(incompleteDataResult[0].missing_phone || 0),
          missing_email: parseInt(incompleteDataResult[0].missing_email || 0),
          missing_iban: parseInt(incompleteDataResult[0].missing_iban || 0),
          missing_qualification: parseInt(incompleteDataResult[0].missing_qualification || 0),
          missing_specialization: parseInt(incompleteDataResult[0].missing_specialization || 0),
          missing_address: parseInt(incompleteDataResult[0].missing_address || 0),
          missing_birthdate: parseInt(incompleteDataResult[0].missing_birthdate || 0),
          missing_salary: parseInt(incompleteDataResult[0].missing_salary || 0),
          missing_contract_start: parseInt(incompleteDataResult[0].missing_contract_start || 0),
          missing_contract_end: parseInt(incompleteDataResult[0].missing_contract_end || 0),
        } : null,
        salaryPercentiles: salaryPercentilesResult && salaryPercentilesResult[0] ? {
          p25: parseFloat(salaryPercentilesResult[0].p25 || 0),
          p50: parseFloat(salaryPercentilesResult[0].p50 || 0),
          p75: parseFloat(salaryPercentilesResult[0].p75 || 0),
        } : null,
        genderByJobTitle: (genderByJobTitleResult || []).map((item) => ({
          job_title: item.job_title,
          male_count: parseInt(item.male_count || 0),
          female_count: parseInt(item.female_count || 0),
        })),
        idExpiration: (idExpirationResult || []).map((item) => ({
          period: item.expiration_period,
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
        ...(salaryMedianByBranchResult && salaryMedianByBranchResult.length > 0
          ? {
            salaryMedianByBranch: (salaryMedianByBranchResult || []).map((item) => ({
              branch_name: item.branch_name,
              branch_id: parseInt(item.branch_id),
              median_salary: parseFloat(item.median_salary || 0),
              count: parseInt(item.count || 0),
            })),
          }
          : {}),
        ...(genderByBranchResult && genderByBranchResult.length > 0
          ? {
            genderByBranch: (genderByBranchResult || []).map((item) => ({
              branch_name: item.branch_name,
              branch_id: parseInt(item.branch_id),
              male_count: parseInt(item.male_count || 0),
              female_count: parseInt(item.female_count || 0),
            })),
          }
          : {}),
        ...(topPaidEmployeesResult && topPaidEmployeesResult.length > 0
          ? {
            topPaidEmployees: (topPaidEmployeesResult || []).map((item) => ({
              employee_id: item.employee_id,
              name: item.name,
              job_title: item.job_title,
              branch_name: item.branch_name,
              salary: parseFloat(item.salary || 0),
            })),
          }
          : {}),
      },
    };

    // Cache the response for 1 minute (60000ms)
    // Statistics don't change frequently and are expensive to compute
    setCache(cacheKey, response, 60000);

    res.json(response);
  } catch (error) {
    log.error("Error fetching employee statistics", { error: error.message });
    handleRouteError(error, req, res, 'فشل جلب إحصائيات الموظفين');
  }
});

/**
 * Helper function to create modern styled PDF table
 */
function createStyledTable(headers, rows, headerColor = '#667eea', alternateRowColor = '#f8fafc') {
  // Add styling to header cells
  const styledHeaders = headers.map(header => ({
    text: header,
    bold: true,
    alignment: 'center',
    fontSize: 12,
    fillColor: headerColor,
    color: '#ffffff',
    margin: [5, 5]
  }));

  // Add styling to data rows
  const styledRows = rows.map(row =>
    row.map(cell => ({
      ...cell,
      margin: cell.margin || [5, 3]
    }))
  );

  // Dynamic column widths based on header count
  let widths;
  if (styledHeaders.length === 2) {
    widths = ['60%', '40%'];
  } else if (styledHeaders.length === 3) {
    widths = ['50%', '25%', '25%'];
  } else {
    widths = new Array(styledHeaders.length).fill('*');
  }

  return {
    table: {
      headerRows: 1,
      widths,
      body: [styledHeaders, ...styledRows]
    },
    layout: {
      fillColor: function (rowIndex) {
        return rowIndex === 0 ? null : (rowIndex % 2 === 0 ? alternateRowColor : null);
      },
      hLineWidth: function (i, node) {
        return (i === 0 || i === 1 || i === node.table.body.length) ? 2 : 1;
      },
      vLineWidth: function () {
        return 0;
      },
      hLineColor: function (i) {
        return i === 1 ? headerColor : '#e2e8f0';
      },
      paddingLeft: function () { return 8; },
      paddingRight: function () { return 8; },
      paddingTop: function () { return 6; },
      paddingBottom: function () { return 6; }
    },
    margin: [0, 0, 0, 20]
  };
}

/**
 * POST /api/employees/statistics/generate-pdf
 * Generate PDF report with selected statistics
 * Main Manager only
 */
router.post("/statistics/generate-pdf", async (req, res) => {
  try {
    // Check authorization
    if (!req.user || !req.user.role) {
      return res.status(401).json({
        success: false,
        message: "غير مصرح",
      });
    }

    // Only main manager can generate reports
    if (req.user.role !== 'main_manager') {
      return res.status(403).json({
        success: false,
        message: "صلاحية غير كافية",
      });
    }

    const { selectedSections = {} } = req.body;

    // Get full statistics data
    const { Employee } = await import("../models/Employee.js");
    const { Branch } = await import("../models/Branch.js");

    const employees = await Employee.findAll();
    const branches = await Branch.findAll();

    if (!employees || employees.length === 0) {
      return res.status(400).json({
        success: false,
        message: "لا توجد بيانات موظفين",
      });
    }

    // Calculate statistics
    const statistics = calculateEmployeeStatistics(employees);

    // Use the certificatePrinter that's already initialized at the top of this file
    const printer = certificatePrinter;

    const docContent = [];
    const now = new Date();
    // Use Gregorian date format: dd/mm/yyyy
    const day = String(now.getDate()).padStart(2, '0');
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const year = now.getFullYear();
    const dateStr = `${day}/${month}/${year}`;

    // Helper function to generate text summary with data
    // Add title and date
    docContent.push({
      text: 'تقرير إحصائيات الموظفين',
      style: 'title',
    });

    docContent.push({
      text: `التاريخ: ${dateStr}`,
      style: 'subtitle',
      margin: [0, 0, 0, 20],
    });

    // Overview Stats in table format (requested)
    if (selectedSections.overview && statistics.overview) {
      docContent.push({
        text: 'ملخص عام',
        style: 'heading',
      });

      const overviewRows = [
        [
          { text: 'إجمالي الموظفين', alignment: 'right', fontSize: 11 },
          { text: String(statistics.overview.total || 0), alignment: 'center', fontSize: 11 }
        ],
        [
          { text: 'الذكور', alignment: 'right', fontSize: 11 },
          { text: String(statistics.overview.male || 0), alignment: 'center', fontSize: 11, color: '#4facfe' }
        ],
        [
          { text: 'الإناث', alignment: 'right', fontSize: 11 },
          { text: String(statistics.overview.female || 0), alignment: 'center', fontSize: 11, color: '#fa709a' }
        ],
        [
          { text: 'إكمال البيانات', alignment: 'right', fontSize: 11 },
          { text: `${statistics.overview.completionRate || 0}%`, alignment: 'center', fontSize: 11, color: '#43e97b' }
        ],
        [
          { text: 'متوسط الراتب', alignment: 'right', fontSize: 11 },
          { text: `${(statistics.overview.avgSalary || 0).toLocaleString('en-US')} ريال`, alignment: 'left', fontSize: 11, direction: 'ltr', noWrap: true }
        ],
        [
          { text: 'إجمالي الرواتب', alignment: 'right', fontSize: 11 },
          { text: `${(statistics.overview.totalSalaryBudget || 0).toLocaleString('en-US')} ريال`, alignment: 'left', fontSize: 11, direction: 'ltr', noWrap: true }
        ],
        [
          { text: 'نسبة التوظيف النشط', alignment: 'right', fontSize: 11 },
          { text: `${statistics.overview.active || 0} موظف`, alignment: 'center', fontSize: 11 }
        ]
      ];

      docContent.push(createStyledTable(['العنصر', 'القيمة'], overviewRows));
    }

    // Gender Distribution Chart
    if (selectedSections.gender && statistics.gender && statistics.gender.length > 0) {
      docContent.push({
        text: 'توزيع الموظفين حسب الجنس',
        style: 'heading',
      });

      const genderRows = statistics.gender.map(item => [
        { text: item.gender === 'male' ? 'ذكور' : 'إناث', fontSize: 11 },
        { text: item.count || 0, fontSize: 11, alignment: 'center' },
        { text: item.percentage + '%', fontSize: 11, alignment: 'center', bold: true, color: '#667eea' }
      ]);

      docContent.push(createStyledTable(
        ['الجنس', 'العدد', 'النسبة'],
        genderRows,
        '#667eea',
        '#f8fafc'
      ));
    }

    // Salary Ranges Chart
    if (selectedSections.salary && statistics.salary?.ranges && statistics.salary.ranges.length > 0) {
      docContent.push({
        text: 'توزيع الرواتب حسب الفئات',
        style: 'heading',
      });

      const salaryRows = statistics.salary.ranges.map(item => {
        const percentage = ((item.count / statistics.overview.total) * 100).toFixed(1);
        return [
          { text: item.range || 'بدون', fontSize: 11 },
          { text: item.count || 0, fontSize: 11, alignment: 'center' },
          { text: percentage + '%', fontSize: 11, alignment: 'center', bold: true, color: '#10b981' }
        ];
      });

      docContent.push(createStyledTable(
        ['فئة الراتب', 'العدد', 'النسبة'],
        salaryRows,
        '#10b981',
        '#f0fdf4'
      ));
    }

    // Job Titles Chart (top 10)
    if (selectedSections.jobTitles && statistics.jobTitles && statistics.jobTitles.length > 0) {
      docContent.push({
        text: 'أكثر 10 مسميات وظيفية',
        style: 'heading',
      });

      const jobRows = statistics.jobTitles.slice(0, 10).map(item => {
        const percentage = ((item.count / statistics.overview.total) * 100).toFixed(1);
        return [
          { text: item.job_title || 'بدون', fontSize: 11 },
          { text: item.count || 0, fontSize: 11, alignment: 'center' },
          { text: percentage + '%', fontSize: 11, alignment: 'center', bold: true, color: '#f59e0b' }
        ];
      });

      docContent.push(createStyledTable(
        ['المسمى الوظيفي', 'العدد', 'النسبة'],
        jobRows,
        '#f59e0b',
        '#fffbeb'
      ));
    }

    // Contract Types Chart
    if (selectedSections.contractTypes && statistics.contractTypes && statistics.contractTypes.length > 0) {
      docContent.push({
        text: 'توزيع الموظفين حسب نوع العقد',
        style: 'heading',
      });

      const contractRows = statistics.contractTypes.map(item => {
        const percentage = ((item.count / statistics.overview.total) * 100).toFixed(1);
        return [
          { text: item.contract_type || 'بدون', fontSize: 11 },
          { text: item.count || 0, fontSize: 11, alignment: 'center' },
          { text: percentage + '%', fontSize: 11, alignment: 'center', bold: true, color: '#8b5cf6' }
        ];
      });

      docContent.push(createStyledTable(
        ['نوع العقد', 'العدد', 'النسبة'],
        contractRows,
        '#8b5cf6',
        '#faf5ff'
      ));
    }

    // Marital Status Chart
    if (selectedSections.maritalStatus && statistics.maritalStatus && statistics.maritalStatus.length > 0) {
      docContent.push({
        text: 'توزيع الموظفين حسب الحالة الاجتماعية',
        style: 'heading',
      });

      const maritalRows = statistics.maritalStatus.map(item => {
        const percentage = ((item.count / statistics.overview.total) * 100).toFixed(1);
        return [
          { text: item.status || 'بدون', fontSize: 11 },
          { text: item.count || 0, fontSize: 11, alignment: 'center' },
          { text: percentage + '%', fontSize: 11, alignment: 'center', bold: true, color: '#ec4899' }
        ];
      });

      docContent.push(createStyledTable(
        ['الحالة الاجتماعية', 'العدد', 'النسبة'],
        maritalRows,
        '#ec4899',
        '#fdf2f8'
      ));
    }

    // Nationalities Chart (top 10)
    if (selectedSections.nationalities && statistics.nationalities && statistics.nationalities.length > 0) {
      docContent.push({
        text: 'أكثر 10 جنسيات',
        style: 'heading',
      });

      const nationalityRows = statistics.nationalities.slice(0, 10).map(item => {
        const percentage = ((item.count / statistics.overview.total) * 100).toFixed(1);
        return [
          { text: item.nationality || 'بدون', fontSize: 11 },
          { text: item.count || 0, fontSize: 11, alignment: 'center' },
          { text: percentage + '%', fontSize: 11, alignment: 'center', bold: true, color: '#06b6d4' }
        ];
      });

      docContent.push(createStyledTable(
        ['الجنسية', 'العدد', 'النسبة'],
        nationalityRows,
        '#06b6d4',
        '#ecfeff'
      ));
    }

    // Educational Qualifications Chart
    if (selectedSections.educationalQualifications && statistics.educationalQualifications && statistics.educationalQualifications.length > 0) {
      docContent.push({
        text: 'توزيع الموظفين حسب المؤهل التعليمي',
        style: 'heading',
      });

      const eduRows = statistics.educationalQualifications.map(item => {
        const percentage = ((item.count / statistics.overview.total) * 100).toFixed(1);
        return [
          { text: item.qualification || 'بدون', fontSize: 11 },
          { text: item.count || 0, fontSize: 11, alignment: 'center' },
          { text: percentage + '%', fontSize: 11, alignment: 'center', bold: true, color: '#3b82f6' }
        ];
      });

      docContent.push(createStyledTable(
        ['المؤهل التعليمي', 'العدد', 'النسبة'],
        eduRows,
        '#3b82f6',
        '#eff6ff'
      ));
    }

    // Employee Status Chart
    if (selectedSections.status && statistics.status && statistics.status.length > 0) {
    }

    // Age Groups Chart
    if (selectedSections.ageGroups && statistics.ageGroups && statistics.ageGroups.length > 0) {
      docContent.push({
        text: 'توزيع الموظفين حسب فئات العمر',
        style: 'heading',
      });

      const ageRows = statistics.ageGroups.map(item => {
        const percentage = ((item.count / statistics.overview.total) * 100).toFixed(1);
        return [
          { text: item.age_group || 'بدون', fontSize: 11 },
          { text: item.count || 0, fontSize: 11, alignment: 'center' },
          { text: percentage + '%', fontSize: 11, alignment: 'center', bold: true, color: '#ef4444' }
        ];
      });

      docContent.push(createStyledTable(
        ['فئة العمر', 'العدد', 'النسبة'],
        ageRows,
        '#ef4444',
        '#fef2f2'
      ));
    }

    // Experience Levels Chart
    if (selectedSections.experienceLevels && statistics.experienceLevels && statistics.experienceLevels.length > 0) {
      docContent.push({
        text: 'توزيع الموظفين حسب مستويات الخبرة',
        style: 'heading',
      });

      const expRows = statistics.experienceLevels.map(item => {
        const percentage = ((item.count / statistics.overview.total) * 100).toFixed(1);
        return [
          { text: item.level || 'بدون', fontSize: 11 },
          { text: item.count || 0, fontSize: 11, alignment: 'center' },
          { text: percentage + '%', fontSize: 11, alignment: 'center', bold: true, color: '#14b8a6' }
        ];
      });

      docContent.push(createStyledTable(
        ['مستوى الخبرة', 'العدد', 'النسبة'],
        expRows,
        '#14b8a6',
        '#f0fdfa'
      ));
    }

    // Branches Chart
    if (selectedSections.branches && statistics.branches && statistics.branches.length > 0) {
      docContent.push({
        text: 'توزيع الموظفين حسب الفروع',
        style: 'heading',
      });

      const branchRows = statistics.branches.map(item => {
        const branchName = branches.find(b => b.id === item.branch_id)?.branch_name || 'فرع مجهول';
        const percentage = ((item.count / statistics.overview.total) * 100).toFixed(1);
        return [
          { text: branchName, fontSize: 11 },
          { text: item.count, fontSize: 11, alignment: 'center' },
          { text: percentage + '%', fontSize: 11, alignment: 'center', bold: true, color: '#f97316' }
        ];
      });

      docContent.push(createStyledTable(
        ['اسم الفرع', 'عدد الموظفين', 'النسبة'],
        branchRows,
        '#f97316',
        '#fff7ed'
      ));
    }

    // PDF definition
    const docDefinition = {
      content: docContent,
      styles: {
        title: {
          fontSize: 24,
          bold: true,
          alignment: 'center',
          margin: [0, 0, 0, 20],
          color: '#1e293b',
          font: 'Amiri',
        },
        subtitle: {
          fontSize: 12,
          alignment: 'center',
          color: '#64748b',
          font: 'Amiri',
        },
        heading: {
          fontSize: 14,
          bold: true,
          margin: [0, 15, 0, 10],
          color: '#2c3e50',
          font: 'Amiri',
          border: [false, false, false, true],
          borderColor: '#667eea',
          borderWidth: 2,
          paddingBottom: 8,
        },
        cardLabel: {
          fontSize: 10,
          color: '#64748b',
          font: 'Roboto',
          margin: [0, 0, 5, 0],
        },
        cardValue: {
          fontSize: 18,
          bold: true,
          color: '#667eea',
          font: 'Roboto',
        },
        dataTable: {
          font: 'Roboto',
        },
      },
      defaultStyle: {
        font: 'Roboto',
        fontSize: 11,
        color: '#1e293b',
      },
    };

    // Generate PDF
    const pdfDoc = printer.createPdfKitDocument(docDefinition);

    // Set response headers
    // Use ASCII filename with UTC-8 encoded filename* parameter for Arabic support
    const dateStrForFilename = new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD format
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="statistics_report_${dateStrForFilename}.pdf"; filename*=UTF-8''%D8%AA%D9%82%D8%B1%D9%8A%D8%B1_%D8%A7%D8%AD%D8%B5%D8%A7%D8%A6%D9%8A%D8%A7%D8%AA_%D8%A7%D9%84%D9%85%D9%88%D8%B8%D9%81%D9%8A%D9%86.pdf`);
    // Pipe to response
    pdfDoc.pipe(res);
    pdfDoc.end();
  } catch (error) {
    log.error('Error generating statistics PDF', { error: error.message });
    handleRouteError(error, req, res, 'فشل إنشاء التقرير');
  }
});

// Get all employees (filtered by branch for branch managers)
router.get("/", async (req, res) => {
  try {
    const { Employee } = await import("../models/Employee.js");
    const { updateEmployeeCompletionStatus } =
      await import("../utils/employeeDataCompletion.js");

    // Handle branch_id - support single value or array
    const branchId = getScopedBranchFilter(req, { allowMultiple: true });

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
    handleRouteError(error, req, res, 'فشل جلب الموظفين');
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
    handleRouteError(error, req, res, 'فشل تحديث حالة الإكمال');
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
    handleRouteError(error, req, res, 'فشل جلب مستندات الموظف');
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
    handleRouteError(error, req, res, 'فشل جلب البيانات المفقودة');
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
    handleRouteError(error, req, res, 'فشل جلب الموظف');
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
    handleRouteError(error, req, res, 'فشل التحقق من التكرار');
  }
});

// Link existing employee to current branch
router.post("/link-to-branch", async (req, res) => {
  try {
    const { Employee } = await import("../models/Employee.js");
    const { Branch } = await import("../models/Branch.js");
    const { employee_id } = req.body;

    if (!employee_id) {
      return res.status(400).json({
        success: false,
        message: "معرف الموظف مطلوب",
      });
    }

    // Determine the branch to link to
    let targetBranchId = getScopedBranchFilter(req, { allowMultiple: false });
    if (!targetBranchId && req.body.branch_id) { // policy-scope:allow-direct
      const ba = resolveBranchAccessFromScope(req.scope, parseInt(req.body.branch_id)); // policy-scope:allow-direct
      if (ba.allowed) targetBranchId = ba.effectiveBranchId;
    }

    if (!targetBranchId) {
      return res.status(400).json({
        success: false,
        message: "لا يمكن تحديد الفرع للربط",
      });
    }

    // Check if employee exists
    const existingEmployee = await Employee.findById(parseInt(employee_id));
    if (!existingEmployee) {
      return res.status(404).json({
        success: false,
        message: "الموظف غير موجود",
      });
    }

    // Check if already linked to this branch
    const isAlreadyLinked = await Employee.isLinkedToBranch(existingEmployee.id, targetBranchId);
    if (isAlreadyLinked) {
      return res.status(409).json({
        success: false,
        message: `الموظف "${existingEmployee.first_name} ${existingEmployee.second_name}" مرتبط بالفعل بهذا الفرع`,
        error: "ALREADY_LINKED",
      });
    }

    // Get target branch info
    const targetBranch = await Branch.findById(targetBranchId);
    if (!targetBranch) {
      return res.status(404).json({
        success: false,
        message: "الفرع المستهدف غير موجود",
      });
    }

    // Link the employee to the new branch
    // Branch managers are stored in branches table, not users — pass null to avoid FK violation
    const addedByUserId = req.user?.existsInDb ? req.user.id : null;
    await Employee.linkToBranch(existingEmployee.id, targetBranchId, addedByUserId);

    // Reload employee with updated branch info
    const updatedEmployee = await Employee.findById(existingEmployee.id);

    // Clear caches
    clearByPrefix(`dashboard:summary:${targetBranchId}`);
    clearByPrefix("branch-statistics");

    log.info("Employee linked to branch", {
      employee_id: existingEmployee.id,
      employee_name: `${existingEmployee.first_name} ${existingEmployee.second_name}`,
      branch_id: targetBranchId,
      branch_name: targetBranch.branch_name,
      linked_by: req.user.id
    });

    res.status(200).json({
      success: true,
      message: `تم ربط الموظف "${existingEmployee.first_name} ${existingEmployee.second_name} ${existingEmployee.third_name} ${existingEmployee.fourth_name}" بفرع "${targetBranch.branch_name}" بنجاح`,
      data: updatedEmployee,
    });

  } catch (error) {
    log.error("Error linking employee to branch", { error: error.message });
    handleRouteError(error, req, res, 'فشل ربط الموظف بالفرع');
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
    log.info("========================================");
    log.info("[EMPLOYEE CREATE] Starting employee creation");
    log.info("[EMPLOYEE CREATE] User:", {
      id: req.user.id,
      role: req.user.role,
      branch_id: req.user.branch_id,
    });
    log.info("[EMPLOYEE CREATE] Request body keys:", Object.keys(req.body));
    log.info(
      "[EMPLOYEE CREATE] Employee ID/Residency:",
      req.body.id_or_residency_number,
    );
    log.info(
      "[EMPLOYEE CREATE] Name:",
      `${req.body.first_name} ${req.body.second_name} ${req.body.third_name} ${req.body.fourth_name}`,
    );
    log.info("[EMPLOYEE CREATE] Branch ID from body:", req.body.branch_id); // policy-scope:allow-direct

    try {
      const { Employee } = await import("../models/Employee.js");
      const { updateEmployeeCompletionStatus } =
        await import("../utils/employeeDataCompletion.js");
      const { isSaudi } = await import("../utils/employeeHelpers.js");

      log.info("[EMPLOYEE CREATE] Imports loaded successfully");

      // Date validation is handled by validateDateFields middleware
      log.info("[EMPLOYEE CREATE] Date validation passed");

      // Enforce branch access via scope
      {
        const _branchId = req.body.branch_id; // policy-scope:allow-direct
        const branchAccess = resolveBranchAccessFromScope(req.scope, _branchId);
        if (!branchAccess.allowed) {
          return res.status(403).json({
            success: false,
            message: "You can only add employees to your own branch",
          });
        }
        req.body.branch_id = branchAccess.effectiveBranchId; // policy-scope:allow-direct
        log.info("[EMPLOYEE CREATE] Branch ID resolved to:", req.body.branch_id); // policy-scope:allow-direct
      }

      // Date normalization is handled by validateDateFields middleware
      log.info("[EMPLOYEE CREATE] Starting field length validation");

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
          log.info(
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
      log.info("[EMPLOYEE CREATE] Field length validation passed");

      // Set created_by to branch_id (never null)
      // For branch managers: use their branch_id
      // For main managers: use the employee's branch_id
      let createdByBranchId = req.body.branch_id ? parseInt(req.body.branch_id) : null; // policy-scope:allow-direct
      log.info(
        "[EMPLOYEE CREATE] Initial createdByBranchId:",
        createdByBranchId,
      );

      // If branch manager, force to their branch_id
      if (req.user.role === "branch_manager" && req.user.branch_id) {
        createdByBranchId = parseInt(req.user.branch_id);
        log.info(
          "[EMPLOYEE CREATE] Updated createdByBranchId for branch manager:",
          createdByBranchId,
        );
      }

      // Ensure branch_id is set (should never be null at this point)
      if (!createdByBranchId) {
        log.info(
          "[EMPLOYEE CREATE] ERROR: createdByBranchId is null or undefined",
        );
        return res.status(400).json({
          success: false,
          message: "لا يمكن تحديد الفرع. الرجاء المحاولة مرة أخرى.",
        });
      }

      // Guard: reject assignment to an inactive branch
      {
        const [branchCheck] = await sql`
          SELECT is_active FROM branches WHERE id = ${createdByBranchId}
        `;
        if (!branchCheck || !branchCheck.is_active) {
          return res.status(400).json({
            success: false,
            message: "لا يمكن إنشاء موظف في فرع غير نشط أو غير موجود.",
          });
        }
      }
      log.info(
        "[EMPLOYEE CREATE] Final createdByBranchId:",
        createdByBranchId,
      );

      // ========== PROACTIVE DUPLICATE CHECK ==========
      // Check for existing employees BEFORE attempting to create
      // This prevents hitting database constraints and provides better UX
      log.info("[EMPLOYEE CREATE] Checking for existing employees with same ID...");

      const { Branch } = await import("../models/Branch.js");

      // Check by id_or_residency_number (most common duplicate scenario)
      if (req.body.id_or_residency_number) {
        const existingByIdNumber = await Employee.findDuplicates(req.body.id_or_residency_number);

        if (existingByIdNumber && existingByIdNumber.length > 0) {
          const existingEmployee = existingByIdNumber[0];
          log.info("[EMPLOYEE CREATE] Found existing employee with same ID:", existingEmployee.id);

          // Get all branches the employee is linked to
          let existingBranches = [];
          try {
            const branchIds = await Employee.getBranchIds(existingEmployee.id);
            for (const branchId of branchIds) {
              const branch = await Branch.findById(branchId);
              if (branch) {
                existingBranches.push({
                  id: branch.id,
                  name: branch.branch_name,
                  type: branch.branch_type
                });
              }
            }
          } catch (branchErr) {
            // Fallback to primary branch_id
            if (existingEmployee.branch_id) {
              const branch = await Branch.findById(existingEmployee.branch_id);
              if (branch) {
                existingBranches.push({
                  id: branch.id,
                  name: branch.branch_name,
                  type: branch.branch_type
                });
              }
            }
          }

          // Check if already linked to the target branch (parseInt for safe comparison)
          const isAlreadyLinked = existingBranches.some(b => Number(b.id) === Number(createdByBranchId));

          if (isAlreadyLinked) {
            log.info("[EMPLOYEE CREATE] Employee already exists in this branch");
            return res.status(409).json({
              success: false,
              message: `⚠️ الموظف "${existingEmployee.first_name} ${existingEmployee.second_name} ${existingEmployee.third_name} ${existingEmployee.fourth_name}" مسجل بالفعل في هذا الفرع.\n\nرقم الهوية/الإقامة: ${existingEmployee.id_or_residency_number}\nالرقم الوظيفي: ${existingEmployee.employee_id_number || 'غير محدد'}\n\nيمكنك البحث عن الموظف في قائمة الموظفين لتعديل بياناته.`,
              error: "EMPLOYEE_ALREADY_IN_BRANCH",
              existingEmployee: {
                id: existingEmployee.id,
                name: `${existingEmployee.first_name} ${existingEmployee.second_name} ${existingEmployee.third_name} ${existingEmployee.fourth_name}`,
                employee_id_number: existingEmployee.employee_id_number,
                id_or_residency_number: existingEmployee.id_or_residency_number,
                branches: existingBranches
              },
              canLink: false
            });
          } else {
            // Employee exists in other branch(es), offer to link
            const branchNames = existingBranches.map(b => b.name).join('، ');
            log.info("[EMPLOYEE CREATE] Employee exists in other branches:", branchNames);
            return res.status(409).json({
              success: false,
              message: `📋 الموظف "${existingEmployee.first_name} ${existingEmployee.second_name} ${existingEmployee.third_name} ${existingEmployee.fourth_name}" مسجل مسبقاً في فرع آخر.\n\n🏢 الفروع الحالية: ${branchNames}\n📝 رقم الهوية/الإقامة: ${existingEmployee.id_or_residency_number}\n🔢 الرقم الوظيفي: ${existingEmployee.employee_id_number || 'غير محدد'}\n\n❓ هل تريد ربط هذا الموظف بفرعك أيضاً؟`,
              error: "EMPLOYEE_EXISTS_IN_OTHER_BRANCH",
              existingEmployee: {
                id: existingEmployee.id,
                name: `${existingEmployee.first_name} ${existingEmployee.second_name} ${existingEmployee.third_name} ${existingEmployee.fourth_name}`,
                employee_id_number: existingEmployee.employee_id_number,
                id_or_residency_number: existingEmployee.id_or_residency_number,
                branches: existingBranches
              },
              canLink: true
            });
          }
        }
      }

      // Also check by employee_id_number if provided
      if (req.body.employee_id_number) {
        const existingByEmployeeId = await Employee.findByEmployeeId(req.body.employee_id_number);

        if (existingByEmployeeId) {
          log.info("[EMPLOYEE CREATE] Found existing employee with same employee_id_number:", existingByEmployeeId.id);

          // Get full employee info with branches
          const fullEmployee = await Employee.findById(existingByEmployeeId.id);
          let existingBranches = fullEmployee?.branches || [];

          // If branches not available, get from primary
          if (existingBranches.length === 0 && existingByEmployeeId.branch_id) {
            const branch = await Branch.findById(existingByEmployeeId.branch_id);
            if (branch) {
              existingBranches = [{
                id: branch.id,
                name: branch.branch_name,
                type: branch.branch_type
              }];
            }
          }

          const isAlreadyLinked = existingBranches.some(b => Number(b.branch_id) === Number(createdByBranchId) || Number(b.id) === Number(createdByBranchId));

          if (isAlreadyLinked) {
            return res.status(409).json({
              success: false,
              message: `⚠️ الموظف برقم وظيفي "${req.body.employee_id_number}" مسجل بالفعل في هذا الفرع.\n\nيمكنك البحث عن الموظف في قائمة الموظفين لتعديل بياناته.`,
              error: "EMPLOYEE_ALREADY_IN_BRANCH",
              existingEmployee: {
                id: existingByEmployeeId.id,
                name: `${existingByEmployeeId.first_name} ${existingByEmployeeId.second_name} ${existingByEmployeeId.third_name} ${existingByEmployeeId.fourth_name}`,
                employee_id_number: existingByEmployeeId.employee_id_number,
                id_or_residency_number: existingByEmployeeId.id_or_residency_number,
                branches: existingBranches
              },
              canLink: false
            });
          } else {
            const branchNames = existingBranches.map(b => b.branch_name || b.name).join('، ') || 'غير محدد';
            return res.status(409).json({
              success: false,
              message: `📋 يوجد موظف آخر بنفس الرقم الوظيفي "${req.body.employee_id_number}" مسجل في فرع آخر.\n\n🏢 الفروع الحالية: ${branchNames}\n👤 الاسم: ${existingByEmployeeId.first_name} ${existingByEmployeeId.second_name}\n\n❓ هل تريد ربط هذا الموظف بفرعك؟`,
              error: "EMPLOYEE_EXISTS_IN_OTHER_BRANCH",
              existingEmployee: {
                id: existingByEmployeeId.id,
                name: `${existingByEmployeeId.first_name} ${existingByEmployeeId.second_name} ${existingByEmployeeId.third_name} ${existingByEmployeeId.fourth_name}`,
                employee_id_number: existingByEmployeeId.employee_id_number,
                id_or_residency_number: existingByEmployeeId.id_or_residency_number,
                branches: existingBranches
              },
              canLink: true
            });
          }
        }
      }

      log.info("[EMPLOYEE CREATE] No duplicates found, proceeding with creation");
      // ========== END PROACTIVE DUPLICATE CHECK ==========

      // Check if this is linking to an existing employee (via existing_employee_id)
      if (req.body.existing_employee_id && req.body.link_to_branch) {
        log.info(
          "[EMPLOYEE CREATE] Linking to existing employee:",
          req.body.existing_employee_id,
        );
        const existingEmployeeId = parseInt(req.body.existing_employee_id);
        const linkBranchId =
          req.body.link_to_branch === "true" ? createdByBranchId : null;

        if (linkBranchId) {
          try {
            log.info(
              "[EMPLOYEE CREATE] Attempting to link employee to branch",
            );
            await Employee.linkToBranch(
              existingEmployeeId,
              linkBranchId,
              auditUserId,
            );
            const updatedEmployee = await Employee.findById(existingEmployeeId);
            clearByPrefix(`dashboard:summary:${linkBranchId}`);
            clearByPrefix("branch-statistics");
            log.info(
              "[EMPLOYEE CREATE] Successfully linked existing employee to branch",
            );
            return res.status(200).json({
              success: true,
              data: updatedEmployee,
              message: "تم ربط الموظف بالفرع الجديد بنجاح",
            });
          } catch (linkError) {
            log.info(
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

      log.info("[EMPLOYEE CREATE] Creating new employee in database...");
      log.info("[EMPLOYEE CREATE] Employee data being sent to model:", {
        employee_id_number: req.body.employee_id_number,
        branch_id: req.body.branch_id, // policy-scope:allow-direct
        first_name: req.body.first_name,
        id_or_residency_number: req.body.id_or_residency_number,
        created_by: req.user.id,
        updated_by: req.user.id,
        contract_start_date_hijri: req.body.contract_start_date_hijri,
        contract_end_date_hijri: req.body.contract_end_date_hijri,
      });

      let employee;
      // Branch managers have req.user.id = branch.id (not a users table FK)
      // created_by/updated_by reference users(id), so use null for branch managers
      const auditUserId = req.user.role === 'branch_manager' ? null : req.user.id;

      await sql.begin(async (tx) => {
        employee = await Employee.create(
          {
            ...req.body,
            created_by: auditUserId,
            updated_by: auditUserId, // For new records, updated_by = created_by
            data_completion_status: "incomplete", // Default to incomplete
          },
          tx,
        );

        log.info(
          "[EMPLOYEE CREATE] Employee created successfully with ID:",
          employee.id,
        );

        log.info(
          "[EMPLOYEE CREATE] Linking employee to branch in employee_branches table",
        );
        await Employee.linkToBranch(
          employee.id,
          createdByBranchId,
          auditUserId,
          tx,
        );
        log.info("[EMPLOYEE CREATE] Successfully linked employee to branch");
      });

      // Check and update completion status
      try {
        log.info("[EMPLOYEE CREATE] Updating employee completion status");
        await updateEmployeeCompletionStatus(employee.id);
        // Reload employee to get updated status
        const updatedEmployee = await Employee.findById(employee.id);
        log.info("[EMPLOYEE CREATE] Employee completion status updated");
        // Invalidate caches for this branch and branch statistics
        clearByPrefix(`dashboard:summary:${updatedEmployee.branch_id}`);
        clearByPrefix("branch-statistics");
        log.info(
          "[EMPLOYEE CREATE] SUCCESS: Employee created and processed successfully",
        );
        log.info("========================================");
        res.status(201).json({ success: true, data: updatedEmployee });
      } catch (completionError) {
        log.info(
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
        log.info(
          "[EMPLOYEE CREATE] SUCCESS: Employee created (completion status check failed)",
        );
        log.info("========================================");
        res.status(201).json({ success: true, data: employee });
      }
    } catch (error) {
      log.info("[EMPLOYEE CREATE] ERROR:", error.message);
      log.info("[EMPLOYEE CREATE] Error stack:", error.stack);
      log.info("========================================");
      log.error("Error creating employee", {
        error: error.message,
        stack: error.stack,
      });

      // Handle duplicate key errors with user-friendly messages and auto-link suggestion
      if (error.message && error.message.includes('duplicate key value violates unique constraint')) {
        const { Employee } = await import("../models/Employee.js");
        const { Branch } = await import("../models/Branch.js");

        let userMessage = "يوجد موظف بنفس البيانات مسبقاً";
        let duplicateField = "unknown";
        let existingEmployee = null;
        let existingBranches = [];

        try {
          // Try to find the existing employee based on the constraint that was violated
          if (error.message.includes('employees_employee_id_number_key')) {
            duplicateField = "employee_id_number";
            existingEmployee = await Employee.findByEmployeeId(req.body.employee_id_number);
          } else if (error.message.includes('employees_id_or_residency_number_key')) {
            duplicateField = "id_or_residency_number";
            // Find by id_or_residency_number
            const duplicates = await Employee.findDuplicates(req.body.id_or_residency_number);
            if (duplicates && duplicates.length > 0) {
              existingEmployee = duplicates[0];
            }
          }

          // If we found the existing employee, get their branch info
          if (existingEmployee) {
            // Get all branches the employee is linked to
            try {
              const branchIds = await Employee.getBranchIds(existingEmployee.id);
              for (const branchId of branchIds) {
                const branch = await Branch.findById(branchId);
                if (branch) {
                  existingBranches.push({
                    id: branch.id,
                    name: branch.branch_name,
                    type: branch.branch_type
                  });
                }
              }
            } catch (branchErr) {
              // If getBranchIds fails, use the primary branch_id
              if (existingEmployee.branch_id) {
                const branch = await Branch.findById(existingEmployee.branch_id);
                if (branch) {
                  existingBranches.push({
                    id: branch.id,
                    name: branch.branch_name,
                    type: branch.branch_type
                  });
                }
              }
            }

            // Check if already linked to the current branch
            const currentBranchId = req.body.branch_id || req.user.branch_id; // policy-scope:allow-direct
            const isAlreadyLinked = existingBranches.some(b => b.id === currentBranchId);

            if (isAlreadyLinked) {
              userMessage = `⚠️ الموظف "${existingEmployee.first_name} ${existingEmployee.second_name} ${existingEmployee.third_name} ${existingEmployee.fourth_name}" مسجل بالفعل في هذا الفرع.\n\nرقم الهوية/الإقامة: ${existingEmployee.id_or_residency_number}\nالرقم الوظيفي: ${existingEmployee.employee_id_number || 'غير محدد'}`;

              return res.status(409).json({
                success: false,
                message: userMessage,
                error: "EMPLOYEE_ALREADY_IN_BRANCH",
                existingEmployee: {
                  id: existingEmployee.id,
                  name: `${existingEmployee.first_name} ${existingEmployee.second_name} ${existingEmployee.third_name} ${existingEmployee.fourth_name}`,
                  employee_id_number: existingEmployee.employee_id_number,
                  id_or_residency_number: existingEmployee.id_or_residency_number,
                  branches: existingBranches
                },
                canLink: false
              });
            } else {
              // Employee exists in other branch(es), offer to link
              const branchNames = existingBranches.map(b => b.name).join('، ');
              userMessage = `📋 الموظف "${existingEmployee.first_name} ${existingEmployee.second_name} ${existingEmployee.third_name} ${existingEmployee.fourth_name}" مسجل مسبقاً في فرع آخر.\n\n🏢 الفروع الحالية: ${branchNames}\n📝 رقم الهوية/الإقامة: ${existingEmployee.id_or_residency_number}\n🔢 الرقم الوظيفي: ${existingEmployee.employee_id_number || 'غير محدد'}\n\n❓ هل تريد ربط هذا الموظف بفرعك أيضاً؟`;

              return res.status(409).json({
                success: false,
                message: userMessage,
                error: "EMPLOYEE_EXISTS_IN_OTHER_BRANCH",
                existingEmployee: {
                  id: existingEmployee.id,
                  name: `${existingEmployee.first_name} ${existingEmployee.second_name} ${existingEmployee.third_name} ${existingEmployee.fourth_name}`,
                  employee_id_number: existingEmployee.employee_id_number,
                  id_or_residency_number: existingEmployee.id_or_residency_number,
                  branches: existingBranches
                },
                canLink: true,
                linkInstructions: "لربط الموظف بفرعك، أعد إرسال الطلب مع إضافة الحقول: existing_employee_id و link_to_branch"
              });
            }
          }
        } catch (lookupError) {
          log.info("[EMPLOYEE CREATE] Error looking up existing employee:", lookupError.message);
          // Continue with generic error message
        }

        // Fallback generic messages if we couldn't find the existing employee
        if (duplicateField === "employee_id_number") {
          userMessage = "يوجد موظف بنفس الرقم الوظيفي مسبقاً. الرجاء التحقق من الرقم الوظيفي أو البحث عن الموظف الموجود.";
        } else if (duplicateField === "id_or_residency_number") {
          userMessage = "يوجد موظف بنفس رقم الهوية أو الإقامة مسبقاً. الرجاء التحقق من رقم الهوية أو البحث عن الموظف الموجود.";
        } else if (error.message.includes('employees_email_key')) {
          userMessage = "يوجد موظف بنفس البريد الإلكتروني مسبقاً.";
        }

        return res.status(409).json({
          success: false,
          message: userMessage,
          error: "DUPLICATE_EMPLOYEE",
        });
      }

      handleRouteError(error, req, res, 'فشل إنشاء الموظف');
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
    log.info("========================================");
    log.info("[EMPLOYEE UPDATE] Starting employee update");
    log.info("[EMPLOYEE UPDATE] Employee ID:", req.params.id);
    log.info("[EMPLOYEE UPDATE] User:", {
      id: req.user.id,
      role: req.user.role,
      branch_id: req.user.branch_id,
    });
    log.info("[EMPLOYEE UPDATE] Update fields:", Object.keys(req.body));

    try {
      const { Employee } = await import("../models/Employee.js");

      // Check if employee exists and user has access
      log.info("[EMPLOYEE UPDATE] Checking if employee exists...");
      const existingEmployee = await Employee.findById(parseInt(req.params.id));
      if (!existingEmployee) {
        log.info("[EMPLOYEE UPDATE] ERROR: Employee not found");
        return res.status(404).json({
          success: false,
          message: "الموظف غير موجود",
        });
      }
      log.info(
        "[EMPLOYEE UPDATE] Employee found:",
        existingEmployee.id,
        existingEmployee.branch_id,
      );

      if (
        req.user.role === "branch_manager" &&
        !employeeHasBranchAccess(existingEmployee, req.user.branch_id)
      ) {
        log.info(
          "[EMPLOYEE UPDATE] ERROR: Branch manager trying to update employee from different branch",
        );
        return res.status(403).json({
          success: false,
          message: "تم رفض الوصول",
        });
      }

      // Enforce branch access via scope
      {
        const _branchId = req.body.branch_id; // policy-scope:allow-direct
        const branchAccess = resolveBranchAccessFromScope(req.scope, _branchId);
        if (_branchId && !branchAccess.allowed) {
          return res.status(403).json({
            success: false,
            message: "لا يمكنك تغيير فرع الموظف",
          });
        }
        if (branchAccess.effectiveBranchId) {
          req.body.branch_id = branchAccess.effectiveBranchId; // policy-scope:allow-direct
        }
      }

      // Date normalization is handled by validateDateFields middleware
      // Branch managers have req.user.id = branch.id (not a users table FK)
      const auditUserIdForUpdate = req.user.role === 'branch_manager' ? null : req.user.id;
      log.info("[EMPLOYEE UPDATE] Updated by user ID:", auditUserIdForUpdate);
      log.info("[EMPLOYEE UPDATE] Calling Employee.update()...");

      const employee = await Employee.update(
        parseInt(req.params.id),
        req.body,
        auditUserIdForUpdate,
      );

      log.info(
        "[EMPLOYEE UPDATE] Employee updated successfully:",
        employee.id,
      );

      // Check and update completion status after update
      try {
        log.info("[EMPLOYEE UPDATE] Updating completion status...");
        const { updateEmployeeCompletionStatus } =
          await import("../utils/employeeDataCompletion.js");
        await updateEmployeeCompletionStatus(employee.id);
        // Reload employee to get updated status
        const updatedEmployee = await Employee.findById(employee.id);
        log.info("[EMPLOYEE UPDATE] Completion status updated");
        // Invalidate caches for this branch and branch statistics
        clearByPrefix(`dashboard:summary:${updatedEmployee.branch_id}`);
        clearByPrefix("branch-statistics");
        log.info("[EMPLOYEE UPDATE] SUCCESS: Employee updated successfully");
        log.info("========================================");
        res.json({ success: true, data: updatedEmployee });
      } catch (completionError) {
        log.info(
          "[EMPLOYEE UPDATE] WARNING: Error checking completion status:",
          completionError.message,
        );
        log.warn("Error checking completion status", {
          error: completionError.message,
        });
        // Invalidate caches for safety
        clearByPrefix(
          `dashboard:summary:${req.body.branch_id || existingEmployee.branch_id}`, // policy-scope:allow-direct
        );
        clearByPrefix("branch-statistics");
        // Still return success, but with original employee data
        log.info(
          "[EMPLOYEE UPDATE] SUCCESS: Employee updated (completion status check failed)",
        );
        log.info("========================================");
        res.json({ success: true, data: employee });
      }
    } catch (error) {
      log.info("[EMPLOYEE UPDATE] ERROR:", error.message);
      log.info("[EMPLOYEE UPDATE] Error stack:", error.stack);
      log.info("========================================");
      handleRouteError(error, req, res, 'فشل تحديث الموظف');
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

    // Get deletion reason from request body
    const reason = req.body?.reason || "تم إلغاء التفعيل";

    // Archive employee by setting status to 'other' with deletion reason
    // Use req.user.id (main manager's user ID) for the FK to users(id)
    const updatedEmployee = await Employee.updateStatus(
      employeeId,
      "other",
      req.user.id,
      reason,
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
    handleRouteError(error, req, res, 'فشل إلغاء تفعيل الموظف');
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
    // status_changed_by has FK to users(id) — branch managers don't have a users row, use null
    let statusChangedBy = req.user.role === 'branch_manager' ? null : req.user.id;

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
    handleRouteError(error, req, res, 'فشل تحديث حالة الموظف');
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
    // status_changed_by is FK to users(id) — branch managers have no users row, use null
    const renewedEmployee = await Employee.renewEmployee(
      employeeId,
      currentYear.year_label,
      currentTerm.id,
      null,
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
    handleRouteError(error, req, res, 'فشل تجديد العقد');
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
    // status_changed_by has FK to users(id) — branch managers don't have a users row, use null
    const updatedEmployee = await Employee.updateStatus(
      employeeId,
      status,
      null,
      reason || "عدم تجديد العقد",
    );

    res.json({
      success: true,
      message: "تم نقل الموظف إلى الأرشيف بنجاح",
      data: updatedEmployee,
    });
  } catch (error) {
    log.error("Error processing non-renewal", { error: error.message });
    handleRouteError(error, req, res, 'فشل تحديد عدم التجديد');
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
    const rawGender = (employee.gender || "").toString().trim().toLowerCase(); // Normalize gender for هو/هي
    const isFemale =
      rawGender === "female" ||
      rawGender === "f" ||
      rawGender.includes("أنث") ||
      rawGender.includes("انث") ||
      rawGender.includes("female") ||
      rawGender.includes("femme");

    // Calculate total salary from all components
    const baseSalaryValue = parseFloat(certificate_data?.basic_salary || employee.base_salary || 0);
    const housingAllowanceValue = parseFloat(certificate_data?.housing_allowance || employee.housing_allowance || 0);
    const transportationAllowanceValue = parseFloat(certificate_data?.transportation_allowance || employee.transportation_allowance || 0);
    const annualLeaveAllowanceValue = parseFloat(certificate_data?.annual_leave_allowance || employee.annual_leave_allowance || 0);
    const endOfServiceAllowanceValue = parseFloat(certificate_data?.end_of_service_allowance || employee.end_of_service_allowance || 0);
    const otherAllowancesValue = parseFloat(certificate_data?.other_allowances || employee.other_allowances || 0);
    const employeeSalary = baseSalaryValue + housingAllowanceValue + transportationAllowanceValue + annualLeaveAllowanceValue + endOfServiceAllowanceValue + otherAllowancesValue;

    const basicSalary = certificate_data?.basic_salary || "";
    const housingAllowance = certificate_data?.housing_allowance || "";
    const transportationAllowance =
      certificate_data?.transportation_allowance || "";
    const annualLeaveAllowance = certificate_data?.annual_leave_allowance || "";
    const endOfServiceAllowance = certificate_data?.end_of_service_allowance || "";
    const otherAllowances = certificate_data?.other_allowances || "";
    const recipient = certificate_data?.recipient || "الي من يهمه الامر";
    const employer = certificate_data?.employer || "شركة الرعاية المتناهية";
    const customTitle = certificate_data?.custom_title || null;

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
    const employeeGender = isFemale ? "female" : "male";
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
          log.info(`✓ Background PNG loaded from: ${backgroundPngPath}`);
          break;
        } catch (error) {
          log.error(
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
            log.info(`✓ Background PDF loaded from: ${backgroundPdfPath}`);
            break;
          } catch (error) {
            log.error(
              `✗ Error reading PDF from ${backgroundPdfPath}:`,
              error.message,
            );
          }
        }
      }
    }

    // Log warning if assets are missing (but continue - PDF will still be generated)
    if (!backgroundImageBytes && !backgroundPdfBytes) {
      log.warn(
        "⚠ Warning: No background image found. Certificate will be generated without background.",
      );
    }

    // Create certificate content using pdfmake with table layout
    const certificateContent = [];

    // Title - use custom title if provided, otherwise default per type
    const defaultTitle =
      certificate_type === "salary" ? "خطاب تعريف راتب" :
        certificate_type === "specialties" ? "تعريف هيئة التخصصات" :
          "شهادة خبرة";
    const titleText = customTitle || defaultTitle;
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
          // Reduced widths to match specialties table spacing with proper margins
          widths: [105, 290],
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
          // Reduced widths to match specialties table spacing with proper margins
          widths: [105, 290],
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
      // Specialties certificate uses a vertical 2-column table (label-value)
      const specialtiesTableBody = [
        // Row 1: ID
        [
          {
            text: `رقم ${idLabel}:`,
            style: "infoLabel",
            alignment: "right",
            border: [true, true, true, true],
          },
          {
            text: employeeIdNumber || "",
            style: "infoValue",
            alignment: "right",
            border: [true, true, true, true],
          },
        ],
        // Row 2: Name
        [
          {
            text: "الاسم:",
            style: "infoLabel",
            alignment: "right",
            border: [true, true, true, true],
          },
          {
            text: employeeFullName || "",
            style: "infoValue",
            alignment: "right",
            border: [true, true, true, true],
          },
        ],
        // Row 3: Profession
        [
          {
            text: "المهنة:",
            style: "infoLabel",
            alignment: "right",
            border: [true, true, true, true],
          },
          {
            text: professionWithGender || "غير محدد",
            style: "infoValue",
            alignment: "right",
            border: [true, true, true, true],
          },
        ],
        // Row 4: Nationality
        [
          {
            text: "الجنسية:",
            style: "infoLabel",
            alignment: "right",
            border: [true, true, true, true],
          },
          {
            text: nationality || "",
            style: "infoValue",
            alignment: "right",
            border: [true, true, true, true],
          },
        ],
        // Row 5: Start Date (on one line)
        [
          {
            text: "تاريخ المباشرة:",
            style: "infoLabel",
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
          // Vertical 2-column layout: label | value
          // Reduced widths to fit within page with proper margins
          widths: [130, 265],
          body: specialtiesTableBody,
        },
        layout: {
          paddingLeft: () => 6,
          paddingRight: () => 6,
          paddingTop: () => 6,
          paddingBottom: () => 6,
          hLineWidth: () => 1,
          vLineWidth: () => 1,
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
            border: [true, true, true, true],
          },
          {
            text: employeeFullName,
            style: "infoValue",
            alignment: "right",
            border: [true, true, true, true],
          },
        ],
        [
          {
            text: "الجنسية:",
            style: "infoLabel",
            alignment: "right",
            border: [true, true, true, true],
          },
          {
            text: nationality,
            style: "infoValue",
            alignment: "right",
            border: [true, true, true, true],
          },
        ],
        [
          {
            text: `رقم ${idLabel}:`,
            style: "infoLabel",
            alignment: "right",
            border: [true, true, true, true],
          },
          {
            text: employeeIdNumber,
            style: "infoValue",
            alignment: "right",
            border: [true, true, true, true],
          },
        ],
        [
          {
            text: "المسمى الوظيفي:",
            style: "infoLabel",
            alignment: "right",
            border: [true, true, true, true],
          },
          {
            text: jobTitle || "غير محدد",
            style: "infoValue",
            alignment: "right",
            border: [true, true, true, true],
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
            border: [true, true, true, true],
          },
          {
            text: jobTitle || "غير محدد",
            style: "infoValue",
            alignment: "right",
            border: [true, true, true, true],
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
            border: [true, true, true, true],
          },
          {
            text: contractStartDateFormatted || "غير محدد",
            style: "infoValue",
            alignment: "right",
            border: [true, true, true, true],
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
              border: [true, true, true, true],
            },
            {
              text: contractStartDateFormatted || "غير محدد",
              style: "infoValue",
              alignment: "right",
              border: [true, true, true, true],
            },
          ],
          [
            {
              text: "تاريخ نهاية العقد:",
              style: "infoLabel",
              alignment: "right",
              border: [true, true, true, true],
            },
            {
              text: contractEndDateFormatted || "غير محدد",
              style: "infoValue",
              alignment: "right",
              border: [true, true, true, true],
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
          paddingLeft: () => 6,
          paddingRight: () => 6,
          paddingTop: (i) => (i === 0 ? 6 : 4),
          paddingBottom: (i) => (i === 0 ? 6 : 4),
          hLineWidth: () => 1,
          vLineWidth: () => 1,
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
        fontSize: 13,
        alignment: "right",
        margin: [40, 8, 40, 5],
        bold: true,
      });

      const salaryTableBody = [];

      // Helper to create a salary row with compact font
      const salaryRow = (label, value, isBold = false) => [
        {
          text: label,
          fontSize: 11,
          bold: true,
          color: "#000000",
          alignment: "right",
          border: [true, true, true, true],
        },
        {
          text: value,
          fontSize: 11,
          bold: isBold,
          color: "#000000",
          alignment: "right",
          border: [true, true, true, true],
        },
      ];

      // Add basic salary row if provided
      if (basicSalary) {
        salaryTableBody.push(salaryRow("الراتب الأساسي:", `﷼ ${basicSalary}`));
      }

      // Add housing allowance row if provided
      if (housingAllowance) {
        salaryTableBody.push(salaryRow("بدل السكن:", `﷼ ${housingAllowance}`));
      }

      // Add transportation allowance row if provided
      if (transportationAllowance) {
        salaryTableBody.push(salaryRow("بدل النقل:", `﷼ ${transportationAllowance}`));
      }

      // Add annual leave allowance row if provided
      if (annualLeaveAllowance) {
        salaryTableBody.push(salaryRow("بدل الإجازة السنوية:", `﷼ ${annualLeaveAllowance}`));
      }

      // Add end of service allowance row if provided
      if (endOfServiceAllowance) {
        salaryTableBody.push(salaryRow("بدل نهاية الخدمة:", `﷼ ${endOfServiceAllowance}`));
      }

      // Add other allowances row if provided
      if (otherAllowances) {
        salaryTableBody.push(salaryRow("بدلات أخرى:", `﷼ ${otherAllowances}`));
      }

      // Add total salary row
      salaryTableBody.push(salaryRow("الراتب الإجمالي:", employeeSalary ? `﷼ ${employeeSalary}` : "غير محدد", true));

      const salaryTable = {
        table: {
          widths: ["auto", "*"],
          body: salaryTableBody,
        },
        layout: {
          paddingLeft: () => 3,
          paddingRight: () => 3,
          paddingTop: () => 1,
          paddingBottom: () => 1,
          hLineWidth: () => 0.5,
          vLineWidth: () => 0.5,
          hLineColor: () => "#000000",
          vLineColor: () => "#000000",
        },
        margin: [40, 0, 40, 8],
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
      certificateTextContent = `نفيدكم نحن شركة الرعاية المتناهية للتأهيل بان ${mentionedBelow} اعلاه ${worksWord} لدينا وما زال على راس العمل وقد اعطي هذا التعريف بناء على ${hisHerRequestSpecialties} لغرض الحصول على تصنيف ${professionWithGender} ولا مانع لدينا من ذلك دون ادنى مسؤولية على الشركة .`;
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
    // Get today's date (Gregorian only) for header
    const today = new Date();
    const todayGregorian = formatDate(today.toISOString().split('T')[0]);

    // For specialties certificate, format date as dd/mm/yyyy
    let dateText;
    if (certificate_type === "specialties") {
      const todayFormattedEnglish = formatDateEnglish(
        today.toISOString().split("T")[0],
      ).replace(/-/g, "/");
      dateText = `التاريخ: ${todayFormattedEnglish}`;
    } else {
      dateText = `التاريخ: ${todayGregorian}`;
    }

    const certificateDocDefinition = {
      pageSize: "A4",
      pageMargins: [40, 50, 40, 120], // Increased top margin to accommodate header
      header: () => {
        // Random 6-digit number shown above the date on all certificates (per page render)
        const generatedNumber = Math.floor(100000 + Math.random() * 900000);

        // Build header lines with proper RTL ordering and spacing
        const headerLines = [
          { text: `الرقم: ${generatedNumber}`, alignment: "right", margin: [0, 0, 0, 2] },
          { text: dateText, alignment: "right" },
        ];

        if (certificate_type === "specialties") {
          headerLines.push({ text: "سعادة مدير / هيئة التخصصات الطبية", alignment: "right", margin: [0, 4, 0, 0] });
          headerLines.push({ text: "السلام عليكم ورحمة الله وبركاته", alignment: "right" });
        }

        return {
          stack: headerLines,
          alignment: "right",
          margin: [40, 10, 40, 0],
          fontSize: 10,
          color: "#000000",
        };
      },
      defaultStyle: {
        font: "Roboto",
        fontSize: 14,
        color: "black",
      },
      styles: {
        certificateTitle: {
          fontSize: 16,
          bold: true,
          alignment: "center",
        },
        certificateBody: {
          fontSize: 14,
          lineHeight: 1.6,
        },
        certificateClosing: {
          fontSize: 14,
        },
        infoLabel: {
          fontSize: 14,
          bold: true,
          color: "#000000",
        },
        infoValue: {
          fontSize: 14,
        },
        infoLabelBold: {
          fontSize: 14,
          bold: true,
          color: "#000000",
        },
        infoValueBold: {
          fontSize: 14,
          bold: true,
          color: "#000000",
        },
        sectionTitle: {
          fontSize: 16,
          bold: true,
          color: "#000000",
        },
      },
      content: certificateContent,
      // Ensure single page
      pageBreakBefore: () => false,
    };

    // Generate PDF with pdfmake
    let certificatePdfDoc;
    try {
      certificatePdfDoc = certificatePrinter.createPdfKitDocument(
        certificateDocDefinition,
      );
    } catch (error) {
      log.error("Error creating certificate PDF:", error);
      return handleRouteError(error, req, res, 'تعذر إنشاء ملف الشهادة، يرجى المحاولة لاحقًا');
    }
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
          log.warn("Error embedding background PNG:", error.message);
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
          log.warn("Error loading background PDF:", error.message);
          log.error("Full error:", error);
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
            log.warn(
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
            log.warn(
              "Error drawing background PDF on page:",
              error.message,
            );
            log.error("Full error:", error);
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
          log.warn("Error embedding content page:", error.message);
          log.error("Full error:", error);
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
    log.error("Certificate generation error:", error);
    if (!res.headersSent) {
      handleRouteError(error, req, res, 'فشل إنشاء الشهادة');
    }
  }
});

// ============================================================
// Employee Transfer & Multi-Branch Routes (Main Manager Only)
// ============================================================

// Transfer employee to another branch
router.put("/:id/transfer", async (req, res) => {
  try {
    // Only main managers can transfer
    if (req.user.role !== 'main_manager') {
      return res.status(403).json({ success: false, message: 'غير مصرح لك بنقل الموظفين' });
    }

    const { Employee } = await import("../models/Employee.js");
    const { Branch } = await import("../models/Branch.js");
    const employeeId = parseInt(req.params.id);
    const { target_branch_id } = req.body;

    if (!target_branch_id) {
      return res.status(400).json({ success: false, message: 'يجب تحديد الفرع المستهدف' });
    }

    // Check employee exists
    const employee = await Employee.findById(employeeId);
    if (!employee) {
      return res.status(404).json({ success: false, message: 'الموظف غير موجود' });
    }

    // Check target branch is active
    const targetBranch = await Branch.findById(parseInt(target_branch_id));
    if (!targetBranch) {
      return res.status(404).json({ success: false, message: 'الفرع المستهدف غير موجود أو محذوف' });
    }

    // Can't transfer to same branch
    if (employee.branch_id === parseInt(target_branch_id)) {
      return res.status(400).json({ success: false, message: 'الموظف موجود بالفعل في هذا الفرع' });
    }

    const updatedEmployee = await Employee.transferToBranch(
      employeeId,
      parseInt(target_branch_id),
      req.user.id
    );

    // Clear caches
    const { clearByPrefix } = await import("../utils/simpleCache.js");
    clearByPrefix(`dashboard:summary:${employee.branch_id}`);
    clearByPrefix(`dashboard:summary:${target_branch_id}`);
    clearByPrefix("branch-statistics");

    res.json({
      success: true,
      message: `تم نقل الموظف "${employee.first_name} ${employee.second_name}" إلى فرع "${targetBranch.branch_name}" بنجاح`,
      data: updatedEmployee
    });
  } catch (error) {
    log.error("Error transferring employee", { error: error.message });
    handleRouteError(error, req, res, 'فشل نقل الموظف');
  }
});

// Get all branches linked to an employee
router.get("/:id/branches", async (req, res) => {
  try {
    const { Employee } = await import("../models/Employee.js");
    const employeeId = parseInt(req.params.id);

    const employee = await Employee.findById(employeeId);
    if (!employee) {
      return res.status(404).json({ success: false, message: 'الموظف غير موجود' });
    }

    const branches = await Employee.getLinkedBranches(employeeId);

    res.json({
      success: true,
      data: branches
    });
  } catch (error) {
    log.error("Error getting employee branches", { error: error.message });
    handleRouteError(error, req, res, 'فشل جلب فروع الموظف');
  }
});

// Unlink employee from a secondary branch
router.delete("/:id/branches/:branchId", async (req, res) => {
  try {
    // Only main managers can unlink
    if (req.user.role !== 'main_manager') {
      return res.status(403).json({ success: false, message: 'غير مصرح لك بإلغاء ربط الموظفين' });
    }

    const { Employee } = await import("../models/Employee.js");
    const employeeId = parseInt(req.params.id);
    const branchId = parseInt(req.params.branchId); // policy-scope:allow-direct

    const employee = await Employee.findById(employeeId);
    if (!employee) {
      return res.status(404).json({ success: false, message: 'الموظف غير موجود' });
    }

    await Employee.unlinkFromBranch(employeeId, branchId);

    // Clear caches
    const { clearByPrefix } = await import("../utils/simpleCache.js");
    clearByPrefix(`dashboard:summary:${branchId}`);
    clearByPrefix("branch-statistics");

    res.json({
      success: true,
      message: 'تم إلغاء ربط الموظف بالفرع بنجاح'
    });
  } catch (error) {
    log.error("Error unlinking employee from branch", { error: error.message });
    const statusCode = error.message.includes('لا يمكن') || error.message.includes('غير مرتبط') ? 400 : 500;
    res.status(statusCode).json({ success: false, message: error.message });
  }
});

export default router;
