/**
 * Reports Routes
 * Generate PDF reports based on employee filters and selected fields
 */

import express from 'express';
import ExcelJS from 'exceljs';
import { authenticate } from '../middleware/auth.js';
import { formatDate, gregorianToHijri as convertGregorianToHijri, formatHijriToString } from '../utils/dateConverter.js';
import { getScopedBranchFilter } from '../utils/policyScope.js';
import { printer } from '../utils/pdfFonts.js';

import { Employee } from '../models/Employee.js';
import { Branch } from '../models/Branch.js';
import sql from '../config/database.js';
import { handleRouteError } from '../utils/routeErrorHandler.js';
import { log } from '../utils/logger.js';

const router = express.Router();

// Note: In serverless environments (like Vercel), we don't save files to disk
// Files are generated in memory and sent directly to the client

// All routes require authentication
router.use(authenticate);

/**
 * Helper function to remove parentheses from text
 * Removes ( and ) characters from strings
 */
const removeParentheses = (text) => {
  if (!text || typeof text !== 'string') return text;
  return text.replace(/[()]/g, '');
};

/**
 * Helper function to calculate age from date of birth
 */
const calculateAge = (dateOfBirth) => {
  if (!dateOfBirth) return null;
  const birthDate = new Date(dateOfBirth);
  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
    age--;
  }
  return age;
};

/**
 * Days remaining until contract end (from Gregorian end date). Negative = expired.
 */
const calculateDaysRemaining = (endDate) => {
  if (!endDate) return null;
  const end = new Date(endDate);
  if (isNaN(end.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  end.setHours(0, 0, 0, 0);
  return Math.round((end - today) / (1000 * 60 * 60 * 24));
};

/**
 * Whether a days-remaining value falls in a given expiry bucket
 */
const matchesContractBucket = (daysRemaining, bucket) => {
  if (daysRemaining === null) return false;
  switch (bucket) {
    case 'expired': return daysRemaining < 0;
    case 'within_30': return daysRemaining >= 0 && daysRemaining <= 30;
    case 'within_60': return daysRemaining >= 31 && daysRemaining <= 60;
    case 'within_90': return daysRemaining >= 61 && daysRemaining <= 90;
    case 'over_90': return daysRemaining > 90;
    default: return false;
  }
};

/**
 * Filter employees by selected contract-expiry buckets (union of buckets)
 */
const filterByContractExpiry = (employees, buckets) => {
  if (!buckets || !Array.isArray(buckets) || buckets.length === 0) return employees;
  return employees.filter(emp => {
    const daysRemaining = calculateDaysRemaining(emp.contract_end_date_gregorian);
    return buckets.some(bucket => matchesContractBucket(daysRemaining, bucket));
  });
};

/**
 * Helper function to ensure numbers are in English (LTR)
 */
const formatNumberForPDF = (value) => {
  if (value === null || value === undefined || value === '') return '-';
  // Convert to string and ensure it's in English numerals
  const str = String(value);
  // Replace Arabic-Indic numerals with English numerals
  const arabicToEnglish = {
    '٠': '0', '١': '1', '٢': '2', '٣': '3', '٤': '4',
    '٥': '5', '٦': '6', '٧': '7', '٨': '8', '٩': '9'
  };
  return str.replace(/[٠-٩]/g, (d) => arabicToEnglish[d] || d);
};

/**
 * Helper function to convert Gregorian date to Hijri date (English numbers)
 * Returns date in format: dd/mm/yyyy
 * Uses centralized conversion algorithm from dateConverter.js
 */
const gregorianToHijri = (date) => {
  if (!date) return '-';

  // Use centralized conversion function
  const hijriDate = convertGregorianToHijri(date);
  if (!hijriDate) return '-';

  // Format as dd/mm/yyyy
  return formatHijriToString(hijriDate);
};

// Using unified formatDate function from dateConverter.js

/**
 * Helper function to format currency (English numbers)
 */
const formatCurrency = (amount) => {
  if (amount === null || amount === undefined) return '-';
  // Format with English numbers
  const formatted = new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(amount);
  return `${formatted} ريال`;
};

/**
 * Build SQL query with filters
 */
const buildEmployeeQuery = async (filters, branchIds) => {
  // Build query parts
  const conditions = ['is_active = true'];
  const params = [];
  let paramIndex = 1;

  // Branch filter - support single branch or multiple branches
  if (branchIds && branchIds.length > 0) {
    if (branchIds.length === 1) {
      conditions.push(`branch_id = $${paramIndex++}`);
      params.push(branchIds[0]);
    } else {
      const placeholders = branchIds.map(() => `$${paramIndex++}`).join(', ');
      conditions.push(`branch_id IN (${placeholders})`);
      params.push(...branchIds);
    }
  }

  // Helper function to add IN clause
  const addInClause = (field, values) => {
    if (Array.isArray(values) && values.length > 0) {
      const placeholders = values.map(() => `$${paramIndex++}`).join(', ');
      conditions.push(`${field} IN (${placeholders})`);
      params.push(...values);
    }
  };

  // Add filters
  addInClause('nationality', filters.nationality);
  addInClause('job_title', filters.job_title);
  addInClause('gender', filters.gender);
  addInClause('marital_status', filters.marital_status);
  addInClause('educational_qualification', filters.educational_qualification);
  addInClause('contract_type', filters.contract_type);
  addInClause('data_completion_status', filters.data_completion_status);

  // Build final query
  const whereClause = conditions.join(' AND ');
  const queryString = `SELECT * FROM employees WHERE ${whereClause} ORDER BY first_name, second_name, third_name, fourth_name`;

  return sql.unsafe(queryString, params);
};

/**
 * Filter employees by age
 */
const filterByAge = (employees, minAge, maxAge) => {
  if (!minAge && !maxAge) return employees;

  return employees.filter(emp => {
    const age = calculateAge(emp.date_of_birth_gregorian);
    if (age === null) return false;
    if (minAge && age < minAge) return false;
    if (maxAge && age > maxAge) return false;
    return true;
  });
};

/**
 * Get field label in Arabic
 */
const getFieldLabel = (field) => {
  const labels = {
    employee_id_number: 'رقم الموظف',
    first_name: 'الاسم الأول',
    second_name: 'الاسم الثاني',
    third_name: 'الاسم الثالث',
    fourth_name: 'الاسم الرابع',
    full_name: 'الاسم الكامل',
    branch_id: 'الفرع',
    occupation: 'المهنة',
    job_title: 'المسمى الوظيفي',
    nationality: 'الجنسية',
    date_of_birth_hijri: 'تاريخ الميلاد (هجري)',
    date_of_birth_gregorian: 'تاريخ الميلاد (ميلادي)',
    age: 'العمر',
    id_or_residency_number: 'رقم الهوية/الإقامة',
    id_type: 'نوع الهوية',
    gender: 'الجنس',
    id_expiry_date_hijri: 'تاريخ انتهاء الهوية (هجري)',
    id_expiry_date_gregorian: 'تاريخ انتهاء الهوية (ميلادي)',
    religion: 'الدين',
    marital_status: 'الحالة الاجتماعية',
    educational_qualification: 'المؤهل التعليمي',
    specialization: 'التخصص',
    bank_iban: 'الآيبان',
    bank_name: 'اسم البنك',
    email: 'البريد الإلكتروني',
    phone_number: 'رقم الهاتف',
    national_address: 'العنوان الوطني',
    contract_type: 'نوع العقد',
    contract_start_date_hijri: 'تاريخ بداية العقد (هجري)',
    contract_start_date_gregorian: 'تاريخ بداية العقد (ميلادي)',
    contract_end_date_hijri: 'تاريخ نهاية العقد (هجري)',
    contract_end_date_gregorian: 'تاريخ نهاية العقد (ميلادي)',
    contract_days_remaining: 'الأيام المتبقية للعقد',
    years_of_experience_in_same_institution: 'سنوات الخبرة في نفس المؤسسة',
    years_of_experience_in_company: 'سنوات الخبرة في الشركة',
    salary: 'الراتب',
    base_salary: 'الراتب الأساسي',
    housing_allowance: 'بدل السكن',
    transportation_allowance: 'بدل المواصلات',
    end_of_service_allowance: 'بدل نهاية الخدمة',
    annual_leave_allowance: 'بدل الإجازة السنوية',
    other_allowances: 'بدلات أخرى',
    graduation_year: 'سنة التخرج',
    university_gpa: 'المعدل التراكمي',
    passport_number: 'رقم الجواز',
    passport_issue_date: 'تاريخ إصدار الجواز',
    passport_expiry_date: 'تاريخ انتهاء الجواز',
    passport_issue_place: 'مكان إصدار الجواز',
    residency_issue_date: 'تاريخ إصدار الإقامة',
    data_completion_status: 'حالة إكمال البيانات'
  };
  return labels[field] || field;
};

/**
 * Get field value for display
 */
const getFieldValue = (employee, field, branches) => {
  switch (field) {
    case 'full_name':
      return `${employee.first_name || ''} ${employee.second_name || ''} ${employee.third_name || ''} ${employee.fourth_name || ''}`.trim();
    case 'branch_id':
      const branch = branches.find(b => b.id === employee.branch_id);
      return branch ? branch.branch_name : formatNumberForPDF(employee.branch_id);
    case 'age':
      return formatNumberForPDF(calculateAge(employee.date_of_birth_gregorian)) || '-';
    case 'contract_days_remaining': {
      const daysRemaining = calculateDaysRemaining(employee.contract_end_date_gregorian);
      if (daysRemaining === null) return '-';
      if (daysRemaining < 0) return 'منتهي';
      if (daysRemaining === 0) return 'ينتهي اليوم';
      return `${formatNumberForPDF(daysRemaining)} يوم متبقي`;
    }
    case 'id_type':
      return employee.id_type === 'citizen' ? 'مواطن' : 'مقيم';
    case 'gender':
      return employee.gender === 'male' ? 'ذكر' : 'أنثى';
    case 'date_of_birth_hijri':
      return employee.date_of_birth_hijri || '-';
    case 'date_of_birth_gregorian':
      return formatDate(employee.date_of_birth_gregorian);
    case 'id_expiry_date_hijri':
    case 'contract_start_date_hijri':
    case 'contract_end_date_hijri':
      return employee[field] || '-';
    case 'id_expiry_date_gregorian':
    case 'passport_issue_date':
    case 'passport_expiry_date':
    case 'residency_issue_date':
    case 'contract_start_date_gregorian':
    case 'contract_end_date_gregorian':
      return formatDate(employee[field]);
    case 'base_salary':
    case 'housing_allowance':
    case 'transportation_allowance':
    case 'end_of_service_allowance':
    case 'annual_leave_allowance':
    case 'other_allowances':
      return formatCurrency(employee[field]);
    case 'data_completion_status':
      return employee.data_completion_status === 'complete' ? 'مكتمل' : 'غير مكتمل';
    case 'employee_id_number':
    case 'id_or_residency_number':
    case 'phone_number':
    case 'bank_iban':
    case 'passport_number':
    case 'years_of_experience_in_same_institution':
    case 'years_of_experience_in_company':
    case 'graduation_year':
    case 'university_gpa':
      return formatNumberForPDF(employee[field]);
    default:
      const value = employee[field];
      // If it's a number, format it
      if (typeof value === 'number') {
        return formatNumberForPDF(value);
      }
      return value || '-';
  }
};

/**
 * Generate PDF report using pdfmake
 * Simple, clean design: black text on white background, clear black table borders
 * pdfmake supports Arabic text properly
 */
const generatePDF = async (title, employees, selectedFields, branches, branchIds) => {
  return new Promise((resolve, reject) => {
    try {
      // Prepare table header
      const tableHeader = selectedFields.map(field => ({
        text: removeParentheses(getFieldLabel(field)),
        style: 'tableHeader',
        alignment: 'center'
      }));

      // Prepare table body rows
      const tableBody = employees.map(employee => {
        return selectedFields.map(field => {
          const value = getFieldValue(employee, field, branches);
          const valueStr = removeParentheses(String(value || '-'));
          // Check if value contains numbers - if so, use LTR direction
          const hasNumbers = /\d/.test(valueStr);
          return {
            text: valueStr,
            style: 'tableCell',
            alignment: 'center',
            direction: hasNumbers ? 'ltr' : 'rtl',
            preserveLeadingSpaces: false
          };
        });
      });

      // Report date in Gregorian (English numbers)
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const reportDate = formatDate(today);

      // Document definition with RTL support
      const docDefinition = {
        pageSize: 'A4',
        pageOrientation: 'landscape',
        pageMargins: [40, 60, 40, 60],
        defaultStyle: {
          font: 'Roboto', // Use Roboto font (mapped to Arial Unicode MS)
          fontSize: 14,
          color: 'black'
          // Removed direction: 'rtl' temporarily to avoid font issues
        },
        styles: {
          title: {
            font: 'Roboto',
            fontSize: 16,
            bold: true,
            alignment: 'center',
            margin: [0, 0, 0, 20]
          },
          info: {
            font: 'Roboto',
            fontSize: 14,
            alignment: 'right',
            margin: [0, 0, 0, 10]
          },
          tableHeader: {
            font: 'Roboto',
            bold: true,
            fontSize: 14,
            color: 'black',
            fillColor: 'white',
            alignment: 'center'
          },
          tableCell: {
            font: 'Roboto',
            fontSize: 14,
            color: 'black',
            fillColor: 'white',
            alignment: 'center',
            preserveLeadingSpaces: false
          }
        },
        content: [
          // Title
          {
            text: removeParentheses(title),
            style: 'title'
          },
          // Report info
          {
            text: [
              { text: 'عدد الموظفين: ', direction: 'rtl' },
              { text: String(employees.length), direction: 'ltr' }
            ],
            style: 'info'
          },
          {
            text: [
              { text: 'تاريخ التقرير: ', direction: 'rtl' },
              { text: reportDate, direction: 'ltr' }
            ],
            style: 'info',
            margin: [0, 0, 0, 20]
          },
          // Table
          {
            table: {
              headerRows: 1,
              widths: Array(selectedFields.length).fill('*'),
              body: [
                tableHeader,
                ...tableBody
              ]
            },
            layout: {
              hLineWidth: function (i, node) {
                return 0.5; // Horizontal line width
              },
              vLineWidth: function (i, node) {
                return 0.5; // Vertical line width
              },
              hLineColor: function (i, node) {
                return 'black';
              },
              vLineColor: function (i, node) {
                return 'black';
              },
              paddingLeft: function (i, node) {
                return 5;
              },
              paddingRight: function (i, node) {
                return 5;
              },
              paddingTop: function (i, node) {
                return 5;
              },
              paddingBottom: function (i, node) {
                return 5;
              }
            }
          }
        ]
      };

      // Generate PDF using pdfMakeRTL printer
      const pdfDoc = printer.createPdfKitDocument(docDefinition);

      // Collect PDF chunks
      const chunks = [];
      pdfDoc.on('data', (chunk) => {
        chunks.push(chunk);
      });

      pdfDoc.on('end', () => {
        const buffer = Buffer.concat(chunks);
        resolve(buffer);
      });

      pdfDoc.on('error', (error) => {
        reject(error);
      });

      // Finalize PDF
      pdfDoc.end();

    } catch (error) {
      reject(error);
    }
  });
};

/**
 * Generate Excel report using ExcelJS
 * Full Arabic support with RTL direction
 * Simple format: headers and data only
 */
const generateExcel = async (title, employees, selectedFields, branches, branchIds) => {
  return new Promise(async (resolve, reject) => {
    try {
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('التقرير');

      // Set RTL direction for the entire worksheet
      worksheet.views = [{ rightToLeft: true }];

      // Add header row with full RTL support
      const headerRow = worksheet.addRow(selectedFields.map(field => getFieldLabel(field)));
      headerRow.font = { bold: true, size: 12, name: 'Arial' };
      headerRow.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFE0E0E0' }
      };
      headerRow.alignment = {
        horizontal: 'center',
        vertical: 'middle',
        wrapText: true,
        textDirection: 'right-to-left'
      };
      headerRow.border = {
        top: { style: 'thin' },
        left: { style: 'thin' },
        bottom: { style: 'thin' },
        right: { style: 'thin' }
      };

      // Set RTL for each header cell
      headerRow.eachCell({ includeEmpty: false }, (cell) => {
        cell.alignment = {
          horizontal: 'center',
          vertical: 'middle',
          wrapText: true,
          textDirection: 'right-to-left'
        };
        cell.font = { bold: true, size: 12, name: 'Arial' };
      });

      // Add data rows with RTL support
      employees.forEach(employee => {
        const row = worksheet.addRow(
          selectedFields.map(field => {
            const value = getFieldValue(employee, field, branches);
            return value !== null && value !== undefined ? String(value) : '-';
          })
        );
        row.alignment = {
          horizontal: 'center',
          vertical: 'middle',
          wrapText: true,
          textDirection: 'right-to-left'
        };
        row.border = {
          top: { style: 'thin' },
          left: { style: 'thin' },
          bottom: { style: 'thin' },
          right: { style: 'thin' }
        };

        // Set RTL for each data cell
        row.eachCell({ includeEmpty: false }, (cell) => {
          cell.alignment = {
            horizontal: 'center',
            vertical: 'middle',
            wrapText: true,
            textDirection: 'right-to-left'
          };
          cell.font = { name: 'Arial' };
        });
      });

      // Set column widths (adjust for Arabic text)
      selectedFields.forEach((field, index) => {
        const column = worksheet.getColumn(index + 1);
        column.width = 20;
        // Enable text wrapping for better Arabic display
        column.alignment = {
          wrapText: true,
          textDirection: 'right-to-left'
        };
      });

      // Set default font for the entire worksheet to support Arabic
      worksheet.properties.defaultRowHeight = 20;

      // Generate buffer
      const buffer = await workbook.xlsx.writeBuffer();
      resolve(buffer);

    } catch (error) {
      reject(error);
    }
  });
};

/**
 * POST /api/reports/generate
 * Generate a PDF or Excel report
 */
router.post('/generate', async (req, res) => {
  try {
    const { title, filters, selectedFields, branch_ids, fileType = 'pdf' } = req.body;

    // Validate required fields
    if (!title || !title.trim()) {
      return res.status(400).json({
        success: false,
        message: 'عنوان التقرير مطلوب'
      });
    }

    if (!selectedFields || !Array.isArray(selectedFields) || selectedFields.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'يجب اختيار حقل واحد على الأقل للعرض'
      });
    }

    // Get branch IDs - support multiple branches for main manager
    let branchIds = [];
    if (req.user.role === 'branch_manager') {
      // Branch manager can only access their own branch
      branchIds = [req.user.branch_id];
    } else if (req.user.role === 'branch_operations_manager') {
      // branch_operations_manager: only assigned branches
      const { UserBranchAssignment } = await import('../models/User.js');
      const assignedBranches = await UserBranchAssignment.getAssignedBranches(req.user.id);
      if (branch_ids && Array.isArray(branch_ids) && branch_ids.length > 0) {
        branchIds = branch_ids.map(id => parseInt(id)).filter(id => !isNaN(id) && assignedBranches.includes(id));
      } else {
        branchIds = assignedBranches;
      }
    } else if (branch_ids && Array.isArray(branch_ids) && branch_ids.length > 0) {
      // Main manager with multiple branch selection
      branchIds = branch_ids.map(id => parseInt(id)).filter(id => !isNaN(id));
    } else {
      // Fallback to single branch_id for backward compatibility
      const branchId = getScopedBranchFilter(req, { allowMultiple: false }) ?? req.body.branch_id; // policy-scope:allow-direct: POST body fallback for main_manager
      if (branchId) {
        branchIds = [parseInt(branchId)];
      }
    }

    if (branchIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'يجب تحديد فرع واحد على الأقل'
      });
    }

    // Verify all branches exist
    const allBranches = await Branch.findAll({ is_active: true });
    const validBranchIds = branchIds.filter(id => allBranches.some(b => b.id === id));

    if (validBranchIds.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'الفروع المحددة غير موجودة'
      });
    }

    // Build query and fetch employees
    const query = await buildEmployeeQuery(filters || {}, validBranchIds);
    let employees = await query;

    // Filter by age if specified
    if (filters?.min_age || filters?.max_age) {
      employees = filterByAge(employees, filters.min_age, filters.max_age);
    }

    // Filter by contract-expiry buckets if specified
    if (filters?.contract_expiry && Array.isArray(filters.contract_expiry) && filters.contract_expiry.length > 0) {
      employees = filterByContractExpiry(employees, filters.contract_expiry);
    }

    if (employees.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'لا توجد موظفين ينطبق عليهم الفلاتر المحددة'
      });
    }

    // Add branch_id field automatically if multiple branches and not already in selectedFields
    let finalSelectedFields = [...selectedFields];
    if (validBranchIds.length > 1 && !finalSelectedFields.includes('branch_id')) {
      finalSelectedFields.push('branch_id');
    }

    // Check if documents are selected
    const selectedDocuments = req.body.selectedDocuments || [];
    const hasDocuments = selectedDocuments && selectedDocuments.length > 0;

    // If documents are selected, force PDF and use document-based generation
    if (hasDocuments) {
      // Fetch documents for all employees
      // Performance Optimization: Fetch all employee documents in parallel instead of sequentially
      // This reduces time from 100 employees × 100ms = 10s to ~100ms (100x faster)
      const { Document } = await import('../models/Document.js');
      const documentsMap = {};

      const documentPromises = employees.map(async (employee) => {
        try {
          const allDocuments = await Document.findByEmployeeId(employee.id);
          // Filter by selected document types
          const filteredDocuments = allDocuments.filter(doc =>
            selectedDocuments.includes(doc.document_type)
          );
          return {
            employeeId: employee.id,
            documents: filteredDocuments || []
          };
        } catch (error) {
          log.warn(`Failed to fetch documents for employee ${employee.id}:`, error);
          // Return empty documents array if fetch fails
          return {
            employeeId: employee.id,
            documents: []
          };
        }
      });

      const documentResults = await Promise.all(documentPromises);
      documentResults.forEach(({ employeeId, documents }) => {
        documentsMap[employeeId] = {
          found: documents,
          selected: selectedDocuments
        };
      });

      // Import generateEmployeeFilePDF from employee-file
      const { generateEmployeeFilePDF } = await import('./employee-file.js');
      const pdfBuffer = await generateEmployeeFilePDF(title, employees, finalSelectedFields, allBranches, documentsMap, true); // true = isReport

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(title)}.pdf"`);
      res.send(pdfBuffer);
      return;
    }

    // Generate file based on fileType (no documents selected)
    if (fileType === 'excel') {
      // Generate Excel file
      const excelBuffer = await generateExcel(title, employees, finalSelectedFields, allBranches, validBranchIds);

      // Return Excel directly as response (no file system write in serverless environment)
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(title)}.xlsx"`);
      res.send(excelBuffer);
    } else {
      // Generate PDF file (default)
      const pdfBuffer = await generatePDF(title, employees, finalSelectedFields, allBranches, validBranchIds);

      // Return PDF directly as response (no file system write in serverless environment)
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(title)}.pdf"`);
      res.send(pdfBuffer);
    }

  } catch (error) {
    log.error('Error generating report:', error);
    if (!res.headersSent) {
      handleRouteError(error, req, res, 'فشل إنشاء التقرير');
    }
  }
});

/**
 * GET /api/reports/preview/:filename
 * Preview a generated report
 * Note: In serverless environments, files are not saved, so this endpoint may not work as expected
 * Reports should be downloaded directly from the generate endpoint
 */
router.get('/preview/:filename', async (req, res) => {
  try {
    // In serverless environments, files are not saved to disk
    // This endpoint is kept for backward compatibility but won't work in serverless deployments
    return res.status(404).json({
      success: false,
      message: 'التقرير غير موجود - في بيئة السيرفر، يجب تحميل التقرير مباشرة من صفحة الإنشاء'
    });

  } catch (error) {
    log.error('Error previewing report:', error);
    handleRouteError(error, req, res, 'فشل عرض التقرير');
  }
});

export default router;
