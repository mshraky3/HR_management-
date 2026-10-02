import { Badge, Button, Card, DataTable } from '../../../ui';
import { getDocumentTypeLabel } from '../../../utils/employeeConstants';
import { formatDate } from '../../../utils/dateConverters';

function formatSize(bytes) {
  if (!bytes) return '—';
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} ك.ب`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} م.ب`;
}

const isExpired = (value) => value && new Date(value) < new Date(new Date().toDateString());

/** DocumentsPanel: uploaded documents as a table (type, file, date, size, verification, expiry). */
export default function DocumentsPanel({ documents, onPreview, onDownload, previewLoading, downloading }) {
  const columns = [
    {
      key: 'type', header: 'نوع المستند', mobilePrimary: true,
      render: (d) => <strong>{getDocumentTypeLabel(d.document_type)}</strong>,
    },
    { key: 'file', header: 'اسم الملف', render: (d) => <bdi className="ui-clamp-2">{d.file_name || '—'}</bdi> },
    { key: 'date', header: 'تاريخ الرفع', render: (d) => formatDate(d.uploaded_at), nowrap: true },
    { key: 'size', header: 'الحجم', mobileHidden: true, render: (d) => formatSize(d.file_size), nowrap: true },
    {
      key: 'verified', header: 'التحقق',
      render: (d) => (d.is_verified ? <Badge tone="success" dot>متحقق منه</Badge> : <Badge tone="warning" dot>غير متحقق</Badge>),
    },
    {
      key: 'expiry', header: 'الانتهاء',
      render: (d) => {
        if (!d.expiry_date) return '—';
        return isExpired(d.expiry_date)
          ? <Badge tone="danger" dot>منتهي {formatDate(d.expiry_date)}</Badge>
          : formatDate(d.expiry_date);
      },
    },
    {
      key: 'actions', header: '', align: 'end',
      render: (d) => (
        <div className="ui-inline-actions">
          <Button size="sm" variant="soft" icon="eye" loading={previewLoading === d.id} onClick={() => onPreview(d)}>عرض</Button>
          <Button size="sm" variant="secondary" icon="download" loading={downloading === d.id} onClick={() => onDownload(d.id)}>تحميل</Button>
        </div>
      ),
    },
  ];

  return (
    <Card title={`المستندات المرفوعة (${documents.length})`} flush>
      <DataTable
        caption="مستندات الموظف"
        columns={columns}
        rows={documents}
        emptyIcon="file"
        emptyTitle="لا توجد مستندات مرفوعة"
        emptyDescription="تُرفع المستندات من نموذج تعديل بيانات الموظف."
      />
    </Card>
  );
}
