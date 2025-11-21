/**
 * Dashboard Page
 * Overview of all tables and statistics
 */

import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { branchesAPI, employeesAPI, usersAPI, documentsAPI } from '../utils/api';
import './Dashboard.css';

const Dashboard = () => {
  const { user, isMainManager } = useAuth();
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
      const [branchesRes, employeesRes] = await Promise.all([
        branchesAPI.getAll({ is_active: true }),
        employeesAPI.getAll({ is_active: true }),
      ]);

      // For documents, use unverified filter to get a count (or empty object if no filter)
      let documentsRes = { data: { data: [] } };
      try {
        documentsRes = await documentsAPI.getAll({ unverified: 'true' });
      } catch (error) {
        // If no documents or error, just use empty array
        console.log('No documents found or error:', error);
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
      <h1>Dashboard</h1>
      <p className="welcome-message">
        Welcome, {user?.full_name || user?.username}!
      </p>

      {stats.loading ? (
        <div className="loading">Loading statistics...</div>
      ) : (
        <div className="stats-grid">
          <div className="stat-card">
            <h3>Branches</h3>
            <div className="stat-number">{stats.branches}</div>
            <Link to="/branches" className="stat-link">View All →</Link>
          </div>

          <div className="stat-card">
            <h3>Employees</h3>
            <div className="stat-number">{stats.employees}</div>
            <Link to="/employees" className="stat-link">View All →</Link>
          </div>

          {isMainManager() && (
            <div className="stat-card">
              <h3>Users</h3>
              <div className="stat-number">{stats.users}</div>
              <Link to="/users" className="stat-link">View All →</Link>
            </div>
          )}

          <div className="stat-card">
            <h3>Documents</h3>
            <div className="stat-number">{stats.documents}</div>
            <Link to="/documents" className="stat-link">View All →</Link>
          </div>
        </div>
      )}

      <div className="quick-actions">
        <h2>Quick Actions</h2>
        <div className="actions-grid">
          {isMainManager() && (
            <Link to="/branches" className="action-card">
              <h3>Manage Branches</h3>
              <p>View and manage all branches</p>
            </Link>
          )}
          <Link to="/employees" className="action-card">
            <h3>{isMainManager() ? 'Manage Employees' : 'My Employees'}</h3>
            <p>{isMainManager() ? 'View and manage employee records' : 'View and manage your branch employees'}</p>
          </Link>
          <Link to="/documents" className="action-card">
            <h3>Manage Documents</h3>
            <p>Upload and manage documents</p>
          </Link>
          {isMainManager() && (
            <>
              <Link to="/users" className="action-card">
                <h3>Manage Users</h3>
                <p>Create and manage user accounts</p>
              </Link>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default Dashboard;

