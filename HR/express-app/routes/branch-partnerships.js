/**
 * /api/branch-partnerships: the partners ("الشراكات") of a healthcare centre, government or private.
 * See routes/branch-records.js for the rules.
 */
import sql from '../config/database.js';
import { createBranchRecordRouter } from './branch-records.js';

export const PARTNER_TYPES = ['government', 'private'];

export default createBranchRecordRouter({
  kind: 'partnerships',
  table: 'branch_partnerships',
  entityType: 'branch_partnership',
  auditLabelField: 'partner_name',
  textFields: [
    { name: 'partner_name', max: 255, required: true, label: 'اسم الجهة' },
    { name: 'service_type', max: 150, label: 'نوع الخدمة' },
    { name: 'description', max: 5000, label: 'الوصف' },
    { name: 'contact_name', max: 255, label: 'اسم المسؤول' },
    { name: 'contact_phone', max: 50, label: 'رقم التواصل' },
  ],
  enumFields: [{ name: 'partner_type', values: PARTNER_TYPES, required: true, label: 'نوع الشراكة' }],
  dateFields: ['contract_start_date', 'contract_end_date'],
  searchFields: ['partner_name', 'service_type', 'description', 'contact_name', 'contact_phone'],
  orderBy: sql`r.created_at DESC`,
  extraFilters: (req) => (PARTNER_TYPES.includes(req.query.partner_type)
    ? [{ column: 'partner_type', value: req.query.partner_type }]
    : []),
  crossCheck: (row) => (row.contract_start_date && row.contract_end_date && row.contract_end_date < row.contract_start_date
    ? 'تاريخ نهاية العقد قبل تاريخ بدايته'
    : null),
});
