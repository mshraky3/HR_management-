/**
 * MeterList: a ranked list of horizontal bars. Replaces vertical bar charts with one column per branch,
 * which are unreadable with 25+ Arabic names and need a colour legend. Each row carries its own label
 * and number, so nothing depends on colour alone.
 *
 *   <MeterList items={[{ key: 1, label: 'فرع', value: 72, tone: 'success', note: '72%' }]} max={100} />
 *
 * tone: primary | success | warning | danger | neutral (default primary)
 */
export default function MeterList({ items, max = 100, emptyText = 'لا توجد بيانات', className = '' }) {
  if (!items || items.length === 0) return <p className="ui-meter-empty">{emptyText}</p>;
  return (
    <ul className={`ui-meters${className ? ` ${className}` : ''}`}>
      {items.map((item) => {
        const pct = max > 0 ? Math.max(0, Math.min(100, (item.value / max) * 100)) : 0;
        return (
          <li key={item.key} className="ui-meter">
            <span className="ui-meter-label" title={item.label}>{item.label}</span>
            <span className="ui-meter-track" role="progressbar" aria-valuenow={item.value} aria-valuemin={0} aria-valuemax={max} aria-label={item.label}>
              <span className={`ui-meter-fill ui-meter-${item.tone || 'primary'}`} style={{ width: `${pct}%` }} />
            </span>
            <span className="ui-meter-note"><bdi>{item.note ?? item.value}</bdi></span>
          </li>
        );
      })}
    </ul>
  );
}
