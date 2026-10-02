import Icon from './Icon';
import Button from './Button';

/** Spinner: inline (default) or centered block with an optional label. */
export function Spinner({ size = 24, label, block = false }) {
  const ring = <span className="ui-spinner" style={{ width: size, height: size }} role="status" aria-label={label || 'جاري التحميل'} />;
  if (!block) return ring;
  return (
    <div className="ui-state ui-state-loading">
      {ring}
      {label && <p className="ui-state-text">{label}</p>}
    </div>
  );
}

/** Skeleton placeholder: reserves layout while data loads. `lines` stacks text-like bars. */
export function Skeleton({ width = '100%', height = 14, lines = 1, radius = 6, style }) {
  return (
    <div className="ui-skeleton-stack" aria-hidden="true">
      {Array.from({ length: lines }, (_, i) => (
        <span
          key={i}
          className="ui-skeleton"
          style={{ width: lines > 1 && i === lines - 1 ? '60%' : width, height, borderRadius: radius, ...style }}
        />
      ))}
    </div>
  );
}

/** Skeleton rows for a table while loading. */
export function TableSkeleton({ rows = 6, cols = 5 }) {
  return (
    <div className="ui-table-skeleton" aria-hidden="true">
      {Array.from({ length: rows }, (_, r) => (
        <div className="ui-table-skeleton-row" key={r}>
          {Array.from({ length: cols }, (_, c) => <span key={c} className="ui-skeleton" style={{ height: 14 }} />)}
        </div>
      ))}
    </div>
  );
}

/** EmptyState: say what is missing and offer the action that fixes it. */
export function EmptyState({ icon = 'inbox', title, description, action, compact = false }) {
  return (
    <div className={`ui-state ui-state-empty${compact ? ' ui-state-compact' : ''}`}>
      <span className="ui-state-icon"><Icon name={icon} size={compact ? 24 : 32} /></span>
      {title && <h3 className="ui-state-title">{title}</h3>}
      {description && <p className="ui-state-text">{description}</p>}
      {action}
    </div>
  );
}

/** ErrorState: what went wrong in plain words, plus a retry. Never a raw exception. */
export function ErrorState({ title = 'تعذّر تحميل البيانات', description = 'تحقق من الاتصال بالإنترنت ثم حاول مرة أخرى.', onRetry, compact = false }) {
  return (
    <div className={`ui-state ui-state-error${compact ? ' ui-state-compact' : ''}`} role="alert">
      <span className="ui-state-icon"><Icon name="alert" size={compact ? 24 : 32} /></span>
      <h3 className="ui-state-title">{title}</h3>
      {description && <p className="ui-state-text">{description}</p>}
      {onRetry && <Button variant="secondary" icon="refresh" onClick={onRetry}>إعادة المحاولة</Button>}
    </div>
  );
}

const ALERT_ICON = { info: 'info', success: 'check-circle', warning: 'alert', danger: 'x-circle' };

/** Alert: inline message inside a page or form. */
export function Alert({ tone = 'info', title, children, action, onClose }) {
  return (
    <div className={`ui-alert ui-alert-${tone}`} role={tone === 'danger' || tone === 'warning' ? 'alert' : 'status'}>
      <Icon name={ALERT_ICON[tone] || 'info'} size={20} />
      <div className="ui-alert-body">
        {title && <strong className="ui-alert-title">{title}</strong>}
        {children && <div className="ui-alert-text">{children}</div>}
      </div>
      {action}
      {onClose && (
        <button type="button" className="ui-alert-close" onClick={onClose} aria-label="إغلاق">
          <Icon name="x" size={16} />
        </button>
      )}
    </div>
  );
}
