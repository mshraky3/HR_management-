/**
 * Employee statistics report (head office): choose which sections go into the generated PDF.
 */
import { useState, useEffect } from 'react';
import { Page, PageHeader, Card, StatCard, Chip, ChipGroup, Button, Badge, EmptyState, Skeleton } from '../ui';
import { useAuth } from '../contexts/AuthContext';
import { useNotification } from '../contexts/NotificationContext';
import { employeesAPI } from '../utils/api';
import { downloadFile } from '../utils/downloadFile';

const AVAILABLE_SECTIONS = [
  { key: 'overview', label: 'ملخص عام' },
  { key: 'gender', label: 'توزيع حسب الجنس' },
  { key: 'salary', label: 'توزيع الرواتب' },
  { key: 'jobTitles', label: 'المسميات الوظيفية' },
  { key: 'contractTypes', label: 'نوع العقد' },
  { key: 'maritalStatus', label: 'الحالة الاجتماعية' },
  { key: 'nationalities', label: 'الجنسيات' },
  { key: 'educationalQualifications', label: 'المؤهلات التعليمية' },
  { key: 'status', label: 'حالة الموظف' },
  { key: 'ageGroups', label: 'فئات العمر' },
  { key: 'experienceLevels', label: 'مستويات الخبرة' },
  { key: 'companyExperience', label: 'خبرة الموظف بالشركة' },
  { key: 'branches', label: 'توزيع حسب الفروع' },
  { key: 'salaryByBranch', label: 'الرواتب حسب الفرع' },
];

const ALL_ON = Object.fromEntries(AVAILABLE_SECTIONS.map((s) => [s.key, true]));
const money = (n) => `${(n || 0).toLocaleString('en-US')} ريال`;

export default function EmployeeStatisticsReport() {
  const { isMainManager } = useAuth();
  const { showError, showSuccess, showWarning } = useNotification();

  const [statistics, setStatistics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [selected, setSelected] = useState(ALL_ON);

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        const response = await employeesAPI.getStatistics();
        if (response.data.success) setStatistics(response.data.data);
        else showError('فشل تحميل الإحصائيات');
      } catch (error) {
        console.error('Error loading statistics:', error);
        showError('فشل تحميل الإحصائيات');
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectedCount = Object.values(selected).filter(Boolean).length;
  const allSelected = selectedCount === AVAILABLE_SECTIONS.length;

  const generate = async () => {
    if (selectedCount === 0) {
      showWarning('الرجاء اختيار قسم واحد على الأقل');
      return;
    }
    try {
      setGenerating(true);
      const response = await employeesAPI.generateStatisticsPDF({ selectedSections: selected }, { responseType: 'blob' });
      const blob = response.data instanceof Blob ? response.data : new Blob([response.data], { type: 'application/pdf' });
      downloadFile(blob, `تقرير_احصائيات_الموظفين_${new Date().toLocaleDateString('ar-SA')}.pdf`);
      showSuccess('تم إنشاء التقرير بنجاح');
    } catch (error) {
      console.error('Error generating PDF:', error);
      showError(error.response?.data?.message || 'فشل إنشاء التقرير');
    } finally {
      setGenerating(false);
    }
  };

  if (!isMainManager()) return null;

  const overview = statistics?.overview || {};

  return (
    <Page>
      <PageHeader
        title="تقرير إحصائيات الموظفين"
        subtitle="اختر الأقسام التي تريد تضمينها في ملف PDF"
        actions={<Button variant="primary" icon="download" loading={generating} disabled={loading || !statistics} onClick={generate}>إنشاء التقرير (PDF)</Button>}
      />

      {loading ? (
        <Card><Skeleton lines={4} height={16} /></Card>
      ) : !statistics ? (
        <Card><EmptyState icon="pie-chart" title="لا توجد بيانات متاحة" /></Card>
      ) : (
        <>
          <div className="ui-grid-stats">
            <StatCard label="إجمالي الموظفين" value={overview.total || 0} icon="users" tone="primary" />
            <StatCard label="متوسط الراتب" value={money(overview.avgSalary)} icon="wallet" tone="success" />
            <StatCard label="إجمالي الرواتب" value={money(overview.totalSalaryBudget)} icon="wallet" tone="primary" />
            <StatCard label="نسبة الإكمال" value={`${overview.completionRate || 0}%`} icon="check-circle" tone="warning" />
          </div>

          <Card
            title="الأقسام المراد تضمينها"
            actions={(
              <>
                <Badge tone="info"><bdi>{selectedCount}</bdi> من <bdi>{AVAILABLE_SECTIONS.length}</bdi></Badge>
                <Button size="sm" variant="soft" onClick={() => setSelected(Object.fromEntries(AVAILABLE_SECTIONS.map((s) => [s.key, !allSelected])))}>
                  {allSelected ? 'إلغاء تحديد الكل' : 'تحديد الكل'}
                </Button>
              </>
            )}
          >
            <ChipGroup aria-label="أقسام التقرير">
              {AVAILABLE_SECTIONS.map((s) => (
                <Chip key={s.key} selected={Boolean(selected[s.key])} onClick={() => setSelected((prev) => ({ ...prev, [s.key]: !prev[s.key] }))}>{s.label}</Chip>
              ))}
            </ChipGroup>
          </Card>
        </>
      )}
    </Page>
  );
}
