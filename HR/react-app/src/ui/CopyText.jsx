import { useEffect, useRef, useState } from 'react';
import Icon from './Icon';

/** Copies text with the Clipboard API, falling back to a hidden textarea on older or insecure contexts. */
export async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const area = document.createElement('textarea');
      area.value = text;
      area.setAttribute('readonly', '');
      area.style.cssText = 'position:fixed;opacity:0;top:0;inset-inline-start:0';
      document.body.appendChild(area);
      area.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(area);
      return ok;
    } catch {
      return false;
    }
  }
}

/**
 * CopyText: a value that copies itself to the clipboard on click (or Enter / Space).
 * `value` is what gets copied (defaults to the text content); children is what is shown.
 */
export default function CopyText({ value, children, className = '', label = 'نسخ' }) {
  const [state, setState] = useState('idle'); // idle | copied | failed
  const timer = useRef(null);
  useEffect(() => () => clearTimeout(timer.current), []);

  const text = String(value ?? (typeof children === 'string' || typeof children === 'number' ? children : '')).trim();
  if (!text || text === '-' || text === '—') return <span className={className}>{children ?? '—'}</span>;

  const copy = async () => {
    const ok = await copyToClipboard(text);
    setState(ok ? 'copied' : 'failed');
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setState('idle'), 1400);
  };

  return (
    <button
      type="button"
      className={`ui-copy${state === 'copied' ? ' is-copied' : ''}${className ? ` ${className}` : ''}`}
      onClick={copy}
      title={`${label}: ${text}`}
    >
      <span className="ui-copy-text">{children ?? text}</span>
      <span className="ui-copy-hint" aria-live="polite">
        <Icon name={state === 'copied' ? 'check' : 'clipboard'} size={14} />
        <span>{state === 'copied' ? 'تم النسخ' : state === 'failed' ? 'تعذّر النسخ' : ''}</span>
      </span>
    </button>
  );
}
