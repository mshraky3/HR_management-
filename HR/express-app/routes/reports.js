/**
 * Reports Routes
 * Generate PDF reports based on employee filters and selected fields
 */

import express from 'express';
import PdfPrinter from '@digicole/pdfmake-rtl';
import ExcelJS from 'exceljs';
import { authenticate } from '../middleware/auth.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
// Note: fs is still used for reading font files, but not for saving report files

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Create pdfmake RTL printer with fonts
// Check if Arabic font file exists, otherwise use Helvetica
const fontsDir = path.join(__dirname, '..', 'fonts');
// Try Noto Sans Arabic first (variable font or static)
const notoSansArabicDir = path.join(fontsDir, 'Noto_Sans_Arabic');
const notoSansArabicVariable = path.join(notoSansArabicDir, 'NotoSansArabic-VariableFont_wdth,wght.ttf');
const notoSansArabicStatic = path.join(notoSansArabicDir, 'static');
let arabicFontPath = null;

// Check for variable font first
if (fs.existsSync(notoSansArabicVariable)) {
  arabicFontPath = notoSansArabicVariable;
} else if (fs.existsSync(notoSansArabicStatic)) {
  // Try to find a regular weight font in static folder
  try {
    const staticFiles = fs.readdirSync(notoSansArabicStatic);
    const regularFont = staticFiles.find(f => f.includes('Regular') && f.endsWith('.ttf'));
    if (regularFont) {
      arabicFontPath = path.join(notoSansArabicStatic, regularFont);
    }
  } catch (e) {
    console.error('Error reading static fonts directory:', e);
  }
}

const hasArabicFont = arabicFontPath !== null && fs.existsSync(arabicFontPath);

let fonts;
if (hasArabicFont) {
  // Use Noto Sans Arabic font
  const notoSansStatic = path.join(notoSansArabicDir, 'static');
  const regularFont = path.join(notoSansStatic, 'NotoSansArabic-Regular.ttf');
  const boldFont = path.join(notoSansStatic, 'NotoSansArabic-Bold.ttf');
  const mediumFont = path.join(notoSansStatic, 'NotoSansArabic-Medium.ttf');
  
  // Use available fonts, fallback to regular if others don't exist
  fonts = {
    Roboto: {
      normal: fs.existsSync(regularFont) ? regularFont : arabicFontPath,
      bold: fs.existsSync(boldFont) ? boldFont : (fs.existsSync(mediumFont) ? mediumFont : arabicFontPath),
      italics: fs.existsSync(regularFont) ? regularFont : arabicFontPath,
      bolditalics: fs.existsSync(boldFont) ? boldFont : (fs.existsSync(mediumFont) ? mediumFont : arabicFontPath)
    },
    Nillima: {
      normal: fs.existsSync(regularFont) ? regularFont : arabicFontPath,
      bold: fs.existsSync(boldFont) ? boldFont : (fs.existsSync(mediumFont) ? mediumFont : arabicFontPath),
      italics: fs.existsSync(regularFont) ? regularFont : arabicFontPath,
      bolditalics: fs.existsSync(boldFont) ? boldFont : (fs.existsSync(mediumFont) ? mediumFont : arabicFontPath)
    }
  };
  
  console.log('Using Noto Sans Arabic font for PDF generation');
} else {
  // Fallback to Helvetica (limited Arabic support)
  fonts = {
    Roboto: {
      normal: 'Helvetica',
      bold: 'Helvetica-Bold',
      italics: 'Helvetica-Oblique',
      bolditalics: 'Helvetica-BoldOblique'
    },
    Nillima: {
      normal: 'Helvetica',
      bold: 'Helvetica-Bold',
      italics: 'Helvetica-Oblique',
      bolditalics: 'Helvetica-BoldOblique'
    }
  };
}

const printer = new PdfPrinter(fonts);

import { verifyBranchDocumentsPassword } from '../middleware/branchDocumentsPassword.js';
import { Employee } from '../models/Employee.js';
import { Branch } from '../models/Branch.js';
import sql from '../config/database.js';

const router = express.Router();

// Note: In serverless environments (like Vercel), we don't save files to disk
// Files are generated in memory and sent directly to the client

// All routes require authentication
router.use(authenticate);

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
 * Helper function to format date for display
 */
const formatDate = (date) => {
  if (!date) return '-';
  const d = new Date(date);
  return d.toLocaleDateString('ar-SA', { year: 'numeric', month: '2-digit', day: '2-digit' });
};

/**
 * Helper function to format currency
 */
const formatCurrency = (amount) => {
  if (amount === null || amount === undefined) return '-';
  return new Intl.NumberFormat('ar-SA', { 
    style: 'currency', 
    currency: 'SAR',
    minimumFractionDigits: 2 
  }).format(amount);
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
    years_of_experience_in_same_institution: 'سنوات الخبرة في نفس المؤسسة',
    years_of_experience_in_company: 'سنوات الخبرة في الشركة',
    salary: 'الراتب',
    base_salary: 'الراتب الأساسي',
    housing_allowance: 'بدل السكن',
    transportation_allowance: 'بدل المواصلات',
    end_of_service_allowance: 'بدل نهاية الخدمة',
    annual_leave_allowance: 'بدل الإجازة السنوية',
    other_allowances: 'بدلات أخرى',
    deductions: 'الخصومات',
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
      return branch ? branch.branch_name : employee.branch_id;
    case 'age':
      return calculateAge(employee.date_of_birth_gregorian) || '-';
    case 'id_type':
      return employee.id_type === 'citizen' ? 'مواطن' : 'مقيم';
    case 'gender':
      return employee.gender === 'male' ? 'ذكر' : 'أنثى';
    case 'date_of_birth_hijri':
    case 'date_of_birth_gregorian':
    case 'id_expiry_date_hijri':
    case 'id_expiry_date_gregorian':
    case 'passport_issue_date':
    case 'passport_expiry_date':
    case 'residency_issue_date':
      return formatDate(employee[field]);
    case 'salary':
    case 'base_salary':
    case 'housing_allowance':
    case 'transportation_allowance':
    case 'end_of_service_allowance':
    case 'annual_leave_allowance':
    case 'other_allowances':
    case 'deductions':
      return formatCurrency(employee[field]);
    case 'data_completion_status':
      return employee.data_completion_status === 'complete' ? 'مكتمل' : 'غير مكتمل';
    default:
      return employee[field] || '-';
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
        text: getFieldLabel(field),
        style: 'tableHeader',
        alignment: 'center'
      }));
      
      // Prepare table body rows
      const tableBody = employees.map(employee => {
        return selectedFields.map(field => {
          const value = getFieldValue(employee, field, branches);
          return {
            text: String(value || '-'),
            style: 'tableCell',
            alignment: 'center'
          };
        });
      });
      
      // Report date
      const reportDate = new Date().toLocaleDateString('ar-SA', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      });
      
      // Get branch count and names
      let branchInfoText = '';
      if (branchIds && branchIds.length > 0) {
        const selectedBranches = branches.filter(b => branchIds.includes(b.id));
        const branchNames = selectedBranches.map(b => b.branch_name).join('، ');
        branchInfoText = `عدد الفروع: ${branchIds.length}${branchIds.length > 1 ? ` (${branchNames})` : ''}`;
      }
      
      // Document definition with RTL support
      const docDefinition = {
        pageSize: 'A4',
        pageMargins: [40, 60, 40, 60],
        defaultStyle: {
          font: 'Roboto', // Use Roboto font (mapped to Arial Unicode MS)
          fontSize: 10,
          color: 'black'
          // Removed direction: 'rtl' temporarily to avoid font issues
        },
        styles: {
          title: {
            font: 'Roboto',
            fontSize: 18,
            bold: true,
            alignment: 'center',
            margin: [0, 0, 0, 20]
          },
          info: {
            font: 'Roboto',
            fontSize: 10,
            alignment: 'right',
            margin: [0, 0, 0, 10]
          },
          tableHeader: {
            font: 'Roboto',
            bold: true,
            fontSize: 9,
            color: 'black',
            fillColor: 'white',
            alignment: 'center'
          },
          tableCell: {
            font: 'Roboto',
            fontSize: 8,
            color: 'black',
            fillColor: 'white',
            alignment: 'center'
          }
        },
        content: [
          // Title
          {
            text: title,
            style: 'title'
          },
          // Report info
          {
            text: `عدد الموظفين: ${employees.length}`,
            style: 'info'
          },
          {
            text: `تاريخ التقرير: ${reportDate}`,
            style: 'info'
          },
          // Branch info (only if multiple branches or main manager)
          ...(branchInfoText ? [{
            text: branchInfoText,
            style: 'info',
            margin: [0, 0, 0, 20]
          }] : [{
            text: '',
            style: 'info',
            margin: [0, 0, 0, 20]
          }]),
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
router.post('/generate', verifyBranchDocumentsPassword, async (req, res) => {
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
    } else if (branch_ids && Array.isArray(branch_ids) && branch_ids.length > 0) {
      // Main manager with multiple branch selection
      branchIds = branch_ids.map(id => parseInt(id)).filter(id => !isNaN(id));
    } else {
      // Fallback to single branch_id for backward compatibility
      const branchId = req.query.branch_id || req.body.branch_id;
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
    
    if (employees.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'لا توجد موظفين ينطبق عليهم الفلاتر المحددة'
      });
    }
    
    // Generate file based on fileType
    if (fileType === 'excel') {
      // Generate Excel file
      const excelBuffer = await generateExcel(title, employees, selectedFields, allBranches, validBranchIds);
      
      // Return Excel directly as response (no file system write in serverless environment)
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(title)}.xlsx"`);
      res.send(excelBuffer);
    } else {
      // Generate PDF file (default)
      const pdfBuffer = await generatePDF(title, employees, selectedFields, allBranches, validBranchIds);
      
      // Return PDF directly as response (no file system write in serverless environment)
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(title)}.pdf"`);
      res.send(pdfBuffer);
    }
    
  } catch (error) {
    console.error('Error generating report:', error);
    res.status(500).json({
      success: false,
      message: 'فشل إنشاء التقرير',
      error: error.message
    });
  }
});

/**
 * GET /api/reports/preview/:filename
 * Preview a generated report
 * Note: In serverless environments, files are not saved, so this endpoint may not work as expected
 * Reports should be downloaded directly from the generate endpoint
 */
router.get('/preview/:filename', verifyBranchDocumentsPassword, async (req, res) => {
  try {
    // In serverless environments, files are not saved to disk
    // This endpoint is kept for backward compatibility but won't work in serverless deployments
    return res.status(404).json({
      success: false,
      message: 'التقرير غير موجود - في بيئة السيرفر، يجب تحميل التقرير مباشرة من صفحة الإنشاء'
    });
    
  } catch (error) {
    console.error('Error previewing report:', error);
    res.status(500).json({
      success: false,
      message: 'فشل عرض التقرير',
      error: error.message
    });
  }
});

export default router;
