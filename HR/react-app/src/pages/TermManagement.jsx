/**
 * Academic years and terms (head office), per branch type. Create a year with its two terms, adjust the term
 * names and dates, and complete a year (which moves every employee not carried over to "pending").
 */
import { useState, useEffect } from 'react';
import {
  Page, PageHeader, Card, Button, Badge, Modal, FormField, Input, Select, Alert, EmptyState, Skeleton, useConfirm,
} from '../ui';
import { useAuth } from '../contexts/AuthContext';
import { useNotification } from '../contexts/NotificationContext';
import { termsAPI, academicYearsAPI, yearCycleAPI } from '../utils/api';
import { formatDate } from '../utils/dateConverters';
import './TermManagement.css';

const EMPTY_YEAR = {
  branch_type: 'school', year_label: '', term1_name: '', term1_start_date: '', term1_end_date: '',
  term2_name: '', term2_start_date: '', term2_end_date: '',
};

const TYPE_OPTIONS = [{ value: 'school', label: 'مدرسة' }, { value: 'healthcare_center', label: 'مركز رعاية نهارية' }];
const SECTIONS = [
  { type: 'school', title: 'المدارس', empty: 'لا توجد سنوات دراسية للمدارس' },
  { type: 'healthcare_center', title: 'مراكز الرعاية النهارية', empty: 'لا توجد سنوات دراسية لمراكز الرعاية النهارية' },
];

/** Returns an Arabic message for the first problem with the two terms' dates, or '' when they are fine. */
function termDatesProblem(d) {
  if (d.term1_start_date && d.term1_end_date && new Date(d.term1_start_date) > new Date(d.term1_end_date)) return 'تاريخ بداية الفصل الأول يجب أن يكون قبل تاريخ النهاية';
  if (d.term2_start_date && d.term2_end_date && new Date(d.term2_start_date) > new Date(d.term2_end_date)) return 'تاريخ بداية الفصل الثاني يجب أن يكون قبل تاريخ النهاية';
  if (d.term1_end_date && d.term2_start_date && new Date(d.term1_end_date) >= new Date(d.term2_start_date)) return 'يجب أن يبدأ الفصل الثاني بعد انتهاء الفصل الأول';
  return '';
}

const termState = (term) => {
  if (!term) return null;
  const now = new Date();
  if (now >= new Date(term.start_date) && now <= new Date(term.end_date)) return { label: 'جاري الآن', tone: 'success' };
  if (now < new Date(term.start_date)) return { label: 'قادم', tone: 'info' };
  return { label: 'منتهٍ', tone: 'neutral' };
};

function TermDatesFields({ values, onChange, prefix, title }) {
  return (
    <fieldset className="tm-term">
      <legend>{title}</legend>
      <div className="tm-grid">
        <FormField label="الاسم" required>
          <Input value={values[`${prefix}_name`]} onChange={(e) => onChange({ [`${prefix}_name`]: e.target.value })} />
        </FormField>
        <FormField label="تاريخ البداية" required>
          <Input type="date" value={values[`${prefix}_start_date`]} onChange={(e) => onChange({ [`${prefix}_start_date`]: e.target.value })} />
        </FormField>
        <FormField label="تاريخ النهاية" required>
          <Input type="date" value={values[`${prefix}_end_date`]} onChange={(e) => onChange({ [`${prefix}_end_date`]: e.target.value })} />
        </FormField>
      </div>
    </fieldset>
  );
}

function YearCard({ year, onComplete, onEdit }) {
  const now = new Date();
  const isCurrent = year.is_current || (now >= new Date(year.year_start) && now <= new Date(year.year_end));
  const isInactive = !isCurrent && !year.is_completed;

  return (
    <article className={`tm-year${isCurrent ? ' is-current' : ''}`}>
      <header>
        <h3>{year.year_label}</h3>
        <span className="tm-badges">
          {isCurrent && <Badge tone="success" dot>الحالية</Badge>}
          {year.is_completed && <Badge tone="neutral">مكتملة</Badge>}
          {isInactive && <Badge tone="warning">غير نشطة</Badge>}
        </span>
      </header>

      <dl className="tm-dates">
        <div><dt>بداية السنة</dt><dd>{formatDate(year.year_start)}</dd></div>
        <div><dt>نهاية السنة</dt><dd>{formatDate(year.year_end)}</dd></div>
      </dl>

      {[{ n: 'الأول', term: year.term1 }, { n: 'الثاني', term: year.term2 }].filter((t) => t.term).map(({ n, term }) => {
        const state = termState(term);
        return (
          <div key={n} className="tm-term-row">
            <div>
              <strong>الفصل {n}</strong>
              <span className="tm-muted">{term.term_name}</span>
              <span className="tm-muted"><bdi>{formatDate(term.start_date)}</bdi> – <bdi>{formatDate(term.end_date)}</bdi></span>
            </div>
            {state && <Badge tone={state.tone}>{state.label}</Badge>}
          </div>
        );
      })}

      {!year.is_completed && (
        <footer>
          <Button size="sm" variant="secondary" icon="edit" onClick={() => onEdit(year)}>تعديل</Button>
          <Button size="sm" variant="warning" icon="check-circle" onClick={() => onComplete(year.id)}>إتمام السنة</Button>
        </footer>
      )}
    </article>
  );
}

export default function TermManagement() {
  const { isMainManager } = useAuth();
  const { showError, showSuccess, showWarning } = useNotification();
  const { confirm, prompt } = useConfirm();

  const [years, setYears] = useState({ school: [], healthcare_center: [] });
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_YEAR);
  const [submitting, setSubmitting] = useState(false);
  const [editing, setEditing] = useState(null); // { year, values }
  const [saving, setSaving] = useState(false);
  const [editError, setEditError] = useState('');

  const loadYears = async () => {
    try {
      setLoading(true);
      const response = await academicYearsAPI.getAll();
      if (response.data.success) {
        const grouped = { school: [], healthcare_center: [] };
        (response.data.data || []).forEach((y) => { if (grouped[y.branch_type]) grouped[y.branch_type].push(y); });
        Object.values(grouped).forEach((list) => list.sort((a, b) => new Date(b.year_start) - new Date(a.year_start)));
        setYears(grouped);
      }
    } catch (error) {
      console.error('Error loading academic years:', error);
      showError('فشل تحميل السنوات الدراسية');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isMainManager()) loadYears();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMainManager]);

  // The term names follow the year label until the user types their own
  const changeForm = (patch) => setForm((prev) => {
    const next = { ...prev, ...patch };
    if (patch.year_label !== undefined && patch.year_label.trim()) {
      const label = patch.year_label.trim();
      const prevLabel = prev.year_label.trim();
      if (!prev.term1_name || prev.term1_name === `الفصل الأول - ${prevLabel}`) next.term1_name = `الفصل الأول - ${label}`;
      if (!prev.term2_name || prev.term2_name === `الفصل الثاني - ${prevLabel}`) next.term2_name = `الفصل الثاني - ${label}`;
    }
    return next;
  });

  const closeCreate = () => { if (!submitting) { setCreateOpen(false); setForm(EMPTY_YEAR); } };

  const submitCreate = async (e) => {
    e.preventDefault();
    if (!form.year_label.trim()) { showWarning('يرجى إدخال تسمية السنة الدراسية'); return; }
    if (!form.term1_name.trim() || !form.term1_start_date || !form.term1_end_date) { showWarning('يرجى إدخال بيانات الفصل الأول'); return; }
    if (!form.term2_name.trim() || !form.term2_start_date || !form.term2_end_date) { showWarning('يرجى إدخال بيانات الفصل الثاني'); return; }
    const problem = termDatesProblem(form);
    if (problem) { showWarning(problem); return; }
    try {
      setSubmitting(true);
      const response = await termsAPI.createAcademicYear({
        branch_type: form.branch_type,
        year_label: form.year_label.trim(),
        term1_name: form.term1_name.trim(), term1_start_date: form.term1_start_date, term1_end_date: form.term1_end_date,
        term2_name: form.term2_name.trim(), term2_start_date: form.term2_start_date, term2_end_date: form.term2_end_date,
      });
      if (response.data.success) {
        showSuccess('تم إنشاء السنة الدراسية والفصلين بنجاح');
        setCreateOpen(false);
        setForm(EMPTY_YEAR);
        loadYears();
      }
    } catch (error) {
      console.error('Error creating academic year:', error);
      showError(error.response?.data?.message || 'فشل إنشاء السنة الدراسية');
    } finally {
      setSubmitting(false);
    }
  };

  const openEdit = (year) => {
    const day = (value) => (value ? value.slice(0, 10) : '');
    setEditError('');
    setEditing({
      year,
      values: {
        term1_name: year.term1?.term_name || '', term1_start_date: day(year.term1?.start_date), term1_end_date: day(year.term1?.end_date),
        term2_name: year.term2?.term_name || '', term2_start_date: day(year.term2?.start_date), term2_end_date: day(year.term2?.end_date),
      },
    });
  };

  const saveEdit = async () => {
    const { year, values } = editing;
    const problem = termDatesProblem(values);
    if (problem) { setEditError(problem); return; }
    try {
      setSaving(true);
      if (year.term1) await termsAPI.update(year.term1.id, { term_name: values.term1_name.trim(), start_date: values.term1_start_date, end_date: values.term1_end_date });
      if (year.term2) await termsAPI.update(year.term2.id, { term_name: values.term2_name.trim(), start_date: values.term2_start_date, end_date: values.term2_end_date });
      setEditing(null);
      showSuccess('تم حفظ التعديلات بنجاح');
      loadYears();
    } catch (error) {
      console.error('Error saving term edits:', error);
      showError(error.response?.data?.message || 'فشل حفظ التعديلات');
    } finally {
      setSaving(false);
    }
  };

  const completeYear = async (yearId) => {
    // Ending a year moves every employee not carried into the new year to "pending" and archives the closing
    // year's beneficiaries, for ALL branches of the type. Show exactly what will change first.
    const year = [...years.school, ...years.healthcare_center].find((y) => y.id === yearId);
    let preview = null;
    try {
      if (year?.branch_type) preview = (await yearCycleAPI.getEndYearPreview(year.branch_type)).data.data;
    } catch (error) {
      console.error('Error loading end-year preview:', error);
    }

    const t = preview?.totals;
    const unconfirmed = preview ? preview.branches.filter((b) => !b.confirmed) : [];
    const lines = t ? [
      `${t.employees_to_pending} موظف نشط سيتحول إلى «قيد التجديد» لأنه لم يُنقل إلى السنة الجديدة.`,
      t.beneficiaries_to_archive > 0 ? `${t.beneficiaries_to_archive} مستفيد من فصول السنة المنتهية سيُؤرشف.` : null,
      unconfirmed.length > 0
        ? `${unconfirmed.length} من ${t.branches} فرع لم يعتمد مراجعة موظفي السنة الجديدة بعد: ${unconfirmed.slice(0, 8).map((b) => b.branch_name).join('، ')}${unconfirmed.length > 8 ? '…' : ''}.`
        : 'كل الفروع اعتمدت مراجعة الموظفين.',
      'لا يمكن التراجع عن هذا الإجراء بسهولة.',
    ].filter(Boolean) : ['تعذّر حساب أثر الإجراء. سيتم تحويل الموظفين غير المنقولين إلى «قيد التجديد».'];

    const message = lines.join('\n\n');
    if (unconfirmed.length > 0 || !preview) {
      // Risky: make head office type the word, not just click.
      const typed = await prompt({
        title: 'إتمام السنة الدراسية', message, label: 'اكتب كلمة «إتمام» للتأكيد', multiline: false, required: true,
        tone: 'danger', confirmText: 'إتمام السنة', requiredMessage: 'اكتب كلمة إتمام للمتابعة',
      });
      if (typed !== 'إتمام') {
        if (typed !== null) showError('لم تُكتب كلمة التأكيد بشكل صحيح');
        return;
      }
    } else if (!await confirm({ title: 'إتمام السنة الدراسية', message, tone: 'danger', confirmText: 'إتمام السنة' })) {
      return;
    }

    try {
      const response = await academicYearsAPI.completeYear(yearId);
      if (response.data.success) {
        showSuccess('تم إتمام السنة الدراسية بنجاح');
        loadYears();
      }
    } catch (error) {
      console.error('Error completing year:', error);
      showError(error.response?.data?.message || 'فشل إتمام السنة الدراسية');
    }
  };

  if (!isMainManager()) {
    return <Page><PageHeader title="غير مصرح" /><Card><EmptyState icon="shield" title="هذه الصفحة متاحة فقط للمدير الرئيسي" /></Card></Page>;
  }

  return (
    <Page>
      <PageHeader
        title="السنة الدراسية والفصول"
        subtitle="إدارة تقسيم السنة الدراسية لكل نوع من الفروع"
        actions={<Button variant="primary" icon="plus" onClick={() => setCreateOpen(true)}>إضافة سنة دراسية جديدة</Button>}
      />

      {SECTIONS.map(({ type, title, empty }) => (
        <Card key={type} title={title} subtitle={loading ? undefined : `${years[type].length} سنة`}>
          {loading ? (
            <Skeleton lines={3} height={16} />
          ) : years[type].length === 0 ? (
            <EmptyState compact icon="calendar" title={empty} />
          ) : (
            <div className="tm-years">
              {years[type].map((year) => <YearCard key={year.id} year={year} onComplete={completeYear} onEdit={openEdit} />)}
            </div>
          )}
        </Card>
      ))}

      <Modal
        open={createOpen}
        onClose={closeCreate}
        title="إضافة سنة دراسية جديدة"
        size="lg"
        footer={(
          <>
            <Button variant="secondary" onClick={closeCreate} disabled={submitting}>إلغاء</Button>
            <Button variant="primary" type="submit" form="tm-create" loading={submitting}>حفظ</Button>
          </>
        )}
      >
        <form id="tm-create" onSubmit={submitCreate} className="ui-form-stack" noValidate>
          <div className="tm-grid">
            <FormField label="نوع الفرع" required>
              <Select value={form.branch_type} onChange={(e) => changeForm({ branch_type: e.target.value })} options={TYPE_OPTIONS} />
            </FormField>
            <FormField label="تسمية السنة الدراسية" required hint="الصيغة: سنة البداية/سنة النهاية">
              <Input value={form.year_label} onChange={(e) => changeForm({ year_label: e.target.value })} placeholder="مثال: 2025/2026" dir="ltr" />
            </FormField>
          </div>
          <Alert tone="info">يُملأ اسم كل فصل تلقائياً من تسمية السنة، ويمكنك تعديله. تبدأ السنة بتاريخ بداية الفصل الأول وتنتهي بتاريخ نهاية الفصل الثاني، وبها يُحدَّد موعد تغيير حالة الموظفين عند إتمام السنة.</Alert>
          <TermDatesFields values={form} onChange={changeForm} prefix="term1" title="الفصل الدراسي الأول" />
          <TermDatesFields values={form} onChange={changeForm} prefix="term2" title="الفصل الدراسي الثاني" />
        </form>
      </Modal>

      <Modal
        open={Boolean(editing)}
        onClose={() => !saving && setEditing(null)}
        title={editing ? `تعديل فصول ${editing.year.year_label}` : ''}
        size="lg"
        footer={(
          <>
            <Button variant="secondary" onClick={() => setEditing(null)} disabled={saving}>إلغاء</Button>
            <Button variant="primary" loading={saving} onClick={saveEdit}>حفظ التعديلات</Button>
          </>
        )}
      >
        {editing && (
          <div className="ui-form-stack">
            {editing.year.term1 && <TermDatesFields values={editing.values} onChange={(patch) => { setEditError(''); setEditing((prev) => ({ ...prev, values: { ...prev.values, ...patch } })); }} prefix="term1" title="الفصل الأول" />}
            {editing.year.term2 && <TermDatesFields values={editing.values} onChange={(patch) => { setEditError(''); setEditing((prev) => ({ ...prev, values: { ...prev.values, ...patch } })); }} prefix="term2" title="الفصل الثاني" />}
            {editError && <Alert tone="danger">{editError}</Alert>}
          </div>
        )}
      </Modal>
    </Page>
  );
}
