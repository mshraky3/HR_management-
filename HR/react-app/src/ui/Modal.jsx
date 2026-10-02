import { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import Icon from './Icon';

const FOCUSABLE = [
  'a[href]', 'button:not([disabled])', 'input:not([disabled]):not([type="hidden"])', 'select:not([disabled])',
  'textarea:not([disabled])', '[tabindex]:not([tabindex="-1"])',
].join(',');

/**
 * Modal: accessible dialog rendered in a portal.
 * Escape closes, Tab stays inside, focus returns to the opener, the page behind does not scroll.
 * size: sm | md | lg | xl | full
 */
export default function Modal({
  open,
  onClose,
  title,
  description,
  size = 'md',
  children,
  footer,
  closeOnOverlay = true,
  hideClose = false,
  className = '',
}) {
  const dialogRef = useRef(null);
  const titleId = useId();
  const descId = useId();
  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; });

  useEffect(() => {
    if (!open) return undefined;
    const opener = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const dialog = dialogRef.current;
    const focusables = () => Array.from(dialog?.querySelectorAll(FOCUSABLE) || []).filter((el) => el.offsetParent !== null);
    // Prefer the first form control; fall back to the first focusable (the close button), then the dialog.
    const first = dialog?.querySelector('[data-autofocus]') || dialog?.querySelector('input:not([type="hidden"]), select, textarea') || focusables()[0] || dialog;
    first?.focus({ preventScroll: true });

    const onKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onCloseRef.current?.();
        return;
      }
      if (e.key !== 'Tab') return;
      const items = focusables();
      if (items.length === 0) { e.preventDefault(); return; }
      const firstEl = items[0];
      const lastEl = items[items.length - 1];
      if (e.shiftKey && document.activeElement === firstEl) { e.preventDefault(); lastEl.focus(); }
      else if (!e.shiftKey && document.activeElement === lastEl) { e.preventDefault(); firstEl.focus(); }
    };
    document.addEventListener('keydown', onKeyDown, true);

    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
      document.body.style.overflow = previousOverflow;
      if (opener && typeof opener.focus === 'function') opener.focus({ preventScroll: true });
    };
  }, [open]);

  if (!open) return null;

  return createPortal(
    <div
      className="ui-modal-overlay"
      onMouseDown={(e) => { if (closeOnOverlay && e.target === e.currentTarget) onClose?.(); }}
    >
      <div
        ref={dialogRef}
        className={`ui-modal ui-modal-${size}${className ? ` ${className}` : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        aria-describedby={description ? descId : undefined}
        tabIndex={-1}
      >
        {(title || !hideClose) && (
          <header className="ui-modal-header">
            <div className="ui-modal-heading">
              {title && <h2 id={titleId} className="ui-modal-title">{title}</h2>}
              {description && <p id={descId} className="ui-modal-description">{description}</p>}
            </div>
            {!hideClose && (
              <button type="button" className="ui-modal-close" onClick={onClose} aria-label="إغلاق">
                <Icon name="x" size={20} />
              </button>
            )}
          </header>
        )}
        <div className="ui-modal-body">{children}</div>
        {footer && <footer className="ui-modal-footer">{footer}</footer>}
      </div>
    </div>,
    document.body,
  );
}
