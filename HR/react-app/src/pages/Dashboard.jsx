/**
 * Dashboard Page
 * Overview of all tables and statistics
 */

import { useState, useEffect, useMemo, useCallback, memo } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useNotification } from '../contexts/NotificationContext';
import { branchesAPI, employeesAPI, usersAPI, branchDocumentsAPI, notificationsAPI, branchStatisticsAPI, alertsAPI, clearCache } from '../utils/api';
import { 
  getRequiredBranchDocuments, 
  getBranchTypeLabel,
  getMonthlyRequiredBranchDocuments,
  isMonthlyBranchDocument
} from '../utils/employeeHelpers';
import { getBranchTypeRules } from '../utils/employeeRules';
import { DATA_COMPLETION_STATUS } from '../utils/employeeConstants';
import './Dashboard.css';

const Dashboard = () => {
  const { user, isMainManager } = useAuth();
  const { showError, showSuccess, showWarning } = useNotification();
  const [branches, setBranches] = useState([]);
  const [stats, setStats] = useState({
    branches: 0,
    employees: 0,
    users: 0,
    documents: 0,
    notifications: 0,
    loading: true,
  });
  const [monthlyDocumentAlerts, setMonthlyDocumentAlerts] = useState([]);
  const [incompleteEmployees, setIncompleteEmployees] = useState([]);
  const [missingBranchDocumentAlerts, setMissingBranchDocumentAlerts] = useState([]);
  const [missingBranchDocumentAlertsWithExpiry, setMissingBranchDocumentAlertsWithExpiry] = useState([]);
  const [missingBranchDocumentAlertsWithoutExpiry, setMissingBranchDocumentAlertsWithoutExpiry] = useState([]);
  const [documentsWithExpiry, setDocumentsWithExpiry] = useState([]);
  const [documentsWithoutExpiry, setDocumentsWithoutExpiry] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [respondingTo, setRespondingTo] = useState(null);
  const [responseStatus, setResponseStatus] = useState('');
  const [responseMessage, setResponseMessage] = useState('');
  const [pendingEmployees, setPendingEmployees] = useState([]);
  const [processingRenewal, setProcessingRenewal] = useState(null);
  const [showNonRenewalForm, setShowNonRenewalForm] = useState(null);
  const [nonRenewalData, setNonRenewalData] = useState({ status: '', reason: '' });
  const [branchStats, setBranchStats] = useState(null);
  const [loadingStats, setLoadingStats] = useState(false);
  const [mainManagerNotifications, setMainManagerNotifications] = useState([]);
  const [newResponsesCount, setNewResponsesCount] = useState(0);
  const [branchInfo, setBranchInfo] = useState(null);
  const [progressData, setProgressData] = useState({
    employeesCompletion: 0,
    branchDocumentsCompletion: 0,
    alertsResolved: 0,
    overallProgress: 0
  });

  useEffect(() => {
    loadStats();
  }, []);

  const loadStats = async () => {
    try {
      // Clear cache to ensure fresh data (especially completion status)
      clearCache('/api/employees');
      clearCache('/api/branch-statistics');
      
      // Build filters based on user role
      const branchFilters = { is_active: true };
      const employeeFilters = { is_active: true };
      const documentFilters = {};

      // Branch managers only see their branch data
      if (!isMainManager() && user?.branch_id) {
        branchFilters.id = user.branch_id;
        employeeFilters.branch_id = user.branch_id;
        documentFilters.branch_id = user.branch_id;
      }

      // Performance Optimization: Batch all parallel API calls together
      // This reduces total loading time by making all requests simultaneously
      const apiPromises = [
        branchesAPI.getAll(branchFilters),
        employeesAPI.getAll(employeeFilters),
        branchDocumentsAPI.getAll(documentFilters).catch(() => ({ data: { data: [] } })),
      ];

      // Add role-specific API calls to batch
      if (!isMainManager() && user?.branch_id) {
        // Branch manager specific calls
        apiPromises.push(
          branchesAPI.getById(user.branch_id).catch(() => ({ data: { success: false } })),
          notificationsAPI.getMyBranchNotifications().catch(() => ({ data: { success: false, data: [] } }))
        );
      } else if (isMainManager()) {
        // Main manager specific calls
        apiPromises.push(
          branchStatisticsAPI.getAll().catch(() => ({ data: { success: false } })),
          notificationsAPI.getAll().catch(() => ({ data: { success: false, data: [] } })),
          usersAPI.getAll({ is_active: true }).catch(() => ({ data: { success: false, data: [] } }))
        );
      }

      // Execute all API calls in parallel
      const results = await Promise.all(apiPromises);

      // Extract results
      const branchesRes = results[0];
      const employeesRes = results[1];
      const documentsRes = results[2];

      // Store branches for display
      const branchesList = branchesRes.data.success ? (branchesRes.data.data || []) : [];
      setBranches(branchesList);

      // Process role-specific results
      if (!isMainManager() && user?.branch_id) {
        // Branch manager results
        const branchInfoRes = results[3];
        const notificationsRes = results[4];

        if (branchInfoRes?.data?.success) {
          setBranchInfo(branchInfoRes.data.data);
        } else {
          setBranchInfo(null);
        }

        if (notificationsRes?.data?.success) {
          setNotifications(notificationsRes.data.data || []);
        } else {
          setNotifications([]);
        }

        // First, recalculate completion status for all employees in the branch
        // This ensures the incomplete employees section always shows up-to-date data on each load
        try {
          // Get all active employees first (for branch managers, this is just their branch)
          const allEmployeesRes = await employeesAPI.getAll({
            ...employeeFilters,
            is_active: true
          }).catch(() => ({ data: { success: false, data: [] } }));
          
          if (allEmployeesRes.data.success && allEmployeesRes.data.data) {
            const allEmployees = allEmployeesRes.data.data.filter(emp => 
              !emp.status || emp.status === 'active' || emp.status === 'pending'
            );
            
            // Update completion status for all employees in batches to avoid overwhelming the server
            // Process in smaller batches with delays between batches
            const BATCH_SIZE = 5; // Smaller batch size for better performance
            for (let i = 0; i < allEmployees.length; i += BATCH_SIZE) {
              const batch = allEmployees.slice(i, i + BATCH_SIZE);
              await Promise.all(
                batch.map(emp => 
                  employeesAPI.updateCompletionStatus(emp.id).catch(err => {
                    console.warn(`Failed to update completion status for employee ${emp.id}:`, err);
                    return null;
                  })
                )
              );
              // Small delay between batches to avoid overwhelming the server
              if (i + BATCH_SIZE < allEmployees.length) {
                await new Promise(resolve => setTimeout(resolve, 50));
              }
            }
          }
        } catch (error) {
          console.warn('Error recalculating completion status:', error);
          // Continue even if recalculation fails - we'll use existing data
        }
        
        // Clear cache for employees to ensure fresh data after status updates
        clearCache('/api/employees');
        
        // Now load incomplete employees with freshly calculated status
        const incompleteFilters = { 
          ...employeeFilters, 
          data_completion_status: DATA_COMPLETION_STATUS.INCOMPLETE
        };
        
        const [incompleteRes, pendingRes] = await Promise.all([
          employeesAPI.getAll(incompleteFilters).catch(() => ({ data: { success: false, data: [] } })),
          employeesAPI.getAll({ 
            ...employeeFilters,
            status: 'pending'
          }).catch(() => ({ data: { success: false, data: [] } }))
        ]);

        if (incompleteRes.data.success) {
          const filtered = (incompleteRes.data.data || []).filter(emp => 
            !emp.status || emp.status === 'active' || emp.status === 'pending'
          );
          setIncompleteEmployees(filtered);
        } else {
          setIncompleteEmployees([]);
        }

        if (pendingRes.data.success) {
          setPendingEmployees(pendingRes.data.data || []);
        } else {
          setPendingEmployees([]);
        }

        // Check monthly documents and missing branch documents
        const allDocuments = documentsRes.data.data || [];
        checkMonthlyDocuments(allDocuments, branchesList);
        checkMissingBranchDocuments(allDocuments, branchesList);
        
        // Calculate progress for branch manager (after branchInfo is loaded)
        if (branchInfoRes?.data?.success && branchInfoRes.data.data) {
          await calculateProgress(employeesRes.data.data || [], allDocuments, branchInfoRes.data.data);
        }
        
        // Separate documents by expiry date (after branches are set)
        setTimeout(() => {
          separateDocumentsByExpiry(allDocuments);
        }, 100);
      } else if (isMainManager()) {
        // Main manager results
        setLoadingStats(true);
        const statsRes = results[3];
        const notificationsRes = results[4];
        const usersRes = results[5];

        if (statsRes?.data?.success) {
          setBranchStats(statsRes.data.data || []);
        }

        if (notificationsRes?.data?.success) {
          const notificationsList = notificationsRes.data.data || [];
          setMainManagerNotifications(notificationsList);
          // Check for new responses since last visit (async, don't await)
          checkNewResponses(notificationsList);
        }

        setStats({
          branches: branchesRes.data.data?.length || 0,
          employees: employeesRes.data.data?.length || 0,
          users: usersRes?.data?.data?.length || 0,
          documents: documentsRes.data.data?.length || 0,
          notifications: notificationsRes?.data?.data?.length || 0,
          loading: false,
        });

        // Check monthly documents for monitoring section
        checkMonthlyDocuments(documentsRes.data.data || [], branchesList);
        // Clear branch manager specific alerts
        setIncompleteEmployees([]);
        setMissingBranchDocumentAlerts([]);
        setDocumentsWithExpiry([]);
        setDocumentsWithoutExpiry([]);
        setLoadingStats(false);
      } else {
        // Set stats for branch managers (main manager stats set above)
        setStats({
          branches: branchesRes.data.data?.length || 0,
          employees: employeesRes.data.data?.length || 0,
          users: 0, // Branch managers don't see users count
          documents: documentsRes.data.data?.length || 0,
          notifications: results[4]?.data?.data?.length || 0,
          loading: false,
        });
      }
    } catch (error) {
      console.error('Error loading stats:', error);
      setStats((prev) => ({ ...prev, loading: false }));
    }
  };

  // Check for new responses since last visit
  // Performance Optimization: Limit to first 20 notifications to prevent N+1 query problem
  const checkNewResponses = useCallback(async (notificationsList) => {
    try {
      const lastVisitTime = localStorage.getItem('notifications_last_visit');
      if (!lastVisitTime || notificationsList.length === 0) {
        // First time or no notifications, no new responses to show
        setNewResponsesCount(0);
        return;
      }
      
      const lastVisit = new Date(lastVisitTime);
      let newCount = 0;
      
      // Performance Optimization: Limit to first 20 notifications to prevent excessive API calls
      // Most recent notifications are more likely to have new responses
      const MAX_NOTIFICATIONS_TO_CHECK = 20;
      const notificationsToCheck = notificationsList.slice(0, MAX_NOTIFICATIONS_TO_CHECK);
      
      // Early return if no notifications to check
      if (notificationsToCheck.length === 0) {
        setNewResponsesCount(0);
        return;
      }
      
      // Fetch details for limited notifications to get actual responses with timestamps
      // Use Promise.allSettled to handle individual failures gracefully
      const notificationDetailsPromises = notificationsToCheck.map(notification => 
        notificationsAPI.getById(notification.id).catch(() => null)
      );
      
      const detailsResults = await Promise.allSettled(notificationDetailsPromises);
      
      // Check each notification's responses for new ones
      detailsResults.forEach((result) => {
        // Handle Promise.allSettled result structure
        const response = result.status === 'fulfilled' ? result.value : null;
        if (response && response.data && response.data.success && response.data.data) {
          const notification = response.data.data;
          if (notification.responses && Array.isArray(notification.responses)) {
            notification.responses.forEach(responseItem => {
              if (responseItem.responded_at) {
                const responseTime = new Date(responseItem.responded_at);
                if (responseTime > lastVisit) {
                  newCount++;
                }
              }
            });
          }
        }
      });
      
      setNewResponsesCount(newCount);
    } catch (error) {
      // Error handling - don't log in production (will be removed by esbuild)
      if (process.env.NODE_ENV !== 'production') {
        console.error('Error checking new responses:', error);
      }
      setNewResponsesCount(0);
    }
  }, []);

  // Calculate overall progress for branch manager
  const calculateProgress = async (employees, documents, branch) => {
    if (!branch || isMainManager()) return;
    
    try {
      // 1. Calculate employees data completion
      // Use branch.number_of_employees if set, otherwise use actual employees count
      // This provides more accurate percentage when branch has expected number of employees
      const expectedEmployeeCount = branch.number_of_employees && branch.number_of_employees > 0 
        ? branch.number_of_employees 
        : employees.length;
      const completeEmployees = employees.filter(emp => emp.data_completion_status === DATA_COMPLETION_STATUS.COMPLETE).length;
      const employeesCompletion = expectedEmployeeCount > 0 
        ? Math.round((completeEmployees / expectedEmployeeCount) * 100) 
        : 0;
      
      // 2. Calculate branch documents completion
      const { getRequiredBranchDocuments } = await import('../utils/employeeHelpers');
      const requiredDocs = getRequiredBranchDocuments(branch.branch_type);
      const uploadedDocs = documents.filter(doc => 
        requiredDocs.includes(doc.document_type) && doc.is_active
      );
      const branchDocumentsCompletion = requiredDocs.length > 0
        ? Math.round((uploadedDocs.length / requiredDocs.length) * 100)
        : 0;
      
      // 3. Calculate overall progress (weighted average)
      // Employees: 50%, Documents: 50%
      const overallProgress = Math.round(
        (employeesCompletion * 0.5) + 
        (branchDocumentsCompletion * 0.5)
      );
      
      setProgressData({
        employeesCompletion,
        branchDocumentsCompletion,
        alertsResolved: 0, // Not used anymore
        overallProgress
      });
    } catch (error) {
      console.error('Error calculating progress:', error);
    }
  };

  // Get progress color class based on percentage
  const getProgressColorClass = (percentage) => {
    if (percentage >= 90) return 'excellent';
    if (percentage >= 70) return 'good';
    if (percentage >= 50) return 'moderate';
    if (percentage >= 30) return 'low';
    return 'critical';
  };

  const checkMonthlyDocuments = (documents, branchesList) => {
    const alerts = [];
    const monthlyTypes = ['payroll_file', 'attendance_file', 'salary_deposit_file'];
    const typeLabels = {
      payroll_file: ' مسيرات الرواتب',
      attendance_file: ' الحضور و الانصراف',
      salary_deposit_file: ' ايداع الرواتب (التحويلات البنكية)'
    };

    // Helper function to get last day of current month
    const getLastDayOfMonth = (date) => {
      const year = date.getFullYear();
      const month = date.getMonth();
      return new Date(year, month + 1, 0).getDate();
    };

    // Helper function to check if document was uploaded for current month
    const isUploadedForCurrentMonth = (uploadDate, currentDate) => {
      return uploadDate.getFullYear() === currentDate.getFullYear() &&
             uploadDate.getMonth() === currentDate.getMonth();
    };

    // Get current date info
    const now = new Date();
    const currentDay = now.getDate();
    const lastDayOfMonth = getLastDayOfMonth(now);
    const isLastDayOfMonth = currentDay === lastDayOfMonth;
    const isDay25 = currentDay === 25;

    // Get branches to check
    const branchesToCheck = isMainManager() 
      ? branchesList 
      : branchesList.filter(b => b.id === user?.branch_id);

    for (const branch of branchesToCheck) {
      for (const docType of monthlyTypes) {
        // Find the most recent document of this type for this branch
        const branchDocs = documents.filter(
          doc => doc.branch_id === branch.id && doc.document_type === docType && doc.is_active !== false
        );

        if (branchDocs.length === 0) {
          // No document found - critical if last day, must_do otherwise
          const status = isLastDayOfMonth ? 'critical' : 'must_do';
          alerts.push({
            branchId: branch.id,
            branchName: branch.branch_name,
            documentType: docType,
            documentLabel: typeLabels[docType],
            status: status,
            lastUploadDate: null,
            message: isLastDayOfMonth 
              ? `تنبيه عاجل:  ${typeLabels[docType]} - يجب رفعه اليوم (آخر يوم في الشهر)`
              : ` ${typeLabels[docType]} - يجب رفعه`
          });
        } else {
          // Find the most recent upload
          const mostRecent = branchDocs.reduce((latest, doc) => {
            const docDate = new Date(doc.uploaded_at);
            const latestDate = latest ? new Date(latest.uploaded_at) : new Date(0);
            return docDate > latestDate ? doc : latest;
          });

          const uploadDate = new Date(mostRecent.uploaded_at);
          const uploadedForCurrentMonth = isUploadedForCurrentMonth(uploadDate, now);

          if (!uploadedForCurrentMonth) {
            // Document not uploaded for current month
            if (isLastDayOfMonth) {
              // Critical - last day of month and not uploaded
              alerts.push({
                branchId: branch.id,
                branchName: branch.branch_name,
                documentType: docType,
                documentLabel: typeLabels[docType],
                status: 'critical',
                lastUploadDate: uploadDate,
                message: `تنبيه عاجل:  ${typeLabels[docType]} لم يتم رفعه لهذا الشهر - يجب رفعه اليوم (آخر يوم في الشهر)`
              });
            } else if (isDay25) {
              // Reminder on day 25
              alerts.push({
                branchId: branch.id,
                branchName: branch.branch_name,
                documentType: docType,
                documentLabel: typeLabels[docType],
                status: 'preferred',
                lastUploadDate: uploadDate,
                message: `تذكير:  ${typeLabels[docType]} يجب رفعه قبل نهاية الشهر (آخر يوم: ${lastDayOfMonth})`
              });
            } else if (currentDay > 25) {
              // After day 25 but not last day - must do
            alerts.push({
              branchId: branch.id,
              branchName: branch.branch_name,
              documentType: docType,
              documentLabel: typeLabels[docType],
              status: 'must_do',
              lastUploadDate: uploadDate,
                message: ` ${typeLabels[docType]} لم يتم رفعه لهذا الشهر - يجب رفعه قبل نهاية الشهر (آخر يوم: ${lastDayOfMonth})`
            });
            } else {
              // Before day 25 - preferred
            alerts.push({
              branchId: branch.id,
              branchName: branch.branch_name,
              documentType: docType,
              documentLabel: typeLabels[docType],
              status: 'preferred',
              lastUploadDate: uploadDate,
                message: ` ${typeLabels[docType]} يجب رفعه قبل نهاية الشهر (آخر يوم: ${lastDayOfMonth})`
            });
            }
          }
          // If uploaded for current month, no alert needed
        }
      }
    }

    // Sort: critical first, then must_do, then preferred
    alerts.sort((a, b) => {
      const statusOrder = { critical: 0, must_do: 1, preferred: 2 };
      const aOrder = statusOrder[a.status] || 3;
      const bOrder = statusOrder[b.status] || 3;
      if (aOrder !== bOrder) return aOrder - bOrder;
      return a.branchName.localeCompare(b.branchName, 'ar');
    });

    setMonthlyDocumentAlerts(alerts);
  };

  // Helper function to determine if a document type requires expiry date
  const requiresExpiryDate = (docType) => {
    // Monthly documents require expiry date (must be updated monthly)
    const monthlyTypes = getMonthlyRequiredBranchDocuments();
    if (monthlyTypes.includes(docType)) {
      return true;
    }
    
    // Documents that typically require expiry dates
    const expiryRequiredTypes = [
      'license',           // الترخيص - usually has expiry
      'permit',            // التصريح - usually has expiry
      'insurance',         // التأمين - usually has expiry
      'insurance_certificate', // شهادة التامينات - usually has expiry
      'civil_defense_certificate', // شهادة الدفاع المدني - usually has expiry
      'municipality_certificate',  // شهادة بلدي - usually has expiry
      'contract',          // العقد - may have expiry
      'rental_contract',   // عقد الايجار - usually has expiry
      'security_contract', // عقد الامن و السالامة - usually has expiry
      'registration'      // السجل التجاري - may have expiry
    ];
    
    return expiryRequiredTypes.includes(docType);
  };

  const checkMissingBranchDocuments = (documents, branchesList) => {
    const alertsWithExpiry = [];
    const alertsWithoutExpiry = [];
    const seenAlerts = new Set(); // To prevent duplicates
    
    // Get document type labels from branch document type labels
    // This ensures consistency with the rule system
    const typeLabels = {
      license: 'الترخيص',
      permit: 'التصريح',
      insurance: 'التأمين',
      insurance_print: 'كشف التأمينات',
      contract: 'العقد',
      rental_contract: 'عقد الايجار',
      certification: 'الشهادة',
      registration: 'السجل التجاري',
      security_contract: 'عقد الامن و السالامة',
      civil_defense_certificate: 'شهادة الدفاع المدني',
      municipality_certificate: 'شهادة بلدي',
      insurance_certificate: 'شهادة التامينات',
      insurance_statement: 'كشف التأمينات',
      operational_plan: 'الخطة التشغلية للمركز',
      owner_civil_id_copy: 'نسخه من هوية الاحوال الشخصية لمالك المركز',
      disclosure_commitment: 'افصاح و تعهد',
      certification_commitment_form: 'نموذج تصديق و تعاقد',
      financial_platform_declaration: ' اقرار المنصة المالية',
      financial_claim_form: 'نموذج مطالبة مالية',
      student_cadre_file: 'بيانات الطلاب',
      dropped_students: 'الطلاب المنقطعين',
      free_seats: 'المقاعد المتاحة',
      acceptance_notifications: 'إشعارات القبول',
      payroll_file: ' مسيرات الرواتب',
      attendance_file: ' الحضور و الانصراف',
      salary_deposit_file: ' ايداع الرواتب (التحويلات البنكية)'
    };

    // Get branches to check
    const branchesToCheck = isMainManager() 
      ? branchesList 
      : branchesList.filter(b => b.id === user?.branch_id);

    for (const branch of branchesToCheck) {
      const branchType = branch.branch_type; // 'school' or 'healthcare_center'
      
      // Use centralized helper function to get required documents (excluding monthly ones)
      const requiredDocTypes = getRequiredBranchDocuments(branchType);
      const monthlyTypes = getMonthlyRequiredBranchDocuments();
      
      // Filter out monthly documents (they are handled separately)
      const nonMonthlyRequired = requiredDocTypes.filter(docType => !monthlyTypes.includes(docType));
      
      for (const docType of nonMonthlyRequired) {
        // Create unique key to prevent duplicates
        const alertKey = `${branch.id}-${docType}`;
        if (seenAlerts.has(alertKey)) {
          continue; // Skip if already added
        }
        
        // Check if this document type exists for this branch
        const branchDocs = documents.filter(
          doc => doc.branch_id === branch.id && doc.document_type === docType && doc.is_active !== false
        );

        if (branchDocs.length === 0) {
          // Document is missing
          const alert = {
            branchId: branch.id,
            branchName: branch.branch_name,
            branchType: branchType,
            documentType: docType,
            documentLabel: typeLabels[docType] || docType,
            message: `مستند ${typeLabels[docType] || docType} مفقود - يجب رفعه`
          };
          
          // Check if document requires expiry date
          if (requiresExpiryDate(docType)) {
            alertsWithExpiry.push(alert);
          } else {
            alertsWithoutExpiry.push(alert);
          }
          
          seenAlerts.add(alertKey);
        }
      }
    }

    // Sort by priority first, then by branch name, then by document type
    const sortAlerts = (alerts) => {
      return alerts.sort((a, b) => {
        // Priority order: 1) Monthly (highest), 2) Student/Cadre, 3) Others
        const monthlyTypes = ['payroll_file', 'attendance_file', 'salary_deposit_file'];
        const studentCadreTypes = ['student_cadre_file', 'dropped_students', 'free_seats', 'acceptance_notifications', 'staff_cadre'];
        
        const aIsMonthly = monthlyTypes.includes(a.documentType);
        const bIsMonthly = monthlyTypes.includes(b.documentType);
        if (aIsMonthly && !bIsMonthly) return -1;
        if (!aIsMonthly && bIsMonthly) return 1;
        
        const aIsStudentCadre = studentCadreTypes.includes(a.documentType);
        const bIsStudentCadre = studentCadreTypes.includes(b.documentType);
        if (aIsStudentCadre && !bIsStudentCadre) return -1;
        if (!aIsStudentCadre && bIsStudentCadre) return 1;
        
        // Then sort by branch name, then by document type
        const branchCompare = a.branchName.localeCompare(b.branchName, 'ar');
        if (branchCompare !== 0) return branchCompare;
        return a.documentLabel.localeCompare(b.documentLabel, 'ar');
      });
    };

    // Keep old state for backward compatibility
    const allAlerts = [...alertsWithExpiry, ...alertsWithoutExpiry];
    setMissingBranchDocumentAlerts(allAlerts);
    setMissingBranchDocumentAlertsWithExpiry(sortAlerts(alertsWithExpiry));
    setMissingBranchDocumentAlertsWithoutExpiry(sortAlerts(alertsWithoutExpiry));
  };

  // Separate documents by expiry date
  const separateDocumentsByExpiry = useCallback((documents) => {
    if (isMainManager()) return;
    
    const branchId = user?.branch_id;
    if (!branchId || branches.length === 0) return;

    // Filter documents for this branch
    const branchDocs = documents.filter(
      doc => doc.branch_id === branchId && doc.is_active !== false
    );

    // Separate by expiry date
    const withExpiry = [];
    const withoutExpiry = [];

    branchDocs.forEach(doc => {
      // Skip monthly documents (handled separately)
      const monthlyTypes = ['payroll_file', 'attendance_file', 'salary_deposit_file'];
      if (monthlyTypes.includes(doc.document_type)) {
        return;
      }

      // Check if document has expiry date
      if (doc.expiry_date) {
        const expiryDate = new Date(doc.expiry_date);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        // Only show if expired or expiring soon (within 90 days)
        const daysUntilExpiry = Math.ceil((expiryDate - today) / (1000 * 60 * 60 * 24));
        
        if (daysUntilExpiry <= 90) {
          const typeLabels = {
            license: 'الترخيص',
            permit: 'التصريح',
            insurance: 'التأمين',
            insurance_print: 'كشف التأمينات',
            contract: 'العقد',
            rental_contract: 'عقد الايجار',
            certification: 'الشهادة',
            registration: 'السجل التجاري',
            security_contract: 'عقد الامن و السالامة',
            civil_defense_certificate: 'شهادة الدفاع المدني',
            municipality_certificate: 'شهادة بلدي',
            insurance_certificate: 'شهادة التامينات',
            insurance_statement: 'كشف التأمينات',
            operational_plan: 'الخطة التشغلية للمركز',
            owner_civil_id_copy: 'نسخه من هوية الاحوال الشخصية لمالك المركز',
            disclosure_commitment: 'افصاح و تعهد',
            certification_commitment_form: 'نموذج تصديق و تعاقد',
            financial_platform_declaration: ' اقرار المنصة المالية',
            financial_claim_form: 'نموذج مطالبة مالية',
            student_cadre_file: 'بيانات الطلاب',
            dropped_students: 'الطلاب المنقطعين',
            free_seats: 'المقاعد المتاحة',
            acceptance_notifications: 'إشعارات القبول'
          };

          withExpiry.push({
            id: doc.id,
            branchId: doc.branch_id,
            branchName: doc.branch_name || branches.find(b => b.id === doc.branch_id)?.branch_name || 'غير محدد',
            documentType: doc.document_type,
            documentLabel: typeLabels[doc.document_type] || doc.document_type,
            expiryDate: expiryDate,
            daysUntilExpiry: daysUntilExpiry,
            isExpired: daysUntilExpiry < 0,
            message: daysUntilExpiry < 0 
              ? `مستند ${typeLabels[doc.document_type] || doc.document_type} منتهي الصلاحية منذ ${Math.abs(daysUntilExpiry)} يوم`
              : daysUntilExpiry === 0
              ? `مستند ${typeLabels[doc.document_type] || doc.document_type} ينتهي اليوم`
              : `مستند ${typeLabels[doc.document_type] || doc.document_type} سينتهي خلال ${daysUntilExpiry} يوم`
          });
        }
      } else {
        // Check if document is missing (not in missingBranchDocumentAlerts)
        const typeLabels = {
          license: 'الترخيص',
          permit: 'التصريح',
          insurance: 'التأمين',
          insurance_print: 'كشف التأمينات',
          contract: 'العقد',
          rental_contract: 'عقد الايجار',
          certification: 'الشهادة',
          registration: 'السجل التجاري',
          security_contract: 'عقد الامن و السالامة',
          civil_defense_certificate: 'شهادة الدفاع المدني',
          municipality_certificate: 'شهادة بلدي',
          insurance_certificate: 'شهادة التامينات',
          insurance_statement: 'كشف التأمينات',
          operational_plan: 'الخطة التشغلية للمركز',
          owner_civil_id_copy: 'نسخه من هوية الاحوال الشخصية لمالك المركز',
          disclosure_commitment: 'افصاح و تعهد',
          certification_commitment_form: 'نموذج تصديق و تعاقد',
          financial_platform_declaration: ' اقرار المنصة المالية',
          financial_claim_form: 'نموذج مطالبة مالية',
          student_cadre_file: 'بيانات الطلاب',
          dropped_students: 'الطلاب المنقطعين',
          free_seats: 'المقاعد المتاحة',
          acceptance_notifications: 'إشعارات القبول'
        };

        // Only add if it's a required document that's missing
        // This will be handled by checkMissingBranchDocuments, so we skip here
      }
    });

    // Sort by expiry date (expired first, then by days until expiry)
    withExpiry.sort((a, b) => {
      if (a.isExpired && !b.isExpired) return -1;
      if (!a.isExpired && b.isExpired) return 1;
      return a.daysUntilExpiry - b.daysUntilExpiry;
    });

    setDocumentsWithExpiry(withExpiry);
    setDocumentsWithoutExpiry(withoutExpiry);
  }, [isMainManager, user, branches]);

  // Get monthly documents status for display
  const getMonthlyDocumentsSummary = () => {
    const monthlyTypes = ['payroll_file', 'attendance_file', 'salary_deposit_file'];
    const typeLabels = {
      payroll_file: ' مسيرات الرواتب',
      attendance_file: ' الحضور و الانصراف',
      salary_deposit_file: ' ايداع الرواتب (التحويلات البنكية)'
    };

    if (isMainManager()) {
      // For main manager, show summary of all branches
      const branchesToCheck = branches;
      let totalBranches = 0;
      let uploadedCount = 0;
      let pendingCount = 0;
      let missingCount = 0;

      branchesToCheck.forEach(branch => {
        monthlyTypes.forEach(docType => {
          totalBranches++;
          const branchDocs = (stats.documents > 0 ? [] : []).filter(
            doc => doc.branch_id === branch.id && doc.document_type === docType
          );
          // This is a simplified check - in real implementation, we'd check current month
          if (branchDocs.length > 0) {
            uploadedCount++;
          } else {
            missingCount++;
          }
        });
      });

      return { totalBranches, uploadedCount, pendingCount, missingCount };
    } else {
      // For branch manager, check their branch
      const branchId = user?.branch_id;
      if (!branchId) return null;

      let uploaded = 0;
      let pending = 0;
      let missing = 0;

      monthlyTypes.forEach(docType => {
        const branchDocs = monthlyDocumentAlerts.filter(
          alert => alert.branchId === branchId && alert.documentType === docType
        );
        if (branchDocs.length === 0) {
          uploaded++;
        } else if (branchDocs.some(a => a.status === 'critical' || a.status === 'must_do')) {
          missing++;
        } else {
          pending++;
        }
      });

      return { uploaded, pending, missing };
    }
  };

  return (
    <div className="dashboard">
      <h1>لوحة التحكم</h1>
      <p className="welcome-message">
        {isMainManager() 
          ? `مرحباً، ${user?.full_name || user?.username}!`
          : `${branches.find(b => b.id === user?.branch_id)?.branch_name || 'غير محدد'}`
        }
      </p>

      {/* Progress Bar - Only for branch managers */}
      {!isMainManager() && (
        <div className="dashboard-progress-section">
          <h2 className="dashboard-section-title">
            <img src="https://img.icons8.com/material-rounded/24/combo-chart.png" alt="إحصائيات" className="section-icon" style={{ width: '24px', height: '24px' }} />
            التقدم الإجمالي
          </h2>
          <div className="progress-card">
            <div className="progress-overall">
              <div className="progress-header">
                <span className="progress-label">التقدم الإجمالي</span>
                <span className="progress-percentage">{progressData.overallProgress}%</span>
              </div>
              <div className="progress-bar-container">
                <div 
                  className={`progress-bar progress-${getProgressColorClass(progressData.overallProgress)}`}
                  style={{ width: `${progressData.overallProgress}%` }}
                >
                  <div className="progress-bar-fill"></div>
                </div>
              </div>
            </div>
            
            <div className="progress-details">
              <div className="progress-item">
                <div className="progress-item-header">
                  <span className="progress-item-label">اكتمال بيانات الموظفين</span>
                  <span className="progress-item-value">{progressData.employeesCompletion}%</span>
                </div>
                <div className="progress-bar-container small">
                  <div 
                    className={`progress-bar progress-${getProgressColorClass(progressData.employeesCompletion)}`}
                    style={{ width: `${progressData.employeesCompletion}%` }}
                  >
                    <div className="progress-bar-fill"></div>
                  </div>
                </div>
              </div>
              
              <div className="progress-item">
                <div className="progress-item-header">
                  <span className="progress-item-label">اكتمال مستندات الفرع</span>
                  <span className="progress-item-value">{progressData.branchDocumentsCompletion}%</span>
                </div>
                <div className="progress-bar-container small">
                  <div 
                    className={`progress-bar progress-${getProgressColorClass(progressData.branchDocumentsCompletion)}`}
                    style={{ width: `${progressData.branchDocumentsCompletion}%` }}
                  >
                    <div className="progress-bar-fill"></div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 1. Branch Info Alert - Highest Priority - Only for branch managers */}
      {!isMainManager() && branchInfo && (!branchInfo.phone_number || !branchInfo.email) && (
        <div className="dashboard-alert-section priority-1">
          <h2 className="dashboard-section-title">
            <img src="https://img.icons8.com/material-rounded/24/building.png" alt="مبنى" className="section-icon" style={{ width: '24px', height: '24px' }} />
            معلومات الفرع
          </h2>
          <div className="alert-card alert-branch-info">
            <div className="alert-card-header">
              <span className="alert-priority-badge badge-critical">الأولوية القصوى</span>
            </div>
            <div className="alert-card-body">
              <p className="alert-message">
                {!branchInfo.phone_number && !branchInfo.email 
                  ? 'يرجى إكمال معلومات الفرع (رقم الجوال والإيميل)'
                  : !branchInfo.phone_number 
                  ? 'يرجى إضافة رقم جوال الفرع'
                  : 'يرجى إضافة إيميل الفرع'
                }
              </p>
            </div>
            <div className="alert-card-actions">
              <Link to="/branch-info" className="btn-alert btn-critical">
                تحديث المعلومات الآن
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* 2. Documents with Expiry Date - Second Priority (Unified Section) */}
      {!isMainManager() && (() => {
        // Combine all documents that require expiry dates (no duplicates)
        const seenDocsWithExpiry = new Set();
        const allDocsWithExpiry = [];
        
        // 1. Add uploaded documents that are expiring soon
        documentsWithExpiry.forEach(doc => {
          const key = `${doc.branchId}-${doc.documentType}`;
          if (!seenDocsWithExpiry.has(key)) {
            seenDocsWithExpiry.add(key);
            allDocsWithExpiry.push({
              ...doc,
              alertType: 'expiring',
              status: doc.isExpired ? 'critical' : doc.daysUntilExpiry <= 7 ? 'must_do' : 'preferred'
            });
          }
        });
        
        // 2. Add monthly document alerts (must be uploaded monthly)
        monthlyDocumentAlerts.forEach(alert => {
          const key = `${alert.branchId}-${alert.documentType}`;
          if (!seenDocsWithExpiry.has(key)) {
            seenDocsWithExpiry.add(key);
            allDocsWithExpiry.push({
              ...alert,
              alertType: 'monthly',
              documentLabel: alert.documentLabel
            });
          }
        });
        
        // 3. Add missing documents that require expiry dates
        missingBranchDocumentAlertsWithExpiry.forEach(alert => {
          const key = `${alert.branchId}-${alert.documentType}`;
          if (!seenDocsWithExpiry.has(key)) {
            seenDocsWithExpiry.add(key);
            allDocsWithExpiry.push({
              ...alert,
              alertType: 'missing',
              status: 'must_do'
            });
          }
        });
        
        // Sort: critical first, then must_do, then preferred
        allDocsWithExpiry.sort((a, b) => {
          const statusOrder = { critical: 0, must_do: 1, preferred: 2 };
          const aOrder = statusOrder[a.status] || 3;
          const bOrder = statusOrder[b.status] || 3;
          if (aOrder !== bOrder) return aOrder - bOrder;
          return (a.documentLabel || '').localeCompare((b.documentLabel || ''), 'ar');
        });
        
        if (allDocsWithExpiry.length === 0) return null;
        
        return (
          <div className="dashboard-alert-section priority-2">
            <h2 className="dashboard-section-title">
              <img src="https://img.icons8.com/material-rounded/24/calendar.png" alt="تقويم" className="section-icon" style={{ width: '24px', height: '24px' }} />
              مستندات لها تاريخ انتهاء أو تحتاج تحديث دوري
              <span className="section-count">({allDocsWithExpiry.length})</span>
            </h2>
            <p className="section-description" style={{ color: '#666', marginBottom: '15px', fontSize: '14px' }}>
              المستندات التي تتطلب تاريخ انتهاء أو تحديث شهري/سنوي
            </p>
            
            {/* Critical notice for monthly documents if any are critical */}
            {allDocsWithExpiry.some(a => a.status === 'critical') && (
              <div className="critical-notice" style={{
                background: 'linear-gradient(135deg, #fee2e2 0%, #fecaca 100%)',
                border: '2px solid #dc2626',
                borderRadius: '12px',
                padding: '16px',
                marginBottom: '20px',
                textAlign: 'center'
              }}>
                <strong style={{ color: '#991b1b', fontSize: '16px' }}>
                  تنبيه عاجل: يوجد مستندات منتهية أو يجب رفعها فوراً
                </strong>
              </div>
            )}
            
            <div className="alerts-container">
              {allDocsWithExpiry.map((doc, index) => (
                <div 
                  key={`expiry-${doc.branchId || 'unknown'}-${doc.documentType}-${index}`}
                  className={`alert-card ${
                    doc.status === 'critical' ? 'alert-critical' : 
                    doc.status === 'must_do' ? 'alert-must-do' : 'alert-warning'
                  }`}
                >
                  <div className="alert-header">
                    <span className={`alert-badge ${
                      doc.status === 'critical' ? 'badge-critical' : 
                      doc.status === 'must_do' ? 'badge-danger' : 'badge-warning'
                    }`}>
                      {doc.alertType === 'expiring' 
                        ? (doc.isExpired ? 'منتهي الصلاحية' : 'ينتهي قريباً')
                        : doc.alertType === 'monthly'
                        ? (doc.status === 'critical' ? 'عاجل جداً' : 'مطلوب شهرياً')
                        : 'مستند مفقود'}
                    </span>
                  </div>
                  <div className="alert-body">
                    <p className="alert-message">{doc.message}</p>
                    {doc.expiryDate && (
                      <p className="alert-date">
                        تاريخ الانتهاء: {new Date(doc.expiryDate).toLocaleDateString('ar-SA', {
                          year: 'numeric',
                          month: 'long',
                          day: 'numeric'
                        })}
                      </p>
                    )}
                    {doc.lastUploadDate && (
                      <p className="alert-date" style={{ fontSize: '12px', color: '#888', marginTop: '5px' }}>
                        آخر تحديث: {new Date(doc.lastUploadDate).toLocaleDateString('ar-SA')}
                      </p>
                    )}
                  </div>
                  <div className="alert-actions">
                    <Link 
                      to={`/branch-documents?branch_id=${doc.branchId}&document_type=${doc.documentType}`}
                      className={`btn-alert ${doc.status === 'critical' ? 'btn-critical' : 'btn-important'}`}
                    >
                      {doc.alertType === 'expiring' && doc.isExpired ? 'تجديد المستند الآن' : 
                       doc.alertType === 'missing' ? 'رفع المستند' : 'عرض المستند'}
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })()}

      {/* 3. Incomplete Employees - Third Priority */}
      {!isMainManager() && incompleteEmployees.length > 0 && (
        <div className="dashboard-alert-section priority-3">
          <h2 className="dashboard-section-title">
            <img src="https://img.icons8.com/material-rounded/24/user.png" alt="موظف" className="section-icon" style={{ width: '24px', height: '24px' }} />
            الموظفين غير مكتملي البيانات
            <span className="section-count">({incompleteEmployees.length})</span>
          </h2>
          <p className="section-description">
            يوجد {incompleteEmployees.length} موظف بحاجة إلى إكمال بياناته
          </p>
          <div className="incomplete-employees-table">
            <table className="data-table" style={{ width: '100%' }}>
              <thead>
                <tr>
                  <th>الاسم</th>
                  <th>المهنة</th>
                  <th>الإجراء</th>
                </tr>
              </thead>
              <tbody>
                {incompleteEmployees.slice(0, 10).map((employee) => {
                  return (
                    <tr key={employee.id}>
                      <td>
                        {employee.first_name} {employee.second_name} {employee.third_name} {employee.fourth_name}
                      </td>
                      <td>{employee.occupation || '-'}</td>
                      <td>
                        <Link 
                          to={`/employees/${employee.id}`}
                          className="btn-alert btn-important"
                          style={{ padding: '4px 10px', fontSize: '11px' }}
                        >
                          إكمال البيانات
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {incompleteEmployees.length > 10 && (
              <div style={{ marginTop: '15px', textAlign: 'center' }}>
                <Link 
                  to={`/employees?data_completion_status=${DATA_COMPLETION_STATUS.INCOMPLETE}`} 
                  className="btn-alert btn-important" 
                  style={{ padding: '8px 16px', fontSize: '13px' }}
                >
                  عرض جميع الموظفين غير مكتملي البيانات ({incompleteEmployees.length})
                </Link>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 4. Documents without Expiry Date - Fourth Priority */}
      {!isMainManager() && (() => {
        // Only show documents that DON'T require expiry dates (static documents)
        const seenDocsWithoutExpiry = new Set();
        const allDocsWithoutExpiry = [];
        
        // Add missing documents that don't require expiry dates
        missingBranchDocumentAlertsWithoutExpiry.forEach(alert => {
          const key = `${alert.branchId}-${alert.documentType}`;
          if (!seenDocsWithoutExpiry.has(key)) {
            seenDocsWithoutExpiry.add(key);
            allDocsWithoutExpiry.push({
              ...alert,
              status: alert.status || 'must_do'
            });
          }
        });

        // Sort by document label
        allDocsWithoutExpiry.sort((a, b) => {
          return (a.documentLabel || '').localeCompare((b.documentLabel || ''), 'ar');
        });

        if (allDocsWithoutExpiry.length === 0) return null;

        return (
          <div className="dashboard-alert-section priority-4">
            <h2 className="dashboard-section-title">
              <img src="https://img.icons8.com/material-rounded/24/document.png" alt="مستند" className="section-icon" style={{ width: '24px', height: '24px' }} />
              مستندات بدون تاريخ انتهاء
              <span className="section-count">({allDocsWithoutExpiry.length})</span>
            </h2>
            <p className="section-description" style={{ color: '#666', marginBottom: '15px', fontSize: '14px' }}>
              المستندات الثابتة التي لا تحتاج تاريخ انتهاء أو تحديث دوري
            </p>

            {/* Unified documents container */}
            <div className="alerts-container">
              {allDocsWithoutExpiry.map((alert, index) => (
                <div 
                  key={`no-expiry-${alert.branchId || 'unknown'}-${alert.documentType || index}-${index}`}
                  className="alert-card alert-must-do"
                >
                  <div className="alert-header">
                    <span className="alert-badge badge-info">
                      مستند مفقود
                    </span>
                  </div>
                  <div className="alert-body">
                    <p className="alert-message">{alert.message}</p>
                  </div>
                  <div className="alert-actions">
                    <Link 
                      to={`/branch-documents?branch_id=${alert.branchId}&document_type=${alert.documentType}`}
                      className="btn-alert btn-important"
                    >
                      رفع المستند
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })()}

      {isMainManager() && (
        stats.loading ? (
          <div className="loading">جاري تحميل الإحصائيات...</div>
        ) : (
          <div className="stats-grid">
            <div className="stat-card">
              <h3>الفروع</h3>
              <div className="stat-number">{stats.branches}</div>
              <Link to="/branches" className="stat-link btn-stat-link">عرض الكل ←</Link>
            </div>

            <div className="stat-card">
              <h3>الموظفين</h3>
              <div className="stat-number">{stats.employees}</div>
              <Link to="/employees" className="stat-link btn-stat-link">عرض الكل ←</Link>
            </div>

            <div className="stat-card">
              <h3>إنشاء تقارير</h3>
              <div className="stat-number">
                <img src="https://img.icons8.com/48/bar-chart.png" alt="رسم بياني" style={{ width: '48px', height: '48px' }} />
              </div>
              <Link to="/reports" className="stat-link btn-stat-link">إنشاء تقرير ←</Link>
            </div>

            <div className="stat-card">
              <h3>اشعارات الفروع</h3>
              <div className="stat-number" style={{ position: 'relative' }}>
                {stats.notifications}
                {newResponsesCount > 0 && (
                  <span 
                    style={{
                      position: 'absolute',
                      top: '-8px',
                      right: '-8px',
                      backgroundColor: '#F44336',
                      color: 'white',
                      borderRadius: '50%',
                      width: '24px',
                      height: '24px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '12px',
                      fontWeight: 'bold',
                      boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
                    }}
                    title={`${newResponsesCount} رد جديد منذ آخر زيارة`}
                  >
                    {newResponsesCount > 9 ? '9+' : newResponsesCount}
                  </span>
                )}
              </div>
              {newResponsesCount > 0 && (
                <div style={{ 
                  fontSize: '12px', 
                  color: '#F44336', 
                  marginBottom: '8px',
                  fontWeight: '500'
                }}>
                  {newResponsesCount} رد جديد منذ آخر زيارة
                </div>
              )}
              <Link 
                to="/notify-branches" 
                className="stat-link btn-stat-link"
                onClick={() => {
                  // Update last visit time when clicking the link
                  localStorage.setItem('notifications_last_visit', new Date().toISOString());
                  setNewResponsesCount(0);
                }}
              >
                عرض الكل ←
              </Link>
            </div>
          </div>
        )
      )}

      {/* Notifications Section - Only for branch managers */}
      {!isMainManager() && notifications.length > 0 && (
        <div className="notifications-section">
          <h2>الإشعارات</h2>
          <div className="notifications-list-dashboard">
            {notifications.map((notification) => {
              const importanceColors = {
                1: '#4CAF50',
                2: '#FF9800',
                3: '#F44336',
                4: '#2196F3'
              };
              const importanceLabels = {
                1: 'تنبيه',
                2: 'هام و غير عاجل',
                3: 'هام و عاجل',
                4: 'تعميم'
              };
              const responseLabels = {
                done: { text: 'تم', color: '#4CAF50' },
                working_on_it: { text: 'قيد العمل', color: 'var(--primary)' },
                seen: { text: 'شوهد', color: '#9E9E9E' }
              };
              const currentResponse = responseLabels[notification.response_status] || null;
              
              return (
                <div 
                  key={notification.id} 
                  className={`notification-item ${notification.response_status ? 'has-response' : 'no-response'}`}
                  style={{ borderRight: `4px solid ${importanceColors[notification.importance_level] || '#FF9800'}` }}
                >
                  <div className="notification-header-dashboard">
                    <div className="notification-importance-dashboard">
                      <span 
                        className="importance-badge-dashboard"
                        style={{ backgroundColor: importanceColors[notification.importance_level] || '#FF9800' }}
                      >
                        {importanceLabels[notification.importance_level] || 'هام و غير عاجل'}
                      </span>
                      {currentResponse && (
                        <span 
                          className="response-badge-dashboard"
                          style={{ color: currentResponse.color }}
                        >
                          {currentResponse.text}
                        </span>
                      )}
                    </div>
                    <span className="notification-date-dashboard">
                      {new Date(notification.created_at).toLocaleDateString('en-US', { calendar: 'gregory' })}
                    </span>
                  </div>
                  <div className="notification-message-dashboard">
                    {notification.message}
                  </div>

                  {/* Attachment Display */}
                  {notification.attachment_url && (
                    <div className="notification-attachment-dashboard" style={{
                      marginTop: '10px',
                      padding: '10px',
                      backgroundColor: '#f5f5f5',
                      borderRadius: '6px',
                      border: '1px solid #ddd'
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <span style={{ fontSize: '16px' }}>📎</span>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: 'bold', marginBottom: '5px', fontSize: '14px' }}>
                             مرفق: {notification.attachment_name || 'مرفق'}
                          </div>
                          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                            <a
                              href={notification.attachment_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              style={{
                                color: 'var(--primary)',
                                textDecoration: 'none',
                                fontSize: '13px'
                              }}
                            >
                              📥 تحميل
                            </a>
                            {(notification.attachment_type?.startsWith('image/') || notification.attachment_type === 'application/pdf') && (
                              <a
                                href={notification.attachment_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                style={{
                                  color: 'var(--primary)',
                                  textDecoration: 'none',
                                  fontSize: '13px'
                                }}
                              >
                                👁️ معاينة
                              </a>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {notification.response_message && (
                    <div className="notification-response-message-dashboard">
                      <strong>ردك:</strong> {notification.response_message}
                    </div>
                  )}
                  <div className="notification-actions-dashboard">
                    {respondingTo === notification.id ? (
                      <div className="response-form-dashboard">
                        <select
                          value={responseStatus}
                          onChange={(e) => setResponseStatus(e.target.value)}
                          className="response-select"
                        >
                          <option value="">اختر حالة الرد</option>
                          <option value="seen">شوهد</option>
                          <option value="working_on_it">قيد العمل</option>
                          <option value="done">تم</option>
                        </select>
                        <textarea
                          value={responseMessage}
                          onChange={(e) => setResponseMessage(e.target.value)}
                          placeholder="رسالة إضافية (اختياري)"
                          rows="2"
                          className="response-textarea"
                        />
                        <div className="response-form-actions">
                          <button
                            className="btn btn-primary btn-sm"
                            onClick={async () => {
                              if (!responseStatus) {
                                showWarning('يرجى اختيار حالة الرد');
                                return;
                              }
                              try {
                                await notificationsAPI.respond(notification.id, {
                                  response_status: responseStatus,
                                  response_message: responseMessage || null
                                });
                                showSuccess('تم حفظ الرد بنجاح');
                                setRespondingTo(null);
                                setResponseStatus('');
                                setResponseMessage('');
                                loadStats();
                              } catch (error) {
                                console.error('Error responding:', error);
                                showError(error.response?.data?.message || 'فشل حفظ الرد');
                              }
                            }}
                          >
                            حفظ
                          </button>
                          <button
                            className="btn btn-secondary btn-sm"
                            onClick={() => {
                              setRespondingTo(null);
                              setResponseStatus('');
                              setResponseMessage('');
                            }}
                          >
                            إلغاء
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        className="btn btn-primary btn-sm"
                        onClick={() => {
                          setRespondingTo(notification.id);
                          setResponseStatus(notification.response_status || '');
                          setResponseMessage(notification.response_message || '');
                        }}
                      >
                        {notification.response_status ? 'تعديل الرد' : 'رد على الإشعار'}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}



      {/* Branch Statistics Summary - Main Manager Only */}
      {isMainManager() && branchStats && branchStats.length > 0 && (
        <div className="branch-stats-summary">
          <h2>ملخص إحصائيات الفروع</h2>
          <div className="compact-stats-graph">
            <div className="graph-item">
              <div className="graph-label">الفروع النشطة</div>
              <div className="graph-bar-container">
                <div 
                  className="graph-bar operational-bar"
                  style={{ 
                    width: `${(branchStats.filter(s => s.is_operational).length / branchStats.length) * 100}%` 
                  }}
                >
                  <span className="graph-bar-value">
                    {branchStats.filter(s => s.is_operational).length} / {branchStats.length}
                  </span>
                </div>
              </div>
            </div>
            <div className="graph-item">
              <div className="graph-label">متوسط نسبة الإكمال</div>
              <div className="graph-bar-container">
                <div 
                  className="graph-bar completion-bar"
                  style={{ 
                    width: `${Math.round(
                      branchStats.reduce((sum, s) => sum + s.completion_percentage, 0) /
                        branchStats.length
                    )}%` 
                  }}
                >
                  <span className="graph-bar-value">
                    {Math.round(
                      branchStats.reduce((sum, s) => sum + s.completion_percentage, 0) /
                        branchStats.length
                    )}%
                  </span>
                </div>
              </div>
            </div>
          </div>
          <div style={{ marginTop: '15px' }}>
            <Link to="/branch-statistics" className="btn btn-primary">
              عرض التفاصيل الكاملة →
            </Link>
          </div>
        </div>
      )}
    </div>
  );
};

// Memoize the component to prevent unnecessary re-renders
export default memo(Dashboard);

