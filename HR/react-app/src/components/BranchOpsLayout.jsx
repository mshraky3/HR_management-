/**
 * Branch Operations Manager Layout Component
 * Limited UI for branch operations managers with scoped features
 */

import { useState } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import "./BranchManagerLayout.css";

const NAV_ITEMS = [
    { path: "/dashboard", label: "لوحة التحكم" },
    { path: "/branch-documents", label: "مستندات الفروع" },
    { path: "/bus-transportation", label: "الباصات" },
];

const BranchOpsLayout = ({ children }) => {
    const { user, logout } = useAuth();
    const navigate = useNavigate();
    const location = useLocation();
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

    const handleLogout = () => {
        logout();
        navigate("/login");
    };

    const isActive = (path) => location.pathname === path ? "active" : "";

    return (
        <div className="layout branch-manager-layout">
            <nav className="navbar branch-navbar branch-ops-nav">
                <div className="nav-brand">
                    <h2>نظام إدارة الموارد البشرية</h2>
                    <span className="branch-badge">مدير عمليات</span>
                </div>
                <button
                    className="mobile-menu-toggle"
                    onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                    aria-label="تبديل القائمة"
                >
                    {mobileMenuOpen ? "✕" : "☰"}
                </button>
                <div
                    className={`nav-links ${mobileMenuOpen ? "mobile-open" : ""}`}
                >
                    {NAV_ITEMS.map((item) => (
                        <Link
                            key={item.path}
                            to={item.path}
                            className={`nav-link ${isActive(item.path)}`}
                            onClick={() => setMobileMenuOpen(false)}
                        >
                            {item.label}
                        </Link>
                    ))}
                    <button
                        onClick={handleLogout}
                        className="btn btn-secondary logout-button mobile-only"
                    >
                        تسجيل الخروج
                    </button>
                </div>
                {mobileMenuOpen && (
                    <div
                        className="nav-overlay"
                        onClick={() => setMobileMenuOpen(false)}
                        aria-hidden="true"
                    />
                )}
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
            <main className="main-content branch-content">{children}</main>
        </div>
    );
};

export default BranchOpsLayout;
