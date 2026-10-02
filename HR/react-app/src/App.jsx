/**
 * Main App Component
 *
 * Performance Optimization: Code Splitting & Lazy Loading
 * All page components are lazy-loaded to reduce initial bundle size by 50-70%
 */
import { lazy } from "react";


import { useAuth } from "./contexts/AuthContext";
import {
  useBackendError,
} from "./contexts/BackendErrorContext";
import "./App.css";
// Load shared page CSS immediately to prevent FOUC (Flash of Unstyled Content)
// This ensures table styles are available before lazy-loaded pages render
import "./pages/TablePage.css";
import { BrowserRouter as Router, Navigate, Route, Routes } from "react-router-dom";
import { Suspense } from "react";
import { Analytics } from "@vercel/analytics/react";
import { Spinner } from "./ui/feedback.jsx";
import AppShell from "./ui/AppShell.jsx";
import { RequireAuth, RequireRole, NotFound, ROLES } from "./ui/RouteGuards.jsx";
import { ConfirmProvider } from "./ui/ConfirmProvider.jsx";
import MaintenancePage from "./pages/MaintenancePage.jsx";
import Login from "./pages/Login.jsx";
import { BackendErrorProvider } from "./contexts/BackendErrorContext.jsx";
import { AuthProvider } from "./contexts/AuthContext.jsx";
import { NotificationProvider } from "./contexts/NotificationContext.jsx";

// Login page - loaded immediately (critical for first render)

// Loading component for Suspense fallback
// This is shown while lazy-loaded components are being fetched
const PageLoading = () => (
  <div className="ui-fullpage">
    <Spinner size={36} label="جاري التحميل…" block />
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
const TestEmails = lazyRetry(() => import("./pages/TestEmails"));
const EmployeeExpiry = lazyRetry(() => import("./pages/EmployeeExpiry"));
const YearCycle = lazyRetry(() => import("./pages/YearCycle"));
const BranchArchive = lazyRetry(() => import("./pages/BranchArchive"));

// /branch-documents: operations managers get the multi-branch management screen, branch managers their own documents
const BranchDocumentsRoute = () => {
  const { isBranchOperationsManager } = useAuth();
  return isBranchOperationsManager() ? <BranchDocumentsManagement /> : <BranchDocuments />;
};

// /archive: the head office manages the archive, a branch manager sees who left their branch
const ArchiveRoute = () => {
  const { isMainManager } = useAuth();
  return isMainManager() ? <Archive /> : <BranchArchive />;
};

// App content component that checks for backend errors
const AppContent = () => {
  const { isBackendDown } = useBackendError();

  // Show maintenance page if backend is down
  if (isBackendDown) {
    return <MaintenancePage />;
  }

  // One shell for every role; each group of routes is limited to the roles that may open it
  // (the same lists feed the sidebar in ui/nav.config.js, and the API enforces them again).
  return (
    <Suspense fallback={<PageLoading />}>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/" element={<RootRedirect />} />

        <Route element={<RequireAuth />}>
          <Route element={<AppShell />}>
            {/* all roles */}
            <Route element={<RequireRole roles={ROLES.ALL} />}>
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/bus-transportation" element={<BusTransportation />} />
              <Route path="/branch-documents" element={<BranchDocumentsRoute />} />
            </Route>

            {/* head office + branch managers */}
            <Route element={<RequireRole roles={ROLES.MAIN_BRANCH} />}>
              <Route path="/employees" element={<Employees />} />
              <Route path="/employees/:id" element={<EmployeeDetails />} />
              <Route path="/employee-expiry" element={<EmployeeExpiry />} />
              <Route path="/employee-statistics" element={<EmployeeStatistics />} />
              <Route path="/employee-statistics-report" element={<EmployeeStatisticsReport />} />
              <Route path="/bus-transportation-report" element={<BusTransportationReport />} />
              <Route path="/students-report" element={<BusTransportationReport />} />
              <Route path="/reports" element={<Reports />} />
              <Route path="/branch-statistics" element={<BranchStatistics />} />
              <Route path="/beneficiaries" element={<Beneficiaries />} />
              <Route path="/suggestions" element={<Suggestions />} />
              <Route path="/archive" element={<ArchiveRoute />} />
            </Route>

            {/* branch managers only */}
            <Route element={<RequireRole roles={ROLES.BRANCH} />}>
              <Route path="/branch-info" element={<BranchInfo />} />
              <Route path="/branch-requests" element={<BranchRequests />} />
            </Route>

            {/* head office only */}
            <Route element={<RequireRole roles={ROLES.MAIN} />}>
              <Route path="/year-cycle" element={<YearCycle />} />
              <Route path="/account-management" element={<AccountManagement />} />
              <Route path="/branch-ops-accounts" element={<BranchOpsAccounts />} />
              <Route path="/branches" element={<Branches />} />
              <Route path="/employee-transfer" element={<EmployeeTransfer />} />
              <Route path="/branch-documents-report" element={<BranchDocumentsReport />} />
              <Route path="/employee-file" element={<EmployeeFile />} />
              <Route path="/experience-certificate" element={<ExperienceCertificate />} />
              <Route path="/notify-branches" element={<NotifyBranches />} />
              <Route path="/term-management" element={<TermManagement />} />
              <Route path="/branches-monitoring" element={<BranchDocumentsManagement />} />
              <Route path="/direct-contact" element={<DirectContact />} />
              <Route path="/manage-requests" element={<ManageRequests />} />
              <Route path="/fix-missing-dates" element={<FixMissingDates />} />
              <Route path="/payroll-absence-admin" element={<PayrollAbsenceAdmin />} />
              <Route path="/beneficiaries-archive" element={<BeneficiariesArchive />} />
              <Route path="/test-emails" element={<TestEmails />} />
            </Route>
          </Route>
        </Route>

        <Route path="*" element={<NotFound />} />
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
          <ConfirmProvider>
            <Router>
              <AppContent />
              <Analytics />
            </Router>
          </ConfirmProvider>
        </NotificationProvider>
      </AuthProvider>
    </BackendErrorProvider>
  );
}

export default App;
