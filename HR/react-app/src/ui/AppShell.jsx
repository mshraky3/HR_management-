import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useNotification } from '../contexts/NotificationContext';
import Icon from './Icon';
import Modal from './Modal';
import Button from './Button';
import { FormField, Input } from './forms';
import { Alert } from './feedback';
import { findNavItem, navForUser, ROLE_LABELS } from './nav.config';

const APP_NAME = 'نظام الموارد البشرية';
const OPEN_GROUPS_KEY = 'hr.nav.openGroups';

function readOpenGroups() {
  try {
    return JSON.parse(localStorage.getItem(OPEN_GROUPS_KEY) || '{}');
  } catch {
    return {};
  }
}

/** ChangePasswordModal: used from the user menu and, forced, when must_change_password is set. */
export function ChangePasswordModal({ open, onClose, forced = false }) {
  const { changePassword, user } = useAuth();
  const { showSuccess } = useNotification();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [again, setAgain] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const reset = () => { setCurrent(''); setNext(''); setAgain(''); setError(''); };

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (next.length < 6) return setError('كلمة المرور الجديدة يجب أن تكون 6 أحرف على الأقل');
    if (next !== again) return setError('تأكيد كلمة المرور لا يطابق كلمة المرور الجديدة');
    setSaving(true);
    const result = await changePassword(current, next);
    setSaving(false);
    if (result.success) {
      showSuccess('تم تغيير كلمة المرور');
      reset();
      onClose?.();
    } else {
      setError(result.message || 'فشل تغيير كلمة المرور');
    }
  };

  return (
    <Modal
      open={open}
      onClose={forced ? undefined : () => { reset(); onClose?.(); }}
      title={forced ? 'يجب تغيير كلمة المرور' : 'تغيير كلمة المرور'}
      description={forced ? `أنشأ المسؤول كلمة مرور مؤقتة لحساب ${user?.username || ''}. اختر كلمة مرور جديدة للمتابعة.` : undefined}
      size="sm"
      hideClose={forced}
      closeOnOverlay={!forced}
      footer={(
        <>
          {!forced && <Button variant="secondary" onClick={() => { reset(); onClose?.(); }}>إلغاء</Button>}
          <Button variant="primary" type="submit" form="change-password-form" loading={saving}>حفظ كلمة المرور</Button>
        </>
      )}
    >
      <form id="change-password-form" onSubmit={submit} className="ui-form-stack">
        {error && <Alert tone="danger">{error}</Alert>}
        <FormField label="كلمة المرور الحالية" required>
          <Input type="password" value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" />
        </FormField>
        <FormField label="كلمة المرور الجديدة" required hint="6 أحرف على الأقل">
          <Input type="password" value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" />
        </FormField>
        <FormField label="تأكيد كلمة المرور الجديدة" required>
          <Input type="password" value={again} onChange={(e) => setAgain(e.target.value)} autoComplete="new-password" />
        </FormField>
      </form>
    </Modal>
  );
}

function SidebarGroup({ group, open, onToggle, onNavigate }) {
  const panelId = `nav-group-${group.id}`;
  return (
    <div className="ui-nav-group">
      <button type="button" className="ui-nav-group-title" onClick={onToggle} aria-expanded={open} aria-controls={panelId}>
        <span>{group.title}</span>
        <Icon name="chevron-down" size={16} className={`ui-nav-chevron${open ? ' is-open' : ''}`} />
      </button>
      {open && (
        <ul className="ui-nav-list" id={panelId}>
          {group.items.map((item) => (
            <li key={item.to}>
              <NavLink to={item.to} className={({ isActive }) => `ui-nav-link${isActive ? ' is-active' : ''}`} onClick={onNavigate}>
                <Icon name={item.icon} size={19} />
                <span>{item.label}</span>
              </NavLink>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * AppShell: the one layout for every role. Right-side sidebar (a drawer below 1024px), a slim top bar
 * with the page title and the user menu, and the routed page in <Outlet/>.
 */
export default function AppShell() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [openGroups, setOpenGroups] = useState(readOpenGroups);
  const userMenuRef = useRef(null);
  const mainRef = useRef(null);

  const groups = useMemo(() => navForUser(user), [user]);
  const active = useMemo(() => findNavItem(user, location.pathname), [user, location.pathname]);

  // A group is open when the user opened it, or when it holds the current page.
  const isGroupOpen = useCallback((g) => (
    openGroups[g.id] !== undefined ? openGroups[g.id] : (active?.group.id === g.id || groups[0]?.id === g.id)
  ), [openGroups, active, groups]);

  const toggleGroup = (g) => {
    setOpenGroups((prev) => {
      const next = { ...prev, [g.id]: !isGroupOpen(g) };
      try { localStorage.setItem(OPEN_GROUPS_KEY, JSON.stringify(next)); } catch { /* storage unavailable */ }
      return next;
    });
  };

  // Page title in the browser tab + move focus to the page on navigation (keyboard / screen reader users)
  useEffect(() => {
    document.title = active ? `${active.item.label} · ${APP_NAME}` : APP_NAME;
    setDrawerOpen(false);
    mainRef.current?.scrollTo?.({ top: 0 });
  }, [active, location.pathname]);

  useEffect(() => {
    if (!userMenuOpen) return undefined;
    const onDoc = (e) => { if (userMenuRef.current && !userMenuRef.current.contains(e.target)) setUserMenuOpen(false); };
    const onKey = (e) => { if (e.key === 'Escape') setUserMenuOpen(false); };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onKey); };
  }, [userMenuOpen]);

  useEffect(() => {
    if (!drawerOpen) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') setDrawerOpen(false); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [drawerOpen]);

  const displayName = user?.full_name || user?.username || '';
  const initial = displayName.trim().charAt(0) || '؟';
  const mustChange = Boolean(user?.must_change_password);

  return (
    <div className="ui-shell">
      <a href="#main-content" className="ui-skip-link">تخطي إلى المحتوى</a>

      {drawerOpen && <div className="ui-drawer-scrim" onClick={() => setDrawerOpen(false)} aria-hidden="true" />}

      <aside className={`ui-sidebar${drawerOpen ? ' is-open' : ''}`} aria-label="القائمة الرئيسية">
        <div className="ui-sidebar-brand">
          <span className="ui-brand-mark"><Icon name="users" size={22} /></span>
          <div className="ui-brand-text">
            <strong>{APP_NAME}</strong>
            <span>{ROLE_LABELS[user?.role] || ''}</span>
          </div>
          <button type="button" className="ui-sidebar-close" onClick={() => setDrawerOpen(false)} aria-label="إغلاق القائمة">
            <Icon name="x" size={20} />
          </button>
        </div>

        <nav className="ui-sidebar-nav">
          {groups.map((g) => (
            <SidebarGroup key={g.id} group={g} open={isGroupOpen(g)} onToggle={() => toggleGroup(g)} onNavigate={() => setDrawerOpen(false)} />
          ))}
        </nav>

        <div className="ui-sidebar-footer">
          <div className="ui-user-chip">
            <span className="ui-avatar" aria-hidden="true">{initial}</span>
            <div className="ui-user-meta">
              <strong title={displayName}>{displayName}</strong>
              <span>{ROLE_LABELS[user?.role] || ''}</span>
            </div>
          </div>
        </div>
      </aside>

      <div className="ui-shell-main">
        <header className="ui-topbar">
          <button type="button" className="ui-topbar-menu" onClick={() => setDrawerOpen(true)} aria-label="فتح القائمة" aria-expanded={drawerOpen}>
            <Icon name="menu" size={22} />
          </button>
          <div className="ui-topbar-title">
            {active ? <span>{active.item.label}</span> : <span>{APP_NAME}</span>}
          </div>
          <div className="ui-topbar-actions" ref={userMenuRef}>
            <button type="button" className="ui-user-button" onClick={() => setUserMenuOpen((o) => !o)} aria-haspopup="menu" aria-expanded={userMenuOpen}>
              <span className="ui-avatar" aria-hidden="true">{initial}</span>
              <span className="ui-user-button-name">{displayName}</span>
              <Icon name="chevron-down" size={16} />
            </button>
            {userMenuOpen && (
              <ul className="ui-menu ui-user-menu" role="menu">
                <li className="ui-menu-header" role="presentation">
                  <strong>{displayName}</strong>
                  <span>{ROLE_LABELS[user?.role] || ''}</span>
                </li>
                <li role="none">
                  <button type="button" role="menuitem" className="ui-menu-item" onClick={() => { setUserMenuOpen(false); setPasswordOpen(true); }}>
                    <Icon name="key" size={18} /> تغيير كلمة المرور
                  </button>
                </li>
                <li role="none">
                  <button type="button" role="menuitem" className="ui-menu-item is-danger" onClick={() => { setUserMenuOpen(false); logout(); }}>
                    <Icon name="log-out" size={18} /> تسجيل الخروج
                  </button>
                </li>
              </ul>
            )}
          </div>
        </header>

        <main id="main-content" className="ui-main" ref={mainRef} tabIndex={-1}>
          <div className="ui-content">
            <Outlet />
          </div>
        </main>
      </div>

      <ChangePasswordModal open={passwordOpen || mustChange} onClose={() => setPasswordOpen(false)} forced={mustChange} />
    </div>
  );
}
