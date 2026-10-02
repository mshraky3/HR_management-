import { useEffect, useState } from 'react';
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

/** Spinner while the session loads; after a while it offers a way out instead of spinning forever. */
function SessionLoading() {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const t = window.setTimeout(() => setSlow(true), 12000);
    return () => window.clearTimeout(t);
  }, []);
  const signOut = () => {
    try { localStorage.removeItem('token'); localStorage.removeItem('user'); } catch { /* storage blocked */ }
    window.location.assign('/login');
  };
  return (
    <div className="ui-fullpage">
      <Spinner size={36} label="جاري تحميل الجلسة…" block />
      {slow && (
        <div role="status" style={{ marginBlockStart: '1.25rem', textAlign: 'center', display: 'grid', gap: '0.75rem', justifyItems: 'center' }}>
          <p style={{ margin: 0, color: 'var(--text-light)' }}>الاتصال بالخادم أبطأ من المعتاد.</p>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', justifyContent: 'center' }}>
            <Button variant="primary" onClick={() => window.location.reload()}>إعادة المحاولة</Button>
            <Button variant="secondary" onClick={signOut}>تسجيل الدخول من جديد</Button>
          </div>
        </div>
      )}
    </div>
  );
}

/** Redirects to /login unless signed in; shows a centred spinner while the session loads. */
export function RequireAuth() {
  const { isAuthenticated, loading } = useAuth();
  if (loading) return <SessionLoading />;
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
