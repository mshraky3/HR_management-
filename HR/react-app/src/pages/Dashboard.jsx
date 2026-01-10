/**
 * Dashboard Page
 * Overview of all tables and statistics
 */

import { useState, useEffect, useMemo, useCallback, memo, useRef } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useNotification } from '../contexts/NotificationContext';
import { branchesAPI, employeesAPI, usersAPI, branchDocumentsAPI, notificationsAPI, branchStatisticsAPI, dashboardAPI, adminAPI, requestsAPI, clearCache } from '../utils/api';
import BranchesOverallProgressChart from '../components/BranchesOverallProgressChart';
import {
  getRequiredBranchDocuments,
  getBranchTypeLabel,
  getMonthlyRequiredBranchDocuments,
  isMonthlyBranchDocument
} from '../utils/employeeHelpers';
import { getBranchTypeRules } from '../utils/employeeRules';
import { DATA_COMPLETION_STATUS } from '../utils/employeeConstants';
import { formatDate } from '../utils/dateConverters';
import DashboardProgress from './DashboardProgress';
import MissingEmployeeDataSection from '../components/MissingEmployeeDataSection.jsx';
import PayrollAbsenceBranchSection from '../components/PayrollAbsenceBranchSection.jsx';
import './Dashboard.css';

const Dashboard = () => {
  const { user, isMainManager } = useAuth();
  const { showError, showSuccess, showWarning } = useNotification();
  const location = useLocation();
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
  const [employeesList, setEmployeesList] = useState([]);
  const [documentsList, setDocumentsList] = useState([]);
  const [requests, setRequests] = useState([]);
  const [newRequestsCount, setNewRequestsCount] = useState(0);
  const [pendingRequestsCount, setPendingRequestsCount] = useState(0);

  const loadStats = useCallback(async () => {
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
        branchDocumentsAPI.getAll(documentFilters).catch((err) => {
          console.warn('[Dashboard] branchDocumentsAPI.getAll failed:', err);
          return { data: { data: [] } };
        }),
      ];

      // Add role-specific API calls to batch
      if (!isMainManager() && user?.branch_id) {
        // Branch manager specific calls
        apiPromises.push(
          branchesAPI.getById(user.branch_id).catch((err) => {
            console.warn('[Dashboard] branchesAPI.getById failed:', err);
            return { data: { success: false } };
          }),
          notificationsAPI.getMyBranchNotifications().catch((err) => {
            console.warn('[Dashboard] notificationsAPI.getMyBranchNotifications failed:', err);
            return { data: { success: false, data: [] } };
          })
        );
      } else if (isMainManager()) {
        // Main manager specific calls
        apiPromises.push(
          branchStatisticsAPI.getAll().catch((err) => {
            console.warn('[Dashboard] branchStatisticsAPI.getAll failed:', err);
            return { data: { success: false } };
          }),
          notificationsAPI.getAll().catch((err) => {
            console.warn('[Dashboard] notificationsAPI.getAll failed:', err);
            return { data: { success: false, data: [] } };
          }),
          usersAPI.getAll({ is_active: true }).catch((err) => {
            console.warn('[Dashboard] usersAPI.getAll failed:', err);
            return { data: { success: false, data: [] } };
          }),
          requestsAPI.getAll().catch((err) => {
            console.warn('[Dashboard] requestsAPI.getAll failed:', err);
            return { data: { success: false, data: [] } };
          })
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

      // Store employees and documents for progress component
      const employeesData = employeesRes.data.success ? (employeesRes.data.data || []) : [];
      const documentsData = documentsRes.data.data || [];
      setEmployeesList(employeesData);
      setDocumentsList(documentsData);

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

        // Use cached dashboard summary endpoint to get current incomplete employees and totals
        try {
          const summaryRes = await dashboardAPI.getSummary({ branch_id: user?.branch_id });
          if (summaryRes?.data?.success) {
            const summary = summaryRes.data.data;
            const filtered = (summary.incompleteEmployees || []).filter(emp =>
              !emp.status || emp.status === 'active' || emp.status === 'pending'
            );
            setIncompleteEmployees(filtered);
            setBranchStats(prev => ({ ...prev, completionPercentage: summary.completionPercentage }));
          } else {
            setIncompleteEmployees([]);
          }
        } catch (err) {
          console.warn('[Dashboard] Failed to load dashboard summary:', err);
          setIncompleteEmployees([]);
        }

        // Load pending employees (still needed for pending list)
        const pendingRes = await employeesAPI.getAll({
          ...employeeFilters,
          status: 'pending'
        }).catch((err) => {
          console.error('[Dashboard] Failed to fetch pending employees:', err);
          return { data: { success: false, data: [] } };
        });

        if (pendingRes.data.success) {
          setPendingEmployees(pendingRes.data.data || []);
        } else {
          setPendingEmployees([]);
        }

        // Check monthly documents and missing branch documents
        const allDocuments = documentsRes.data.data || [];
        checkMonthlyDocuments(allDocuments, branchesList);
        checkMissingBranchDocuments(allDocuments, branchesList);

        // Progress calculation is now handled by DashboardProgress component (runs in parallel)

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
        const requestsRes = results[6];

        if (statsRes?.data?.success) {
          setBranchStats(statsRes.data.data || []);
        }

        if (notificationsRes?.data?.success) {
          const notificationsList = notificationsRes.data.data || [];
          setMainManagerNotifications(notificationsList);
          // Check for new responses since last visit (async, don't await)
          checkNewResponses(notificationsList);
        }

        if (requestsRes?.data?.success) {
          const requestsList = requestsRes.data.data || [];
          setRequests(requestsList);
          // Check for new requests since last visit (async, don't await)
          checkNewRequests(requestsList);
        } else {
          setRequests([]);
        }

        const statsData = {
          branches: branchesRes.data.data?.length || 0,
          employees: employeesRes.data.data?.length || 0,
          users: usersRes?.data?.data?.length || 0,
          documents: documentsRes.data.data?.length || 0,
          notifications: notificationsRes?.data?.data?.length || 0,
          loading: false,
        };
        setStats(statsData);

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
        const branchStatsData = {
          branches: branchesRes.data.data?.length || 0,
          employees: employeesRes.data.data?.length || 0,
          users: 0, // Branch managers don't see users count
          documents: documentsRes.data.data?.length || 0,
          notifications: results[4]?.data?.data?.length || 0,
          loading: false,
        };
        setStats(branchStatsData);
      }
    } catch (error) {
      console.error('[Dashboard] Error loading stats:', error);
      setStats((prev) => ({ ...prev, loading: false }));
    }
  }, [user, isMainManager]); // Dependencies: user and isMainManager from context

  // Load stats on mount and when navigating back to Dashboard
  useEffect(() => {
    loadStats();
  }, [location.pathname, loadStats]); // Reload when route changes (including returning to Dashboard)

  // Also reload when page becomes visible (user switches back to tab/window)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        // Reload data when page becomes visible to ensure fresh data
        loadStats();
      }
    };

    const handleFocus = () => {
      // Reload data when window regains focus
      loadStats();
    };

    // Listen for branch info updates from BranchInfo page
    const handleBranchInfoUpdate = () => {
      // Clear cache and reload when branch info is updated
      clearCache('/api/branches');
      clearCache('/api/branch-statistics');
      loadStats();
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleFocus);
    window.addEventListener('branchInfoUpdated', handleBranchInfoUpdate);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('branchInfoUpdated', handleBranchInfoUpdate);
    };
  }, [loadStats]); // Include loadStats in dependencies

  // Track which one-time notifications have been marked as viewed in this session
  const markedAsViewedRef = useRef(new Set());

  // Mark one-time notifications as viewed when they are actually displayed to the user
  // Only mark if they haven't been viewed yet (viewed === false) and haven't been marked in this session
  useEffect(() => {
    if (!notifications || notifications.length === 0 || !user?.id) {
      return;
    }

    // Filter one-time notifications that:
    // 1. Are one-time notifications
    // 2. Haven't been viewed yet (viewed === false)
    // 3. Haven't been marked in this session yet
    const oneTimeNotifications = notifications.filter(
      (notification) =>
        notification.one_time &&
        !notification.viewed &&
        !markedAsViewedRef.current.has(notification.id)
    );

    if (oneTimeNotifications.length === 0) {
      return;
    }

    // Mark each one-time notification as viewed
    oneTimeNotifications.forEach((notification) => {
      // Add to ref immediately to prevent duplicate calls
      markedAsViewedRef.current.add(notification.id);

      // Call API to mark as viewed
      notificationsAPI
        .markViewed(notification.id)
        .catch((err) => {
          // Remove from ref on error so it can be retried
          markedAsViewedRef.current.delete(notification.id);
          // Silently handle errors - don't log warnings
        });
    });
  }, [notifications, user?.id]);

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
        notificationsAPI.getById(notification.id).catch((err) => {
          console.warn('[Dashboard] Failed to fetch notification', notification.id, ':', err);
          return null;
        })
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
      console.error('[Dashboard] Error checking new responses:', error);
      setNewResponsesCount(0);
    }
  }, []);

  // Check for new requests since last visit
  const checkNewRequests = useCallback(async (requestsList) => {
    try {
      const lastVisitTime = localStorage.getItem('requests_last_visit');
      
      let newCount = 0;
      let pendingCount = 0;

      if (requestsList.length === 0) {
        setNewRequestsCount(0);
        setPendingRequestsCount(0);
        return;
      }

      const lastVisit = lastVisitTime ? new Date(lastVisitTime) : null;

      // Count new requests and pending requests
      requestsList.forEach(request => {
        // Count pending requests (without response)
        if (request.status === 'pending') {
          pendingCount++;
        }

        // Count new requests created since last visit
        if (lastVisit && request.created_at) {
          const requestTime = new Date(request.created_at);
          if (requestTime > lastVisit) {
            newCount++;
          }
        }
      });

      setNewRequestsCount(newCount);
      setPendingRequestsCount(pendingCount);
    } catch (error) {
      console.error('[Dashboard] Error checking new requests:', error);
      setNewRequestsCount(0);
      setPendingRequestsCount(0);
    }
  }, []);


  const checkMonthlyDocuments = (documents, branchesList) => {
    const alerts = [];
    const monthlyTypes = ['payroll_file', 'salary_deposit_file'];
    const typeLabels = {
      payroll_file: ' مسيرات الرواتب',
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
        const monthlyTypes = ['payroll_file', 'salary_deposit_file'];
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
    const monthlyTypes = ['payroll_file', 'salary_deposit_file'];
    const typeLabels = {
      payroll_file: ' مسيرات الرواتب',
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

      {/* Missing employee data quick-fill (dates + qualification doc notice) */}
      {!isMainManager() && (
        <div className="dashboard-section">
          <MissingEmployeeDataSection />
        </div>
      )}

      {/* Payroll Absence Section for branch managers (inline, not a separate page) */}
      {!isMainManager() && (
        <div className="dashboard-section">
          <PayrollAbsenceBranchSection />
        </div>
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
                      {formatDate(notification.created_at)}
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

      {/* Progress Bar - Only for branch managers */}
      {!isMainManager() && branchInfo && (
        <DashboardProgress
          employees={employeesList}
          documents={documentsList}
          branch={branchInfo}
        />
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

        // 2. Add monthly document alerts (must be uploaded monthly) - exclude payroll_file
        monthlyDocumentAlerts
          .filter(alert => alert.documentType !== 'payroll_file')
          .forEach(alert => {
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
                  className={`alert-card ${doc.status === 'critical' ? 'alert-critical' :
                    doc.status === 'must_do' ? 'alert-must-do' : 'alert-warning'
                    }`}
                >
                  <div className="alert-header">
                    <span className={`alert-badge ${doc.status === 'critical' ? 'badge-critical' :
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
                        تاريخ الانتهاء: {formatDate(doc.expiryDate)}
                      </p>
                    )}
                    {doc.lastUploadDate && (
                      <p className="alert-date" style={{ fontSize: '12px', color: '#888', marginTop: '5px' }}>
                        آخر تحديث: {formatDate(doc.lastUploadDate)}
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
              <h3>طلبات الفروع</h3>
              <div className="stat-number" style={{ position: 'relative' }}>
                {requests.length}
                {(newRequestsCount > 0 || pendingRequestsCount > 0) && (
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
                    title={`${newRequestsCount > 0 ? newRequestsCount + ' طلب جديد' : ''}${newRequestsCount > 0 && pendingRequestsCount > 0 ? '، ' : ''}${pendingRequestsCount > 0 ? pendingRequestsCount + ' طلب بلا رد' : ''}`}
                  >
                    {(newRequestsCount + pendingRequestsCount) > 9 ? '9+' : (newRequestsCount + pendingRequestsCount)}
                  </span>
                )}
              </div>
              {newRequestsCount > 0 && (
                <div style={{
                  fontSize: '12px',
                  color: '#F44336',
                  marginBottom: '4px',
                  fontWeight: '500'
                }}>
                  {newRequestsCount} طلب جديد منذ آخر زيارة
                </div>
              )}
              {pendingRequestsCount > 0 && (
                <div style={{
                  fontSize: '12px',
                  color: '#FF9800',
                  marginBottom: newRequestsCount > 0 ? '4px' : '8px',
                  fontWeight: '500'
                }}>
                  {pendingRequestsCount} طلب بلا رد
                </div>
              )}
              <Link
                to="/manage-requests"
                className="stat-link btn-stat-link"
                onClick={() => {
                  // Update last visit time when clicking the link
                  localStorage.setItem('requests_last_visit', new Date().toISOString());
                  setNewRequestsCount(0);
                }}
              >
                عرض الكل ←
              </Link>
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

      {/* Branch Statistics Summary - Main Manager Only */}
      {isMainManager() && branchStats && branchStats.length > 0 && (
        <div className="branch-stats-summary">
          <BranchesOverallProgressChart
            statistics={branchStats}
            documentsList={documentsList}
          />
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

