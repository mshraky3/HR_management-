/**
 * Main App Component
 *
 * Performance Optimization: Code Splitting & Lazy Loading
 * All page components are lazy-loaded to reduce initial bundle size by 50-70%
 */
import { Analytics } from "@vercel/analytics/react";
import { lazy, Suspense } from "react";
import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate,
} from "react-router-dom";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import { NotificationProvider } from "./contexts/NotificationContext";
import {
  BackendErrorProvider,
  useBackendError,
} from "./contexts/BackendErrorContext";
import ProtectedRoute from "./components/ProtectedRoute";
import Layout from "./components/Layout";
import BranchManagerLayout from "./components/BranchManagerLayout";
import BranchOpsLayout from "./components/BranchOpsLayout";
import MaintenancePage from "./pages/MaintenancePage";
import "./App.css";
// Load shared page CSS immediately to prevent FOUC (Flash of Unstyled Content)
// This ensures table styles are available before lazy-loaded pages render
import "./pages/TablePage.css";

// Login page - loaded immediately (critical for first render)
import Login from "./pages/Login";

// Loading component for Suspense fallback
// This is shown while lazy-loaded components are being fetched
const PageLoading = () => (
  <div
    style={{
      display: "flex",
      justifyContent: "center",
      alignItems: "center",
      minHeight: "60vh",
      flexDirection: "column",
      gap: "20px",
      padding: "40px",
    }}
  >
    <div
      className="spinner-large"
      style={{
        border: "4px solid rgba(73, 136, 196, 0.3)",
        borderTop: "4px solid var(--primary, #4988C4)",
      }}
    ></div>
    <div
      style={{
        color: "var(--text-secondary, #334155)",
        fontSize: "16px",
        fontWeight: "500",
      }}
    >
      جاري التحميل...
    </div>
  </div>
);

// Recover from stale hashed chunks after a new deployment by reloading once.
const lazyRetry = (importer) =>
  lazy(async () => {
    const retryKey = "lazy-chunk-retry";
    const hasRetried = window.sessionStorage.getItem(retryKey) === "1";
    try {
      const mod = await importer();
      window.sessionStorage.removeItem(retryKey);
      return mod;
    } catch (error) {
      const message = error?.message || "";
      const isChunkError =
        message.includes("Failed to fetch dynamically imported module") ||
        message.includes("ChunkLoadError");

      if (isChunkError && !hasRetried) {
        window.sessionStorage.setItem(retryKey, "1");
        window.location.reload();
      }

      throw error;
    }
  });

// Lazy load all page components (code splitting)
// These will be loaded on-demand when user navigates to each route
const Dashboard = lazyRetry(() => import("./pages/Dashboard"));
const AccountManagement = lazyRetry(() => import("./pages/AccountManagement"));
const BranchOpsAccounts = lazyRetry(() => import("./pages/BranchOpsAccounts"));
const Branches = lazyRetry(() => import("./pages/Branches"));
const Employees = lazyRetry(() => import("./pages/Employees"));
const EmployeeDetails = lazyRetry(() => import("./pages/EmployeeDetails/index.jsx"));
const BranchDocuments = lazyRetry(() => import("./pages/BranchDocuments"));
const Reports = lazyRetry(() => import("./pages/Reports"));
const BranchDocumentsReport = lazyRetry(() => import("./pages/BranchDocumentsReport"));
const EmployeeFile = lazyRetry(() => import("./pages/EmployeeFile"));
const NotifyBranches = lazyRetry(() => import("./pages/NotifyBranches"));
const Archive = lazyRetry(() => import("./pages/Archive"));
const BranchStatistics = lazyRetry(() => import("./pages/BranchStatistics"));
const TermManagement = lazyRetry(() => import("./pages/TermManagement"));
const BranchDocumentsManagement = lazyRetry(
  () => import("./pages/BranchDocumentsManagement"),
);
const BranchInfo = lazyRetry(() => import("./pages/BranchInfo"));
const DirectContact = lazyRetry(() => import("./pages/DirectContact"));
const BranchRequests = lazyRetry(() => import("./pages/BranchRequests"));
const ManageRequests = lazyRetry(() => import("./pages/ManageRequests"));
const FixMissingDates = lazyRetry(() => import("./pages/FixMissingDates"));
const PayrollAbsenceAdmin = lazyRetry(() => import("./pages/PayrollAbsenceAdmin"));
const EmployeeStatistics = lazyRetry(() => import("./pages/EmployeeStatistics"));
const EmployeeStatisticsReport = lazyRetry(() => import("./pages/EmployeeStatisticsReport"));
const BusTransportationReport = lazyRetry(() => import("./pages/BusTransportationReport"));
const ExperienceCertificate = lazyRetry(
  () => import("./pages/ExperienceCertificate"),
);
const EmployeeTransfer = lazyRetry(() => import("./pages/EmployeeTransfer"));
const BusTransportation = lazyRetry(() => import("./pages/BusTransportation.jsx"));
const Suggestions = lazyRetry(() => import("./pages/Suggestions"));
const Beneficiaries = lazyRetry(() => import("./pages/Beneficiaries"));
const BeneficiariesArchive = lazyRetry(() => import("./pages/BeneficiariesArchive"));
const TreatmentPlanSubmission = lazyRetry(() => import("./pages/TreatmentPlanSubmission"));
const TreatmentPlanMonitor = lazyRetry(() => import("./pages/TreatmentPlanMonitor"));
const TestEmails = lazyRetry(() => import("./pages/TestEmails"));
const EmployeeExpiry = lazyRetry(() => import("./pages/EmployeeExpiry"));

// Wrapper component to choose layout based on role
const RoleBasedLayout = ({ children }) => {
  const { isMainManager, isBranchOperationsManager } = useAuth();
  if (isMainManager()) return <Layout>{children}</Layout>;
  if (isBranchOperationsManager()) return <BranchOpsLayout>{children}</BranchOpsLayout>;
  return <BranchManagerLayout>{children}</BranchManagerLayout>;
};

const BlockBranchOpsRoute = ({ children, fallback = "/dashboard" }) => {
  const { isBranchOperationsManager } = useAuth();

  if (isBranchOperationsManager()) {
    return <Navigate to={fallback} replace />;
  }

  return children;
};

const BranchDocumentsRoute = () => {
  const { isBranchOperationsManager } = useAuth();

  return (
    <RoleBasedLayout>
      {isBranchOperationsManager() ? <BranchDocumentsManagement /> : <BranchDocuments />}
    </RoleBasedLayout>
  );
};

// App content component that checks for backend errors
const AppContent = () => {
  const { isBackendDown } = useBackendError();

  // Show maintenance page if backend is down
  if (isBackendDown) {
    return <MaintenancePage />;
  }

  // Otherwise show normal app routes
  return (
    <Suspense fallback={<PageLoading />}>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/treatment-plans" element={<TreatmentPlanSubmission />} />
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
          path="/branch-ops-accounts"
          element={
            <ProtectedRoute requireMainManager>
              <Layout>
                <BranchOpsAccounts />
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
          path="/employee-transfer"
          element={
            <ProtectedRoute requireMainManager>
              <Layout>
                <EmployeeTransfer />
              </Layout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/branch-documents"
          element={
            <ProtectedRoute>
              <BranchDocumentsRoute />
            </ProtectedRoute>
          }
        />
        <Route
          path="/reports"
          element={
            <ProtectedRoute>
              <BlockBranchOpsRoute>
                <RoleBasedLayout>
                  <Reports />
                </RoleBasedLayout>
              </BlockBranchOpsRoute>
            </ProtectedRoute>
          }
        />
        <Route
          path="/branch-documents-report"
          element={
            <ProtectedRoute requireMainManager>
              <Layout>
                <BranchDocumentsReport />
              </Layout>
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
          path="/experience-certificate"
          element={
            <ProtectedRoute requireMainManager>
              <Layout>
                <ExperienceCertificate />
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
            <ProtectedRoute>
              <BlockBranchOpsRoute>
                <RoleBasedLayout>
                  <BranchStatistics />
                </RoleBasedLayout>
              </BlockBranchOpsRoute>
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
                <BranchDocumentsManagement />
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
          path="/branch-requests"
          element={
            <ProtectedRoute>
              <RoleBasedLayout>
                <BranchRequests />
              </RoleBasedLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/manage-requests"
          element={
            <ProtectedRoute requireMainManager>
              <Layout>
                <ManageRequests />
              </Layout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/fix-missing-dates"
          element={
            <ProtectedRoute requireMainManager>
              <Layout>
                <FixMissingDates />
              </Layout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/payroll-absence-admin"
          element={
            <ProtectedRoute requireMainManager>
              <Layout>
                <PayrollAbsenceAdmin />
              </Layout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/employee-expiry"
          element={
            <ProtectedRoute>
              <RoleBasedLayout>
                <EmployeeExpiry />
              </RoleBasedLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/employee-statistics"
          element={
            <ProtectedRoute>
              <RoleBasedLayout>
                <EmployeeStatistics />
              </RoleBasedLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/employee-statistics-report"
          element={
            <ProtectedRoute>
              <RoleBasedLayout>
                <EmployeeStatisticsReport />
              </RoleBasedLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/bus-transportation-report"
          element={
            <ProtectedRoute>
              <RoleBasedLayout>
                <BusTransportationReport />
              </RoleBasedLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/students-report"
          element={
            <ProtectedRoute>
              <RoleBasedLayout>
                <BusTransportationReport />
              </RoleBasedLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/bus-transportation"
          element={
            <ProtectedRoute>
              <RoleBasedLayout>
                <BusTransportation />
              </RoleBasedLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/suggestions"
          element={
            <ProtectedRoute>
              <RoleBasedLayout>
                <Suggestions />
              </RoleBasedLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/beneficiaries"
          element={
            <ProtectedRoute>
              <RoleBasedLayout>
                <Beneficiaries />
              </RoleBasedLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/beneficiaries-archive"
          element={
            <ProtectedRoute requireMainManager>
              <Layout>
                <BeneficiariesArchive />
              </Layout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/treatment-plans-monitor"
          element={
            <ProtectedRoute requireMainManager>
              <Layout>
                <TreatmentPlanMonitor />
              </Layout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/test-emails"
          element={
            <ProtectedRoute requireMainManager>
              <Layout>
                <TestEmails />
              </Layout>
            </ProtectedRoute>
          }
        />
        <Route path="/" element={<Navigate to="/login" replace />} />
      </Routes>
    </Suspense>
  );
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
    <BackendErrorProvider>
      <AuthProvider>
        <NotificationProvider>
          <Router>
            <AppContent />
            <Analytics />
          </Router>
        </NotificationProvider>
      </AuthProvider>
    </BackendErrorProvider>
  );
}

export default App;
