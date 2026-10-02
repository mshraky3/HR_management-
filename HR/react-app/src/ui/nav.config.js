/**
 * Navigation per role: ONE place that says which pages each role sees and how they are grouped.
 * The AppShell renders the sidebar from this; route guards in App.jsx use the same `roles` lists.
 *
 * item: { to, label, icon, when?(user) }  `when` hides an item for some users of the role
 *       (e.g. beneficiaries exist only for healthcare branches).
 */

export const ROLE_LABELS = {
  main_manager: 'المدير الرئيسي',
  branch_manager: 'مدير فرع',
  branch_operations_manager: 'مسؤول بيانات الفروع',
};

const MAIN_MANAGER = [
  {
    id: 'overview',
    title: 'نظرة عامة',
    items: [
      { to: '/dashboard', label: 'لوحة التحكم', icon: 'dashboard' },
      { to: '/year-cycle', label: 'متابعة السنة الجديدة', icon: 'list-check' },
    ],
  },
  {
    id: 'employees',
    title: 'الموظفون',
    items: [
      { to: '/employees', label: 'الموظفون', icon: 'users' },
      { to: '/employee-transfer', label: 'نقل وربط الموظفين', icon: 'transfer' },
      { to: '/employee-expiry', label: 'التواريخ المنتهية', icon: 'clock' },
      { to: '/employee-statistics', label: 'إحصائيات الموظفين', icon: 'pie-chart' },
      { to: '/fix-missing-dates', label: 'البيانات غير الدقيقة', icon: 'alert' },
      { to: '/archive', label: 'الأرشيف', icon: 'archive' },
    ],
  },
  {
    id: 'branches',
    title: 'الفروع',
    items: [
      { to: '/branches', label: 'حسابات الفروع', icon: 'building' },
      { to: '/branch-statistics', label: 'إحصائيات الفروع', icon: 'chart' },
      { to: '/branches-monitoring', label: 'مستندات الفروع', icon: 'folder' },
      { to: '/bus-transportation', label: 'الباصات', icon: 'bus' },
      { to: '/beneficiaries', label: 'المستفيدون', icon: 'graduation-cap' },
      { to: '/beneficiaries-archive', label: 'أرشيف المستفيدين', icon: 'archive' },
      { to: '/term-management', label: 'السنة الدراسية والفصول', icon: 'calendar' },
    ],
  },
  {
    id: 'payroll-docs',
    title: 'الرواتب والمستندات',
    items: [
      { to: '/payroll-absence-admin', label: 'مسيرات الرواتب', icon: 'wallet' },
      { to: '/employee-file', label: 'ملف موظف', icon: 'file-text' },
      { to: '/experience-certificate', label: 'شهادات وتعاريف', icon: 'award' },
      { to: '/branch-documents-report', label: 'إحصائيات المستندات', icon: 'clipboard' },
    ],
  },
  {
    id: 'reports',
    title: 'التقارير',
    items: [
      { to: '/reports', label: 'التقارير', icon: 'file' },
      { to: '/employee-statistics-report', label: 'تقرير إحصائيات الموظفين', icon: 'pie-chart' },
      { to: '/bus-transportation-report', label: 'تقرير النقل بالحافلات', icon: 'bus' },
    ],
  },
  {
    id: 'communication',
    title: 'التواصل',
    items: [
      { to: '/manage-requests', label: 'إدارة الطلبات', icon: 'inbox' },
      { to: '/notify-branches', label: 'إشعار الفروع', icon: 'bell' },
      { to: '/suggestions', label: 'الاقتراحات', icon: 'message' },
      { to: '/direct-contact', label: 'التواصل المباشر', icon: 'phone' },
    ],
  },
  {
    id: 'accounts',
    title: 'الحسابات',
    items: [
      { to: '/account-management', label: 'حسابات المسؤولين', icon: 'shield' },
      { to: '/branch-ops-accounts', label: 'حسابات مسؤولي الفروع', icon: 'user-check' },
    ],
  },
];

const BRANCH_MANAGER = [
  {
    id: 'home',
    title: 'الرئيسية',
    items: [
      { to: '/dashboard', label: 'لوحة التحكم', icon: 'dashboard' },
      { to: '/branch-info', label: 'معلومات الفرع', icon: 'building' },
    ],
  },
  {
    id: 'employees',
    title: 'الموظفون',
    items: [
      { to: '/employees', label: 'موظفو الفرع', icon: 'users' },
      { to: '/employee-expiry', label: 'التواريخ المنتهية', icon: 'clock' },
      { to: '/archive', label: 'من غادروا الفرع', icon: 'archive' },
      { to: '/reports', label: 'إصدار التقارير', icon: 'file' },
    ],
  },
  {
    id: 'branch',
    title: 'الفرع',
    items: [
      { to: '/branch-documents', label: 'مستندات الفرع', icon: 'folder' },
      { to: '/bus-transportation', label: 'الباصات', icon: 'bus' },
      {
        to: '/beneficiaries', label: 'المستفيدون', icon: 'graduation-cap',
        when: (user) => user?.branch_type === 'healthcare_center',
      },
    ],
  },
  {
    id: 'communication',
    title: 'التواصل',
    items: [
      { to: '/branch-requests', label: 'طلبات للإدارة', icon: 'inbox' },
      { to: '/suggestions', label: 'الاقتراحات', icon: 'message' },
    ],
  },
];

const OPS_MANAGER = [
  {
    id: 'home',
    title: 'الرئيسية',
    items: [
      { to: '/dashboard', label: 'لوحة التحكم', icon: 'dashboard' },
      { to: '/branch-documents', label: 'مستندات الفروع', icon: 'folder' },
      { to: '/bus-transportation', label: 'الباصات', icon: 'bus' },
    ],
  },
];

const BY_ROLE = {
  main_manager: MAIN_MANAGER,
  branch_manager: BRANCH_MANAGER,
  branch_operations_manager: OPS_MANAGER,
};

/** Groups visible to this user (empty groups are dropped). */
export function navForUser(user) {
  const groups = BY_ROLE[user?.role] || [];
  return groups
    .map((g) => ({ ...g, items: g.items.filter((i) => !i.when || i.when(user)) }))
    .filter((g) => g.items.length > 0);
}

/** Every path a role may open through the UI; used by route guards. */
export function pathsForRole(role) {
  return (BY_ROLE[role] || []).flatMap((g) => g.items.map((i) => i.to));
}

/** Find the nav item (and its group) for a pathname; matches nested paths like /employees/12. */
export function findNavItem(user, pathname) {
  let best = null;
  for (const g of navForUser(user)) {
    for (const item of g.items) {
      const exact = pathname === item.to;
      const nested = pathname.startsWith(`${item.to}/`);
      if ((exact || nested) && (!best || item.to.length > best.item.to.length)) best = { item, group: g };
    }
  }
  return best;
}
