/**
 * Layout Component
 * Main layout with navigation - Main Manager only
 */

import { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import './Layout.css';

const Layout = ({ children }) => {
  const { user, logout, isMainManager } = useAuth();
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
    <div className="layout main-manager-layout">
      <nav className="navbar main-navbar">
        <div className="nav-brand">
          <h2>نظام إدارة الموارد البشرية</h2>
          <span className="manager-badge">مدير رئيسي</span>
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
          <Link to="/users" className={isActive('/users')} onClick={() => setMobileMenuOpen(false)}>
            المستخدمون
          </Link>
          <Link to="/branches" className={isActive('/branches')} onClick={() => setMobileMenuOpen(false)}>
            الفروع
          </Link>
          <Link to="/employees" className={isActive('/employees')} onClick={() => setMobileMenuOpen(false)}>
            الموظفون
          </Link>
          <Link to="/branch-documents" className={isActive('/branch-documents')} onClick={() => setMobileMenuOpen(false)}>
            مستندات الفروع
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
      <main className="main-content">
        {children}
      </main>
    </div>
  );
};

export default Layout;

