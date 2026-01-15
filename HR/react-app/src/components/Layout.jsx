/**
 * Layout Component
 * Main layout with navigation - Main Manager only
 */

import { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { usePushNotifications } from '../contexts/PushNotificationContext';
import NotificationSettings from './NotificationSettings';
import './Layout.css';

const Layout = ({ children }) => {
  const { user, logout, isMainManager } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [openDropdown, setOpenDropdown] = useState(null);
  const [showNotificationSettings, setShowNotificationSettings] = useState(false);

  const {
    isSupported: notificationsSupported,
    permission: notificationPermission,
    isEnabled: notificationsEnabled,
    shouldPromptForPermission,
    requestPermission
  } = usePushNotifications();

  // Prompt for notification permission on first load (if needed)
  useEffect(() => {
    if (shouldPromptForPermission()) {
      // Show a subtle prompt after 3 seconds
      const timer = setTimeout(() => {
        // Don't auto-prompt, just highlight the bell icon
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [shouldPromptForPermission]);

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

  // Navigation menu structure
  const menuItems = {
    management: {
      label: 'الإدارة',
      items: [
        { path: '/dashboard', label: 'لوحة التحكم' },
        { path: '/account-management', label: 'إدارة الحسابات' },
        { path: '/branches', label: 'حسابات الفروع' },
      ]
    },
    employees: {
      label: 'الموظفين',
      items: [
        { path: '/employees', label: 'البحث عن موظف' },
        { path: '/payroll-absence-admin', label: 'المسيرات' },
      ]
    },
    reports: {
      label: 'التقارير',
      items: [
        { path: '/employee-file', label: 'ملف موظف' },
        { path: '/reports', label: 'التقارير' },
      ]
    },
    monitoring: {
      label: 'المتابعة والمراقبة',
      items: [
        { path: '/branches-monitoring', label: 'الفروع' },
        { path: '/branch-statistics', label: 'إحصائيات الفروع' },
        { path: '/term-management', label: 'إدارة الفصول' },
        { path: '/fix-missing-dates', label: 'البيانات غير الدقيقة' },
        { path: '/archive', label: 'الأرشيف' },
      ]
    },
    communication: {
      label: 'التواصل',
      items: [
        { path: '/manage-requests', label: 'إدارة الطلبات' },
        { path: '/notify-branches', label: 'إشعار الفروع' },
        { path: '/direct-contact', label: 'التواصل المباشر' },
      ]
    }
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

          {/* Standalone menu item */}
          <Link
            to="/bus-transportation"
            className={`nav-link ${isActive('/bus-transportation')}`}
            onClick={() => {
              setMobileMenuOpen(false);
              closeDropdown();
            }}
          >
            الباصات
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
      <main className="main-content">
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

export default Layout;

