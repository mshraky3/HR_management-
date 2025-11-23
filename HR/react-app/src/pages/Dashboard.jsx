/**
 * Dashboard Page
 * Overview of all tables and statistics
 */

import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { branchesAPI, employeesAPI, usersAPI, branchDocumentsAPI } from '../utils/api';
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

      // For branch documents
      let documentsRes = { data: { data: [] } };
      try {
        documentsRes = await branchDocumentsAPI.getAll(documentFilters);
      } catch (error) {
        // If no documents or error, just use empty array
        console.log('No branch documents found or error:', error);
      }

      // Check monthly documents (payroll_file and attendance_file)
      checkMonthlyDocuments(documentsRes.data.data || [], branchesList);

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

    // Get branches to check
    const branchesToCheck = isMainManager() 
      ? branchesList 
      : branchesList.filter(b => b.id === user?.branch_id);

    for (const branch of branchesToCheck) {
      for (const docType of monthlyTypes) {
        // Find the most recent document of this type for this branch
        const branchDocs = documents.filter(
          doc => doc.branch_id === branch.id && doc.document_type === docType
        );

        if (branchDocs.length === 0) {
          // No document found - must do
          alerts.push({
            branchId: branch.id,
            branchName: branch.branch_name,
            documentType: docType,
            documentLabel: typeLabels[docType],
            status: 'must_do',
            daysSinceUpload: null,
            message: `لا يوجد ملف ${typeLabels[docType]} للفرع`
          });
        } else {
          // Find the most recent upload
          const mostRecent = branchDocs.reduce((latest, doc) => {
            const docDate = new Date(doc.uploaded_at);
            const latestDate = latest ? new Date(latest.uploaded_at) : new Date(0);
            return docDate > latestDate ? doc : latest;
          });

          const uploadDate = new Date(mostRecent.uploaded_at);
          const now = new Date();
          const daysDiff = Math.floor((now - uploadDate) / (1000 * 60 * 60 * 24));

          if (daysDiff > 30) {
            // Must do - more than 30 days (overrides preferred)
            alerts.push({
              branchId: branch.id,
              branchName: branch.branch_name,
              documentType: docType,
              documentLabel: typeLabels[docType],
              status: 'must_do',
              daysSinceUpload: daysDiff,
              lastUploadDate: uploadDate,
              message: `ملف ${typeLabels[docType]} لم يتم تحديثه منذ ${daysDiff} يوم - يجب التحديث فوراً`
            });
          } else if (daysDiff > 25) {
            // Preferred to do - more than 25 days but not more than 30
            alerts.push({
              branchId: branch.id,
              branchName: branch.branch_name,
              documentType: docType,
              documentLabel: typeLabels[docType],
              status: 'preferred',
              daysSinceUpload: daysDiff,
              lastUploadDate: uploadDate,
              message: `ملف ${typeLabels[docType]} لم يتم تحديثه منذ ${daysDiff} يوم - يُفضل التحديث قريباً`
            });
          }
        }
      }
    }

    // Sort: must_do first, then preferred
    alerts.sort((a, b) => {
      if (a.status === 'must_do' && b.status !== 'must_do') return -1;
      if (a.status !== 'must_do' && b.status === 'must_do') return 1;
      return (b.daysSinceUpload || 0) - (a.daysSinceUpload || 0);
    });

    setMonthlyDocumentAlerts(alerts);
  };

  return (
    <div className="dashboard">
      <h1>لوحة التحكم</h1>
      <p className="welcome-message">
        {isMainManager() 
          ? `مرحباً، ${user?.full_name || user?.username}!`
          : `مرحباً، ${user?.full_name || user?.username}! - فرعك: ${branches.find(b => b.id === user?.branch_id)?.branch_name || 'غير محدد'}`
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
              <Link to="/branches" className="stat-link">عرض الكل ←</Link>
            </div>
          )}

          <div className="stat-card">
            <h3>الموظفون</h3>
            <div className="stat-number">{stats.employees}</div>
            <Link to="/employees" className="stat-link">عرض الكل ←</Link>
          </div>

          {isMainManager() && (
            <div className="stat-card">
              <h3>المستخدمون</h3>
              <div className="stat-number">{stats.users}</div>
              <Link to="/users" className="stat-link">عرض الكل ←</Link>
            </div>
          )}

          <div className="stat-card">
            <h3>مستندات الفرع</h3>
            <div className="stat-number">{stats.documents}</div>
            <Link to="/branch-documents" className="stat-link">عرض الكل ←</Link>
          </div>
        </div>
      )}

      {/* Monthly Document Alerts */}
      {monthlyDocumentAlerts.length > 0 && (
        <div className="monthly-documents-alerts">
          <h2>تنبيهات المستندات الشهرية</h2>
          <div className="alerts-container">
            {monthlyDocumentAlerts.map((alert, index) => (
              <div 
                key={`${alert.branchId}-${alert.documentType}-${index}`}
                className={`alert-card ${alert.status === 'must_do' ? 'alert-must-do' : 'alert-preferred'}`}
              >
                <div className="alert-header">
                  <span className={`alert-badge ${alert.status === 'must_do' ? 'badge-danger' : 'badge-warning'}`}>
                    {alert.status === 'must_do' ? 'يجب التنفيذ' : 'يفضل التنفيذ'}
                  </span>
                  <h3>{alert.branchName}</h3>
                </div>
                <div className="alert-body">
                  <p className="alert-message">{alert.message}</p>
                  {alert.lastUploadDate && (
                    <p className="alert-date">
                      آخر تحديث: {new Date(alert.lastUploadDate).toLocaleDateString('ar-SA')}
                    </p>
                  )}
                </div>
                <div className="alert-actions">
                  <Link 
                    to={`/branch-documents?branch_id=${alert.branchId}&document_type=${alert.documentType}`}
                    className="btn-alert"
                  >
                    رفع الملف الآن
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
            <Link to="/users" className="action-card">
              <h3>إدارة المستخدمين</h3>
              <p>إنشاء وإدارة حسابات المستخدمين</p>
            </Link>
          </div>
        </div>
      )}
    </div>
  );
};

export default Dashboard;

