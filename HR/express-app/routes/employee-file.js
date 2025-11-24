/**
 * Employee File Routes
 * Generate employee files with documents - Main Manager only
 */

import express from 'express';
import PdfPrinter from '@digicole/pdfmake-rtl';
import { authenticate } from '../middleware/auth.js';
import { requireMainManager } from '../middleware/authorization.js';
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

// Directory for storing generated files
const FILES_DIR = path.join(__dirname, '..', 'storage', 'reports');

if (!fs.existsSync(FILES_DIR)) {
  fs.mkdirSync(FILES_DIR, { recursive: true });
}

// All routes require authentication and main manager
router.use(authenticate);
router.use(requireMainManager);

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
 * Merge PDF documents into main PDF
 */
const mergePdfDocuments = async (mainPdfBuffer, documentFilesMap, documentsMap, employees) => {
  try {
    // Load main PDF
    const mainPdf = await PDFDocument.load(mainPdfBuffer);
    
    // For each employee, merge their PDF documents
    for (const employee of employees) {
      const employeeDocuments = documentsMap[employee.id] || [];
      
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
 */
const generateEmployeeFilePDF = async (title, employees, selectedFields, branches, documentsMap) => {
  try {
    // Load all document files and convert to base64
    const documentFilesMap = {}; // Map of document_id -> {base64, mimeType, buffer}
    
      // Load all document files and convert to base64
    for (const employee of employees) {
      const employeeDocuments = documentsMap[employee.id] || [];
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
    
    return new Promise((resolve, reject) => {
      try {
        // Report date
      const reportDate = new Date().toLocaleDateString('ar-SA', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      });
      
      // Get first names of selected employees
      const firstNames = employees.map(e => e.first_name || '-').join('، ');
      
      // Build content array
      const content = [];
      
      // First page: Title, Date, Count, First Names
      content.push(
        {
          text: title,
          style: 'title',
          pageBreak: 'after'
        },
        {
          text: `تاريخ الملف: ${reportDate}`,
          style: 'info'
        },
        {
          text: `عدد الموظفين: ${employees.length}`,
          style: 'info'
        },
        {
          text: `الأسماء الأولى: ${firstNames}`,
          style: 'info',
          margin: [0, 0, 0, 30]
        }
      );
      
      // Add each employee's data and documents
      employees.forEach((employee, index) => {
        // Note: Using forEach here is fine since we're not using await inside
        const employeeFullName = `${employee.first_name || ''} ${employee.second_name || ''} ${employee.third_name || ''} ${employee.fourth_name || ''}`.trim();
        
        // Employee header
        if (index > 0) {
          content.push({ text: '', pageBreak: 'before' });
        }
        
        content.push({
          text: `الموظف: ${employeeFullName}`,
          style: 'employeeHeader',
          margin: [0, 0, 0, 15]
        });
        
        // Employee data table
        const employeeDataRows = [];
        selectedFields.forEach(field => {
          const label = getFieldLabel(field);
          const value = getFieldValue(employee, field, branches);
          employeeDataRows.push([
            { text: label, style: 'dataLabel', alignment: 'right' },
            { text: String(value || '-'), style: 'dataValue', alignment: 'right' }
          ]);
        });
        
        content.push({
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
        const employeeDocuments = documentsMap[employee.id] || [];
        if (employeeDocuments.length > 0) {
          content.push({
            text: 'المستندات:',
            style: 'sectionHeader',
            margin: [0, 20, 0, 10]
          });
          
          for (const doc of employeeDocuments) {
            const docFileData = documentFilesMap[doc.id];
            
            // Document header with type and name
            content.push({
              text: `${doc.document_type || 'مستند'} - ${doc.filename || doc.file_name || 'بدون اسم'}`,
              style: 'documentItem',
              margin: [0, 0, 0, 5]
            });
            
            if (doc.description) {
              content.push({
                text: `الوصف: ${doc.description}`,
                style: 'documentDescription',
                margin: [0, 0, 0, 5]
              });
            }
            
            if (doc.expiry_date) {
              const expiryDate = formatDate(doc.expiry_date);
              content.push({
                text: `تاريخ الانتهاء: ${expiryDate}`,
                style: 'documentDescription',
                margin: [0, 0, 0, 10]
              });
            }
            
            // Embed document file
            if (docFileData) {
              const mimeType = docFileData.mimeType;
              
              // Check if it's an image
              if (mimeType.startsWith('image/')) {
                try {
                  // Use registered image name from images object
                  const imageKey = `doc_${doc.id}`;
                  content.push({
                    image: imageKey, // Reference to registered image
                    width: 500,
                    alignment: 'center',
                    margin: [0, 10, 0, 20],
                    fit: [500, 700] // Max width 500, max height 700
                  });
                } catch (error) {
                  console.error(`Error embedding image for document ${doc.id}:`, error);
                  // Fallback: try using data URI directly
                  try {
                    content.push({
                      image: docFileData.base64DataUri, // Use full data URI as fallback
                      width: 500,
                      alignment: 'center',
                      margin: [0, 10, 0, 20],
                      fit: [500, 700]
                    });
                  } catch (fallbackError) {
                    console.error(`Fallback also failed for document ${doc.id}:`, fallbackError);
                    content.push({
                      text: `[خطأ في تحميل الصورة: ${doc.filename || doc.file_name}]`,
                      style: 'documentDescription',
                      margin: [0, 10, 0, 20]
                    });
                  }
                }
              } 
              // Check if it's a PDF
              else if (mimeType === 'application/pdf') {
                // PDFs will be merged after PDF generation
                // Add a note that PDF will be included
                content.push({
                  text: `[مستند PDF: ${doc.filename || doc.file_name} - سيتم إدراج المستند في نهاية التقرير]`,
                  style: 'documentDescription',
                  margin: [0, 10, 0, 20],
                  color: '#666'
                });
              }
              // Other file types
              else {
                content.push({
                  text: `[نوع الملف: ${mimeType} - لا يمكن إدراج هذا النوع من الملفات مباشرة]`,
                  style: 'documentDescription',
                  margin: [0, 10, 0, 20],
                  color: '#666'
                });
              }
            } else {
              content.push({
                text: `[تعذر تحميل الملف: ${doc.filename || doc.file_name}]`,
                style: 'documentDescription',
                margin: [0, 10, 0, 20],
                color: '#999'
              });
            }
          }
        } else {
          content.push({
            text: 'لا توجد مستندات',
            style: 'documentItem',
            margin: [0, 20, 0, 20]
          });
        }
      });
      
      // Register images in docDefinition.images
      const images = {};
      for (const [docId, fileData] of Object.entries(documentFilesMap)) {
        if (fileData.mimeType.startsWith('image/')) {
          images[`doc_${docId}`] = fileData.base64DataUri; // Use data URI for images
        }
      }
      
      // Document definition
      const docDefinition = {
        pageSize: 'A4',
        pageMargins: [40, 60, 40, 60],
        images: images, // Register images
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
            color: 'black'
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
        content: content
      };
      
      // Generate PDF
      const pdfDoc = printer.createPdfKitDocument(docDefinition);
      
      const chunks = [];
      pdfDoc.on('data', (chunk) => {
        chunks.push(chunk);
      });
      
      pdfDoc.on('end', async () => {
        try {
          const mainPdfBuffer = Buffer.concat(chunks);
          
          // Merge PDF documents into main PDF
          const finalPdfBuffer = await mergePdfDocuments(mainPdfBuffer, documentFilesMap, documentsMap, employees);
          
          resolve(finalPdfBuffer);
        } catch (mergeError) {
          console.error('Error merging PDFs, using main PDF only:', mergeError);
          // If merging fails, return main PDF without merged documents
          const buffer = Buffer.concat(chunks);
          resolve(buffer);
        }
      });
      
      pdfDoc.on('error', (error) => {
        reject(error);
      });
      
      pdfDoc.end();
      
      } catch (error) {
        reject(error);
      }
    });
  } catch (error) {
    return Promise.reject(error);
  }
};

/**
 * POST /api/employee-file/generate
 * Generate employee file PDF
 */
router.post('/generate', async (req, res) => {
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
    
    // Save PDF to file
    const timestamp = Date.now();
    const filename = `employee_file_${timestamp}.pdf`;
    const filepath = path.join(FILES_DIR, filename);
    
    fs.writeFileSync(filepath, pdfBuffer);
    
    // Return PDF as response
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(title)}.pdf"`);
    res.send(pdfBuffer);
    
    // Clean up old files (older than 24 hours)
    setTimeout(() => {
      try {
        const files = fs.readdirSync(FILES_DIR);
        const now = Date.now();
        files.forEach(file => {
          const filePath = path.join(FILES_DIR, file);
          const stats = fs.statSync(filePath);
          if (now - stats.mtimeMs > 24 * 60 * 60 * 1000) {
            fs.unlinkSync(filePath);
          }
        });
      } catch (error) {
        console.error('Error cleaning up old files:', error);
      }
    }, 0);
    
  } catch (error) {
    console.error('Error generating employee file:', error);
    res.status(500).json({
      success: false,
      message: 'فشل إنشاء الملف',
      error: error.message
    });
  }
});

export default router;

