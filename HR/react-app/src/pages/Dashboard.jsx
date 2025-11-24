/**
 * Dashboard Page
 * Overview of all tables and statistics
 */

import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { branchesAPI, employeesAPI, usersAPI, branchDocumentsAPI } from '../utils/api';
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
  const [branches, setBranches] = useState([]);
  const [stats, setStats] = useState({
    branches: 0,
    employees: 0,
    users: 0,
    documents: 0,
    loading: true,
  });
  const [monthlyDocumentAlerts, setMonthlyDocumentAlerts] = useState([]);
  const [incompleteEmployees, setIncompleteEmployees] = useState([]);
  const [missingBranchDocumentAlerts, setMissingBranchDocumentAlerts] = useState([]);

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

      // Only load incomplete employees, monthly documents, and missing branch documents for branch managers
      // These sections have been removed from main manager dashboard
      if (!isMainManager()) {
        // Load incomplete employees for branch managers
        const incompleteFilters = { 
          ...employeeFilters, 
          data_completion_status: 'incomplete' 
        };
        try {
          const incompleteRes = await employeesAPI.getAll(incompleteFilters);
          if (incompleteRes.data.success) {
            setIncompleteEmployees(incompleteRes.data.data || []);
          }
        } catch (error) {
          console.error('Error loading incomplete employees:', error);
          setIncompleteEmployees([]);
        }

        // Check monthly documents (payroll_file and attendance_file) for branch managers
        checkMonthlyDocuments(documentsRes.data.data || [], branchesList);
        
        // Check for missing required branch documents for branch managers
        checkMissingBranchDocuments(documentsRes.data.data || [], branchesList);
      } else {
        // For main manager, clear these states since sections are removed
        setIncompleteEmployees([]);
        setMonthlyDocumentAlerts([]);
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
        loading: false,
      });
    } catch (error) {
      console.error('Error loading stats:', error);
      setStats((prev) => ({ ...prev, loading: false }));
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
              ? `⚠️ تنبيه عاجل: لا يوجد ملف ${typeLabels[docType]} - يجب رفعه اليوم (آخر يوم في الشهر)`
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
                message: `⚠️ تنبيه عاجل: ملف ${typeLabels[docType]} لم يتم رفعه لهذا الشهر - يجب رفعه اليوم (آخر يوم في الشهر)`
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

  return (
    <div className="dashboard">
      <h1>لوحة التحكم</h1>
      <p className="welcome-message">
        {isMainManager() 
          ? `مرحباً، ${user?.full_name || user?.username}!`
          : `${branches.find(b => b.id === user?.branch_id)?.branch_name || 'غير محدد'}`
        }
      </p>

      {stats.loading ? (
        <div className="loading">جاري تحميل الإحصائيات...</div>
      ) : (
        <div className="stats-grid">
          {isMainManager() && (
            <div className="stat-card">
              <h3>الفروع</h3>
              <div className="stat-number">{stats.branches}</div>
              <Link to="/branches" className="stat-link btn-stat-link">عرض الكل ←</Link>
            </div>
          )}

          <div className="stat-card">
            <h3>الموظفون</h3>
            <div className="stat-number">{stats.employees}</div>
            <Link to="/employees" className="stat-link btn-stat-link">عرض الكل ←</Link>
          </div>

          {isMainManager() && (
            <div className="stat-card">
              <h3>إدارة الحسابات</h3>
              <div className="stat-number">{stats.users}</div>
              <Link to="/account-management" className="stat-link btn-stat-link">عرض الكل ←</Link>
            </div>
          )}

          <div className="stat-card">
            <h3>مستندات الفرع</h3>
            <div className="stat-number">{stats.documents}</div>
            <Link to="/branch-documents" className="stat-link btn-stat-link">عرض الكل ←</Link>
          </div>
        </div>
      )}

      {/* Incomplete Employees Alert - Only for branch managers */}
      {!isMainManager() && incompleteEmployees.length > 0 && (
        <div className="incomplete-employees-alert">
          <h2>الموظفون غير مكتملي البيانات</h2>
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
                  <p className="alert-date" style={{ fontSize: '12px', color: '#888', marginTop: '8px' }}>
                    {alert.branchName} - نوع الفرع: {getBranchTypeLabel(alert.branchType)}
                  </p>
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
                ⚠️ تنبيه عاجل: اليوم هو آخر يوم في الشهر - يجب رفع مسيرات الرواتب وملفات الحضور والانصراف فوراً
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
                      ? '⚠️ عاجل جداً' 
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
                    {alert.status === 'critical' ? '🚨 رفع الملف الآن' : 'رفع الملف الآن'}
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {isMainManager() && (
        <div className="quick-actions">
          <h2>إجراءات سريعة</h2>
          <div className="actions-grid">
            <Link to="/branches" className="action-card">
              <h3>إدارة الفروع</h3>
              <p>عرض وإدارة جميع الفروع</p>
            </Link>
            <Link to="/employees" className="action-card">
              <h3>إدارة الموظفين</h3>
              <p>عرض وإدارة سجلات الموظفين</p>
            </Link>
            <Link to="/branch-documents" className="action-card">
              <h3>مستندات الفرع</h3>
              <p>رفع وإدارة مستندات الفروع</p>
            </Link>
            <Link to="/account-management" className="action-card">
              <h3>إدارة الحسابات</h3>
              <p>إنشاء وإدارة حسابات المدير الرئيسي</p>
            </Link>
          </div>
        </div>
      )}
    </div>
  );
};

export default Dashboard;

