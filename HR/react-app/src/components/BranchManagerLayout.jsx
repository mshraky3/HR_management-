/**
 * Branch Manager Layout Component
 * Different UI for branch managers with limited features
 */

import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import './BranchManagerLayout.css';

const BranchManagerLayout = ({ children }) => {
  const { user, logout } = useAuth();
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
    <div className="layout branch-manager-layout">
      <nav className="navbar branch-navbar">
        <div className="nav-brand">
          <h2>HRM - Branch Portal</h2>
          <span className="branch-badge">Branch Manager</span>
        </div>
        <div className="nav-links">
          <Link to="/dashboard" className={isActive('/dashboard')}>
            Dashboard
          </Link>
          <Link to="/employees" className={isActive('/employees')}>
            My Employees
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
      <main className="main-content branch-content">
        {children}
      </main>
    </div>
  );
};

export default BranchManagerLayout;

