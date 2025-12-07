/**
 * Employee File Routes
 * Generate employee files with documents - Main Manager only
 */

import express from 'express';
import PdfPrinter from '@digicole/pdfmake-rtl';
import { authenticate } from '../middleware/auth.js';
import { requireMainManager, requireManager } from '../middleware/authorization.js';
import { verifyBranchDocumentsPassword } from '../middleware/branchDocumentsPassword.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { fetchFromBlob } from '../utils/blobStorage.js';
import { PDFDocument } from 'pdf-lib';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Create pdfmake RTL printer with fonts (same as reports)
const fontsDir = path.join(__dirname, '..', 'fonts');
const notoSansArabicDir = path.join(fontsDir, 'Noto_Sans_Arabic');
const notoSansArabicVariable = path.join(notoSansArabicDir, 'NotoSansArabic-VariableFont_wdth,wght.ttf');
const notoSansArabicStatic = path.join(notoSansArabicDir, 'static');
let arabicFontPath = null;

if (fs.existsSync(notoSansArabicVariable)) {
  arabicFontPath = notoSansArabicVariable;
} else if (fs.existsSync(notoSansArabicStatic)) {
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
  
  // Using Noto Sans Arabic font for PDF generation
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

import { Employee } from '../models/Employee.js';
import { Document } from '../models/Document.js';
import { Branch } from '../models/Branch.js';
import sql from '../config/database.js';

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
 * Helper function to convert Gregorian date to Hijri date
 * Returns date in format: dd/mm/yyyy (English numbers)
 * Uses accurate conversion algorithm
 */
const gregorianToHijri = (date) => {
  if (!date) return '-';
  
  const d = new Date(date);
  const year = d.getFullYear();
  const month = d.getMonth() + 1;
  const day = d.getDate();
  
  // Convert Gregorian to Julian Day Number
  let jd;
  if (year > 1582 || (year === 1582 && month > 10) || (year === 1582 && month === 10 && day > 14)) {
    // Gregorian calendar
    const a = Math.floor((14 - month) / 12);
    const y = year + 4800 - a;
    const m = month + 12 * a - 3;
    jd = day + Math.floor((153 * m + 2) / 5) + 365 * y + Math.floor(y / 4) - Math.floor(y / 100) + Math.floor(y / 400) - 32045;
  } else {
    // Julian calendar
    const a = Math.floor((14 - month) / 12);
    const y = year + 4800 - a;
    const m = month + 12 * a - 3;
    jd = day + Math.floor((153 * m + 2) / 5) + 365 * y + Math.floor(y / 4) - 32083;
  }
  
  // Convert Julian Day Number to Hijri
  // Hijri epoch: July 16, 622 CE = Julian Day 1948439.5
  const hijriEpoch = 1948439.5;
  const daysSinceEpoch = jd - hijriEpoch;
  
  // Calculate Hijri year using accurate formula
  // Average Hijri year = 354.36667 days
  const hijriYear = Math.floor((daysSinceEpoch - 1) / 354.36667) + 1;
  
  // Calculate days from start of Hijri year
  const yearStartDays = Math.floor((hijriYear - 1) * 354) + Math.floor((11 * (hijriYear - 1) + 3) / 30);
  let daysFromYearStart = daysSinceEpoch - yearStartDays;
  
  // Ensure positive days
  if (daysFromYearStart < 0) {
    daysFromYearStart = 0;
  }
  
  // Determine if it's a leap year (11 leap years in 30-year cycle)
  const cycleYear = (hijriYear - 1) % 30;
  const leapYears = [2, 5, 7, 10, 13, 16, 18, 21, 24, 26, 29];
  const isLeapYear = leapYears.includes(cycleYear);
  
  // Hijri month lengths (standard pattern)
  const monthLengths = [30, 29, 30, 29, 30, 29, 30, 29, 30, 29, 30, 29];
  if (isLeapYear) {
    monthLengths[11] = 30; // Last month is 30 days in leap year
  }
  
  // Find the month
  let hijriMonth = 1;
  let daysRemaining = daysFromYearStart;
  
  for (let i = 0; i < 12; i++) {
    if (daysRemaining < monthLengths[i]) {
      hijriMonth = i + 1;
      break;
    }
    daysRemaining -= monthLengths[i];
  }
  
  // Calculate Hijri day
  let hijriDay = Math.floor(daysRemaining) + 1;
  
  // Validate and adjust if needed
  if (hijriDay < 1) hijriDay = 1;
  if (hijriDay > monthLengths[hijriMonth - 1]) {
    hijriDay = monthLengths[hijriMonth - 1];
  }
  if (hijriMonth < 1) hijriMonth = 1;
  if (hijriMonth > 12) hijriMonth = 12;
  if (hijriYear < 1 || hijriYear > 1500) {
    // Fallback: return today's date in Gregorian format
    const today = new Date();
    const d = String(today.getDate()).padStart(2, '0');
    const m = String(today.getMonth() + 1).padStart(2, '0');
    const y = today.getFullYear();
    return `${d}/${m}/${y}`;
  }
  
  // Format as dd/mm/yyyy (English numbers)
  const formattedDay = String(hijriDay).padStart(2, '0');
  const formattedMonth = String(hijriMonth).padStart(2, '0');
  const formattedYear = String(hijriYear);
  
  return `${formattedDay}/${formattedMonth}/${formattedYear}`;
};

/**
 * Helper function to format date for display (day/month/year only, no time)
 */
const formatDate = (date) => {
  if (!date) return '-';
  // Handle string dates (YYYY-MM-DD format)
  let d;
  if (typeof date === 'string') {
    // If it's a date string, parse it
    if (date.includes('T')) {
      // Remove time part if present
      d = new Date(date.split('T')[0]);
    } else {
      d = new Date(date);
    }
  } else {
    d = new Date(date);
  }
  
  // Format as DD/MM/YYYY (English numbers)
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  
  return `${day}/${month}/${year}`;
};

/**
 * Get document type label in Arabic
 */
const getDocumentTypeLabel = (documentType) => {
  const labels = {
    'id_or_residency': 'الهوية/الإقامة',
    'direct_letter': 'خطاب مباشرة',
    'bank_iban': 'مستند الآيبان',
    'primary_qualification': 'المؤهل الأساسي',
    'employment_contract': 'عقد العمل',
    'additional_courses': 'الدورات الإضافية',
    'passport': 'جواز السفر',
    'professional_license': 'الترخيص المهني',
    'experience_certificate': 'شهادة الخبرة',
    'classification': 'شهادة التصنيف',
    'speech_therapy_course': 'دورة علاج النطق',
    'speech_therapy_70_hours_course': 'دورة 70 ساعة في التخاطب',
    'physical_therapy_course': 'دورة العلاج الطبيعي',
    'therapy_40_hours_course': 'دورة 40 ساعة',
    'medical_disclosure_form': 'نموذج افصاح طبي'
  };
  return labels[documentType] || documentType;
};

/**
 * Helper function to format currency
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
    case 'id_type':
      return employee.id_type === 'citizen' ? 'مواطن' : 'مقيم';
    case 'gender':
      return employee.gender === 'male' ? 'ذكر' : 'أنثى';
    case 'date_of_birth_hijri':
      return employee.date_of_birth_hijri || '-';
    case 'date_of_birth_gregorian':
      // Format date of birth as DD/MM/YYYY (day/month/year only)
      return formatDate(employee.date_of_birth_gregorian);
    case 'id_expiry_date_hijri':
      return employee[field] || '-';
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
 * Merge PDF documents into main PDF
 */
const mergePdfDocuments = async (mainPdfBuffer, documentFilesMap, documentsMap, employees) => {
  try {
    // Load main PDF
    const mainPdf = await PDFDocument.load(mainPdfBuffer);
    
    // Handle both old format (array) and new format (object with found/selected)
    const normalizeDocumentsMap = (map) => {
      const normalized = {};
      for (const [employeeId, value] of Object.entries(map)) {
        if (Array.isArray(value)) {
          normalized[employeeId] = { found: value, selected: [] };
        } else {
          normalized[employeeId] = value;
        }
      }
      return normalized;
    };
    
    const normalizedMap = normalizeDocumentsMap(documentsMap);
    
    // For each employee, merge their PDF documents directly after their section
    // Since we can't know exactly where each employee's section ends in the merged PDF,
    // we'll merge all PDFs in order: employee 1 section, employee 1 PDFs, employee 2 section, employee 2 PDFs, etc.
    for (const employee of employees) {
      const employeeData = normalizedMap[employee.id] || { found: [], selected: [] };
      const employeeDocuments = employeeData.found || [];
      
      // Merge PDF documents for this employee
      for (const doc of employeeDocuments) {
        const docFileData = documentFilesMap[doc.id];
        
        // Only merge PDF files
        if (docFileData && docFileData.mimeType === 'application/pdf') {
          try {
            // Load the PDF document
            const pdfToMerge = await PDFDocument.load(docFileData.buffer);
            
            // Copy all pages from the PDF to the main PDF
            const pages = await mainPdf.copyPages(pdfToMerge, pdfToMerge.getPageIndices());
            
            // Add each page to the main PDF
            pages.forEach((page) => {
              mainPdf.addPage(page);
            });
            
          } catch (error) {
            console.error(`Error merging PDF document ${doc.id}:`, error);
            // Continue with other documents even if one fails
          }
        }
      }
    }
    
    // Save the merged PDF
    const mergedPdfBytes = await mainPdf.save();
    return Buffer.from(mergedPdfBytes);
  } catch (error) {
    console.error('Error in mergePdfDocuments:', error);
    throw error;
  }
};

/**
 * Load document file and convert to base64
 */
const loadDocumentFile = async (document) => {
  try {
    let fileBuffer;
    
    // If file_path is a URL (Blob Storage)
    if (document.file_path && (document.file_path.startsWith('http://') || document.file_path.startsWith('https://'))) {
      const result = await fetchFromBlob(document.file_path);
      fileBuffer = result.buffer;
    } else {
      // Local file path
      let filePath;
      if (path.isAbsolute(document.file_path)) {
        filePath = document.file_path;
      } else {
        let relativePath = document.file_path;
        if (relativePath.startsWith('express-app/')) {
          relativePath = relativePath.replace(/^express-app\//, '');
        }
        filePath = path.join(__dirname, '..', relativePath);
      }
      
      if (!fs.existsSync(filePath)) {
        const altPath = document.file_path.replace(/^express-app\//, '');
        const altFilePath = path.join(__dirname, '..', altPath);
        filePath = fs.existsSync(altFilePath) ? altFilePath : filePath;
      }
      
      if (!fs.existsSync(filePath)) {
        throw new Error(`File not found: ${document.file_path}`);
      }
      
      fileBuffer = fs.readFileSync(filePath);
    }
    
    // Convert to base64
    const base64 = fileBuffer.toString('base64');
    const mimeType = document.mime_type || 'application/octet-stream';
    
    return {
      base64: base64, // Raw base64 without data URI prefix (pdfmake needs raw base64)
      base64DataUri: `data:${mimeType};base64,${base64}`, // Full data URI for reference
      mimeType: mimeType,
      buffer: fileBuffer
    };
  } catch (error) {
    console.error(`Error loading document file ${document.id}:`, error);
    throw error;
  }
};

/**
 * Generate Employee File PDF
 * Exported for use in reports
 * @param {boolean} isReport - If true, show missing documents message for reports
 */
export const generateEmployeeFilePDF = async (title, employees, selectedFields, branches, documentsMap, isReport = false) => {
  try {
    // Load all document files and convert to base64
    const documentFilesMap = {}; // Map of document_id -> {base64, mimeType, buffer}
    
    // Handle both old format (array) and new format (object with found/selected)
    const normalizeDocumentsMap = (map) => {
      const normalized = {};
      for (const [employeeId, value] of Object.entries(map)) {
        if (Array.isArray(value)) {
          normalized[employeeId] = { found: value, selected: [] };
        } else {
          normalized[employeeId] = value;
        }
      }
      return normalized;
    };
    
    const normalizedMap = normalizeDocumentsMap(documentsMap);
    
    // Load all document files and convert to base64
    for (const employee of employees) {
      const employeeData = normalizedMap[employee.id] || { found: [], selected: [] };
      const employeeDocuments = employeeData.found || [];
      
      for (const doc of employeeDocuments) {
        try {
          const fileData = await loadDocumentFile(doc);
          documentFilesMap[doc.id] = fileData;
        } catch (error) {
          console.error(`Failed to load document ${doc.id}:`, error.message);
          // Continue with other documents even if one fails
        }
      }
    }
    
    // Helper function to create PDF for a single employee
    const createEmployeePdf = async (employee, employeeIndex, isFirst) => {
      return new Promise((resolve, reject) => {
        try {
          const employeeData = normalizedMap[employee.id] || { found: [], selected: [] };
          const employeeDocuments = employeeData.found || [];
          const selectedDocTypes = employeeData.selected || [];
          
          const employeeFullName = `${employee.first_name || ''} ${employee.second_name || ''} ${employee.third_name || ''} ${employee.fourth_name || ''}`.trim();
          
          // Report date in Gregorian (today's date)
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          const reportDate = formatDate(today);
          
          // Register images for this employee
          const employeeImages = {};
          for (const doc of employeeDocuments) {
            const docFileData = documentFilesMap[doc.id];
            if (docFileData && docFileData.mimeType.startsWith('image/')) {
              const imageKey = `doc_${doc.id}`;
              employeeImages[imageKey] = docFileData.base64DataUri;
            }
          }
          
          const employeeContent = [];
          
          // Title and info at the top of each employee section
          if (!isFirst) {
            employeeContent.push({ text: '', pageBreak: 'before' });
          }
          
          employeeContent.push({
            text: removeParentheses(title),
            style: 'title',
            margin: [0, 0, 0, 10]
          });
          
          employeeContent.push({
            text: [
              { text: 'تاريخ الملف: ', direction: 'rtl' },
              { text: reportDate, direction: 'ltr' }
            ],
            style: 'info'
          });
          
          employeeContent.push({
            text: `الموظف: ${removeParentheses(employeeFullName)}`,
            style: 'employeeHeader',
            margin: [0, 0, 0, 15]
          });
          
          // Employee data table
          const employeeDataRows = [];
          selectedFields.forEach(field => {
            const label = removeParentheses(getFieldLabel(field));
            const value = getFieldValue(employee, field, branches);
            const valueStr = removeParentheses(String(value || '-'));
            const hasNumbers = /\d/.test(valueStr);
            employeeDataRows.push([
              { text: label, style: 'dataLabel', alignment: 'right' },
              { 
                text: valueStr, 
                style: 'dataValue', 
                alignment: 'right',
                direction: hasNumbers ? 'ltr' : 'rtl',
                preserveLeadingSpaces: false
              }
            ]);
          });
          
          employeeContent.push({
            table: {
              widths: ['*', '*'],
              body: employeeDataRows
            },
            layout: {
              hLineWidth: (i, node) => 0.5,
              vLineWidth: (i, node) => 0.5,
              hLineColor: () => 'black',
              vLineColor: () => 'black',
              paddingLeft: () => 5,
              paddingRight: () => 5,
              paddingTop: () => 5,
              paddingBottom: () => 5
            },
            margin: [0, 0, 0, 20]
          });
          
          // Employee documents
          employeeContent.push({
            text: 'المستندات:',
            style: 'sectionHeader',
            margin: [0, 20, 0, 10]
          });
          
          // If this is a report, show all selected document types (including missing ones)
          if (isReport && selectedDocTypes.length > 0) {
            const foundDocTypes = employeeDocuments.map(doc => doc.document_type);
            
            for (const docType of selectedDocTypes) {
              const doc = employeeDocuments.find(d => d.document_type === docType);
              
              if (!doc) {
                employeeContent.push({
                  text: removeParentheses(`${getDocumentTypeLabel(docType)}: غير متواجد لدى الموظف`),
                  style: 'documentItem',
                  color: '#d32f2f',
                  margin: [0, 0, 0, 10]
                });
                continue;
              }
              
              const docFileData = documentFilesMap[doc.id];
              
              employeeContent.push({
                text: removeParentheses(`${getDocumentTypeLabel(doc.document_type) || 'مستند'} - ${doc.filename || doc.file_name || 'بدون اسم'}`),
                style: 'documentItem',
                margin: [0, 0, 0, 5]
              });
              
              if (doc.description) {
                employeeContent.push({
                  text: removeParentheses(`الوصف: ${doc.description || ''}`),
                  style: 'documentDescription',
                  margin: [0, 0, 0, 5]
                });
              }
              
              if (doc.expiry_date) {
                const expiryDate = formatDate(doc.expiry_date);
                employeeContent.push({
                  text: `تاريخ الانتهاء: ${expiryDate}`,
                  style: 'documentDescription',
                  margin: [0, 0, 0, 10]
                });
              }
              
              // Embed document file (only images, PDFs will be merged separately)
              if (docFileData) {
                const mimeType = docFileData.mimeType;
                
                if (mimeType.startsWith('image/')) {
                  try {
                    const imageKey = `doc_${doc.id}`;
                    if (imageKey in employeeImages) {
                      employeeContent.push({
                        image: imageKey,
                        width: 500,
                        alignment: 'center',
                        margin: [0, 10, 0, 20],
                        fit: [500, 700]
                      });
                    } else {
                      employeeContent.push({
                        image: docFileData.base64DataUri,
                        width: 500,
                        alignment: 'center',
                        margin: [0, 10, 0, 20],
                        fit: [500, 700]
                      });
                    }
                  } catch (error) {
                    console.error(`Error embedding image for document ${doc.id}:`, error);
                    try {
                      employeeContent.push({
                        image: docFileData.base64DataUri,
                        width: 500,
                        alignment: 'center',
                        margin: [0, 10, 0, 20],
                        fit: [500, 700]
                      });
                    } catch (fallbackError) {
                      employeeContent.push({
                        text: removeParentheses(`[خطأ في تحميل الصورة: ${doc.filename || doc.file_name}]`),
                        style: 'documentDescription',
                        margin: [0, 10, 0, 20]
                      });
                    }
                  }
                } else if (mimeType !== 'application/pdf') {
                  employeeContent.push({
                    text: removeParentheses(`[نوع الملف: ${mimeType} - لا يمكن إدراج هذا النوع من الملفات مباشرة]`),
                    style: 'documentDescription',
                    margin: [0, 10, 0, 20],
                    color: '#666'
                  });
                }
              } else {
                employeeContent.push({
                  text: removeParentheses(`[تعذر تحميل الملف: ${doc.filename || doc.file_name}]`),
                  style: 'documentDescription',
                  margin: [0, 10, 0, 20],
                  color: '#999'
                });
              }
            }
          } else {
            // Not a report or no selected types - show all documents
            if (employeeDocuments.length > 0) {
              for (const doc of employeeDocuments) {
                const docFileData = documentFilesMap[doc.id];
                
                employeeContent.push({
                  text: removeParentheses(`${getDocumentTypeLabel(doc.document_type) || 'مستند'} - ${doc.filename || doc.file_name || 'بدون اسم'}`),
                  style: 'documentItem',
                  margin: [0, 0, 0, 5]
                });
                
                if (doc.description) {
                  employeeContent.push({
                    text: removeParentheses(`الوصف: ${doc.description || ''}`),
                    style: 'documentDescription',
                    margin: [0, 0, 0, 5]
                  });
                }
                
                if (doc.expiry_date) {
                  const expiryDate = formatDate(doc.expiry_date);
                  employeeContent.push({
                    text: `تاريخ الانتهاء: ${expiryDate}`,
                    style: 'documentDescription',
                    margin: [0, 0, 0, 10]
                  });
                }
                
                // Embed document file (only images, PDFs will be merged separately)
                if (docFileData) {
                  const mimeType = docFileData.mimeType;
                  
                  if (mimeType.startsWith('image/')) {
                    try {
                      const imageKey = `doc_${doc.id}`;
                      if (imageKey in employeeImages) {
                        employeeContent.push({
                          image: imageKey,
                          width: 500,
                          alignment: 'center',
                          margin: [0, 10, 0, 20],
                          fit: [500, 700]
                        });
                      } else {
                        employeeContent.push({
                          image: docFileData.base64DataUri,
                          width: 500,
                          alignment: 'center',
                          margin: [0, 10, 0, 20],
                          fit: [500, 700]
                        });
                      }
                    } catch (error) {
                      console.error(`Error embedding image for document ${doc.id}:`, error);
                      try {
                        employeeContent.push({
                          image: docFileData.base64DataUri,
                          width: 500,
                          alignment: 'center',
                          margin: [0, 10, 0, 20],
                          fit: [500, 700]
                        });
                      } catch (fallbackError) {
                        employeeContent.push({
                          text: removeParentheses(`[خطأ في تحميل الصورة: ${doc.filename || doc.file_name}]`),
                          style: 'documentDescription',
                          margin: [0, 10, 0, 20]
                        });
                      }
                    }
                  } else if (mimeType !== 'application/pdf') {
                    employeeContent.push({
                      text: removeParentheses(`[نوع الملف: ${mimeType} - لا يمكن إدراج هذا النوع من الملفات مباشرة]`),
                      style: 'documentDescription',
                      margin: [0, 10, 0, 20],
                      color: '#666'
                    });
                  }
                } else {
                  employeeContent.push({
                    text: removeParentheses(`[تعذر تحميل الملف: ${doc.filename || doc.file_name}]`),
                    style: 'documentDescription',
                    margin: [0, 10, 0, 20],
                    color: '#999'
                  });
                }
              }
            } else {
              employeeContent.push({
                text: 'لا توجد مستندات',
                style: 'documentItem',
                margin: [0, 20, 0, 20]
              });
            }
          }
          
          const employeeDocDefinition = {
            pageSize: 'A4',
            pageMargins: [40, 60, 40, 60],
            images: employeeImages,
            defaultStyle: {
              font: 'Roboto',
              fontSize: 10,
              color: 'black'
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
              employeeHeader: {
                font: 'Roboto',
                fontSize: 14,
                bold: true,
                alignment: 'right'
              },
              sectionHeader: {
                font: 'Roboto',
                fontSize: 12,
                bold: true,
                alignment: 'right'
              },
              dataLabel: {
                font: 'Roboto',
                fontSize: 9,
                bold: true,
                color: 'black',
                fillColor: '#f0f0f0'
              },
              dataValue: {
                font: 'Roboto',
                fontSize: 9,
                color: 'black',
                preserveLeadingSpaces: false
              },
              documentItem: {
                font: 'Roboto',
                fontSize: 9,
                alignment: 'right'
              },
              documentDescription: {
                font: 'Roboto',
                fontSize: 8,
                alignment: 'right',
                color: '#666'
              }
            },
            content: employeeContent
          };
          
          const employeePdfDoc = printer.createPdfKitDocument(employeeDocDefinition);
          const chunks = [];
          
          employeePdfDoc.on('data', (chunk) => {
            chunks.push(chunk);
          });
          
          employeePdfDoc.on('end', () => {
            const buffer = Buffer.concat(chunks);
            resolve(buffer);
          });
          
          employeePdfDoc.on('error', (error) => {
            reject(error);
          });
          
          employeePdfDoc.end();
        } catch (error) {
          reject(error);
        }
      });
    };
    
    // Helper function to merge PDF documents in order
    const mergePdfDocuments = async (headerPdfBuffer) => {
      try {
        // Load header PDF (title and info only, if needed)
        const finalPdf = await PDFDocument.load(headerPdfBuffer);
        
        // For each employee, create their PDF and merge it, then merge their PDF documents
        for (let i = 0; i < employees.length; i++) {
          const employee = employees[i];
          const isFirst = i === 0;
          
          try {
            // Create PDF for this employee
            const employeePdfBuffer = await createEmployeePdf(employee, i, isFirst);
            const employeePdf = await PDFDocument.load(employeePdfBuffer);
            
            // Copy all pages from employee PDF to final PDF
            const pages = await finalPdf.copyPages(employeePdf, employeePdf.getPageIndices());
            pages.forEach((page) => {
              finalPdf.addPage(page);
            });
            
            // Merge PDF documents for this employee
            const employeeData = normalizedMap[employee.id] || { found: [], selected: [] };
            const employeeDocuments = employeeData.found || [];
            
            for (const doc of employeeDocuments) {
              const docFileData = documentFilesMap[doc.id];
              if (docFileData && docFileData.mimeType === 'application/pdf') {
                try {
                  const pdfToMerge = await PDFDocument.load(docFileData.buffer);
                  const pdfPages = await finalPdf.copyPages(pdfToMerge, pdfToMerge.getPageIndices());
                  pdfPages.forEach((page) => {
                    finalPdf.addPage(page);
                  });
                } catch (error) {
                  console.error(`Error merging PDF document ${doc.id}:`, error);
                }
              }
            }
          } catch (error) {
            console.error(`Error creating PDF for employee ${employee.id}:`, error);
            // Continue with other employees even if one fails
          }
        }
        
        // Save the merged PDF
        const mergedPdfBytes = await finalPdf.save();
        return Buffer.from(mergedPdfBytes);
      } catch (error) {
        console.error('Error in mergePdfDocuments:', error);
        throw error;
      }
    };
    
    return new Promise((resolve, reject) => {
      try {
        // Create a minimal header PDF (or use first employee's PDF as header)
        // For simplicity, we'll create an empty PDF as header and merge employees
        const headerContent = [];
        
        const headerDocDefinition = {
          pageSize: 'A4',
          pageMargins: [40, 60, 40, 60],
          images: {},
          defaultStyle: {
            font: 'Roboto',
            fontSize: 10,
            color: 'black'
          },
          styles: {},
          content: headerContent
        };
        
        const headerPdfDoc = printer.createPdfKitDocument(headerDocDefinition);
        const chunks = [];
        
        headerPdfDoc.on('data', (chunk) => {
          chunks.push(chunk);
        });
        
        headerPdfDoc.on('end', async () => {
          try {
            const headerPdfBuffer = Buffer.concat(chunks);
            
            // Merge all employee PDFs and their PDF documents
            const finalPdfBuffer = await mergePdfDocuments(headerPdfBuffer);
            
            resolve(finalPdfBuffer);
          } catch (mergeError) {
            console.error('Error merging PDFs:', mergeError);
            reject(mergeError);
          }
        });
        
        headerPdfDoc.on('error', (error) => {
          reject(error);
        });
        
        headerPdfDoc.end();
        
      } catch (error) {
        reject(error);
      }
    });
  } catch (error) {
    return Promise.reject(error);
  }
};

/**
 * POST /api/employee-file/generate-single/:employee_id
 * Generate employee file PDF for a single employee
 * Requires password for branch managers, not for main managers
 * Available for both main_manager and branch_manager
 */
router.post('/generate-single/:employee_id', requireManager, verifyBranchDocumentsPassword, async (req, res) => {
  try {
    const employeeId = parseInt(req.params.employee_id);
    
    if (isNaN(employeeId)) {
      return res.status(400).json({
        success: false,
        message: 'معرف الموظف غير صحيح'
      });
    }
    
    // Fetch employee
    const employee = await Employee.findById(employeeId);
    if (!employee) {
      return res.status(404).json({
        success: false,
        message: 'الموظف غير موجود'
      });
    }
    
    // Check access - branch managers can only access their own branch employees
    if (req.user?.role === 'branch_manager' && req.user.branch_id !== employee.branch_id) {
      return res.status(403).json({
        success: false,
        message: 'غير مصرح لك بالوصول إلى بيانات هذا الموظف'
      });
    }
    
    // Fetch all branches for display
    const allBranches = await Branch.findAll({ is_active: true });
    
    // Fetch all documents for the employee
    const documents = await Document.findByEmployeeId(employee.id);
    const documentsMap = { [employee.id]: documents || [] };
    
    // Default selected fields - all available fields
    const selectedFields = [
      'employee_id_number', 'first_name', 'second_name', 'third_name', 'fourth_name',
      'occupation', 'nationality', 'date_of_birth_hijri', 'date_of_birth_gregorian',
      'id_or_residency_number', 'id_type', 'gender', 'id_expiry_date_hijri', 'id_expiry_date_gregorian',
      'religion', 'marital_status', 'educational_qualification', 'specialization',
      'bank_iban', 'bank_name', 'email', 'phone_number', 'national_address', 'contract_type',
      'years_of_experience_in_same_institution', 'salary', 'base_salary', 'housing_allowance',
      'transportation_allowance', 'end_of_service_allowance', 'annual_leave_allowance',
      'other_allowances', 'deductions', 'graduation_year', 'university_gpa',
      'passport_number', 'passport_issue_date', 'passport_expiry_date', 'passport_issue_place',
      'residency_issue_date', 'job_title'
    ];
    
    // Generate title
    const title = `ملف موظف - ${employee.first_name} ${employee.second_name} ${employee.third_name} ${employee.fourth_name}`;
    
    // Generate PDF
    const pdfBuffer = await generateEmployeeFilePDF(title, [employee], selectedFields, allBranches, documentsMap);
    
    // Return PDF directly as response
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(title)}.pdf"`);
    res.send(pdfBuffer);
    
  } catch (error) {
    console.error('Error generating employee file:', error);
    if (!res.headersSent) {
      res.status(500).json({
        success: false,
        message: 'فشل إنشاء الملف',
        error: error.message
      });
    }
  }
});

/**
 * POST /api/employee-file/generate
 * Generate employee file PDF
 * Main manager only
 */
router.post('/generate', requireMainManager, async (req, res) => {
  try {
    const { title, employee_ids, selectedFields, selected_documents } = req.body;
    
    // Validate required fields
    if (!title || !title.trim()) {
      return res.status(400).json({
        success: false,
        message: 'عنوان الملف مطلوب'
      });
    }
    
    if (!employee_ids || !Array.isArray(employee_ids) || employee_ids.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'يجب اختيار موظف واحد على الأقل'
      });
    }
    
    if (!selectedFields || !Array.isArray(selectedFields) || selectedFields.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'يجب اختيار حقل واحد على الأقل للعرض'
      });
    }
    
    // Fetch employees
    const validEmployeeIds = employee_ids.map(id => parseInt(id)).filter(id => !isNaN(id));
    const employees = [];
    
    for (const employeeId of validEmployeeIds) {
      const employee = await Employee.findById(employeeId);
      if (employee && employee.is_active) {
        employees.push(employee);
      }
    }
    
    if (employees.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'لم يتم العثور على موظفين صالحين'
      });
    }
    
    // Fetch all branches for display
    const allBranches = await Branch.findAll({ is_active: true });
    
    // Fetch selected documents for all employees
    const documentsMap = {};
    for (const employee of employees) {
      const selectedDocIds = selected_documents && selected_documents[employee.id] 
        ? selected_documents[employee.id].map(id => parseInt(id)).filter(id => !isNaN(id))
        : [];
      
      if (selectedDocIds.length > 0) {
        // Fetch only selected documents
        const allDocuments = await Document.findByEmployeeId(employee.id);
        const selectedDocuments = allDocuments.filter(doc => selectedDocIds.includes(doc.id));
        documentsMap[employee.id] = selectedDocuments || [];
      } else {
        // If no documents selected, use all documents (backward compatibility)
        const documents = await Document.findByEmployeeId(employee.id);
        documentsMap[employee.id] = documents || [];
      }
    }
    
    // Generate PDF
    const pdfBuffer = await generateEmployeeFilePDF(title, employees, selectedFields, allBranches, documentsMap);
    
    // Return PDF directly as response (no file system write in serverless environment)
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(title)}.pdf"`);
    res.send(pdfBuffer);
    
  } catch (error) {
    console.error('Error generating employee file:', error);
    if (!res.headersSent) {
      res.status(500).json({
        success: false,
        message: 'فشل إنشاء الملف',
        error: error.message
      });
    }
  }
});

export default router;

