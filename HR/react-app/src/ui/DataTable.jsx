import { useEffect, useId, useRef, useState } from 'react';
import Icon from './Icon';
import { EmptyState, ErrorState, TableSkeleton } from './feedback';

/**
 * DataTable: the one table. Sticky header, sortable columns, optional row selection,
 * loading skeleton / empty / error states built in, and on narrow screens every row becomes a
 * card (each cell prints its column header via data-label) instead of scrolling sideways.
 *
 * columns: [{ key, header, render?(row, index), width?, align?: 'start'|'center'|'end',
 *             sortable?, mobileHidden?, mobilePrimary? (shown as the card title), nowrap? }]
 */
export default function DataTable({
  columns,
  rows,
  rowKey = 'id',
  loading = false,
  error = null,
  onRetry,
  emptyIcon = 'inbox',
  emptyTitle = 'لا توجد بيانات',
  emptyDescription,
  emptyAction,
  onRowClick,
  rowClassName,
  selectable = false,
  selectedKeys,
  onSelectionChange,
  sort,
  onSortChange,
  caption,
  dense = false,
  footer,
  className = '',
}) {
  const getKey = typeof rowKey === 'function' ? rowKey : (r) => r[rowKey];
  const allKeys = (rows || []).map(getKey);
  const selected = selectedKeys || new Set();
  const allSelected = allKeys.length > 0 && allKeys.every((k) => selected.has(k));
  const someSelected = !allSelected && allKeys.some((k) => selected.has(k));
  const headCheckRef = useRef(null);
  useEffect(() => { if (headCheckRef.current) headCheckRef.current.indeterminate = someSelected; }, [someSelected]);

  const toggleAll = () => {
    const next = new Set(selected);
    if (allSelected) allKeys.forEach((k) => next.delete(k)); else allKeys.forEach((k) => next.add(k));
    onSelectionChange?.(next);
  };
  const toggleOne = (k) => {
    const next = new Set(selected);
    if (next.has(k)) next.delete(k); else next.add(k);
    onSelectionChange?.(next);
  };

  if (error) return <ErrorState onRetry={onRetry} />;

  const showSkeleton = loading && (!rows || rows.length === 0);
  const empty = !loading && (!rows || rows.length === 0);

  return (
    <div className={`ui-table-wrap${className ? ` ${className}` : ''}`} aria-busy={loading || undefined}>
      {showSkeleton ? (
        <TableSkeleton cols={Math.min(columns.length, 6)} />
      ) : empty ? (
        <EmptyState icon={emptyIcon} title={emptyTitle} description={emptyDescription} action={emptyAction} />
      ) : (
        <div className="ui-table-scroll">
          <table className={`ui-table${dense ? ' is-dense' : ''}${loading ? ' is-refreshing' : ''}`}>
            {caption && <caption className="visually-hidden">{caption}</caption>}
            <thead>
              <tr>
                {selectable && (
                  <th className="ui-col-check" scope="col">
                    <input ref={headCheckRef} type="checkbox" checked={allSelected} onChange={toggleAll} aria-label="تحديد الكل" />
                  </th>
                )}
                {columns.map((c) => {
                  const active = sort && sort.key === c.key;
                  return (
                    <th
                      key={c.key}
                      scope="col"
                      style={{ width: c.width, textAlign: c.align || undefined }}
                      aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : undefined}
                      className={c.mobileHidden ? 'ui-m-hide' : undefined}
                    >
                      {c.sortable && onSortChange ? (
                        <button type="button" className="ui-th-sort" onClick={() => onSortChange({ key: c.key, dir: active && sort.dir === 'asc' ? 'desc' : 'asc' })}>
                          {c.header}
                          <Icon name={active ? (sort.dir === 'asc' ? 'chevron-up' : 'chevron-down') : 'chevron-down'} size={14} className={active ? '' : 'ui-th-sort-idle'} />
                        </button>
                      ) : c.header}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => {
                const key = getKey(row);
                const isSel = selected.has(key);
                const clickable = typeof onRowClick === 'function';
                return (
                  <tr
                    key={key}
                    className={[isSel ? 'is-selected' : '', clickable ? 'is-clickable' : '', rowClassName ? rowClassName(row) : ''].filter(Boolean).join(' ')}
                    onClick={clickable ? () => onRowClick(row) : undefined}
                  >
                    {selectable && (
                      <td className="ui-col-check" onClick={(e) => e.stopPropagation()}>
                        <input type="checkbox" checked={isSel} onChange={() => toggleOne(key)} aria-label="تحديد الصف" />
                      </td>
                    )}
                    {columns.map((c) => (
                      <td
                        key={c.key}
                        data-label={typeof c.header === 'string' ? c.header : undefined}
                        className={[c.mobileHidden ? 'ui-m-hide' : '', c.mobilePrimary ? 'ui-m-primary' : '', c.nowrap ? 'ui-nowrap' : ''].filter(Boolean).join(' ') || undefined}
                        style={{ textAlign: c.align || undefined }}
                      >
                        {c.render ? c.render(row, index) : row[c.key] ?? '—'}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {footer && <div className="ui-table-footer">{footer}</div>}
    </div>
  );
}

/** Pagination: range text, page buttons (windowed), optional page-size select. */
export function Pagination({ page, pageSize, total, onPageChange, onPageSizeChange, pageSizeOptions = [25, 50, 100] }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const current = Math.min(page, pages);
  const from = total === 0 ? 0 : (current - 1) * pageSize + 1;
  const to = Math.min(total, current * pageSize);

  const numbers = [];
  const add = (n) => { if (n >= 1 && n <= pages && !numbers.includes(n)) numbers.push(n); };
  [1, 2, current - 1, current, current + 1, pages - 1, pages].forEach(add);
  numbers.sort((a, b) => a - b);

  const items = [];
  numbers.forEach((n, i) => {
    if (i > 0 && n - numbers[i - 1] > 1) items.push(`gap-${n}`);
    items.push(n);
  });

  if (total === 0) return null;
  return (
    <nav className="ui-pagination" aria-label="التنقل بين الصفحات">
      <span className="ui-pagination-range">عرض <bdi>{from}</bdi>–<bdi>{to}</bdi> من <bdi>{total}</bdi></span>
      <div className="ui-pagination-pages">
        <button type="button" className="ui-page-btn" onClick={() => onPageChange(current - 1)} disabled={current <= 1} aria-label="الصفحة السابقة">
          <Icon name="chevron-start" size={18} />
        </button>
        {items.map((it) => (typeof it === 'string'
          ? <span key={it} className="ui-page-gap" aria-hidden="true">…</span>
          : (
            <button key={it} type="button" className={`ui-page-btn${it === current ? ' is-active' : ''}`} onClick={() => onPageChange(it)} aria-current={it === current ? 'page' : undefined}>
              {it}
            </button>
          )))}
        <button type="button" className="ui-page-btn" onClick={() => onPageChange(current + 1)} disabled={current >= pages} aria-label="الصفحة التالية">
          <Icon name="chevron-end" size={18} />
        </button>
      </div>
      {onPageSizeChange && (
        <label className="ui-pagination-size">
          <span>لكل صفحة</span>
          <select className="ui-input ui-select" value={pageSize} onChange={(e) => onPageSizeChange(Number(e.target.value))}>
            {pageSizeOptions.map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </label>
      )}
    </nav>
  );
}

/** RowActions: "…" menu for secondary row actions; the primary action stays a visible button. */
export function RowActions({ actions, label = 'المزيد من الإجراءات' }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const menuId = useId();
  const visible = actions.filter((a) => !a.hidden);

  useEffect(() => {
    if (!open) return undefined;
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onKey); };
  }, [open]);

  if (visible.length === 0) return null;
  return (
    <div className="ui-row-actions" ref={ref}>
      <button type="button" className="ui-row-actions-btn" onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }} aria-haspopup="menu" aria-expanded={open} aria-controls={menuId} aria-label={label} title={label}>
        <Icon name="more" size={20} />
      </button>
      {open && (
        <ul className="ui-menu" id={menuId} role="menu">
          {visible.map((a) => (
            <li key={a.label} role="none">
              <button
                type="button"
                role="menuitem"
                className={`ui-menu-item${a.danger ? ' is-danger' : ''}`}
                onClick={(e) => { e.stopPropagation(); setOpen(false); a.onClick?.(); }}
                disabled={a.disabled}
              >
                {a.icon && <Icon name={a.icon} size={18} />}
                {a.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
