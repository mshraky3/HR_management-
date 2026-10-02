import { useMemo, useState } from 'react';
import { SearchInput, Button, Checkbox } from '../../ui';
import { normalizeSearch } from '../employees/employeeUtils';

/**
 * BranchPicker: choose several branches from a searchable list, with "select all shown" and a counter.
 * value: array of branch ids; onChange(nextIds)
 */
export default function BranchPicker({ branches, value, onChange, label = 'الفروع المسؤول عنها' }) {
  const [q, setQ] = useState('');
  const selected = useMemo(() => new Set(value), [value]);

  const shown = useMemo(() => {
    const term = normalizeSearch(q);
    return branches.filter((b) => b.is_active !== false && (!term || normalizeSearch(`${b.branch_name} ${b.branch_location || ''}`).includes(term)));
  }, [branches, q]);

  const toggle = (id) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id); else next.add(id);
    onChange([...next]);
  };
  const selectShown = () => onChange([...new Set([...value, ...shown.map((b) => b.id)])]);
  const clearShown = () => { const ids = new Set(shown.map((b) => b.id)); onChange(value.filter((id) => !ids.has(id))); };

  return (
    <fieldset className="ui-picker">
      <legend className="ui-field-label">{label} <span className="ui-picker-count">({value.length} محدد)</span></legend>
      <div className="ui-picker-tools">
        <SearchInput value={q} onChange={(e) => setQ(e.target.value)} onClear={() => setQ('')} placeholder="ابحث عن فرع…" />
        <Button size="sm" variant="secondary" onClick={selectShown} disabled={shown.length === 0}>تحديد المعروض</Button>
        <Button size="sm" variant="ghost" onClick={clearShown} disabled={shown.length === 0}>إلغاء المعروض</Button>
      </div>
      <div className="ui-picker-list" role="group">
        {shown.length === 0 ? <p className="ui-cell-sub">لا توجد فروع مطابقة</p> : shown.map((b) => (
          <Checkbox
            key={b.id}
            checked={selected.has(b.id)}
            onChange={() => toggle(b.id)}
            label={<>{b.branch_name}<span className="ui-cell-sub"> · {b.branch_type === 'school' ? 'مدرسة' : 'مركز رعاية'}</span></>}
          />
        ))}
      </div>
    </fieldset>
  );
}
