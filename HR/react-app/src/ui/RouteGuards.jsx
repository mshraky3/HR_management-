import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Spinner } from './feedback';
import { EmptyState } from './feedback';
import Button from './Button';

export const ROLES = {
  MAIN: ['main_manager'],
  BRANCH: ['branch_manager'],
  MAIN_BRANCH: ['main_manager', 'branch_manager'],
  ALL: ['main_manager', 'branch_manager', 'branch_operations_manager'],
};

/** Redirects to /login unless signed in; shows a centred spinner while the session loads. */
export function RequireAuth() {
  const { isAuthenticated, loading } = useAuth();
  if (loading) {
    return <div className="ui-fullpage"><Spinner size={36} label="جاري تحميل الجلسة…" block /></div>;
  }
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return <Outlet />;
}

/** Lets only the listed roles through; everyone else lands on their dashboard. */
export function RequireRole({ roles }) {
  const { user } = useAuth();
  if (!user) return <Outlet />; // user record still arriving; the API enforces the real rule
  if (!roles.includes(user.role)) return <Navigate to="/dashboard" replace />;
  return <Outlet />;
}

export function NotFound() {
  return (
    <div className="ui-fullpage">
      <EmptyState
        icon="search"
        title="الصفحة غير موجودة"
        description="الرابط الذي فتحته غير صحيح أو لم تعد الصفحة متاحة."
        action={<Button variant="primary" to="/dashboard">العودة إلى لوحة التحكم</Button>}
      />
    </div>
  );
}
