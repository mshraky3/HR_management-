/**
 * Main App Component
 */

import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import Layout from './components/Layout';
import BranchManagerLayout from './components/BranchManagerLayout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import AccountManagement from './pages/AccountManagement';
import Branches from './pages/Branches';
import Employees from './pages/Employees';
import EmployeeDetails from './pages/EmployeeDetails';
import BranchDocuments from './pages/BranchDocuments';
import Reports from './pages/Reports';
import EmployeeFile from './pages/EmployeeFile';
import './App.css';

// Wrapper component to choose layout based on role
const RoleBasedLayout = ({ children }) => {
  const { isMainManager } = useAuth();
  return isMainManager() ? <Layout>{children}</Layout> : <BranchManagerLayout>{children}</BranchManagerLayout>;
};

function App() {
  return (
    <AuthProvider>
      <Router>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <RoleBasedLayout>
                  <Dashboard />
                </RoleBasedLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/account-management"
            element={
              <ProtectedRoute requireMainManager>
                <Layout>
                  <AccountManagement />
                </Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/branches"
            element={
              <ProtectedRoute>
                <RoleBasedLayout>
                  <Branches />
                </RoleBasedLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/employees"
            element={
              <ProtectedRoute>
                <RoleBasedLayout>
                  <Employees />
                </RoleBasedLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/employees/:id"
            element={
              <ProtectedRoute>
                <RoleBasedLayout>
                  <EmployeeDetails />
                </RoleBasedLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/branch-documents"
            element={
              <ProtectedRoute>
                <RoleBasedLayout>
                  <BranchDocuments />
                </RoleBasedLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/reports"
            element={
              <ProtectedRoute>
                <RoleBasedLayout>
                  <Reports />
                </RoleBasedLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/employee-file"
            element={
              <ProtectedRoute requireMainManager>
                <Layout>
                  <EmployeeFile />
                </Layout>
              </ProtectedRoute>
            }
          />
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </Router>
    </AuthProvider>
  );
}

export default App;
