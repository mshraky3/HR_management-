/**
 * Layout Component
 * Main layout with navigation - Main Manager only
 */

import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import './Layout.css';

const Layout = ({ children }) => {
  const { user, logout, isMainManager } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const isActive = (path) => {
    return location.pathname === path ? 'active' : '';
  };

  return (
    <div className="layout main-manager-layout">
      <nav className="navbar main-navbar">
        <div className="nav-brand">
          <h2>HRM System - Main Portal</h2>
          <span className="manager-badge">Main Manager</span>
        </div>
        <div className="nav-links">
          <Link to="/dashboard" className={isActive('/dashboard')}>
            Dashboard
          </Link>
          <Link to="/users" className={isActive('/users')}>
            Users
          </Link>
          <Link to="/branches" className={isActive('/branches')}>
            Branches
          </Link>
          <Link to="/employees" className={isActive('/employees')}>
            Employees
          </Link>
          <Link to="/documents" className={isActive('/documents')}>
            Documents
          </Link>
        </div>
        <div className="nav-user">
          <span className="user-info">
            {user?.full_name || user?.username}
          </span>
          <button onClick={handleLogout} className="logout-button">
            Logout
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

