/** Exports (head office): beneficiaries to Excel with chosen columns, and the staffing table to CSV. */
import { Card, Button, Checkbox, EmptyState } from '../../ui';
import { EXPORT_COLUMN_OPTIONS } from './constants';

export default function ExportsPanel({ hasTerm, exportColumns, setExportColumns, onExport, onStaffingExport, hasStaffing }) {
  if (!hasTerm) {
    return <Card><EmptyState icon="calendar" title="اختر الفصل الدراسي" description="يجب اختيار فصل دراسي لتصدير البيانات." /></Card>;
  }
  const allOn = Object.values(exportColumns).every(Boolean);
  const anyOn = Object.values(exportColumns).some(Boolean);

  return (
    <div className="bn-stack">
      <Card
        title="تصدير بيانات المستفيدين"
        subtitle="اختر الأعمدة التي تريد تضمينها في ملف Excel"
        actions={(
          <Button
            size="sm"
            variant="soft"
            onClick={() => setExportColumns((prev) => Object.fromEntries(Object.keys(prev).map((k) => [k, !allOn])))}
          >
            {allOn ? 'إلغاء الكل' : 'تحديد الكل'}
          </Button>
        )}
      >
        <div className="ui-form-stack">
          <div className="bn-check-grid">
            {EXPORT_COLUMN_OPTIONS.map((col) => (
              <Checkbox
                key={col.key}
                label={col.label}
                checked={Boolean(exportColumns[col.key])}
                onChange={() => setExportColumns((prev) => ({ ...prev, [col.key]: !prev[col.key] }))}
              />
            ))}
          </div>
          <div>
            <Button variant="primary" icon="download" onClick={() => onExport()} disabled={!anyOn}>تصدير بيانات المستفيدين</Button>
          </div>
        </div>
      </Card>

      <Card title="تصدير متطلبات التوظيف" subtitle="قائمة الوظائف المطلوبة حسب اللائحة لكل فرع">
        <Button variant="primary" icon="download" onClick={onStaffingExport} disabled={!hasStaffing}>تصدير متطلبات التوظيف</Button>
      </Card>
    </div>
  );
}
