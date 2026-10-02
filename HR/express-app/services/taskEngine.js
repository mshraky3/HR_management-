/**
 * Task engine: works out, on the server and in one request, what a branch still has to do.
 *
 * Replaces the browser-side taskPrioritizer, which needed ~14 API calls and re-implemented the rules
 * (and had bugs: the "complete employee data" task was hidden all year, healthcare branches with no
 * history got no registration task, the same bus was listed up to five times).
 *
 * Task shape:
 *   { id, section, severity: 'critical'|'important'|'normal', title, description,
 *     total, remaining, done, due_at, link, link_label, inline?: { type, items }, meta? }
 *
 * System tasks are derived from the data (nothing stored); tasks the head office assigns live in branch_tasks.
 */

import sql from '../config/database.js';
import { log } from '../utils/logger.js';
import { getRequiredBranchDocuments } from '../utils/dataCompletionUtils.js';
import { getTransitionStatus } from './employeeTransitionService.js';
import { getRolloverStatus } from './beneficiaryRolloverService.js';
import { getCurrentTermWithState } from './termLifecycleService.js';

export const SECTIONS = [
  { id: 'head_office', title: 'من الإدارة' },
  { id: 'new_year', title: 'السنة الجديدة' },
  { id: 'payroll', title: 'مسيرات الرواتب' },
  { id: 'data', title: 'بيانات الفرع والموظفين' },
  { id: 'expiry', title: 'التواريخ المنتهية' },
  { id: 'documents', title: 'مستندات الفرع' },
  { id: 'transport', title: 'الباصات' },
  { id: 'beneficiaries', title: 'المستفيدون' },
];

const SEVERITY_RANK = { critical: 0, important: 1, normal: 2 };

const isoDate = (value) => {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

const todayIso = () => isoDate(new Date());
const fullName = (e) => [e.first_name, e.second_name, e.third_name, e.fourth_name].filter(Boolean).join(' ');

// --- builders: each returns an array of tasks ---------------------------------------------------------------

async function yearReviewTasks(branch) {
  const status = await getTransitionStatus(branch.id);
  if (!status.is_active) return [];
  const c = status.counts;
  const confirmed = Boolean(status.confirmation);
  if (c.total_source === 0 && !confirmed) return []; // nothing to review (e.g. a brand-new branch)

  const open = c.undecided + c.pending_review;
  const done = confirmed && open === 0;
  let description;
  if (open > 0) {
    const parts = [];
    if (c.undecided > 0) parts.push(`${c.undecided} موظف بلا قرار (مستمر أم غادر)`);
    if (c.pending_review > 0) parts.push(`${c.pending_review} موظف لم تُراجع بياناته`);
    description = parts.join('، ');
  } else if (!confirmed) {
    description = 'اكتملت القرارات والمراجعة. اضغط "اعتماد المراجعة" لإنهاء هذه المهمة.';
  } else {
    description = 'تم اعتماد مراجعة موظفي السنة الجديدة.';
  }

  return [{
    id: 'year-review',
    section: 'new_year',
    severity: done ? 'normal' : 'critical',
    title: `مراجعة موظفي السنة الجديدة (${status.target_year.year_label})`,
    description,
    total: c.total_source,
    remaining: done ? 0 : Math.max(open, confirmed ? 0 : 1),
    done,
    due_at: isoDate(status.target_year.review_deadline),
    link: '/employees?tab=year-review',
    link_label: done ? 'عرض المراجعة' : 'ابدأ المراجعة',
  }];
}

async function beneficiaryTasks(branch) {
  if (branch.branch_type !== 'healthcare_center') return [];
  const status = await getRolloverStatus(branch.id, { readOnly: true });
  if (!status.is_active) return [];
  const c = status.counts;

  // A healthcare branch with no beneficiaries at all still has something to do: register them.
  if (c.total_source === 0 && c.target_total === 0) {
    return [{
      id: 'beneficiary-registration',
      section: 'beneficiaries',
      severity: 'important',
      title: 'تسجيل المستفيدين للفصل الحالي',
      description: 'لا يوجد مستفيدون مسجلون في الفصل الدراسي الحالي.',
      total: 1,
      remaining: 1,
      done: false,
      link: '/beneficiaries',
      link_label: 'تسجيل المستفيدين',
    }];
  }

  const confirmed = Boolean(status.confirmation);
  const open = c.undecided + c.pending_review;
  const done = confirmed && open === 0;
  const description = open > 0
    ? [c.undecided > 0 && `${c.undecided} مستفيد بلا قرار`, c.pending_review > 0 && `${c.pending_review} مستفيد لم تُراجع بياناته`].filter(Boolean).join('، ')
    : confirmed ? 'تم اعتماد مراجعة المستفيدين.' : 'اكتملت القرارات. اعتمد المراجعة لإنهاء هذه المهمة.';

  return [{
    id: 'beneficiary-review',
    section: 'beneficiaries',
    severity: done ? 'normal' : 'critical',
    title: 'مراجعة المستفيدين للفصل الجديد',
    description,
    total: c.total_source || c.target_total,
    remaining: done ? 0 : Math.max(open, confirmed ? 0 : 1),
    done,
    link: '/beneficiaries',
    link_label: done ? 'عرض المراجعة' : 'ابدأ المراجعة',
  }];
}

async function schoolBusCarryOverTasks(branch) {
  if (branch.branch_type !== 'school') return [];
  const { term } = await getCurrentTermWithState(branch.branch_type);
  if (!term) return [];
  const [current] = await sql`SELECT COUNT(*)::int AS n FROM bus_transportation WHERE branch_id = ${branch.id} AND term_id = ${term.id}`;
  if (current.n > 0) return [];
  const [previous] = await sql`
    SELECT bt.term_id, COUNT(*)::int AS n
    FROM bus_transportation bt JOIN terms t ON t.id = bt.term_id
    WHERE bt.branch_id = ${branch.id} AND t.branch_type = ${branch.branch_type} AND t.end_date < ${term.start_date}
    GROUP BY bt.term_id, t.end_date
    ORDER BY t.end_date DESC
    LIMIT 1
  `;
  if (!previous) return [];
  return [{
    id: 'buses-carry-over',
    section: 'transport',
    severity: 'important',
    title: 'ترحيل الباصات إلى الفصل الجديد',
    description: `لا توجد باصات في الفصل الحالي، وكان لديك ${previous.n} باص في الفصل السابق. رحّلها بدل إدخالها من جديد.`,
    total: previous.n,
    remaining: previous.n,
    done: false,
    link: '/bus-transportation',
    link_label: 'ترحيل الباصات',
  }];
}

async function employeeDataTasks(branch) {
  const [counts] = await sql`
    SELECT COUNT(*)::int AS total,
           COUNT(*) FILTER (WHERE data_completion_status IS DISTINCT FROM 'complete')::int AS incomplete
    FROM employees
    WHERE branch_id = ${branch.id} AND (status IN ('active', 'pending') OR status IS NULL)
  `;
  const tasks = [];

  if (counts.total === 0) {
    tasks.push({
      id: 'employees-none',
      section: 'data',
      severity: 'important',
      title: 'إضافة موظفي الفرع',
      description: 'لم تُسجَّل بيانات موظفين لهذا الفرع بعد.',
      total: 1,
      remaining: 1,
      done: false,
      link: '/employees',
      link_label: 'إضافة موظف',
    });
    return tasks;
  }

  if (counts.incomplete > 0) {
    tasks.push({
      id: 'employees-incomplete',
      section: 'data',
      severity: 'important',
      title: 'إكمال بيانات الموظفين',
      description: `${counts.incomplete} من ${counts.total} موظف بياناتهم أو مستنداتهم غير مكتملة.`,
      total: counts.total,
      remaining: counts.incomplete,
      done: false,
      link: '/employees?data_completion_status=incomplete',
      link_label: 'إكمال البيانات',
    });
  }

  const [salaryRows, ibanRows] = await Promise.all([
    sql`
      SELECT id, first_name, second_name, third_name, fourth_name, total_salary
      FROM employees
      WHERE branch_id = ${branch.id} AND status = 'active'
        AND (COALESCE(total_salary, 0) < 500 OR COALESCE(total_salary, 0) >= 13000)
      ORDER BY total_salary NULLS FIRST
      LIMIT 100
    `,
    sql`
      SELECT id, first_name, second_name, third_name, fourth_name, bank_iban
      FROM employees
      WHERE branch_id = ${branch.id} AND status = 'active'
        AND (bank_iban IS NULL OR UPPER(REPLACE(bank_iban, ' ', '')) !~ '^SA[0-9]{22}$')
      ORDER BY id
      LIMIT 100
    `,
  ]);

  if (salaryRows.length > 0) {
    const items = salaryRows.map((e) => ({
      id: e.id,
      name: fullName(e),
      total_salary: Number(e.total_salary || 0),
      issue: Number(e.total_salary || 0) < 500 ? 'low' : 'high',
    }));
    tasks.push({
      id: 'salary-review',
      section: 'data',
      severity: 'normal',
      title: 'مراجعة رواتب الموظفين',
      description: `${items.filter((i) => i.issue === 'low').length} براتب منخفض (أقل من 500) و${items.filter((i) => i.issue === 'high').length} براتب مرتفع (13000 فأكثر).`,
      total: counts.total,
      remaining: items.length,
      done: false,
      inline: { type: 'salary_review', items },
    });
  }

  if (ibanRows.length > 0) {
    const items = ibanRows.map((e) => ({
      id: e.id,
      name: fullName(e),
      iban: e.bank_iban || '',
      issue: e.bank_iban ? 'invalid' : 'missing',
    }));
    tasks.push({
      id: 'iban-review',
      section: 'data',
      severity: 'normal',
      title: 'مراجعة أرقام الآيبان',
      description: `${items.filter((i) => i.issue === 'missing').length} بدون آيبان و${items.filter((i) => i.issue === 'invalid').length} بآيبان غير صحيح.`,
      total: counts.total,
      remaining: items.length,
      done: false,
      inline: { type: 'iban_review', items },
    });
  }
  return tasks;
}

function branchInfoTasks(branch) {
  const missing = [];
  if (!branch.phone_number) missing.push('رقم الجوال');
  if (!branch.email) missing.push('البريد الإلكتروني (يصله رمز الدخول)');
  if (missing.length === 0) return [];
  return [{
    id: 'branch-info',
    section: 'data',
    severity: branch.email ? 'normal' : 'important',
    title: 'إكمال معلومات الفرع',
    description: `ينقص: ${missing.join('، ')}.`,
    total: 2,
    remaining: missing.length,
    done: false,
    link: '/branch-info',
    link_label: 'تعديل معلومات الفرع',
  }];
}

async function employeeExpiryTasks(branch) {
  const [row] = await sql`
    WITH dates AS (
      SELECT e.id_expiry_date_gregorian::date AS d FROM employees e
      WHERE e.branch_id = ${branch.id} AND (e.status IN ('active','pending') OR e.status IS NULL) AND e.id_expiry_date_gregorian IS NOT NULL
      UNION ALL
      SELECT e.contract_end_date_gregorian::date FROM employees e
      WHERE e.branch_id = ${branch.id} AND (e.status IN ('active','pending') OR e.status IS NULL) AND e.contract_end_date_gregorian IS NOT NULL
      UNION ALL
      SELECT ed.expiry_date::date FROM employee_documents ed JOIN employees e ON e.id = ed.employee_id
      WHERE e.branch_id = ${branch.id} AND (e.status IN ('active','pending') OR e.status IS NULL) AND ed.is_active = true AND ed.expiry_date IS NOT NULL
    )
    SELECT COUNT(*) FILTER (WHERE d < CURRENT_DATE)::int AS expired,
           COUNT(*) FILTER (WHERE d >= CURRENT_DATE AND d <= CURRENT_DATE + 30)::int AS soon
    FROM dates
  `;
  if (row.expired + row.soon === 0) return [];
  return [{
    id: 'employee-expiry',
    section: 'expiry',
    severity: row.expired > 0 ? 'critical' : 'important',
    title: 'تواريخ الموظفين المنتهية أو القريبة',
    description: [row.expired > 0 && `${row.expired} منتهٍ بالفعل`, row.soon > 0 && `${row.soon} ينتهي خلال 30 يوماً`].filter(Boolean).join('، ') + ' (الهوية والعقد والمستندات).',
    total: row.expired + row.soon,
    remaining: row.expired + row.soon,
    done: false,
    link: '/employee-expiry',
    link_label: 'تحديث التواريخ',
  }];
}

async function branchDocumentTasks(branch) {
  const required = getRequiredBranchDocuments(branch.branch_type);
  const docs = await sql`
    SELECT document_type, expiry_date FROM branch_documents WHERE branch_id = ${branch.id} AND is_active = true
  `;
  const present = new Set(docs.map((d) => d.document_type));
  const missing = required.filter((t) => !present.has(t));
  const today = todayIso();
  const soonLimit = isoDate(new Date(Date.now() + 30 * 86400000));
  const expired = docs.filter((d) => d.expiry_date && isoDate(d.expiry_date) < today);
  const soon = docs.filter((d) => d.expiry_date && isoDate(d.expiry_date) >= today && isoDate(d.expiry_date) <= soonLimit);

  const tasks = [];
  if (missing.length > 0) {
    tasks.push({
      id: 'branch-docs-missing',
      section: 'documents',
      severity: 'important',
      title: 'رفع مستندات الفرع المطلوبة',
      description: `ينقص ${missing.length} من ${required.length} مستند مطلوب.`,
      total: required.length,
      remaining: missing.length,
      done: false,
      link: '/branch-documents',
      link_label: 'رفع المستندات',
      meta: { missing_types: missing },
    });
  }
  if (expired.length + soon.length > 0) {
    tasks.push({
      id: 'branch-docs-expiring',
      section: 'documents',
      severity: expired.length > 0 ? 'critical' : 'important',
      title: 'مستندات الفرع المنتهية أو القريبة من الانتهاء',
      description: [expired.length > 0 && `${expired.length} منتهٍ`, soon.length > 0 && `${soon.length} ينتهي خلال 30 يوماً`].filter(Boolean).join('، ') + '.',
      total: expired.length + soon.length,
      remaining: expired.length + soon.length,
      done: false,
      link: '/branch-documents',
      link_label: 'تجديد المستندات',
    });
  }
  return tasks;
}

async function busTasks(branch) {
  const { term } = await getCurrentTermWithState(branch.branch_type);
  if (!term) return [];
  const rows = await sql`
    SELECT bt.id,
           (SELECT MIN(expiry_date_gregorian) FROM bus_registration_data WHERE bus_id = bt.id) AS reg_exp,
           (SELECT MIN(expiry_date_gregorian) FROM driver_license_data WHERE bus_id = bt.id) AS license_exp,
           (SELECT MIN(insurance_expiry_date_gregorian) FROM bus_details WHERE bus_id = bt.id) AS insurance_exp,
           NOT EXISTS (SELECT 1 FROM bus_registration_data WHERE bus_id = bt.id) AS no_registration,
           NOT EXISTS (SELECT 1 FROM driver_license_data WHERE bus_id = bt.id) AS no_driver
    FROM bus_transportation bt
    WHERE bt.branch_id = ${branch.id} AND bt.term_id = ${term.id}
  `;
  if (rows.length === 0) return [];

  const today = todayIso();
  const soonLimit = isoDate(new Date(Date.now() + 30 * 86400000));
  let expired = 0;
  let soon = 0;
  for (const r of rows) {
    for (const d of [r.reg_exp, r.license_exp, r.insurance_exp]) {
      const day = isoDate(d);
      if (!day) continue;
      if (day < today) expired += 1; else if (day <= soonLimit) soon += 1;
    }
  }
  const incomplete = rows.filter((r) => r.no_registration || r.no_driver).length;

  const tasks = [];
  if (expired + soon > 0) {
    tasks.push({
      id: 'bus-expiry',
      section: 'transport',
      severity: expired > 0 ? 'critical' : 'important',
      title: 'تواريخ الباصات المنتهية أو القريبة',
      description: [expired > 0 && `${expired} منتهٍ`, soon > 0 && `${soon} ينتهي خلال 30 يوماً`].filter(Boolean).join('، ') + ' (الاستمارة، رخصة السائق، التأمين).',
      total: rows.length,
      remaining: expired + soon,
      done: false,
      link: '/bus-transportation',
      link_label: 'تحديث بيانات الباصات',
    });
  }
  if (incomplete > 0) {
    tasks.push({
      id: 'bus-data',
      section: 'transport',
      severity: 'normal',
      title: 'إكمال بيانات الباصات',
      description: `${incomplete} من ${rows.length} باص بدون بيانات الاستمارة أو السائق.`,
      total: rows.length,
      remaining: incomplete,
      done: false,
      link: '/bus-transportation',
      link_label: 'إكمال البيانات',
    });
  }
  return tasks;
}

async function payrollTasks(branch) {
  const [win] = await sql`
    SELECT w.id, w.status, w.submission_count, w.manual_expires_at, c.month_start, c.month_end
    FROM branch_absence_windows w JOIN absence_cycles c ON c.id = w.cycle_id
    WHERE w.branch_id = ${branch.id} AND w.status = 'entry_open'
    ORDER BY c.month_start DESC
    LIMIT 1
  `;
  if (!win) return [];
  const submitted = win.submission_count > 0;
  // Entry stays open 4 days after the month ends (head office can extend manually)
  const closes = win.manual_expires_at
    ? isoDate(win.manual_expires_at)
    : isoDate(new Date(new Date(win.month_end).getTime() + 4 * 86400000));
  return [{
    id: 'payroll-absence',
    section: 'payroll',
    severity: submitted ? 'normal' : 'critical',
    title: 'إدخال غياب الموظفين لمسير الرواتب',
    description: submitted
      ? 'تم إرسال الغياب لهذا الشهر. يمكنك إعادة الإرسال إن احتجت للتعديل قبل إغلاق النافذة.'
      : `نافذة إدخال غياب شهر ${isoDate(win.month_start).slice(0, 7)} مفتوحة الآن.`,
    total: 1,
    remaining: submitted ? 0 : 1,
    done: submitted,
    due_at: closes,
    inline: { type: 'payroll_absence' },
    link: '/dashboard',
    link_label: 'إدخال الغياب',
  }];
}

async function headOfficeTasks(branch) {
  const [notifications, manual] = await Promise.all([
    sql`
      SELECT n.id, n.message, n.importance_level, n.expires_at
      FROM notifications n
      JOIN notification_branches nb ON nb.notification_id = n.id AND nb.branch_id = ${branch.id}
      LEFT JOIN notification_responses r ON r.notification_id = n.id AND r.branch_id = ${branch.id}
      WHERE n.is_active = true AND (n.expires_at IS NULL OR n.expires_at > NOW()) AND r.id IS NULL
      ORDER BY n.importance_level DESC, n.created_at DESC
      LIMIT 20
    `,
    sql`
      SELECT id, title, description, due_date, deep_link
      FROM branch_tasks WHERE branch_id = ${branch.id} AND status = 'open'
      ORDER BY due_date NULLS LAST, created_at
    `,
  ]);

  const tasks = manual.map((t) => ({
    id: `manual-${t.id}`,
    section: 'head_office',
    severity: 'important',
    title: t.title,
    description: t.description || 'مهمة من الإدارة الرئيسية.',
    total: 1,
    remaining: 1,
    done: false,
    due_at: isoDate(t.due_date),
    link: t.deep_link || null,
    link_label: t.deep_link ? 'فتح' : null,
    manual_task_id: t.id,
  }));

  if (notifications.length > 0) {
    tasks.push({
      id: 'notifications-unanswered',
      section: 'head_office',
      severity: notifications.some((n) => n.importance_level >= 3) ? 'critical' : 'important',
      title: 'إشعارات من الإدارة بانتظار ردك',
      description: `${notifications.length} إشعار لم تُسجّل ردك عليه (تم الاطلاع / جارٍ العمل / تم).`,
      total: notifications.length,
      remaining: notifications.length,
      done: false,
      inline: { type: 'notifications', items: notifications.map((n) => ({ id: n.id, message: n.message, importance: n.importance_level, expires_at: n.expires_at })) },
    });
  }
  return tasks;
}

// --- assembly ----------------------------------------------------------------------------------------------

const BUILDERS = [
  ['head_office', headOfficeTasks],
  ['year_review', yearReviewTasks],
  ['beneficiaries', beneficiaryTasks],
  ['bus_carry_over', schoolBusCarryOverTasks],
  ['payroll', payrollTasks],
  ['employee_data', employeeDataTasks],
  ['branch_info', async (b) => branchInfoTasks(b)],
  ['employee_expiry', employeeExpiryTasks],
  ['branch_documents', branchDocumentTasks],
  ['buses', busTasks],
];

/** All tasks for one branch, grouped into sections and sorted by urgency. Never throws for one failing source. */
export async function buildBranchTasks(branchId) {
  const [branch] = await sql`
    SELECT id, branch_name, branch_type, phone_number, email FROM branches WHERE id = ${branchId}
  `;
  if (!branch) return null;

  const failed = [];
  const results = await Promise.all(BUILDERS.map(async ([name, build]) => {
    try {
      return await build(branch);
    } catch (error) {
      failed.push(name);
      log.error('Task builder failed', { builder: name, branchId, error: error.message });
      return [];
    }
  }));
  const tasks = results.flat();

  const today = todayIso();
  const decorated = tasks.map((t) => ({ ...t, overdue: Boolean(t.due_at && !t.done && t.due_at < today) }));
  const rank = (t) => [t.done ? 1 : 0, t.overdue ? 0 : 1, SEVERITY_RANK[t.severity] ?? 2];
  decorated.sort((a, b) => {
    const ra = rank(a); const rb = rank(b);
    for (let i = 0; i < ra.length; i++) if (ra[i] !== rb[i]) return ra[i] - rb[i];
    return (a.due_at || '9999') < (b.due_at || '9999') ? -1 : 1;
  });

  const sections = SECTIONS
    .map((s) => {
      const list = decorated.filter((t) => t.section === s.id);
      return { ...s, tasks: list, open: list.filter((t) => !t.done).length, total: list.length };
    })
    .filter((s) => s.tasks.length > 0);

  const open = decorated.filter((t) => !t.done);
  return {
    generated_at: new Date().toISOString(),
    branch,
    sections,
    summary: {
      total: decorated.length,
      open: open.length,
      done: decorated.length - open.length,
      critical: open.filter((t) => t.severity === 'critical').length,
      overdue: open.filter((t) => t.overdue).length,
    },
    degraded: failed,
  };
}
