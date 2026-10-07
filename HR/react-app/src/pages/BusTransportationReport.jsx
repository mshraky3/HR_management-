/**
 * Bus transportation report (head office): pick branches and sections for a PDF, or export every driver's
 * licence with the licence files embedded.
 */
import { useState, useMemo } from 'react';
import { Page, PageHeader, Card, Button, Badge, Chip, ChipGroup, SearchInput } from '../ui';
import { busTransportationReportAPI } from '../utils/api';
import { useNotification } from '../contexts/NotificationContext';
import { downloadFile } from '../utils/downloadFile';
import { useBranches } from '../hooks/useBranches';

const SECTIONS = [
  { key: 'summary', label: 'ملخص عام' },
  { key: 'busDetails', label: 'تفاصيل الحافلات' },
  { key: 'drivers', label: 'بيانات السائقين' },
  { key: 'routes', label: 'المسارات' },
  { key: 'students', label: 'الطلاب المسجلين' },
];

const ALL_SECTIONS = Object.fromEntries(SECTIONS.map((s) => [s.key, true]));

/** With responseType 'blob' an error body arrives as a Blob: read the Arabic message out of it. */
async function blobErrorMessage(error, fallback) {
  const data = error.response?.data;
  if (data instanceof Blob) {
    try {
      const parsed = JSON.parse(await data.text());
      return parsed.error || parsed.message || fallback;
    } catch { return fallback; }
  }
  return data?.error || data?.message || fallback;
}

export default function BusTransportationReport() {
  const { branches } = useBranches({});
  const { showError, showSuccess } = useNotification();
  const [selectedBranches, setSelectedBranches] = useState([]);
  const [branchQuery, setBranchQuery] = useState('');
  const [selectedData, setSelectedData] = useState(ALL_SECTIONS);
  const [generating, setGenerating] = useState(null); // null | 'pdf' | 'licenses'

  const visibleBranches = useMemo(() => branches.filter((b) => b.branch_name && b.branch_name.includes(branchQuery.trim())), [branches, branchQuery]);
  const selectedCount = Object.values(selectedData).filter(Boolean).length;
  const allSections = selectedCount === SECTIONS.length;
  const allBranches = branches.length > 0 && selectedBranches.length === branches.length;

  const toggleBranch = (id) => setSelectedBranches((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const generate = async (kind) => {
    if (selectedBranches.length === 0) { showError('الرجاء اختيار فرع واحد على الأقل'); return; }
    if (kind === 'pdf' && selectedCount === 0) { showError('الرجاء اختيار قسم واحد على الأقل'); return; }
    setGenerating(kind);
    try {
      const branchIds = selectedBranches.map(Number);
      const response = kind === 'pdf'
        ? await busTransportationReportAPI.generatePDF({ branchIds, sections: selectedData }, { responseType: 'blob' })
        : await busTransportationReportAPI.generateDriverLicenses({ branchIds }, { responseType: 'blob' });
      const blob = response.data instanceof Blob ? response.data : new Blob([response.data], { type: 'application/pdf' });
      downloadFile(blob, `${kind === 'pdf' ? 'تقرير-النقل-بالحافلات' : 'تقرير-رخص-السائقين'}-${new Date().toLocaleDateString('ar-SA')}.pdf`);
      showSuccess(kind === 'pdf' ? 'تم إنشاء التقرير بنجاح' : 'تم إنشاء تقرير رخص السائقين بنجاح');
    } catch (error) {
      console.error('Error generating report:', error);
      showError(await blobErrorMessage(error, kind === 'pdf' ? 'فشل إنشاء التقرير' : 'فشل إنشاء تقرير رخص السائقين'));
    } finally {
      setGenerating(null);
    }
  };

  return (
    <Page>
      <PageHeader
        title="تقرير النقل بالحافلات"
        subtitle="اختر الفروع والأقسام ثم أنشئ التقرير بصيغة PDF"
        actions={<Button variant="primary" icon="download" loading={generating === 'pdf'} disabled={Boolean(generating) || selectedBranches.length === 0} onClick={() => generate('pdf')}>إنشاء تقرير PDF</Button>}
      />

      <Card
        title="الفروع"
        subtitle="اختر فرعاً واحداً على الأقل"
        actions={(
          <>
            {selectedBranches.length > 0 && <Badge tone="info"><bdi>{selectedBranches.length}</bdi> محدد</Badge>}
            <Button size="sm" variant="soft" disabled={branches.length === 0} onClick={() => setSelectedBranches(allBranches ? [] : branches.map((b) => b.id))}>{allBranches ? 'إلغاء الكل' : 'تحديد الكل'}</Button>
          </>
        )}
      >
        <div className="ui-form-stack">
          <SearchInput value={branchQuery} onChange={(e) => setBranchQuery(e.target.value)} onClear={() => setBranchQuery('')} placeholder="ابحث عن فرع…" />
          <ChipGroup aria-label="الفروع">
            {visibleBranches.map((b) => <Chip key={b.id} selected={selectedBranches.includes(b.id)} onClick={() => toggleBranch(b.id)}>{b.branch_name}</Chip>)}
          </ChipGroup>
        </div>
      </Card>

      <Card
        title="الأقسام المراد تضمينها"
        actions={(
          <>
            <Badge tone="info"><bdi>{selectedCount}</bdi> من <bdi>{SECTIONS.length}</bdi></Badge>
            <Button size="sm" variant="soft" onClick={() => setSelectedData(Object.fromEntries(SECTIONS.map((s) => [s.key, !allSections])))}>{allSections ? 'إلغاء تحديد الكل' : 'تحديد الكل'}</Button>
          </>
        )}
      >
        <ChipGroup aria-label="الأقسام">
          {SECTIONS.map((s) => <Chip key={s.key} selected={Boolean(selectedData[s.key])} onClick={() => setSelectedData((prev) => ({ ...prev, [s.key]: !prev[s.key] }))}>{s.label}</Chip>)}
        </ChipGroup>
      </Card>

      <Card
        title="تقرير رخص السائقين"
        subtitle="تقرير مستقل يحتوي على بيانات جميع السائقين ورخص القيادة للفروع المحددة، مع إرفاق صورة أو ملف رخصة كل سائق كصفحة داخل التقرير."
      >
        <Button variant="secondary" icon="file-text" loading={generating === 'licenses'} disabled={Boolean(generating) || selectedBranches.length === 0} onClick={() => generate('licenses')}>
          تحميل رخص السائقين مع المستندات
        </Button>
      </Card>
    </Page>
  );
}
