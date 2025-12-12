/**
 * Alert Generators
 * Functions to automatically generate alerts for various conditions
 */

import { Alert } from '../models/Alert.js';
import { AlertSettings } from '../models/AlertSettings.js';
import { Employee } from '../models/Employee.js';
import { Document } from '../models/Document.js';
import { BranchDocument } from '../models/BranchDocument.js';
import { checkEmployeeDataCompletion } from './employeeDataCompletion.js';
import { getBranchTypeRules } from './employeeRules.js';
import { isNonSaudi } from './employeeHelpers.js';
import sql from '../config/database.js';

// Helper function to get required branch documents
function getRequiredBranchDocuments(branchType) {
  const branchRules = getBranchTypeRules(branchType);
  if (!branchRules) return [];
  return branchRules.requiredDocuments || [];
}

/**
 * Helper function to parse Hijri date string (dd/mm/yyyy) to Date object
 * Returns null if invalid
 */
function parseHijriDate(hijriDateString) {
  if (!hijriDateString || typeof hijriDateString !== 'string') {
    return null;
  }

  try {
    const parts = hijriDateString.split('/');
    if (parts.length !== 3) return null;

    const day = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10);
    const year = parseInt(parts[2], 10);

    if (isNaN(day) || isNaN(month) || isNaN(year)) return null;

    // Convert Hijri to Gregorian (simplified - approximate conversion)
    // For more accurate conversion, we'd need a proper library
    // This is a rough approximation: 1 Hijri year ≈ 0.97 Gregorian years
    const gregorianYear = Math.floor(year * 0.97 + 622);
    const daysInMonth = [30, 29, 30, 29, 30, 29, 30, 29, 30, 29, 30, 29];
    const approximateDays = (year - 1) * 354 + (month - 1) * 29.5 + day;
    const gregorianDays = approximateDays * 1.03; // Approximate conversion
    const baseDate = new Date(622, 6, 16); // Hijri epoch
    const resultDate = new Date(baseDate.getTime() + gregorianDays * 24 * 60 * 60 * 1000);

    return resultDate;
  } catch (error) {
    console.error('Error parsing Hijri date:', error);
    return null;
  }
}

/**
 * Calculate days until expiry
 */
function daysUntilExpiry(expiryDate) {
  if (!expiryDate) return null;

  const expiry = expiryDate instanceof Date ? expiryDate : new Date(expiryDate);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  expiry.setHours(0, 0, 0, 0);

  const diffTime = expiry - today;
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  return diffDays;
}

/**
 * Generate alerts for ID expiry
 * Checks employees with expiring IDs within specified days
 */
export async function generateIdExpiryAlerts(daysBefore = 30) {
  try {
    const alerts = [];

    // Get all active employees
    const employees = await Employee.findAll({
      is_active: true,
      status: 'active'
    });

    for (const employee of employees) {
      // Skip Saudi employees (IDs don't expire)
      if (!isNonSaudi(employee.nationality)) {
        continue;
      }

      // Check expiry date (prefer Gregorian, fallback to Hijri)
      let expiryDate = null;
      if (employee.id_expiry_date_gregorian) {
        expiryDate = new Date(employee.id_expiry_date_gregorian);
      } else if (employee.id_expiry_date_hijri) {
        expiryDate = parseHijriDate(employee.id_expiry_date_hijri);
      }

      if (!expiryDate || isNaN(expiryDate.getTime())) {
        continue;
      }

      const daysUntil = daysUntilExpiry(expiryDate);

      // Generate alert if expiring within specified days
      if (daysUntil !== null && daysUntil <= daysBefore && daysUntil >= 0) {
        let priority = 'medium';
        if (daysUntil <= 7) {
          priority = 'critical';
        } else if (daysUntil <= 15) {
          priority = 'high';
        }

        const title = daysUntil === 0
          ? `انتهت هوية/إقامة موظف: ${employee.first_name} ${employee.second_name} ${employee.third_name} ${employee.fourth_name}`
          : `تنتهي هوية/إقامة موظف خلال ${daysUntil} يوم: ${employee.first_name} ${employee.second_name} ${employee.third_name} ${employee.fourth_name}`;

        const message = daysUntil === 0
          ? `انتهت هوية/إقامة الموظف ${employee.first_name} ${employee.second_name} ${employee.third_name} ${employee.fourth_name} (${employee.employee_id_number}) في ${employee.id_expiry_date_gregorian || employee.id_expiry_date_hijri}. يرجى تجديدها فوراً.`
          : `تنتهي هوية/إقامة الموظف ${employee.first_name} ${employee.second_name} ${employee.third_name} ${employee.fourth_name} (${employee.employee_id_number}) خلال ${daysUntil} يوم. تاريخ الانتهاء: ${employee.id_expiry_date_gregorian || employee.id_expiry_date_hijri}.`;

        // Check user settings for this branch
        const { User } = await import('../models/User.js');
        const branchManager = await User.findAll({ branch_id: employee.branch_id, role: 'branch_manager', is_active: true });
        const shouldNotify = branchManager.length > 0 && await checkUserAlertPreference(branchManager[0].id, 'id_expiry_enabled');

        if (shouldNotify) {
          const alertData = {
            alert_type: 'id_expiry',
            priority: priority,
            title: title,
            message: message,
            branch_id: employee.branch_id,
            employee_id: employee.id,
            related_entity_type: 'employee',
            related_entity_id: employee.id,
            alert_data: {
              employee_id_number: employee.employee_id_number,
              id_or_residency_number: employee.id_or_residency_number,
              expiry_date: employee.id_expiry_date_gregorian || employee.id_expiry_date_hijri,
              days_until_expiry: daysUntil
            },
            expires_at: new Date(expiryDate.getTime() + 30 * 24 * 60 * 60 * 1000) // Expire 30 days after ID expiry
          };

          // Use findOrCreate to prevent duplicates
          const alert = await Alert.findOrCreate(alertData);
          alerts.push(alert);
        }
      }
    }

    return alerts;
  } catch (error) {
    console.error('Error generating ID expiry alerts:', error);
    throw error;
  }
}

/**
 * Generate alerts for missing documents
 */
export async function generateMissingDocumentAlerts() {
  try {
    const alerts = [];

    // Get all active branches
    const { Branch } = await import('../models/Branch.js');
    const branches = await Branch.findAll({ is_active: true });

    for (const branch of branches) {
      // Get required documents for this branch type
      const requiredDocs = getRequiredBranchDocuments(branch.branch_type);

      // Get existing branch documents
      const existingDocs = await BranchDocument.findAll({
        branch_id: branch.id,
        is_active: true
      });

      const existingDocTypes = existingDocs.map(doc => doc.document_type);
      const missingDocTypes = requiredDocs.filter(docType => !existingDocTypes.includes(docType));

      if (missingDocTypes.length > 0) {
        const docTypeLabels = {
          license: 'الترخيص',
          permit: 'التصريح',
          insurance: 'التأمين',
          contract: 'العقد',
          rental_contract: 'عقد الإيجار',
          certification: 'الشهادة',
          registration: 'السجل التجاري'
        };

        const missingDocsList = missingDocTypes.map(docType => 
          docTypeLabels[docType] || docType
        ).join('، ');

        // Check user settings
        const { User } = await import('../models/User.js');
        const branchManager = await User.findAll({ branch_id: branch.id, role: 'branch_manager', is_active: true });
        const shouldNotify = branchManager.length > 0 && await checkUserAlertPreference(branchManager[0].id, 'missing_document_enabled');

        if (shouldNotify) {
          const alertData = {
            alert_type: 'missing_document',
            priority: 'high',
            title: `مستندات مفقودة في ${branch.branch_name}`,
            message: `يوجد ${missingDocTypes.length} مستند مطلوب مفقود في الفرع ${branch.branch_name}: ${missingDocsList}`,
            branch_id: branch.id,
            related_entity_type: 'branch',
            related_entity_id: branch.id,
            alert_data: {
              branch_name: branch.branch_name,
              missing_document_types: missingDocTypes,
              branch_type: branch.branch_type
            }
          };

          const alert = await Alert.findOrCreate(alertData);
          alerts.push(alert);
        }
      }
    }

    return alerts;
  } catch (error) {
    console.error('Error generating missing document alerts:', error);
    throw error;
  }
}

/**
 * Generate alerts for incomplete employee data
 */
export async function generateIncompleteDataAlerts() {
  try {
    const alerts = [];

    // Get all active employees with incomplete data
    const employees = await Employee.findAll({
      is_active: true,
      status: 'active',
      data_completion_status: 'incomplete'
    });

    // Group by branch
    const employeesByBranch = {};
    for (const employee of employees) {
      if (!employeesByBranch[employee.branch_id]) {
        employeesByBranch[employee.branch_id] = [];
      }
      employeesByBranch[employee.branch_id].push(employee);
    }

    // Generate alerts per branch
    for (const [branchId, branchEmployees] of Object.entries(employeesByBranch)) {
      if (branchEmployees.length === 0) continue;

      // Check user settings
      const { User } = await import('../models/User.js');
      const branchManager = await User.findAll({ branch_id: parseInt(branchId), role: 'branch_manager', is_active: true });
      const shouldNotify = branchManager.length > 0 && await checkUserAlertPreference(branchManager[0].id, 'incomplete_data_enabled');

      if (shouldNotify) {
        const { Branch } = await import('../models/Branch.js');
        const branch = await Branch.findById(parseInt(branchId));

        const alertData = {
          alert_type: 'incomplete_data',
          priority: branchEmployees.length > 10 ? 'high' : 'medium',
          title: `${branchEmployees.length} موظف غير مكتملي البيانات في ${branch?.branch_name || 'فرع غير محدد'}`,
          message: `يوجد ${branchEmployees.length} موظف ببيانات غير مكتملة في الفرع ${branch?.branch_name || 'غير محدد'}. يرجى مراجعة وإكمال بياناتهم.`,
          branch_id: parseInt(branchId),
          related_entity_type: 'branch',
          related_entity_id: parseInt(branchId),
          alert_data: {
            branch_name: branch?.branch_name,
            incomplete_employees_count: branchEmployees.length,
            employee_ids: branchEmployees.map(e => e.id)
          }
        };

        const alert = await Alert.findOrCreate(alertData);
        alerts.push(alert);
      }
    }

    return alerts;
  } catch (error) {
    console.error('Error generating incomplete data alerts:', error);
    throw error;
  }
}

/**
 * Check if user has alert preference enabled
 */
async function checkUserAlertPreference(userId, preferenceKey) {
  try {
    const settings = await AlertSettings.getOrCreateDefault(userId);
    return settings[preferenceKey] !== false; // Default to true if not set
  } catch (error) {
    console.error('Error checking user alert preference:', error);
    return true; // Default to enabled on error
  }
}

/**
 * Run all alert generators
 */
export async function generateAllAlerts() {
  try {
    console.log('Starting alert generation...');

    // Get default settings (30 days for ID expiry)
    const defaultSettings = await AlertSettings.getOrCreateDefault(1); // Use first user as default, or implement global settings
    const daysBefore = defaultSettings?.id_expiry_days_before || 30;

    const results = {
      idExpiry: [],
      missingDocuments: [],
      incompleteData: []
    };

    // Generate all alert types
    results.idExpiry = await generateIdExpiryAlerts(daysBefore);
    results.missingDocuments = await generateMissingDocumentAlerts();
    results.incompleteData = await generateIncompleteDataAlerts();

    const totalAlerts = results.idExpiry.length + results.missingDocuments.length + results.incompleteData.length;

    console.log(`Alert generation completed: ${totalAlerts} alerts created`);
    console.log(`  - ID Expiry: ${results.idExpiry.length}`);
    console.log(`  - Missing Documents: ${results.missingDocuments.length}`);
    console.log(`  - Incomplete Data: ${results.incompleteData.length}`);

    return results;
  } catch (error) {
    console.error('Error generating all alerts:', error);
    throw error;
  }
}


