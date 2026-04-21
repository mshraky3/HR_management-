/**
 * Layout Component
 * Main layout with navigation - Main Manager only
 */

import { useState, useEffect, useCallback } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import "./Layout.css";

const Layout = ({ children }) => {
  const { user, logout, isMainManager } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [openDropdown, setOpenDropdown] = useState(null);

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  const isActive = (path) => {
    return location.pathname === path ? "active" : "";
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

  // Global keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Don't trigger if user is typing in an input/textarea/contenteditable
      const tag = e.target.tagName;
      const isEditable = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || e.target.isContentEditable;

      // "/" to focus any search input on the page (skip if already in an input)
      if (e.key === '/' && !isEditable) {
        e.preventDefault();
        const searchInput = document.querySelector('input[type="search"], input[placeholder*="بحث"], input[placeholder*="search"]');
        if (searchInput) searchInput.focus();
        return;
      }

      // Escape to close dropdowns/modals
      if (e.key === 'Escape') {
        setOpenDropdown(null);
        setMobileMenuOpen(false);
        // Blur active element to dismiss page dropdowns
        if (isEditable) e.target.blur();
        return;
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = () => {
      setOpenDropdown(null);
    };
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, []);

  // Navigation menu structure
  const menuItems = {
    management: {
      label: "الإدارة",
      items: [
        { path: "/dashboard", label: "لوحة التحكم" },
        { path: "/account-management", label: "إدارة الحسابات" },
        { path: "/branch-ops-accounts", label: "حسابات إدارة بيانات الفروع" },
        { path: "/branches", label: "حسابات الفروع" },
      ],
    },
    employees: {
      label: "الموظفين",
      items: [
        { path: "/employees", label: "البحث عن موظف" },
        { path: "/employee-transfer", label: "نقل وربط الموظفين" },
        { path: "/employee-statistics", label: "احصائيات" },
        { path: "/employee-expiry", label: "التواريخ المنتهية" },
      ],
    },
    reports: {
      label: "التقارير",
      items: [
        { path: "/employee-file", label: "ملف موظف" },
        { path: "/reports", label: "التقارير" },
        { path: "/branch-documents-report", label: "احصائيات المستندات" },
        { path: "/employee-statistics-report", label: "تقرير إحصائيات الموظفين" },
        { path: "/bus-transportation-report", label: "تقرير النقل بالحافلات" },
        { path: "/experience-certificate", label: "شهادات و تعاريف" },
      ],
    },
    monitoring: {
      label: "متابعة الفروع",
      items: [
        { path: "/branches-monitoring", label: "المستندات" },
        { path: "/branch-statistics", label: "إحصائيات الفروع" },
        { path: "/term-management", label: "إدارة الفصول" },
        { path: "/fix-missing-dates", label: "البيانات غير الدقيقة" },
        { path: "/archive", label: "الأرشيف" },
        { path: "/beneficiaries-archive", label: "أرشيف المستفيدين" },
        { path: "/treatment-plans-monitor", label: "الخطط العلاجية" },
      ],
    },
    communication: {
      label: "التواصل",
      items: [
        { path: "/manage-requests", label: "إدارة الطلبات" },
        { path: "/notify-branches", label: "إشعار الفروع" },
        { path: "/direct-contact", label: "التواصل المباشر" },
      ],
    },
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
          <span aria-hidden="true">{mobileMenuOpen ? "✕" : "☰"}</span>
        </button>
        <div className={`nav-links ${mobileMenuOpen ? "mobile-open" : ""}`}>
          {Object.entries(menuItems).map(([key, menu]) => (
            <div key={key} className="nav-dropdown">
              <button
                className={`dropdown-toggle ${isActive(menu.items.map((item) => item.path).find((path) => location.pathname === path)) ? "active" : ""}`}
                onClick={(e) => {
                  e.stopPropagation();
                  toggleDropdown(key);
                }}
                aria-expanded={openDropdown === key}
                aria-haspopup="true"
                aria-controls={`dropdown-${key}`}
              >
                {menu.label}
                <span className="dropdown-arrow">▼</span>
              </button>
              <div
                id={`dropdown-${key}`}
                role="menu"
                className={`dropdown-menu ${openDropdown === key ? "open" : ""}`}
              >
                {menu.items.map((item) => (
                  <Link
                    key={item.path}
                    to={item.path}
                    role="menuitem"
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

          {/* Standalone menu items */}
          <Link
            to="/bus-transportation"
            className={`nav-link ${isActive("/bus-transportation")}`}
            onClick={() => {
              setMobileMenuOpen(false);
              closeDropdown();
            }}
          >
            الباصات
          </Link>
          <Link
            to="/payroll-absence-admin"
            className={`nav-link ${isActive("/payroll-absence-admin")}`}
            onClick={() => {
              setMobileMenuOpen(false);
              closeDropdown();
            }}
          >
            مسيرات الرواتب
          </Link>
          <Link
            to="/beneficiaries"
            className={`nav-link ${isActive("/beneficiaries")}`}
            onClick={() => {
              setMobileMenuOpen(false);
              closeDropdown();
            }}
          >
            المستفيدين
          </Link>
          <Link
            to="/suggestions"
            className={`nav-link ${isActive("/suggestions")}`}
            onClick={() => {
              setMobileMenuOpen(false);
              closeDropdown();
            }}
          >
            الاقتراحات
          </Link>
        </div>
        <div className="nav-user">
          <span className="user-info">{user?.full_name || user?.username}</span>
          <button
            onClick={handleLogout}
            className="btn btn-secondary logout-button"
          >
            تسجيل الخروج
          </button>
        </div>
      </nav>
      <main className="main-content">{children}</main>
    </div>
  );
};

export default Layout;
