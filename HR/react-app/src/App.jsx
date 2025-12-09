/**
 * Main App Component
 * 
 * Performance Optimization: Code Splitting & Lazy Loading
 * All page components are lazy-loaded to reduce initial bundle size by 50-70%
 */

import { lazy, Suspense } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { NotificationProvider } from './contexts/NotificationContext';
import ProtectedRoute from './components/ProtectedRoute';
import Layout from './components/Layout';
import BranchManagerLayout from './components/BranchManagerLayout';
import './App.css';
// Load shared page CSS immediately to prevent FOUC (Flash of Unstyled Content)
// This ensures table styles are available before lazy-loaded pages render
import './pages/TablePage.css';

// Login page - loaded immediately (critical for first render)
import Login from './pages/Login';

// Loading component for Suspense fallback
// This is shown while lazy-loaded components are being fetched
const PageLoading = () => (
  <div style={{ 
    display: 'flex', 
    justifyContent: 'center', 
    alignItems: 'center', 
    minHeight: '60vh',
    flexDirection: 'column',
    gap: '20px',
    padding: '40px'
  }}>
    <div 
      className="spinner-large" 
      style={{ 
        border: '4px solid rgba(185, 210, 207, 0.3)',
        borderTop: '4px solid var(--primary, #b9d2cf)'
      }}
    ></div>
    <div style={{ 
      color: 'var(--text-secondary, #334155)', 
      fontSize: '16px',
      fontWeight: '500'
    }}>
      جاري التحميل...
    </div>
  </div>
);

// Lazy load all page components (code splitting)
// These will be loaded on-demand when user navigates to each route
const Dashboard = lazy(() => import('./pages/Dashboard'));
const AccountManagement = lazy(() => import('./pages/AccountManagement'));
const Branches = lazy(() => import('./pages/Branches'));
const Employees = lazy(() => import('./pages/Employees'));
const EmployeeDetails = lazy(() => import('./pages/EmployeeDetails'));
const BranchDocuments = lazy(() => import('./pages/BranchDocuments'));
const MonthlyDocuments = lazy(() => import('./pages/MonthlyDocuments'));
const Reports = lazy(() => import('./pages/Reports'));
const EmployeeFile = lazy(() => import('./pages/EmployeeFile'));
const NotifyBranches = lazy(() => import('./pages/NotifyBranches'));
const Archive = lazy(() => import('./pages/Archive'));
const BranchStatistics = lazy(() => import('./pages/BranchStatistics'));
const TermManagement = lazy(() => import('./pages/TermManagement'));
const BranchesMonitoring = lazy(() => import('./pages/BranchesMonitoring'));
const BranchInfo = lazy(() => import('./pages/BranchInfo'));
const DirectContact = lazy(() => import('./pages/DirectContact'));

// Wrapper component to choose layout based on role
const RoleBasedLayout = ({ children }) => {
  const { isMainManager } = useAuth();
  return isMainManager() ? <Layout>{children}</Layout> : <BranchManagerLayout>{children}</BranchManagerLayout>;
};

// Root redirect component - handles authentication check before redirecting
const RootRedirect = () => {
  const { isAuthenticated, loading } = useAuth();
  
  if (loading) {
    return <PageLoading />;
  }
  
  if (isAuthenticated) {
    return <Navigate to="/dashboard" replace />;
  }
  
  return <Navigate to="/login" replace />;
};

function App() {
  return (
    <AuthProvider>
      <NotificationProvider>
        <Router>
          <Suspense fallback={<PageLoading />}>
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
                path="/monthly-documents"
                element={
                  <ProtectedRoute>
                    <RoleBasedLayout>
                      <MonthlyDocuments />
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
              <Route
                path="/notify-branches"
                element={
                  <ProtectedRoute requireMainManager>
                    <Layout>
                      <NotifyBranches />
                    </Layout>
                  </ProtectedRoute>
                }
              />
              <Route
                path="/archive"
                element={
                  <ProtectedRoute requireMainManager>
                    <Layout>
                      <Archive />
                    </Layout>
                  </ProtectedRoute>
                }
              />
              <Route
                path="/branch-statistics"
                element={
                  <ProtectedRoute requireMainManager>
                    <Layout>
                      <BranchStatistics />
                    </Layout>
                  </ProtectedRoute>
                }
              />
              <Route
                path="/term-management"
                element={
                  <ProtectedRoute requireMainManager>
                    <Layout>
                      <TermManagement />
                    </Layout>
                  </ProtectedRoute>
                }
              />
              <Route
                path="/branches-monitoring"
                element={
                  <ProtectedRoute requireMainManager>
                    <Layout>
                      <BranchesMonitoring />
                    </Layout>
                  </ProtectedRoute>
                }
              />
              <Route
                path="/direct-contact"
                element={
                  <ProtectedRoute requireMainManager>
                    <Layout>
                      <DirectContact />
                    </Layout>
                  </ProtectedRoute>
                }
              />
              <Route
                path="/branch-info"
                element={
                  <ProtectedRoute>
                    <RoleBasedLayout>
                      <BranchInfo />
                    </RoleBasedLayout>
                  </ProtectedRoute>
                }
              />
              <Route 
                path="/" 
                element={<Navigate to="/login" replace />} 
              />
            </Routes>
          </Suspense>
        </Router>
      </NotificationProvider>
    </AuthProvider>
  );
}

export default App;
