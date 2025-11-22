/**
 * Branch Manager Layout Component
 * Different UI for branch managers with limited features
 */

import { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import './BranchManagerLayout.css';

const BranchManagerLayout = ({ children }) => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const isActive = (path) => {
    return location.pathname === path ? 'active' : '';
  };

  const toggleMobileMenu = () => {
    setMobileMenuOpen(!mobileMenuOpen);
  };

  return (
    <div className="layout branch-manager-layout">
      <nav className="navbar branch-navbar">
        <div className="nav-brand">
          <h2>نظام إدارة الموارد البشرية</h2>
          <span className="branch-badge">مدير فرع</span>
        </div>
        <button 
          className="mobile-menu-toggle" 
          onClick={toggleMobileMenu}
          aria-label="تبديل القائمة"
        >
          {mobileMenuOpen ? '✕' : '☰'}
        </button>
        <div className={`nav-links ${mobileMenuOpen ? 'mobile-open' : ''}`}>
          <Link to="/dashboard" className={isActive('/dashboard')} onClick={() => setMobileMenuOpen(false)}>
            لوحة التحكم
          </Link>
          <Link to="/employees" className={isActive('/employees')} onClick={() => setMobileMenuOpen(false)}>
            موظفي الفرع
          </Link>
          <Link to="/branch-documents" className={isActive('/branch-documents')} onClick={() => setMobileMenuOpen(false)}>
            مستندات الفرع
          </Link>
        </div>
        <div className="nav-user">
          <span className="user-info">
            {user?.full_name || user?.username}
          </span>
          <button onClick={handleLogout} className="logout-button">
            تسجيل الخروج
          </button>
        </div>
      </nav>
      <main className="main-content branch-content">
        {children}
      </main>
    </div>
  );
};

export default BranchManagerLayout;

