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
import Users from './pages/Users';
import Branches from './pages/Branches';
import Employees from './pages/Employees';
import Documents from './pages/Documents';
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
            path="/users"
            element={
              <ProtectedRoute requireMainManager>
                <Layout>
                  <Users />
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
            path="/documents"
            element={
              <ProtectedRoute>
                <RoleBasedLayout>
                  <Documents />
                </RoleBasedLayout>
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
