import { useRef } from 'react';
import { Link } from 'react-router-dom';
import Icon from './Icon';

/** PageHeader: every page starts with the same title / subtitle / actions row. */
export function PageHeader({ title, subtitle, actions, back, breadcrumbs, children }) {
  return (
    <header className="ui-page-header">
      <div className="ui-page-header-main">
        {breadcrumbs && breadcrumbs.length > 0 && (
          <nav className="ui-breadcrumbs" aria-label="مسار الصفحة">
            {breadcrumbs.map((b, i) => (
              <span key={`${b.label}-${i}`} className="ui-breadcrumb">
                {b.to ? <Link to={b.to}>{b.label}</Link> : <span aria-current="page">{b.label}</span>}
                {i < breadcrumbs.length - 1 && <Icon name="chevron-end" size={14} />}
              </span>
            ))}
          </nav>
        )}
        <div className="ui-page-title-row">
          {back && (
            <Link to={back} className="ui-page-back" aria-label="رجوع">
              <Icon name="arrow-start" size={20} />
            </Link>
          )}
          <div>
            <h1 className="ui-page-title">{title}</h1>
            {subtitle && <p className="ui-page-subtitle">{subtitle}</p>}
          </div>
        </div>
        {children}
      </div>
      {actions && <div className="ui-page-actions">{actions}</div>}
    </header>
  );
}

/** Page: standard content wrapper (max width, vertical rhythm). */
export function Page({ children, className = '', narrow = false }) {
  return <div className={`ui-page${narrow ? ' ui-page-narrow' : ''}${className ? ` ${className}` : ''}`}>{children}</div>;
}

/** Card: titled surface. `flush` removes body padding (for tables). */
export function Card({ title, subtitle, actions, children, flush = false, className = '', as: Tag = 'section' }) {
  return (
    <Tag className={`ui-card${className ? ` ${className}` : ''}`}>
      {(title || actions) && (
        <div className="ui-card-header">
          <div>
            {title && <h2 className="ui-card-title">{title}</h2>}
            {subtitle && <p className="ui-card-subtitle">{subtitle}</p>}
          </div>
          {actions && <div className="ui-card-actions">{actions}</div>}
        </div>
      )}
      <div className={`ui-card-body${flush ? ' is-flush' : ''}`}>{children}</div>
    </Tag>
  );
}

/** StatCard: one number with a label; optional trend/hint and link. tone colours the icon chip. */
export function StatCard({ label, value, hint, icon, tone = 'primary', to, loading = false }) {
  const body = (
    <>
      {icon && <span className={`ui-stat-icon ui-tone-${tone}`}><Icon name={icon} size={22} /></span>}
      <div className="ui-stat-text">
        <span className="ui-stat-label">{label}</span>
        <span className="ui-stat-value">{loading ? <span className="ui-skeleton" style={{ width: 56, height: 28 }} /> : value}</span>
        {hint && <span className="ui-stat-hint">{hint}</span>}
      </div>
    </>
  );
  return to
    ? <Link to={to} className="ui-stat ui-stat-link">{body}</Link>
    : <div className="ui-stat">{body}</div>;
}

/**
 * Tabs: accessible tab list (arrow keys move between tabs).
 *   <Tabs value={tab} onChange={setTab} items={[{ id: 'a', label: 'A', count: 3 }]} />
 * The caller renders the matching panel; give it role="tabpanel".
 */
export function Tabs({ items, value, onChange, className = '', ariaLabel = 'التبويبات' }) {
  const listRef = useRef(null);
  const onKeyDown = (e) => {
    const idx = items.findIndex((i) => i.id === value);
    // In RTL the "next" tab is to the left, i.e. ArrowLeft.
    const rtl = getComputedStyle(listRef.current).direction === 'rtl';
    const forward = rtl ? 'ArrowLeft' : 'ArrowRight';
    const backward = rtl ? 'ArrowRight' : 'ArrowLeft';
    let next = null;
    if (e.key === forward) next = items[(idx + 1) % items.length];
    else if (e.key === backward) next = items[(idx - 1 + items.length) % items.length];
    else if (e.key === 'Home') next = items[0];
    else if (e.key === 'End') next = items[items.length - 1];
    if (next) {
      e.preventDefault();
      onChange(next.id);
      listRef.current.querySelector(`[data-tab="${next.id}"]`)?.focus();
    }
  };
  return (
    <div className={`ui-tabs${className ? ` ${className}` : ''}`} role="tablist" aria-label={ariaLabel} ref={listRef} onKeyDown={onKeyDown}>
      {items.map((item) => {
        const selected = item.id === value;
        return (
          <button
            key={item.id}
            type="button"
            role="tab"
            data-tab={item.id}
            id={`tab-${item.id}`}
            aria-selected={selected}
            tabIndex={selected ? 0 : -1}
            className={`ui-tab${selected ? ' is-active' : ''}`}
            onClick={() => onChange(item.id)}
            disabled={item.disabled}
          >
            {item.icon && <Icon name={item.icon} size={18} />}
            <span>{item.label}</span>
            {item.count != null && <span className="ui-tab-count">{item.count}</span>}
          </button>
        );
      })}
    </div>
  );
}

/** Toolbar: a wrapping row for filters / bulk actions above a table. */
export function Toolbar({ children, className = '' }) {
  return <div className={`ui-toolbar${className ? ` ${className}` : ''}`}>{children}</div>;
}
