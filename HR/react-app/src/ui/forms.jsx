import { Children, cloneElement, forwardRef, isValidElement, useId } from 'react';
import Icon from './Icon';

/**
 * FormField: label + control + hint + error, wired together for screen readers.
 * The child control gets id / aria-invalid / aria-describedby automatically.
 *
 *   <FormField label="رقم الجوال" required error={errors.phone} hint="مثال: 05xxxxxxxx">
 *     <Input value={...} onChange={...} dir="ltr" />
 *   </FormField>
 */
export function FormField({ label, hint, error, required = false, children, className = '', inline = false }) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const child = Children.only(children);
  const control = isValidElement(child)
    ? cloneElement(child, {
        id: child.props.id || id,
        'aria-invalid': error ? true : undefined,
        'aria-describedby': [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(' ') || undefined,
        required: child.props.required ?? required,
      })
    : child;
  const controlId = isValidElement(child) ? (child.props.id || id) : id;

  return (
    <div className={`ui-field${inline ? ' ui-field-inline' : ''}${error ? ' has-error' : ''}${className ? ` ${className}` : ''}`}>
      {label && (
        <label className="ui-field-label" htmlFor={controlId}>
          {label}
          {required && <span className="ui-field-required" aria-hidden="true"> *</span>}
        </label>
      )}
      {control}
      {hint && !error && <span id={hintId} className="ui-field-hint">{hint}</span>}
      {error && <span id={errorId} className="ui-field-error" role="alert">{error}</span>}
    </div>
  );
}

export const Input = forwardRef(function Input({ className = '', ...props }, ref) {
  return <input ref={ref} className={`ui-input${className ? ` ${className}` : ''}`} {...props} />;
});

export const Textarea = forwardRef(function Textarea({ className = '', rows = 3, ...props }, ref) {
  return <textarea ref={ref} rows={rows} className={`ui-input${className ? ` ${className}` : ''}`} {...props} />;
});

/** Select: options = [{ value, label }] or plain strings; `placeholder` adds a disabled first option. */
export const Select = forwardRef(function Select({ options = [], placeholder, className = '', children, ...props }, ref) {
  return (
    <select ref={ref} className={`ui-input ui-select${className ? ` ${className}` : ''}`} {...props}>
      {placeholder != null && <option value="">{placeholder}</option>}
      {children || options.map((o) => {
        const opt = typeof o === 'object' ? o : { value: o, label: o };
        return <option key={opt.value} value={opt.value} disabled={opt.disabled}>{opt.label}</option>;
      })}
    </select>
  );
});

/** SearchInput: input with a search icon and a clear button. */
export const SearchInput = forwardRef(function SearchInput({ value, onChange, onClear, placeholder = 'بحث…', className = '', ...props }, ref) {
  return (
    <div className={`ui-search${className ? ` ${className}` : ''}`}>
      <Icon name="search" size={18} />
      <input ref={ref} type="search" className="ui-search-input" value={value} onChange={onChange} placeholder={placeholder} aria-label={props['aria-label'] || placeholder} {...props} />
      {value && onClear && (
        <button type="button" className="ui-search-clear" onClick={onClear} aria-label="مسح البحث">
          <Icon name="x" size={16} />
        </button>
      )}
    </div>
  );
});

/** Checkbox with a visible label (large click target). */
export const Checkbox = forwardRef(function Checkbox({ label, className = '', ...props }, ref) {
  return (
    <label className={`ui-check${className ? ` ${className}` : ''}`}>
      <input ref={ref} type="checkbox" {...props} />
      {label && <span>{label}</span>}
    </label>
  );
});

/**
 * Chip: a pill that toggles on and off (multi-select filters, field pickers).
 *   <ChipGroup label="الجنسية"><Chip selected={on} onClick={toggle}>سعودي</Chip></ChipGroup>
 * Uses aria-pressed, so a screen reader announces the state without relying on colour.
 */
export function Chip({ selected = false, onClick, children, className = '', ...props }) {
  return (
    <button
      type="button"
      className={`ui-chip${selected ? ' is-selected' : ''}${className ? ` ${className}` : ''}`}
      aria-pressed={selected}
      onClick={onClick}
      {...props}
    >
      {selected && <Icon name="check" size={14} />}
      <span>{children}</span>
    </button>
  );
}

export function ChipGroup({ children, className = '', ...props }) {
  return <div className={`ui-chip-group${className ? ` ${className}` : ''}`} role="group" {...props}>{children}</div>;
}
