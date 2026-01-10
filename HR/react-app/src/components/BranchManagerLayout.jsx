/**
 * Branch Manager Layout Component
 * Different UI for branch managers with limited features
 */

import { useState, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { usePushNotifications } from '../contexts/PushNotificationContext';
import NotificationSettings from './NotificationSettings';
import './BranchManagerLayout.css';

const BranchManagerLayout = ({ children }) => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [openDropdown, setOpenDropdown] = useState(null);
  const [showNotificationSettings, setShowNotificationSettings] = useState(false);
  
  const { 
    isSupported: notificationsSupported,
    permission: notificationPermission,
    isEnabled: notificationsEnabled,
  } = usePushNotifications();

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

  const toggleDropdown = (dropdownName) => {
    setOpenDropdown(openDropdown === dropdownName ? null : dropdownName);
  };

  const closeDropdown = () => {
    setOpenDropdown(null);
  };

  // Navigation menu structure for branch managers
  const menuItems = {
    main: {
      label: 'الرئيسية',
      items: [
        { path: '/dashboard', label: 'لوحة التحكم' },
        { path: '/branch-info', label: 'معلومات الفرع' },
      ]
    },
    employees: {
      label: 'الموظفين',
      items: [
        { path: '/employees', label: 'موظفي الفرع' },
        { path: '/reports', label: 'إصدار التقارير' },
      ]
    }
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
          {Object.entries(menuItems).map(([key, menu]) => (
            <div key={key} className="nav-dropdown">
              <button
                className={`dropdown-toggle ${isActive(menu.items.map(item => item.path).find(path => location.pathname === path)) ? 'active' : ''}`}
                onClick={() => toggleDropdown(key)}
              >
                {menu.label}
                <span className="dropdown-arrow">▼</span>
              </button>
              <div className={`dropdown-menu ${openDropdown === key ? 'open' : ''}`}>
                {menu.items.map((item) => (
                  <Link
                    key={item.path}
                    to={item.path}
                    className={isActive(item.path)}
                    onClick={() => {
                      setMobileMenuOpen(false);
                      closeDropdown();
                    }}
                  >
                    {item.label}
                  </Link>
                ))}
              </div>
            </div>
          ))}
          {/* Direct navigation links (moved from documents dropdown) */}
          <Link
            to="/branch-documents"
            className={`nav-link ${isActive('/branch-documents')}`}
            onClick={() => setMobileMenuOpen(false)}
          >
            مستندات الفرع
          </Link>
          <Link
            to="/branch-requests"
            className={`nav-link ${isActive('/branch-requests')}`}
            onClick={() => setMobileMenuOpen(false)}
          >
            طلبات
          </Link>
        </div>
        <div className="nav-user">
          {/* Notification Bell */}
          {notificationsSupported && (
            <button 
              className={`notification-bell ${notificationPermission === 'default' ? 'prompt' : ''} ${notificationsEnabled ? 'enabled' : ''}`}
              onClick={() => setShowNotificationSettings(true)}
              title="إعدادات الإشعارات"
            >
              🔔
              {notificationPermission === 'default' && <span className="notification-dot"></span>}
            </button>
          )}
          <span className="user-info">
            {user?.full_name || user?.username}
          </span>
          <button onClick={handleLogout} className="btn btn-secondary logout-button">
            تسجيل الخروج
          </button>
        </div>
      </nav>
      <main className="main-content branch-content">
        {children}
      </main>
      
      {/* Notification Settings Modal */}
      {showNotificationSettings && (
        <div className="notification-settings-modal" onClick={() => setShowNotificationSettings(false)}>
          <div onClick={(e) => e.stopPropagation()}>
            <NotificationSettings onClose={() => setShowNotificationSettings(false)} />
          </div>
        </div>
      )}
    </div>
  );
};

export default BranchManagerLayout;

