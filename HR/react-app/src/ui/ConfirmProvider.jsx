import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import Modal from './Modal';
import Button from './Button';
import Icon from './Icon';

/**
 * useConfirm(): promise-based replacement for window.confirm / window.prompt.
 *
 *   const { confirm, prompt } = useConfirm();
 *   if (!(await confirm({ title: 'حذف الموظف', message: '...', tone: 'danger', confirmText: 'حذف' }))) return;
 *   const reason = await prompt({ title: 'سبب الأرشفة', label: 'السبب', required: true });   // string | null
 *
 * Keeps the call shape of window.confirm (await a boolean), so migrating a page is a one-line change.
 */
const ConfirmContext = createContext(null);

export function useConfirm() {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error('useConfirm must be used inside <ConfirmProvider>');
  return ctx;
}

export function ConfirmProvider({ children }) {
  const [dialog, setDialog] = useState(null);
  const resolverRef = useRef(null);
  const [text, setText] = useState('');
  const [error, setError] = useState('');

  const close = useCallback((value) => {
    resolverRef.current?.(value);
    resolverRef.current = null;
    setDialog(null);
    setText('');
    setError('');
  }, []);

  const open = useCallback((kind, options) => new Promise((resolve) => {
    // A second dialog while one is open cancels the first.
    resolverRef.current?.(kind === 'prompt' ? null : false);
    resolverRef.current = resolve;
    setText(options.defaultValue || '');
    setError('');
    setDialog({ kind, ...options });
  }), []);

  const api = useMemo(() => ({
    confirm: (options) => open('confirm', typeof options === 'string' ? { message: options } : options),
    prompt: (options) => open('prompt', options),
  }), [open]);

  const onConfirm = () => {
    if (dialog.kind === 'prompt') {
      const value = text.trim();
      if (dialog.required && value.length < (dialog.minLength || 2)) {
        setError(dialog.requiredMessage || 'هذا الحقل مطلوب');
        return;
      }
      close(value);
    } else {
      close(true);
    }
  };

  const tone = dialog?.tone === 'danger' ? 'danger' : 'primary';

  return (
    <ConfirmContext.Provider value={api}>
      {children}
      <Modal
        open={Boolean(dialog)}
        onClose={() => close(dialog?.kind === 'prompt' ? null : false)}
        size="sm"
        title={dialog?.title || (dialog?.kind === 'prompt' ? 'إدخال مطلوب' : 'تأكيد الإجراء')}
        hideClose
        footer={dialog && (
          <>
            <Button variant="secondary" onClick={() => close(dialog.kind === 'prompt' ? null : false)}>
              {dialog.cancelText || 'إلغاء'}
            </Button>
            <Button variant={tone === 'danger' ? 'danger' : 'primary'} onClick={onConfirm} data-autofocus={dialog.kind === 'confirm' ? true : undefined}>
              {dialog.confirmText || 'تأكيد'}
            </Button>
          </>
        )}
      >
        {dialog && (
          <div className="ui-confirm">
            <span className={`ui-confirm-icon ui-confirm-icon-${tone}`}>
              <Icon name={tone === 'danger' ? 'alert' : dialog.kind === 'prompt' ? 'edit' : 'info'} size={22} />
            </span>
            <div className="ui-confirm-content">
              {dialog.message && <p className="ui-confirm-message">{dialog.message}</p>}
              {dialog.kind === 'prompt' && (
                <div className="ui-field">
                  {dialog.label && <label className="ui-field-label" htmlFor="ui-prompt-input">{dialog.label}</label>}
                  {dialog.multiline === false ? (
                    <input id="ui-prompt-input" className="ui-input" value={text} onChange={(e) => setText(e.target.value)} placeholder={dialog.placeholder} onKeyDown={(e) => { if (e.key === 'Enter') onConfirm(); }} />
                  ) : (
                    <textarea id="ui-prompt-input" className="ui-input" rows={3} value={text} onChange={(e) => setText(e.target.value)} placeholder={dialog.placeholder} />
                  )}
                  {error && <span className="ui-field-error" role="alert">{error}</span>}
                </div>
              )}
            </div>
          </div>
        )}
      </Modal>
    </ConfirmContext.Provider>
  );
}
