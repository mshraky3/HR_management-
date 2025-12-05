/**
 * Dashboard Page
 * Overview of all tables and statistics
 */

import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useNotification } from '../contexts/NotificationContext';
import { branchesAPI, employeesAPI, usersAPI, branchDocumentsAPI, notificationsAPI, branchStatisticsAPI } from '../utils/api';
import { 
  getRequiredBranchDocuments, 
  getBranchTypeLabel,
  getMonthlyRequiredBranchDocuments,
  isMonthlyBranchDocument
} from '../utils/employeeHelpers';
import { getBranchTypeRules } from '../utils/employeeRules';
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

  useEffect(() => {
    loadStats();
  }, []);

  const loadStats = async () => {
    try {
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

      const [branchesRes, employeesRes] = await Promise.all([
        branchesAPI.getAll(branchFilters),
        employeesAPI.getAll(employeeFilters),
      ]);

      // Store branches for display
      const branchesList = branchesRes.data.success ? (branchesRes.data.data || []) : [];
      setBranches(branchesList);

      // For branch documents - only load if needed for stats
      let documentsRes = { data: { data: [] } };
      try {
        documentsRes = await branchDocumentsAPI.getAll(documentFilters);
      } catch (error) {
        // If no documents or error, just use empty array
      }

      // Load notifications for branch managers
      if (!isMainManager() && user?.branch_id) {
        try {
          const notificationsRes = await notificationsAPI.getMyBranchNotifications();
          if (notificationsRes.data.success) {
            setNotifications(notificationsRes.data.data || []);
          }
        } catch (error) {
          console.error('Error loading notifications:', error);
          setNotifications([]);
        }
      }

      // Load branch statistics and notifications for main manager
      let notificationsList = [];
      if (isMainManager()) {
        try {
          setLoadingStats(true);
          const [statsRes, notificationsRes] = await Promise.all([
            branchStatisticsAPI.getAll(),
            notificationsAPI.getAll()
          ]);
          
          if (statsRes.data.success) {
            setBranchStats(statsRes.data.data || []);
          }
          
          if (notificationsRes.data.success) {
            notificationsList = notificationsRes.data.data || [];
            setMainManagerNotifications(notificationsList);
            
            // Check for new responses since last visit (async, don't await)
            checkNewResponses(notificationsList);
          }
        } catch (error) {
          console.error('Error loading data:', error);
        } finally {
          setLoadingStats(false);
        }
      }

      // Only load incomplete employees, monthly documents, and missing branch documents for branch managers
      // These sections have been removed from main manager dashboard
      if (!isMainManager()) {
        // Load incomplete employees for branch managers (only active or pending)
        const incompleteFilters = { 
          ...employeeFilters, 
          data_completion_status: 'incomplete'
          // Note: status filter is not set, so backend will default to active/pending only
        };
        try {
          const incompleteRes = await employeesAPI.getAll(incompleteFilters);
          if (incompleteRes.data.success) {
            // Double-check: filter out any archived employees that might have slipped through
            const filtered = (incompleteRes.data.data || []).filter(emp => 
              !emp.status || emp.status === 'active' || emp.status === 'pending'
            );
            setIncompleteEmployees(filtered);
          }
        } catch (error) {
          console.error('Error loading incomplete employees:', error);
          setIncompleteEmployees([]);
        }

        // Load pending employees (end of year, awaiting renewal)
        try {
          const pendingRes = await employeesAPI.getAll({ 
            ...employeeFilters,
            status: 'pending'
          });
          if (pendingRes.data.success) {
            setPendingEmployees(pendingRes.data.data || []);
          }
        } catch (error) {
          console.error('Error loading pending employees:', error);
          setPendingEmployees([]);
        }

        // Check monthly documents (payroll_file and attendance_file) for branch managers
        checkMonthlyDocuments(documentsRes.data.data || [], branchesList);
        
        // Check for missing required branch documents for branch managers
        checkMissingBranchDocuments(documentsRes.data.data || [], branchesList);
      } else {
        // For branch managers, check monthly documents
        checkMonthlyDocuments(documentsRes.data.data || [], branchesList);
        checkMissingBranchDocuments(documentsRes.data.data || [], branchesList);
      }
      
      // For main manager, also check monthly documents for monitoring section
      if (isMainManager()) {
        checkMonthlyDocuments(documentsRes.data.data || [], branchesList);
        // Clear branch manager specific alerts
        setIncompleteEmployees([]);
        setMissingBranchDocumentAlerts([]);
      }

      let usersRes = { data: { data: [] } };
      if (isMainManager()) {
        usersRes = await usersAPI.getAll({ is_active: true });
      }

      setStats({
        branches: branchesRes.data.data?.length || 0,
        employees: employeesRes.data.data?.length || 0,
        users: usersRes.data.data?.length || 0,
        documents: documentsRes.data.data?.length || 0,
        notifications: isMainManager() ? notificationsList.length : 0,
        loading: false,
      });
    } catch (error) {
      console.error('Error loading stats:', error);
      setStats((prev) => ({ ...prev, loading: false }));
    }
  };

  // Check for new responses since last visit
  const checkNewResponses = async (notificationsList) => {
    try {
      const lastVisitTime = localStorage.getItem('notifications_last_visit');
      if (!lastVisitTime || notificationsList.length === 0) {
        // First time or no notifications, no new responses to show
        setNewResponsesCount(0);
        return;
      }
      
      const lastVisit = new Date(lastVisitTime);
      let newCount = 0;
      
      // Fetch details for all notifications to get actual responses with timestamps
      const notificationDetailsPromises = notificationsList.map(notification => 
        notificationsAPI.getById(notification.id).catch(() => null)
      );
      
      const detailsResults = await Promise.all(notificationDetailsPromises);
      
      // Check each notification's responses for new ones
      detailsResults.forEach((result) => {
        if (result && result.data && result.data.success && result.data.data) {
          const notification = result.data.data;
          if (notification.responses && Array.isArray(notification.responses)) {
            notification.responses.forEach(response => {
              if (response.responded_at) {
                const responseTime = new Date(response.responded_at);
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
      console.error('Error checking new responses:', error);
      setNewResponsesCount(0);
    }
  };

  const checkMonthlyDocuments = (documents, branchesList) => {
    const alerts = [];
    const monthlyTypes = ['payroll_file', 'attendance_file'];
    const typeLabels = {
      payroll_file: 'ملف مسيرات الرواتب',
      attendance_file: 'ملف الحضور و الانصراف'
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
              ? `تنبيه عاجل: لا يوجد ملف ${typeLabels[docType]} - يجب رفعه اليوم (آخر يوم في الشهر)`
              : `لا يوجد ملف ${typeLabels[docType]} - يجب رفعه`
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
                message: `تنبيه عاجل: ملف ${typeLabels[docType]} لم يتم رفعه لهذا الشهر - يجب رفعه اليوم (آخر يوم في الشهر)`
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
                message: `تذكير: ملف ${typeLabels[docType]} يجب رفعه قبل نهاية الشهر (آخر يوم: ${lastDayOfMonth})`
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
                message: `ملف ${typeLabels[docType]} لم يتم رفعه لهذا الشهر - يجب رفعه قبل نهاية الشهر (آخر يوم: ${lastDayOfMonth})`
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
                message: `ملف ${typeLabels[docType]} يجب رفعه قبل نهاية الشهر (آخر يوم: ${lastDayOfMonth})`
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

  const checkMissingBranchDocuments = (documents, branchesList) => {
    const alerts = [];
    
    // Get document type labels from branch document type labels
    // This ensures consistency with the rule system
    const typeLabels = {
      license: 'الترخيص',
      permit: 'التصريح',
      insurance: 'التأمين',
      insurance_print: 'برينت التأمينات',
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
      certification_commitment_form: 'نموذج تصديق و تعقد',
      financial_platform_declaration: 'ملف اقرار المنصة المالية',
      financial_claim_form: 'نموذج مطالبة مالية',
      student_cadre_file: 'كادر الطلاب',
      dropped_students: 'الطلاب المتسربين',
      free_seats: 'المقاعد المتاحة',
      acceptance_notifications: 'إشعارات القبول'
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
        // Check if this document type exists for this branch
        const branchDocs = documents.filter(
          doc => doc.branch_id === branch.id && doc.document_type === docType && doc.is_active !== false
        );

        if (branchDocs.length === 0) {
          // Document is missing
          alerts.push({
            branchId: branch.id,
            branchName: branch.branch_name,
            branchType: branchType,
            documentType: docType,
            documentLabel: typeLabels[docType] || docType,
            message: `مستند ${typeLabels[docType] || docType} مفقود - يجب رفعه`
          });
        }
      }
    }

    // Sort by branch name, then by document type
    alerts.sort((a, b) => {
      const branchCompare = a.branchName.localeCompare(b.branchName, 'ar');
      if (branchCompare !== 0) return branchCompare;
      return a.documentLabel.localeCompare(b.documentLabel, 'ar');
    });

    setMissingBranchDocumentAlerts(alerts);
  };

  // Get monthly documents status for display
  const getMonthlyDocumentsSummary = () => {
    const monthlyTypes = ['payroll_file', 'attendance_file'];
    const typeLabels = {
      payroll_file: 'ملف مسيرات الرواتب',
      attendance_file: 'ملف الحضور و الانصراف'
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
                3: '#F44336'
              };
              const importanceLabels = {
                1: 'منخفض',
                2: 'متوسط',
                3: 'عالي'
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
                        {importanceLabels[notification.importance_level] || 'متوسط'}
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
                      {new Date(notification.created_at).toLocaleDateString('ar-SA', { calendar: 'gregory' })}
                    </span>
                  </div>
                  <div className="notification-message-dashboard">
                    {notification.message}
                  </div>
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

      {/* Incomplete Employees Alert - Only for branch managers */}
      {!isMainManager() && incompleteEmployees.length > 0 && (
        <div className="incomplete-employees-alert">
          <h2>الموظفين غير مكتملي البيانات</h2>
          <p style={{ color: '#666', marginBottom: '20px' }}>
            يوجد {incompleteEmployees.length} موظف بحاجة إلى إكمال بياناته
          </p>
          <div className="incomplete-employees-table">
            <table className="data-table" style={{ width: '100%' }}>
              <thead>
                <tr>
                  <th>رقم الموظف</th>
                  <th>الاسم</th>
                  <th>الفرع</th>
                  <th>المهنة</th>
                  <th>الإجراء</th>
                </tr>
              </thead>
              <tbody>
                {incompleteEmployees.slice(0, 10).map((employee) => {
                  const branch = branches.find(b => b.id === employee.branch_id);
                  return (
                    <tr key={employee.id}>
                      <td>{employee.employee_id_number || '-'}</td>
                      <td>
                        {employee.first_name} {employee.second_name} {employee.third_name} {employee.fourth_name}
                      </td>
                      <td>{branch ? branch.branch_name : employee.branch_id}</td>
                      <td>{employee.occupation || '-'}</td>
                      <td>
                        <Link 
                          to={`/employees/${employee.id}`}
                          className="btn-alert"
                          style={{ padding: '6px 12px', fontSize: '12px' }}
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
                <Link to="/employees?data_completion_status=incomplete" className="btn-alert">
                  عرض جميع الموظفين غير مكتملي البيانات ({incompleteEmployees.length})
                </Link>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Missing Branch Documents Alerts - Only for branch managers */}
      {!isMainManager() && missingBranchDocumentAlerts.length > 0 && (
        <div className="missing-branch-documents-alerts">
          <h2>مستندات الفرع المفقودة</h2>
          <p style={{ color: '#666', marginBottom: '20px' }}>
            يوجد {missingBranchDocumentAlerts.length} مستند مفقود يحتاج إلى رفع
          </p>
          <div className="alerts-container">
            {missingBranchDocumentAlerts.map((alert, index) => (
              <div 
                key={`missing-${alert.branchId}-${alert.documentType}-${index}`}
                className="alert-card alert-must-do"
              >
                <div className="alert-header">
                  <span className="alert-badge badge-danger">
                    مستند مفقود
                  </span>
                </div>
                <div className="alert-body">
                  <p className="alert-message">{alert.message}</p>
                </div>
                <div className="alert-actions">
                  <Link 
                    to={`/branch-documents?branch_id=${alert.branchId}&document_type=${alert.documentType}`}
                    className="btn-alert"
                  >
                    رفع المستند الآن
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Monthly Document Alerts - Only for branch managers */}
      {!isMainManager() && monthlyDocumentAlerts.length > 0 && (
        <div className="monthly-documents-alerts">
          <h2>تنبيهات المستندات الشهرية</h2>
          {monthlyDocumentAlerts.some(a => a.status === 'critical') && (
            <div className="critical-notice" style={{
              background: 'linear-gradient(135deg, #fee2e2 0%, #fecaca 100%)',
              border: '2px solid #dc2626',
              borderRadius: '12px',
              padding: '16px',
              marginBottom: '20px',
              textAlign: 'center',
              animation: 'pulse-critical 2s infinite'
            }}>
              <strong style={{ color: '#991b1b', fontSize: '18px' }}>
                تنبيه عاجل: اليوم هو آخر يوم في الشهر - يجب رفع مسيرات الرواتب وملفات الحضور والانصراف فوراً
              </strong>
            </div>
          )}
          <div className="alerts-container">
            {monthlyDocumentAlerts.map((alert, index) => (
              <div 
                key={`${alert.branchId}-${alert.documentType}-${index}`}
                className={`alert-card ${
                  alert.status === 'critical' 
                    ? 'alert-critical' 
                    : alert.status === 'must_do' 
                    ? 'alert-must-do' 
                    : 'alert-preferred'
                }`}
              >
                <div className="alert-header">
                  <span className={`alert-badge ${
                    alert.status === 'critical' 
                      ? 'badge-critical' 
                      : alert.status === 'must_do' 
                      ? 'badge-danger' 
                      : 'badge-warning'
                  }`}>
                    {alert.status === 'critical' 
                      ? 'عاجل جداً' 
                      : alert.status === 'must_do' 
                      ? 'يجب التنفيذ' 
                      : 'تذكير'}
                  </span>
                </div>
                <div className="alert-body">
                  <p className="alert-message">{alert.message}</p>
                  <p className="alert-date" style={{ fontSize: '12px', color: '#888', marginTop: '8px' }}>
                    {alert.branchName}
                    {alert.lastUploadDate && (
                      <> - آخر تحديث: {new Date(alert.lastUploadDate).toLocaleDateString('ar-SA')}</>
                    )}
                  </p>
                </div>
                <div className="alert-actions">
                  <Link 
                    to={`/branch-documents?branch_id=${alert.branchId}&document_type=${alert.documentType}`}
                    className={`btn-alert ${alert.status === 'critical' ? 'btn-critical' : ''}`}
                  >
                    {alert.status === 'critical' ? 'رفع الملف الآن' : 'رفع الملف الآن'}
                  </Link>
                </div>
              </div>
            ))}
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

export default Dashboard;

