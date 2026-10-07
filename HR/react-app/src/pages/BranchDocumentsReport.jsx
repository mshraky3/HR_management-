/**
 * Branch documents report (head office): which branch documents are expired or about to expire, and two PDF
 * reports (statistics, and the documents themselves).
 */
import { useState, useEffect, useMemo } from 'react';
import {
  Page, PageHeader, Card, StatCard, Button, Badge, FormField, Input, Chip, ChipGroup, SearchInput, DataTable, EmptyState,
} from '../ui';
import { branchDocumentsAPI, branchesAPI } from '../utils/api';
import { useAuth } from '../contexts/AuthContext';
import { useNotification } from '../contexts/NotificationContext';
import { formatDate } from '../utils/dateConverters';
import { API_URL } from '../config/api';
import { downloadFile } from '../utils/downloadFile';
import { branchDocumentLabel } from '../utils/branchDocumentLabels';
import './BranchDocumentsReport.css';

const DAY_MS = 1000 * 60 * 60 * 24;

export default function BranchDocumentsReport() {
  const { isMainManager } = useAuth();
  const { showError, showSuccess } = useNotification();

  const [documents, setDocuments] = useState([]);
  const [branches, setBranches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(null); // null | 'stats' | 'documents'
  const [selectedBranches, setSelectedBranches] = useState([]);
  const [daysThreshold, setDaysThreshold] = useState(30);
  const [branchQuery, setBranchQuery] = useState('');

  useEffect(() => {
    if (!isMainManager()) return;
    (async () => {
      try {
        setLoading(true);
        const [docsRes, branchesRes] = await Promise.all([branchDocumentsAPI.getAll(), branchesAPI.getAll()]);
        setDocuments(Array.isArray(docsRes?.data) ? docsRes.data : (docsRes?.data?.data || []));
        setBranches(Array.isArray(branchesRes?.data) ? branchesRes.data : (branchesRes?.data?.data || []));
      } catch (err) {
        showError('فشل تحميل البيانات');
        console.error(err);
        setDocuments([]);
        setBranches([]);
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMainManager]);

  const branchName = (id) => branches.find((b) => b.id === id)?.branch_name || 'غير محدد';

  // Documents with an expiry date, split into expired / expiring within the threshold
  const { expired, expiring } = useMemo(() => {
    const now = new Date();
    const out = { expired: [], expiring: [] };
    documents.forEach((doc) => {
      if (!doc.expiry_date) return;
      const days = Math.ceil((new Date(doc.expiry_date) - now) / DAY_MS);
      if (days < 0) out.expired.push({ ...doc, daysUntilExpiry: days });
      else if (days <= daysThreshold) out.expiring.push({ ...doc, daysUntilExpiry: days });
    });
    return out;
  }, [documents, daysThreshold]);

  const rows = useMemo(() => [...expired, ...expiring]
    .filter((d) => selectedBranches.length === 0 || selectedBranches.includes(d.branch_id))
    .sort((a, b) => a.daysUntilExpiry - b.daysUntilExpiry), [expired, expiring, selectedBranches]);

  const visibleBranches = useMemo(() => branches.filter((b) => b.branch_name.includes(branchQuery.trim())), [branches, branchQuery]);

  const toggleBranch = (id) => setSelectedBranches((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const generate = async (kind) => {
    if (kind === 'stats' && expired.length === 0 && expiring.length === 0) {
      showError('لا توجد مستندات منتهية أو قريبة الانتهاء');
      return;
    }
    if (kind === 'documents' && rows.length === 0) {
      showError('لا توجد مستندات لإنشاء التقرير');
      return;
    }
    try {
      setGenerating(kind);
      const branchIds = selectedBranches.length > 0 ? selectedBranches : branches.map((b) => b.id);
      const response = await fetch(`${API_URL}/api/branch-documents/${kind === 'stats' ? 'generate-pdf-stats' : 'generate-pdf-documents'}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('token')}` },
        body: JSON.stringify({ branch_ids: branchIds, days_threshold: daysThreshold }),
      });
      if (!response.ok) throw new Error('فشل في إنشاء التقرير');
      const blob = await response.blob();
      downloadFile(blob, kind === 'stats' ? `تقرير-مستندات-الفروع-${formatDate(new Date())}.pdf` : `مستندات-الفروع-${formatDate(new Date())}.pdf`);
      showSuccess('تم إنشاء التقرير بنجاح');
    } catch (err) {
      showError('فشل في إنشاء التقرير');
      console.error(err);
    } finally {
      setGenerating(null);
    }
  };

  const columns = [
    { key: 'branch', header: 'الفرع', mobilePrimary: true, render: (d) => <strong>{branchName(d.branch_id)}</strong> },
    { key: 'type', header: 'نوع المستند', render: (d) => branchDocumentLabel(d.document_type) },
    { key: 'number', header: 'رقم المستند', mobileHidden: true, render: (d) => (d.document_number ? <bdi>{d.document_number}</bdi> : '—') },
    { key: 'issue', header: 'تاريخ الإصدار', mobileHidden: true, render: (d) => (d.issue_date ? formatDate(new Date(d.issue_date)) : '—') },
    { key: 'expiry', header: 'تاريخ الانتهاء', render: (d) => (d.expiry_date ? formatDate(new Date(d.expiry_date)) : '—') },
    {
      key: 'status', header: 'الحالة',
      render: (d) => (d.daysUntilExpiry < 0
        ? <Badge tone="danger" dot>منتهي منذ <bdi>{Math.abs(d.daysUntilExpiry)}</bdi> يوماً</Badge>
        : <Badge tone="warning" dot>يتبقى <bdi>{d.daysUntilExpiry}</bdi> يوماً</Badge>),
    },
  ];

  if (!isMainManager()) {
    return <Page><PageHeader title="غير مصرح" /><Card><EmptyState icon="shield" title="هذه الصفحة متاحة فقط للمدير الرئيسي" /></Card></Page>;
  }

  return (
    <Page>
      <PageHeader
        title="تقرير مستندات الفروع"
        subtitle="المستندات المنتهية والقريبة من الانتهاء، وتقارير PDF عنها"
        actions={(
          <>
            <Button variant="secondary" icon="chart" loading={generating === 'stats'} disabled={Boolean(generating) || (expired.length === 0 && expiring.length === 0)} onClick={() => generate('stats')}>تقرير الإحصائيات</Button>
            <Button variant="primary" icon="file-text" loading={generating === 'documents'} disabled={Boolean(generating) || rows.length === 0} onClick={() => generate('documents')}>تقرير المستندات</Button>
          </>
        )}
      />

      <div className="ui-grid-stats">
        <StatCard label="إجمالي المستندات" value={documents.length} icon="folder" tone="primary" loading={loading} />
        <StatCard label="مستندات منتهية" value={expired.length} icon="x-circle" tone="danger" loading={loading} />
        <StatCard label="قريبة الانتهاء" value={expiring.length} icon="clock" tone="warning" loading={loading} />
      </div>

      <Card
        title="تصفية"
        actions={selectedBranches.length > 0 ? <Button size="sm" variant="ghost" icon="x" onClick={() => setSelectedBranches([])}>إزالة تصفية الفروع</Button> : null}
      >
        <div className="ui-form-stack">
          <FormField label="عتبة الانتهاء (بالأيام)" hint="المستند الذي ينتهي خلال هذه المدة يُعدّ قريب الانتهاء" className="bdr-days">
            <Input type="number" min="1" max="365" value={daysThreshold} onChange={(e) => setDaysThreshold(Math.max(1, parseInt(e.target.value, 10) || 30))} />
          </FormField>
          <div className="ui-form-stack">
            <span className="ui-field-label">الفروع {selectedBranches.length > 0 ? `(${selectedBranches.length} محددة)` : '(الكل)'}</span>
            <SearchInput value={branchQuery} onChange={(e) => setBranchQuery(e.target.value)} onClear={() => setBranchQuery('')} placeholder="ابحث عن فرع…" />
            <ChipGroup aria-label="الفروع">
              {visibleBranches.map((b) => <Chip key={b.id} selected={selectedBranches.includes(b.id)} onClick={() => toggleBranch(b.id)}>{b.branch_name}</Chip>)}
            </ChipGroup>
          </div>
        </div>
      </Card>

      <Card title="المستندات المنتهية والقريبة من الانتهاء" actions={<Badge tone="neutral"><bdi>{rows.length}</bdi></Badge>} flush>
        <DataTable
          columns={columns}
          rows={rows}
          rowKey={(d) => `${d.id}-${d.branch_id}`}
          loading={loading}
          emptyIcon="check-circle"
          emptyTitle="لا توجد مستندات منتهية أو قريبة من الانتهاء"
        />
      </Card>
    </Page>
  );
}
