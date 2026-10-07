/**
 * Direct contact (head office): every active branch's phone and e-mail, with a WhatsApp shortcut.
 */
import { useState, useEffect, useMemo } from 'react';
import { Page, PageHeader, Card, SearchInput, Button, Badge, Icon, EmptyState, Skeleton } from '../ui';
import { branchesAPI } from '../utils/api';
import { useAuth } from '../contexts/AuthContext';
import { useNotification } from '../contexts/NotificationContext';
import './DirectContact.css';

// Saudi numbers are stored as 05xxxxxxxx; WhatsApp wants 9665xxxxxxxx.
const whatsappDigits = (phone) => {
  if (!phone) return null;
  const cleaned = phone.startsWith('0') ? phone.substring(1) : phone;
  return cleaned.replace(/\D/g, '') || null;
};

export default function DirectContact() {
  const { isMainManager } = useAuth();
  const { showError } = useNotification();
  const [branches, setBranches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (!isMainManager()) return;
    (async () => {
      try {
        setLoading(true);
        const response = await branchesAPI.getAll({ is_active: true });
        if (response.data.success) {
          const list = response.data.data || [];
          setBranches([...list].sort((a, b) => (a.branch_name || '').localeCompare(b.branch_name || '', 'ar')));
        }
      } catch (error) {
        console.error('Error loading branches:', error);
        showError('فشل تحميل الفروع');
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return branches;
    return branches.filter((b) => b.branch_name.toLowerCase().includes(q)
      || (b.phone_number && b.phone_number.includes(search.trim()))
      || (b.email && b.email.toLowerCase().includes(q)));
  }, [branches, search]);

  const openWhatsApp = (branch) => {
    const digits = whatsappDigits(branch.phone_number);
    if (!digits) return;
    const text = encodeURIComponent(`مرحباً، أود التواصل مع فرع ${branch.branch_name}`);
    window.open(`https://wa.me/966${digits}?text=${text}`, '_blank', 'noopener');
  };

  return (
    <Page>
      <PageHeader title="التواصل المباشر" subtitle="تواصل مباشر مع جميع الفروع عبر الواتساب" />

      {branches.length > 0 && (
        <div className="dc-search">
          <SearchInput value={search} onChange={(e) => setSearch(e.target.value)} onClear={() => setSearch('')} placeholder="ابحث عن فرع أو رقم هاتف أو بريد إلكتروني…" />
          {search && <Badge tone="neutral"><bdi>{visible.length}</bdi> فرع من <bdi>{branches.length}</bdi></Badge>}
        </div>
      )}

      {loading ? (
        <div className="dc-grid">{[0, 1, 2].map((i) => <Card key={i}><Skeleton lines={3} height={16} /></Card>)}</div>
      ) : branches.length === 0 ? (
        <Card><EmptyState icon="building" title="لا توجد فروع متاحة" /></Card>
      ) : visible.length === 0 ? (
        <Card><EmptyState icon="search" title="لا توجد نتائج للبحث" description="جرّب اسماً أو رقماً آخر." /></Card>
      ) : (
        <ul className="dc-grid">
          {visible.map((branch) => {
            const hasPhone = Boolean(branch.phone_number && branch.phone_number.trim());
            return (
              <li key={branch.id} className="dc-card">
                <h3>{branch.branch_name}</h3>
                <dl className="dc-facts">
                  <div>
                    <dt><Icon name="phone" size={16} /> رقم التواصل</dt>
                    <dd className={hasPhone ? '' : 'is-missing'}>{hasPhone ? <bdi>{branch.phone_number}</bdi> : 'غير متوفر'}</dd>
                  </div>
                  {branch.email && (
                    <div>
                      <dt><Icon name="mail" size={16} /> البريد الإلكتروني</dt>
                      <dd><bdi>{branch.email}</bdi></dd>
                    </div>
                  )}
                </dl>
                <Button
                  variant={hasPhone ? 'success' : 'secondary'}
                  icon="message"
                  disabled={!hasPhone}
                  onClick={() => openWhatsApp(branch)}
                  title={hasPhone ? 'تواصل عبر الواتساب' : 'الرقم غير متوفر'}
                >
                  {hasPhone ? 'تواصل على الواتساب' : 'الرقم غير متوفر'}
                </Button>
              </li>
            );
          })}
        </ul>
      )}
    </Page>
  );
}
