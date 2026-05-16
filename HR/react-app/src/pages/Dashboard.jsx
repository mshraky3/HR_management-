/**
 * Dashboard Page
 * Overview of all tables and statistics
 */

import { useState, useEffect, useMemo, useCallback, memo, useRef } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useNotification } from '../contexts/NotificationContext';
import { branchesAPI, employeesAPI, usersAPI, branchDocumentsAPI, notificationsAPI, branchStatisticsAPI, dashboardAPI, adminAPI, requestsAPI, busTransportationAPI, payrollAbsenceAPI, beneficiariesAPI, employeeExpiryAPI, clearCache } from '../utils/api';
import BranchesOverallProgressChart from '../components/BranchesOverallProgressChart';
import {
  getRequiredBranchDocuments,
  getBranchTypeLabel,
  getMonthlyRequiredBranchDocuments,
  isMonthlyBranchDocument
} from '../utils/employeeHelpers';
import { getBranchTypeRules } from '../utils/employeeRules';
import { DATA_COMPLETION_STATUS } from '../utils/employeeConstants';
import { formatDate, hijriToGregorian, parseHijriString } from '../utils/dateConverters';
import DashboardProgress from './DashboardProgress';
import MissingEmployeeDataSection from '../components/MissingEmployeeDataSection.jsx';
import PayrollAbsenceBranchSection from '../components/PayrollAbsenceBranchSection.jsx';
import SalaryReviewSection from '../components/SalaryReviewSection.jsx';
import IBANReviewSection from '../components/IBANReviewSection.jsx';
import TaskProgressOverview from '../components/TaskProgressOverview';
import FocusTaskCard from '../components/FocusTaskCard';
import TaskQueue from '../components/TaskQueue';
import TaskCardWrapper from '../components/TaskCardWrapper';
import { calculateTasks } from '../utils/taskPrioritizer';
import './Dashboard.css';

const Dashboard = () => {
  const { user, isMainManager, isBranchOperationsManager } = useAuth();
  const { showError, showSuccess, showWarning } = useNotification();
  const location = useLocation();
  const isBranchOpsUser = isBranchOperationsManager();
  const assignedBranchIds = useMemo(
    () =>
      Array.isArray(user?.assigned_branches)
        ? user.assigned_branches.map((id) => parseInt(id, 10)).filter(Number.isFinite)
        : [],
    [user?.assigned_branches],
  );
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
  const [buses, setBuses] = useState([]);
  const [skippedTaskIds, setSkippedTaskIds] = useState(new Set()); // Temporary skip (session-only, doesn't mark as completed)
  const [completedTaskIds, setCompletedTaskIds] = useState(new Set()); // Actually completed tasks
  const [missingEmployeeContractData, setMissingEmployeeContractData] = useState([]);
  const [payrollAbsenceState, setPayrollAbsenceState] = useState(null);
  const [beneficiaryCount, setBeneficiaryCount] = useState(0);
  const [employeeExpirySummary, setEmployeeExpirySummary] = useState(null);
  const [currentTaskIndex, setCurrentTaskIndex] = useState(0); // Track current task being shown
  const [branchOpsTasksLoading, setBranchOpsTasksLoading] = useState(false);

  // Track whether the component is still mounted to avoid state updates after unmount
  const mountedRef = useRef(true);
  useEffect(() => () => { mountedRef.current = false; }, []);

  const loadStats = useCallback(async () => {
    try {
      if (isBranchOpsUser) {
        setBranchOpsTasksLoading(true);
      }

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
        employeesAPI.getAll(employeeFilters)
          .catch((err) => {
            console.warn('[Dashboard] employeesAPI.getAll failed:', err?.message || 'Unknown error');
            return { data: { data: [] } };
          }),
        branchDocumentsAPI.getAll(documentFilters)
          .catch((err) => {
            console.warn('[Dashboard] branchDocumentsAPI.getAll failed:', err?.message || 'Unknown error');
            return { data: { data: [] } };
          }),
      ];

      // Add role-specific API calls to batch
      if (!isMainManager() && user?.branch_id) {
        // Branch manager specific calls
        apiPromises.push(
          branchesAPI.getById(user.branch_id).catch((err) => {
            console.warn('[Dashboard] branchesAPI.getById failed:', err?.message || 'Unknown error');
            return { data: { success: false } };
          }),
          notificationsAPI.getMyBranchNotifications().catch((err) => {
            console.warn('[Dashboard] notificationsAPI.getMyBranchNotifications failed:', err?.message || 'Unknown error');
            return { data: { success: false, data: [] } };
          }),
          busTransportationAPI.getAll({ branch_id: user.branch_id }).catch((err) => {
            console.warn('[Dashboard] busTransportationAPI.getAll failed:', err?.message || 'Unknown error');
            return { data: { success: false, data: [] } };
          }),
          employeesAPI.getMissingRequiredData().catch((err) => {
            console.warn('[Dashboard] employeesAPI.getMissingRequiredData failed:', err?.message || 'Unknown error');
            return { data: { success: false, data: [] } };
          }),
          payrollAbsenceAPI.getBranchState().catch((err) => {
            console.warn('[Dashboard] payrollAbsenceAPI.getBranchState failed:', err?.message || 'Unknown error');
            return { data: { success: false, data: null } };
          }),
          beneficiariesAPI.getBranchCount().catch((err) => {
            console.warn('[Dashboard] beneficiariesAPI.getBranchCount failed:', err?.message || 'Unknown error');
            return { data: { success: false, data: { count: 0 } } };
          }),
          employeeExpiryAPI.getSummary().catch((err) => {
            console.warn('[Dashboard] employeeExpiryAPI.getSummary failed:', err?.message || 'Unknown error');
            return { data: { success: false, data: null } };
          })
        );
      } else if (isMainManager()) {
        // Main manager specific calls
        apiPromises.push(
          branchStatisticsAPI.getAll().catch((err) => {
            console.warn('[Dashboard] branchStatisticsAPI.getAll failed:', err?.message || 'Unknown error');
            // Return empty array instead of false to prevent UI errors
            return { data: { success: false, data: [] } };
          }),
          notificationsAPI.getAll().catch((err) => {
            console.warn('[Dashboard] notificationsAPI.getAll failed:', err?.message || 'Unknown error');
            return { data: { success: false, data: [] } };
          }),
          usersAPI.getAll({ is_active: true }).catch((err) => {
            console.warn('[Dashboard] usersAPI.getAll failed:', err?.message || 'Unknown error');
            return { data: { success: false, data: [] } };
          }),
          requestsAPI.getAll().catch((err) => {
            console.warn('[Dashboard] requestsAPI.getAll failed:', err?.message || 'Unknown error');
            return { data: { success: false, data: [] } };
          })
        );
      }

      // Execute all API calls in parallel
      const results = await Promise.all(apiPromises);

      // Guard: component may have unmounted while awaiting
      if (!mountedRef.current) return;

      // Extract results
      const branchesRes = results[0];
      const employeesRes = results[1];
      const documentsRes = results[2];

      // Store branches for display
      const rawBranches = branchesRes.data.success ? (branchesRes.data.data || []) : [];
      const branchesList = isBranchOpsUser
        ? rawBranches.filter((branch) => assignedBranchIds.includes(parseInt(branch.id, 10)))
        : rawBranches;
      setBranches(branchesList);

      // Store employees and documents for progress component
      const rawEmployeesData = employeesRes.data.success ? (employeesRes.data.data || []) : [];
      const rawDocumentsData = documentsRes.data.data || [];
      const employeesData = isBranchOpsUser
        ? rawEmployeesData.filter((employee) =>
          assignedBranchIds.includes(parseInt(employee.branch_id, 10)),
        )
        : rawEmployeesData;
      const documentsData = isBranchOpsUser
        ? rawDocumentsData.filter((document) =>
          assignedBranchIds.includes(parseInt(document.branch_id, 10)),
        )
        : rawDocumentsData;
      setEmployeesList(employeesData);
      setDocumentsList(documentsData);

      // Process role-specific results
      if (!isMainManager() && user?.branch_id) {
        // Branch manager results
        const branchInfoRes = results[3];
        const notificationsRes = results[4];
        const busesRes = results[5];
        const missingContractDataRes = results[6];
        const payrollAbsenceRes = results[7];
        const beneficiaryCountRes = results[8];

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

        if (busesRes?.data?.success) {
          setBuses(busesRes.data.data || []);
        } else {
          setBuses([]);
        }

        if (missingContractDataRes?.data?.success) {
          setMissingEmployeeContractData(missingContractDataRes.data.data || []);
        } else {
          setMissingEmployeeContractData([]);
        }

        if (payrollAbsenceRes?.data?.success && payrollAbsenceRes.data.data) {
          setPayrollAbsenceState(payrollAbsenceRes.data.data);
        } else {
          setPayrollAbsenceState(null);
        }

        if (beneficiaryCountRes?.data?.success) {
          setBeneficiaryCount(beneficiaryCountRes.data.data?.count || 0);
        } else {
          setBeneficiaryCount(0);
        }

        const expiryRes = results[9];
        if (expiryRes?.data?.success) {
          setEmployeeExpirySummary(expiryRes.data.data);
        } else {
          setEmployeeExpirySummary(null);
        }

        // Use cached dashboard summary endpoint to get current incomplete employees and totals
        try {
          const summaryRes = await dashboardAPI.getSummary({ branch_id: user?.branch_id });
          if (summaryRes?.data?.success) {
            const summary = summaryRes.data.data;
            // Filter to only active employees (exclude pending and inactive)
            const filtered = (summary.incompleteEmployees || []).filter(emp =>
              !emp.status || emp.status === 'active'
            );
            setIncompleteEmployees(filtered);
            setBranchStats(prev => ({ ...prev, completionPercentage: summary.completionPercentage }));
          } else {
            setIncompleteEmployees([]);
          }
        } catch (err) {
          console.warn('[Dashboard] Failed to load dashboard summary:', err?.message || 'Unknown error');
          setIncompleteEmployees([]);
        }

        // Load pending employees (still needed for pending list)
        const pendingRes = await employeesAPI.getAll({
          ...employeeFilters,
          status: 'pending'
        }).catch((err) => {
          console.error('[Dashboard] Failed to fetch pending employees:', err?.message || 'Unknown error');
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
          branches: branchesList.length || 0,
          employees: employeesData.length || 0,
          users: 0, // Branch managers don't see users count
          documents: documentsData.length || 0,
          notifications: results[4]?.data?.data?.length || 0,
          loading: false,
        };
        setStats(branchStatsData);

        if (isBranchOpsUser) {
          checkMonthlyDocuments(documentsData, branchesList);
          checkMissingBranchDocuments(documentsData, branchesList);
          setIncompleteEmployees([]);
          setPendingEmployees([]);
          setNotifications([]);
          setBranchInfo(null);
          setBuses([]);
          setMissingEmployeeContractData([]);
          setPayrollAbsenceState(null);
          setBeneficiaryCount(0);
          setEmployeeExpirySummary(null);
          setBranchOpsTasksLoading(false);
        }
      }
    } catch (error) {
      console.error('[Dashboard] Error loading stats:', error);
      setStats((prev) => ({ ...prev, loading: false }));
      if (isBranchOpsUser) {
        setBranchOpsTasksLoading(false);
      }
    }
  }, [user, isMainManager, isBranchOpsUser, assignedBranchIds]); // Dependencies: user and role context

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
    // REMOVED: 'payroll_file' is handled by payroll absence system, not as document upload
    // It has its own dedicated task (calculatePayrollAbsenceTask) that opens when entry period starts
    const monthlyTypes = [];
    const typeLabels = {};

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
      : isBranchOpsUser
        ? branchesList.filter((branch) => assignedBranchIds.includes(parseInt(branch.id, 10)))
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
    const hasStoredFile = (doc) => !!(doc?.file_path || doc?.file_url || doc?.blob_url);
    const normalizeDocType = (type) => (type === 'insurance_print' ? 'insurance_statement' : type);

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
      student_cadre_file: 'بيانات الطلاب',
      // NOTE: payroll_file removed - users enter payroll data in payroll absence system, not as document upload
      payroll_file: ' مسيرات الرواتب' // REMOVED from document management
    };

    // Get branches to check
    const branchesToCheck = isMainManager()
      ? branchesList
      : isBranchOpsUser
        ? branchesList.filter((branch) => assignedBranchIds.includes(parseInt(branch.id, 10)))
        : branchesList.filter(b => b.id === user?.branch_id);

    for (const branch of branchesToCheck) {
      const branchType = branch.branch_type; // 'school' or 'healthcare_center'

      // Use centralized helper function to get required documents (excluding monthly ones)
      const requiredDocTypes = getRequiredBranchDocuments(branchType);
      const monthlyTypes = getMonthlyRequiredBranchDocuments();

      // Filter out monthly documents (they are handled separately)
      const nonMonthlyRequired = requiredDocTypes.filter(docType => !monthlyTypes.includes(docType));
      const uniqueRequired = [...new Set(nonMonthlyRequired)];

      for (const docType of uniqueRequired) {
        // Create unique key to prevent duplicates
        const alertKey = `${branch.id}-${docType}`;
        if (seenAlerts.has(alertKey)) {
          continue; // Skip if already added
        }

        // Check if this document type exists for this branch
        // IMPORTANT: Only check active documents (is_active !== false)
        // Also check that document exists and has a stored file reference (file_path is the main one for branch docs)
        const branchDocs = documents.filter(
          doc => doc.branch_id === branch.id &&
            normalizeDocType(doc.document_type) === docType &&
            doc.is_active !== false &&
            hasStoredFile(doc)
        );

        const allBranchDocsOfType = documents.filter(
          doc => doc.branch_id === branch.id && normalizeDocType(doc.document_type) === docType
        );

        // Check if there are archived documents of this type (expired documents)
        const archivedDocs = allBranchDocsOfType.filter(doc => doc.is_active === false);
        const hasArchivedDoc = archivedDocs.length > 0;

        if (branchDocs.length === 0) {
          // Document is missing - determine message based on archive status
          const alertMessage = hasArchivedDoc
            ? `مستند ${typeLabels[docType] || docType} منتهي الصلاحية في الأرشيف - يحتاج رفع مستند جديد`
            : `مستند ${typeLabels[docType] || docType} مفقود - يجب رفعه`;

          const alert = {
            branchId: branch.id,
            branchName: branch.branch_name,
            branchType: branchType,
            documentType: docType,
            documentLabel: typeLabels[docType] || docType,
            message: alertMessage,
            isArchived: hasArchivedDoc
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
        // Priority order: 1) Student/Cadre, 2) Others
        // NOTE: payroll_file is not included here because it's handled by payroll absence system
        const studentCadreTypes = ['student_cadre_file', 'dropped_students', 'free_seats', 'acceptance_notifications', 'staff_cadre'];

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

  // Separate documents by expiry date - TEMPORARILY DISABLED until date calculations are fixed
  const separateDocumentsByExpiry = useCallback((documents) => {
    // Temporarily disabled - will be re-enabled after fixing date calculations
    return;

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
      // NOTE: payroll_file is handled by payroll absence system, not as document
      const monthlyTypes = ['attendance_file'];
      if (monthlyTypes.includes(doc.document_type)) {
        return;
      }

      // Check if document has expiry date
      // IMPORTANT: Determine date type based on year: < 1600 = Hijri, >= 1600 = Gregorian
      let expiryDate = null;

      if (doc.expiry_date) {
        const tempDate = new Date(doc.expiry_date);
        if (!isNaN(tempDate.getTime())) {
          const year = tempDate.getFullYear();

          // Determine date type: year < 1600 = Hijri, year >= 1600 = Gregorian
          if (year < 1600) {
            // Hijri date - convert to Gregorian for calculation
            // Parse the date string to get day/month/year
            const dateStr = doc.expiry_date;
            const parts = dateStr.split(/[-/]/);
            if (parts.length === 3) {
              // Try to parse as YYYY-MM-DD format (hijri year is first)
              const hijriYear = parseInt(parts[0]);
              const hijriMonth = parseInt(parts[1]);
              const hijriDay = parseInt(parts[2]);

              // Convert Hijri to Gregorian
              const gregorianDateStr = hijriToGregorian(hijriDay, hijriMonth, hijriYear);
              if (gregorianDateStr) {
                expiryDate = new Date(gregorianDateStr);
              }
            } else if (doc.expiry_date_hijri) {
              // Use expiry_date_hijri if available (format: DD/MM/YYYY)
              const hijriDate = parseHijriString(doc.expiry_date_hijri);
              if (hijriDate) {
                const gregorianDateStr = hijriToGregorian(hijriDate.day, hijriDate.month, hijriDate.year);
                if (gregorianDateStr) {
                  expiryDate = new Date(gregorianDateStr);
                }
              }
            }
          } else {
            // Gregorian date - use directly
            expiryDate = tempDate;
          }
        }
      } else if (doc.expiry_date_hijri) {
        // Only hijri date available - convert to Gregorian (format: DD/MM/YYYY)
        const hijriDate = parseHijriString(doc.expiry_date_hijri);
        if (hijriDate) {
          const gregorianDateStr = hijriToGregorian(hijriDate.day, hijriDate.month, hijriDate.year);
          if (gregorianDateStr) {
            expiryDate = new Date(gregorianDateStr);
          }
        }
      }

      if (expiryDate && !isNaN(expiryDate.getTime())) {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        expiryDate.setHours(0, 0, 0, 0);

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
            student_cadre_file: 'بيانات الطلاب'
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
          insurance_print: 'كشف التأمينات (رعاية)',
          contract: 'العقد',
          rental_contract: 'عقد الايجار',
          certification: 'الشهادة',
          registration: 'السجل التجاري',
          security_contract: 'عقد الامن و السالامة',
          civil_defense_certificate: 'شهادة الدفاع المدني',
          municipality_certificate: 'شهادة بلدي',
          insurance_certificate: 'شهادة التامينات',
          insurance_statement: 'كشف التأمينات (مدارس)',
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
  // NOTE: Payroll files are handled by payroll absence system, not monthly documents
  const getMonthlyDocumentsSummary = () => {
    const monthlyTypes = [];
    const typeLabels = {};

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
          : isBranchOpsUser
            ? `مرحباً، ${user?.full_name || user?.username}! — ${branches.length} ${branches.length === 1 ? 'فرع' : 'فروع'} مُعينة`
            : `${branches.find(b => b.id === user?.branch_id)?.branch_name || 'غير محدد'}`
        }
      </p>

      {/* Notifications Section - Only for branch managers */}
      {!isMainManager() && notifications.length > 0 && (
        <div className="notifications-section" id="notifications">
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
                    {notification.message ? notification.message.split('\n').filter(line => line.trim() !== '').join('\n') : ''}
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

      {isBranchOpsUser && (() => {
        const groupedMissing = missingBranchDocumentAlerts.reduce((acc, alert) => {
          const current = acc.get(alert.branchId) || {
            branchId: alert.branchId,
            branchName: alert.branchName,
            items: [],
          };
          current.items.push(alert.documentLabel);
          acc.set(alert.branchId, current);
          return acc;
        }, new Map());

        const missingGroups = Array.from(groupedMissing.values()).sort((a, b) =>
          a.branchName.localeCompare(b.branchName, 'ar'),
        );

        const branchOpsTasks = missingBranchDocumentAlerts.length > 0
          ? [{
            id: 'branch-ops-missing-documents',
            type: 'document',
            category: 'documents',
            priority: 'critical',
            title: 'استكمال مستندات الفروع المعينة',
            description: `${missingBranchDocumentAlerts.length} مستند مفقود في ${missingGroups.length} فرع`,
            totalItems: missingBranchDocumentAlerts.length,
            completedItems: 0,
            remainingItems: missingBranchDocumentAlerts.length,
            progress: 0,
            actionUrl: '/branch-documents',
            actionLabel: 'رفع المستندات',
            urgency: 'no_deadline',
            estimatedTime: `${Math.max(missingGroups.length * 5, 5)} min`,
            dependencies: [],
          }]
          : [];

        return (
          <div className="dashboard-tasks-section">
            {branchOpsTasksLoading ? (
              <div className="branch-ops-tasks-loading" aria-label="جاري تحميل مهام مستندات الفروع">
                <div className="branch-ops-loading-card" />
                <div className="branch-ops-loading-card" />
                <div className="branch-ops-loading-row" />
                <div className="branch-ops-loading-row" />
              </div>
            ) : (
              <TaskProgressOverview tasks={branchOpsTasks} />
            )}

            {!branchOpsTasksLoading && (branchOpsTasks.length > 0 ? (
              <>
                <div className="task-navigation-info">
                  <span className="task-counter">المهمة 1 من 1</span>
                </div>

                <FocusTaskCard task={branchOpsTasks[0]} />

                <div className="missing-branch-documents-alerts" style={{ marginTop: '1.5rem' }}>
                  <h2>الفروع التي تحتاج رفع مستندات</h2>
                  <div className="alerts-grid">
                    {missingGroups.map((group) => (
                      <div key={group.branchId} className="alert-card warning">
                        <h3>{group.branchName}</h3>
                        <p>
                          {group.items.slice(0, 4).join('، ')}
                          {group.items.length > 4 ? `، +${group.items.length - 4}` : ''}
                        </p>
                        <Link
                          to={`/branch-documents?branch_id=${group.branchId}`}
                          className="btn btn-primary"
                        >
                          رفع المستندات
                        </Link>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            ) : (
              <div className="tasks-completion-message">
                <div className="completion-icon">
                  <svg width="80" height="80" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <circle cx="12" cy="12" r="10" fill="#4CAF50" opacity="0.2" />
                    <path d="M9 12L11 14L15 10" stroke="#4CAF50" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
                <h2 className="completion-title">لا توجد مستندات ناقصة حالياً</h2>
                <p className="completion-description">كل الفروع المعينة لك مغطاة بالمستندات المطلوبة حالياً.</p>
              </div>
            ))}
          </div>
        );
      })()}

      {/* Gamified Dashboard for Branch Managers */}
      {!isMainManager() && branchInfo && (() => {
        // Calculate all tasks
        const allTasks = calculateTasks({
          branchInfo,
          branches,
          documents: documentsList,
          incompleteEmployees,
          notifications,
          monthlyDocumentAlerts,
          missingBranchDocumentAlerts,
          documentsWithExpiry,
          buses,
          missingEmployeeContractData,
          payrollAbsenceState,
          employees: employeesList,
          beneficiaryCount,
          employeeExpirySummary
        });

        // Filter out actually completed tasks (not just skipped)
        const visibleTasks = allTasks.filter(task => !completedTaskIds.has(task.id));

        // Filter out temporarily skipped tasks for display (session-only)
        const tasksForDisplay = visibleTasks.filter(task => !skippedTaskIds.has(task.id));

        // Combine all tasks in priority order: inline editors first, then regular tasks
        const allTasksOrdered = [
          ...tasksForDisplay.filter(task => task.hasInlineEditor),
          ...tasksForDisplay.filter(task => !task.hasInlineEditor)
        ];

        // Clamp task index to valid range (no setState during render to avoid loops)
        const validTaskIndex = allTasksOrdered.length > 0
          ? Math.max(0, Math.min(currentTaskIndex, allTasksOrdered.length - 1))
          : 0;

        const currentTask = allTasksOrdered[validTaskIndex] || null;
        const isLastTask = validTaskIndex === allTasksOrdered.length - 1;
        const isFirstTask = validTaskIndex === 0;
        const allTasksComplete = allTasks.length > 0 && allTasksOrdered.length === 0;

        // Handle next task navigation
        const handleNext = () => {
          if (validTaskIndex < allTasksOrdered.length - 1) {
            setCurrentTaskIndex(validTaskIndex + 1);
          }
        };

        // Handle previous task navigation
        const handlePrevious = () => {
          if (validTaskIndex > 0) {
            setCurrentTaskIndex(validTaskIndex - 1);
          }
        };

        // Handle scroll to section
        const handleScrollToSection = (url) => {
          if (url && url.startsWith('#')) {
            const sectionId = url.replace('#', '');
            const element = document.getElementById(sectionId);
            if (element) {
              element.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
          }
        };

        // Completion verification - check if task is actually complete
        const checkTaskCompletion = async (task) => {
          try {
            if (task.type === 'branch_info') {
              // Check if phone/email now exist
              const branchInfoRes = await branchesAPI.getById(user.branch_id);
              const branchInfo = branchInfoRes.data.data;
              return branchInfo?.phone_number && branchInfo?.email;
            }
            if (task.type === 'employee_contract_data') {
              // Check if missing contract data is now empty
              const missingRes = await employeesAPI.getMissingRequiredData();
              return !missingRes.data.data || missingRes.data.data.length === 0;
            }
            if (task.type === 'payroll_absence') {
              // Check if payroll absence is now submitted (view_only or closed)
              const stateRes = await payrollAbsenceAPI.getBranchState();
              const state = stateRes.data.data;
              return state?.state === 'view_only' || state?.state === 'closed';
            }
            // For other tasks, rely on data refresh to update task list
            return false;
          } catch (error) {
            console.error('[Dashboard] Error checking task completion:', error);
            return false;
          }
        };

        // Handle task completion - verify and mark as complete
        const handleTaskComplete = async (taskId) => {
          const task = visibleTasks.find(t => t.id === taskId);
          if (!task) return;

          // Small delay to allow data to be saved
          setTimeout(async () => {
            // Verify completion
            const isComplete = await checkTaskCompletion(task);
            if (isComplete) {
              setCompletedTaskIds(prev => new Set([...prev, taskId]));
              // Refresh data to update tasks
              await loadStats();
            }
          }, 500);
        };

        // If all tasks are complete, show completion message
        if (allTasksComplete) {
          return (
            <div className="dashboard-tasks-section">
              <div className="tasks-completion-message">
                <div className="completion-icon">
                  <svg width="80" height="80" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <circle cx="12" cy="12" r="10" fill="#4CAF50" opacity="0.2" />
                    <path d="M9 12L11 14L15 10" stroke="#4CAF50" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
                <h2 className="completion-title">🎉 مبروك! تم إكمال جميع المهام</h2>
                <p className="completion-description">
                  لقد أكملت جميع المهام المطلوبة للفرع. رائع جداً!
                </p>
              </div>
            </div>
          );
        }

        // Show only the current task (one at a time)
        return (
          <>
            {/* Unified Task Management Section */}
            <div className="dashboard-tasks-section">
              {/* Progress Overview */}
              <TaskProgressOverview tasks={tasksForDisplay} />

              {/* Task Navigation Info */}
              {allTasksOrdered.length > 0 && (
                <div className="task-navigation-info">
                  <span className="task-counter">
                    المهمة {validTaskIndex + 1} من {allTasksOrdered.length}
                  </span>
                </div>
              )}

              {/* Show only the current task - Auto-expanded */}
              {currentTask && (
                <>
                  {currentTask.hasInlineEditor ? (
                    // Inline Editor Task (TaskCardWrapper)
                    <div>
                      {currentTask.type === 'employee_contract_data' && (
                        <TaskCardWrapper key={currentTask.id} task={currentTask} defaultExpanded={true}>
                          <MissingEmployeeDataSection
                            onComplete={() => handleTaskComplete(currentTask.id)}
                          />
                        </TaskCardWrapper>
                      )}
                      {currentTask.type === 'payroll_absence' && (
                        <TaskCardWrapper key={currentTask.id} task={currentTask} defaultExpanded={true}>
                          <PayrollAbsenceBranchSection
                            onComplete={() => handleTaskComplete(currentTask.id)}
                          />
                        </TaskCardWrapper>
                      )}
                      {currentTask.type === 'salary_review' && (
                        <TaskCardWrapper key={currentTask.id} task={currentTask} defaultExpanded={true}>
                          <SalaryReviewSection
                            employeeList={currentTask.employeeList || []}
                            onComplete={() => handleTaskComplete(currentTask.id)}
                          />
                        </TaskCardWrapper>
                      )}
                      {currentTask.type === 'iban_review' && (
                        <TaskCardWrapper key={currentTask.id} task={currentTask} defaultExpanded={true}>
                          <IBANReviewSection
                            employeeList={currentTask.employeeList || []}
                            onComplete={() => handleTaskComplete(currentTask.id)}
                          />
                        </TaskCardWrapper>
                      )}
                    </div>
                  ) : (
                    // Regular Task (FocusTaskCard)
                    <FocusTaskCard
                      task={currentTask}
                      onSkip={handleNext}
                    />
                  )}
                </>
              )}

              {/* Navigation Buttons */}
              {allTasksOrdered.length > 1 && (
                <div className="task-navigation-buttons">
                  <button
                    className="task-nav-btn task-nav-btn-prev"
                    onClick={handlePrevious}
                    disabled={isFirstTask}
                    title="المهمة السابقة"
                  >
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                      <path d="M15 18L9 12L15 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    السابقة
                  </button>

                  <button
                    className="task-nav-btn task-nav-btn-next"
                    onClick={handleNext}
                    disabled={isLastTask}
                    title="المهمة التالية"
                  >
                    التالية
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                      <path d="M9 18L15 12L9 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>
                </div>
              )}
            </div>
          </>
        );
      })()}

      {isMainManager() && (
        stats.loading ? (
          <div className="stats-grid stats-grid-skeleton" aria-label="جاري تحميل الإحصائيات">
            {Array.from({ length: 6 }).map((_, index) => (
              <div key={index} className="stat-card skeleton-stat-card">
                <div className="skeleton-stat-line skeleton-title" />
                <div className="skeleton-stat-line skeleton-number" />
                <div className="skeleton-stat-line skeleton-link" />
              </div>
            ))}
          </div>
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

