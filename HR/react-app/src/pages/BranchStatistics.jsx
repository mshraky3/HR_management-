/**
 * Branch statistics (head office): which branches are active, how complete their data is, how often they
 * sign in, and a monthly performance report in Excel.
 */
import { useState, useEffect, useMemo } from 'react';
import {
  Page, PageHeader, Card, StatCard, Toolbar, FormField, Input, Select, Button, Badge, DataTable, MeterList, EmptyState,
} from '../ui';
import { useAuth } from '../contexts/AuthContext';
import { useNotification } from '../contexts/NotificationContext';
import { branchStatisticsAPI, branchDocumentsAPI } from '../utils/api';
import { calculateOverallProgress, calculateDocumentsCompletion } from '../utils/dataCompletionUtils';
import { formatDate } from '../utils/dateConverters';
import { downloadFile } from '../utils/downloadFile';
import BranchesOverallProgressChart from '../components/BranchesOverallProgressChart.jsx';
import './BranchStatistics.css';

const MONTHS = Array.from({ length: 12 }, (_, i) => ({ value: String(i + 1), label: String(i + 1).padStart(2, '0') }));
const monthKey = (year, month) => `${year}-${String(month).padStart(2, '0')}`;

/** The server answers errors for blob requests as a blob: read the message out of it. */
async function reportErrorMessage(error) {
  const data = error.response?.data;
  if (!error.response) return error.message || 'فشل إنشاء التقرير';
  if (data instanceof Blob) {
    try { return JSON.parse(await data.text()).message || 'فشل إنشاء التقرير'; } catch { return 'فشل إنشاء التقرير'; }
  }
  if (data && typeof data === 'object') return data.message || 'فشل إنشاء التقرير';
  if (typeof data === 'string') {
    try { return JSON.parse(data).message || 'فشل إنشاء التقرير'; } catch { return data || 'فشل إنشاء التقرير'; }
  }
  return 'فشل إنشاء التقرير';
}

export default function BranchStatistics() {
  const { isMainManager } = useAuth();
  const { showError, showSuccess } = useNotification();

  const [statistics, setStatistics] = useState([]);
  const [branchDocuments, setBranchDocuments] = useState({});
  const [loading, setLoading] = useState(true);
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [filterOperational, setFilterOperational] = useState('all');
  const [sortBy, setSortBy] = useState('completion');
  const [generatingReport, setGeneratingReport] = useState(false);

  const loadStatistics = async () => {
    try {
      setLoading(true);
      const response = await branchStatisticsAPI.getAll();
      if (!response.data.success) return;
      const stats = response.data.data || [];
      setStatistics(stats);

      // One call for every branch's documents (the API returns all the user may see), grouped here.
      const documentsMap = {};
      stats.forEach((stat) => { documentsMap[stat.branch_id] = []; });
      try {
        const docsResponse = await branchDocumentsAPI.getAll();
        if (docsResponse.data.success) {
          (docsResponse.data.data || []).forEach((doc) => { if (documentsMap[doc.branch_id]) documentsMap[doc.branch_id].push(doc); });
        }
      } catch (error) {
        console.error('Error loading branch documents:', error);
      }
      setBranchDocuments(documentsMap);
    } catch (error) {
      console.error('Error loading statistics:', error);
      showError('فشل تحميل الإحصائيات');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!isMainManager()) return;
    loadStatistics();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMainManager, selectedMonth, selectedYear]);

  const generateReport = async () => {
    try {
      setGeneratingReport(true);
      const response = await branchStatisticsAPI.generatePerformanceReport({
        month: selectedMonth,
        year: selectedYear,
        branch_ids: statistics.map((s) => s.branch_id),
        format: 'excel',
      });
      let blob;
      if (response.data instanceof Blob) blob = response.data;
      else if (response.data instanceof ArrayBuffer) blob = new Blob([response.data], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      else throw new Error('تنسيق الاستجابة غير صحيح');
      downloadFile(blob, `performance-report-${selectedYear}-${selectedMonth}.xlsx`);
      showSuccess('تم تحميل التقرير بنجاح');
    } catch (error) {
      console.error('Error generating report:', error);
      showError(await reportErrorMessage(error));
    } finally {
      setGeneratingReport(false);
    }
  };

  const overallProgress = (stat) => {
    const docs = calculateDocumentsCompletion(branchDocuments[stat.branch_id] || [], stat.branch_type);
    return calculateOverallProgress(stat.completion_percentage, docs.percentage);
  };

  const rows = useMemo(() => statistics
    .filter((s) => (filterOperational === 'operational' ? s.is_operational === true : filterOperational === 'inactive' ? s.is_operational === false : true))
    .sort((a, b) => {
      switch (sortBy) {
        case 'completion': return overallProgress(b) - overallProgress(a);
        case 'logins': return b.login_days_this_month - a.login_days_this_month;
        case 'activity': return b.activities_last_30_days.total - a.activities_last_30_days.total;
        default: return a.branch_name.localeCompare(b.branch_name, 'ar');
      }
    }),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [statistics, filterOperational, sortBy, branchDocuments]);

  const operationalCount = statistics.filter((s) => s.is_operational).length;
  const inactiveCount = statistics.filter((s) => !s.is_operational).length;
  const hasDocs = Object.keys(branchDocuments).length > 0;
  const average = statistics.length > 0 ? Math.round(statistics.reduce((sum, s) => sum + overallProgress(s), 0) / statistics.length) : 0;

  const loginRows = useMemo(() => {
    const target = monthKey(selectedYear, selectedMonth);
    return statistics
      .map((stat) => {
        const entry = (stat.monthly_login_history || []).find((m) => {
          const d = new Date(m.month);
          return monthKey(d.getFullYear(), d.getMonth() + 1) === target;
        });
        return entry ? { stat, days: entry.login_days } : null;
      })
      .filter(Boolean)
      .sort((a, b) => b.days - a.days);
  }, [statistics, selectedMonth, selectedYear]);

  const columns = [
    { key: 'branch_name', header: 'الفرع', mobilePrimary: true, render: (s) => <strong>{s.branch_name}</strong> },
    { key: 'branch_type', header: 'النوع', render: (s) => (s.branch_type === 'school' ? 'مدرسة' : 'مركز رعاية نهارية') },
    { key: 'progress', header: 'التقدم', align: 'center', render: (s) => <bdi>{hasDocs ? `${overallProgress(s)}%` : '—'}</bdi> },
    { key: 'status', header: 'الحالة', render: (s) => (s.is_operational ? <Badge tone="success" dot>نشط</Badge> : <Badge tone="danger" dot>غير نشط</Badge>) },
    { key: 'logins', header: 'أيام الدخول', align: 'center', render: (s) => <bdi>{s.login_days_this_month}</bdi> },
    {
      key: 'activity', header: 'النشاط (آخر 30 يوماً)',
      render: (s) => (
        <span className="bs-activity">
          <span>تحديثات <bdi>{s.activities_last_30_days.employee_updates}</bdi></span>
          <span>مستندات <bdi>{s.activities_last_30_days.document_uploads}</bdi></span>
          <span>إضافات <bdi>{s.activities_last_30_days.employee_creations}</bdi></span>
          <strong>المجموع <bdi>{s.activities_last_30_days.total}</bdi></strong>
        </span>
      ),
    },
    {
      key: 'last_login', header: 'آخر تسجيل دخول', mobileHidden: true,
      render: (s) => (s.last_login ? <span className="bs-last">{formatDate(s.last_login)}{s.days_since_last_login !== null && <small>منذ <bdi>{s.days_since_last_login}</bdi> يوماً</small>}</span> : 'لا يوجد'),
    },
    { key: 'last_activity', header: 'آخر نشاط', mobileHidden: true, render: (s) => (s.last_activity ? formatDate(s.last_activity) : 'لا يوجد') },
  ];

  if (!isMainManager()) {
    return <Page><PageHeader title="غير مصرح" /><Card><EmptyState icon="shield" title="هذه الصفحة متاحة فقط للمدير الرئيسي" /></Card></Page>;
  }

  return (
    <Page>
      <PageHeader
        title="إحصائيات ومتابعة الفروع"
        subtitle="نشاط الفروع واكتمال بياناتها وأداؤها الشهري"
        actions={(
          <>
            <FormField label="الشهر" className="bs-inline"><Select value={String(selectedMonth)} onChange={(e) => setSelectedMonth(parseInt(e.target.value, 10))} options={MONTHS} /></FormField>
            <FormField label="السنة" className="bs-inline"><Input type="number" min="2020" max="2100" value={selectedYear} onChange={(e) => setSelectedYear(parseInt(e.target.value, 10) || selectedYear)} /></FormField>
            <Button variant="primary" icon="download" loading={generatingReport} onClick={generateReport}>تقرير Excel</Button>
            <Button variant="secondary" icon="mail" to="/test-emails">اختبار البريد</Button>
          </>
        )}
      />

      <div className="ui-grid-stats">
        <StatCard label="إجمالي الفروع" value={statistics.length} icon="building" tone="primary" loading={loading} />
        <StatCard label="الفروع النشطة" value={operationalCount} icon="check-circle" tone="success" loading={loading} />
        <StatCard label="الفروع غير النشطة" value={inactiveCount} icon="alert" tone="danger" loading={loading} />
        <StatCard label="متوسط التقدم الإجمالي" value={hasDocs ? `${average}%` : '—'} icon="chart" tone="warning" loading={loading} />
      </div>

      <BranchesOverallProgressChart statistics={statistics} branchDocumentsMap={branchDocuments} />

      <Card flush>
        <Toolbar>
          <FormField label="الحالة" className="bs-filter">
            <Select
              value={filterOperational}
              onChange={(e) => setFilterOperational(e.target.value)}
              options={[{ value: 'all', label: 'الكل' }, { value: 'operational', label: 'نشط فقط' }, { value: 'inactive', label: 'غير نشط فقط' }]}
            />
          </FormField>
          <FormField label="ترتيب حسب" className="bs-filter">
            <Select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              options={[
                { value: 'branch_name', label: 'اسم الفرع' },
                { value: 'completion', label: 'نسبة الإكمال' },
                { value: 'logins', label: 'أيام تسجيل الدخول' },
                { value: 'activity', label: 'النشاط' },
              ]}
            />
          </FormField>
        </Toolbar>
        <DataTable columns={columns} rows={rows} rowKey="branch_id" loading={loading} emptyIcon="building" emptyTitle="لا توجد فروع" rowClassName={(s) => (s.is_operational ? '' : 'bs-inactive')} />
      </Card>

      <Card title={`تسجيلات الدخول · ${String(selectedMonth).padStart(2, '0')}/${selectedYear}`} subtitle="عدد الأيام التي سجّل فيها كل فرع دخوله خلال الشهر المختار">
        <MeterList
          items={loginRows.map(({ stat, days }) => ({ key: stat.branch_id, label: stat.branch_name, value: days, note: `${days} يوم`, tone: days >= 15 ? 'success' : days >= 5 ? 'warning' : 'danger' }))}
          max={31}
          emptyText="لا توجد بيانات تسجيل دخول متاحة لهذا الشهر"
        />
      </Card>
    </Page>
  );
}
