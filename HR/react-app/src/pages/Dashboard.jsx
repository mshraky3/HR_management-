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
      if (branchesRes.data.success) {
        setBranches(branchesRes.data.data || []);
      }

      // For branch documents
      let documentsRes = { data: { data: [] } };
      try {
        documentsRes = await branchDocumentsAPI.getAll(documentFilters);
      } catch (error) {
        // If no documents or error, just use empty array
        console.log('No branch documents found or error:', error);
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

