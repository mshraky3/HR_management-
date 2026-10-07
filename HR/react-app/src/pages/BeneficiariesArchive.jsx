/**
 * Beneficiaries archive (head office): read-only view of the beneficiaries archived from earlier terms, with
 * statistics and an Excel export. Reuses the data table and statistics panels of the beneficiaries page.
 */
import { useState, useEffect } from 'react';
import { Page, PageHeader, Card, Toolbar, FormField, Select, Button, Tabs, Spinner, EmptyState } from '../ui';
import { beneficiariesAPI, branchesAPI } from '../utils/api';
import { useNotification } from '../contexts/NotificationContext';
import { downloadFile } from '../utils/downloadFile';
import DataPanel from './beneficiaries/DataPanel';
import StatsPanel from './beneficiaries/StatsPanel';
import './Beneficiaries.css';

export default function BeneficiariesArchive() {
  const { showError, showSuccess } = useNotification();

  const [beneficiaries, setBeneficiaries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [termsWithData, setTermsWithData] = useState([]);
  const [branches, setBranches] = useState([]);
  const [stats, setStats] = useState(null);
  const [view, setView] = useState('table');
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState({ term_id: '', branch_id: '' });

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        const [termsRes, branchRes] = await Promise.all([beneficiariesAPI.getTermsWithData(), branchesAPI.getAll()]);
        const terms = (termsRes.data.data || []).filter((t) => t.has_archived);
        setTermsWithData(terms);
        setBranches((branchRes.data.data || branchRes.data || []).filter((b) => b.branch_type === 'healthcare_center'));
        if (terms.length > 0) setFilters((prev) => ({ ...prev, term_id: terms[0].id.toString() }));
      } catch {
        showError('فشل في تحميل البيانات');
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!filters.term_id) return;
    (async () => {
      try {
        const params = { term_id: filters.term_id };
        if (filters.branch_id) params.branch_id = filters.branch_id;
        const res = await beneficiariesAPI.getArchive(params);
        if (res.data.success) setBeneficiaries(res.data.data || []);
      } catch {
        showError('فشل في تحميل الأرشيف');
      }
      try {
        const res = await beneficiariesAPI.getStats({ term_id: filters.term_id });
        if (res.data.success) setStats(res.data.data);
      } catch (error) {
        console.error('Error loading archived stats:', error);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.term_id, filters.branch_id]);

  const exportExcel = async () => {
    try {
      const params = { term_id: filters.term_id, is_archived: 'true' };
      if (filters.branch_id) params.branch_id = filters.branch_id;
      const res = await beneficiariesAPI.exportExcel(params);
      downloadFile(new Blob([res.data], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), `beneficiaries-archive-${filters.term_id}.xlsx`);
      showSuccess('تم تصدير البيانات بنجاح');
    } catch {
      showError('فشل في تصدير البيانات');
    }
  };

  if (loading) return <Page><PageHeader title="أرشيف المستفيدين" /><Card><Spinner block label="جاري التحميل…" /></Card></Page>;

  return (
    <Page>
      <PageHeader
        title="أرشيف المستفيدين"
        subtitle="بيانات المستفيدين المؤرشفة من الفصول السابقة"
        actions={filters.term_id ? <Button variant="primary" icon="download" onClick={exportExcel}>تصدير Excel</Button> : null}
      />

      {termsWithData.length === 0 ? (
        <Card><EmptyState icon="archive" title="لا توجد بيانات مؤرشفة" description="لم تتم أرشفة أي بيانات مستفيدين بعد." /></Card>
      ) : (
        <>
          <Card flush>
            <Toolbar>
              <FormField label="الفصل الدراسي" className="bn-filter">
                <Select
                  value={filters.term_id}
                  onChange={(e) => setFilters((prev) => ({ ...prev, term_id: e.target.value }))}
                  options={termsWithData.map((t) => ({ value: t.id.toString(), label: `${t.term_name} (${t.beneficiary_count} مستفيد)` }))}
                  placeholder="اختر الفصل"
                />
              </FormField>
              <FormField label="الفرع" className="bn-filter">
                <Select
                  value={filters.branch_id}
                  onChange={(e) => setFilters((prev) => ({ ...prev, branch_id: e.target.value }))}
                  options={branches.map((b) => ({ value: String(b.id), label: b.branch_name }))}
                  placeholder="جميع الفروع"
                />
              </FormField>
            </Toolbar>
          </Card>

          {filters.term_id && (
            <>
              <Tabs value={view} onChange={setView} items={[{ id: 'table', label: 'الجدول', icon: 'clipboard' }, { id: 'stats', label: 'الإحصائيات', icon: 'chart' }]} ariaLabel="طريقة العرض" />
              {view === 'stats'
                ? <StatsPanel stats={stats} submissionStatus={[]} />
                : <DataPanel beneficiaries={beneficiaries} isMain canEdit={false} activeTerm={null} searchQuery={search} onSearch={setSearch} />}
            </>
          )}
        </>
      )}
    </Page>
  );
}
