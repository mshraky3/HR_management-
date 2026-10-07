/** Request statuses: label and badge tone, shared by the branch and head-office pages. */

export const REQUEST_STATUS = {
  pending: { label: 'قيد الانتظار', tone: 'warning' },
  approved: { label: 'موافق عليه', tone: 'success' },
  rejected: { label: 'مرفوض', tone: 'danger' },
  in_progress: { label: 'قيد المعالجة', tone: 'info' },
  completed: { label: 'مكتمل', tone: 'neutral' },
};

export const statusMeta = (status) => REQUEST_STATUS[status] || { label: status, tone: 'neutral' };
