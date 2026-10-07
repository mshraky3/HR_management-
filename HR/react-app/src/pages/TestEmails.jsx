/**
 * E-mail test (main manager): sends a test notification to the manager and a test error report to the developer
 * through the e-mail gateway, and shows what happened to each.
 */
import { useState } from 'react';
import { Page, PageHeader, Card, Button, Badge, Alert } from '../ui';
import { useAuth } from '../contexts/AuthContext';
import { useNotification } from '../contexts/NotificationContext';
import { adminAPI } from '../utils/api';
import './TestEmails.css';

const CHANNELS = [
  { key: 'manager', icon: 'bell', title: 'إشعار المدير الرئيسي', text: 'رسالة اختبار إلى بريد المدير الرئيسي للتحقق من وصول الإشعارات', recipient: 'Sharaksa@gmail.com' },
  { key: 'developer', icon: 'alert', title: 'تقرير خطأ للمطوّر', text: 'رسالة اختبار بتنسيق تقرير الأخطاء للتحقق من وصول تنبيهات المطوّر', recipient: 'alshraky3@gmail.com' },
];

export default function TestEmails() {
  const { isMainManager } = useAuth();
  const { showSuccess, showError } = useNotification();
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState(null);

  if (!isMainManager()) {
    return <Page><PageHeader title="غير مصرح" /><Alert tone="warning">هذه الصفحة متاحة فقط للمدير الرئيسي</Alert></Page>;
  }

  const send = async () => {
    try {
      setLoading(true);
      setResults(null);
      const res = await adminAPI.testEmail();
      const data = res.data;
      setResults(data.results || {});
      if (data.success) showSuccess('تم إرسال رسائل الاختبار بنجاح');
      else showError('بعض الرسائل فشلت — راجع النتائج أدناه');
    } catch {
      showError('فشل إرسال رسائل الاختبار');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Page>
      <PageHeader
        title="اختبار نظام البريد الإلكتروني"
        subtitle="تحقق من أن جميع قنوات البريد الإلكتروني تعمل بشكل صحيح"
        actions={<Button variant="primary" icon="mail" loading={loading} onClick={send}>إرسال رسائل الاختبار</Button>}
      />

      <div className="te-grid">
        {CHANNELS.map((c) => {
          const result = results?.[c.key];
          return (
            <Card key={c.key} title={c.title} subtitle={c.text}>
              <div className="te-body">
                <span className="te-recipient"><bdi dir="ltr">{c.recipient}</bdi></span>
                {result && <Badge tone={result.success ? 'success' : 'danger'} dot>{result.success ? 'نجح' : 'فشل'}</Badge>}
              </div>
              {result?.messageId && <p className="te-muted">Message ID: <bdi dir="ltr">{result.messageId}</bdi></p>}
              {result?.error && <Alert tone="danger" title="الخطأ">{result.error}</Alert>}
              {result?.reason === 'rate_limited' && <Alert tone="warning">تم تجاوز حد الإرسال — انتظر 5 دقائق وأعد المحاولة</Alert>}
            </Card>
          );
        })}
      </div>
    </Page>
  );
}
