/**
 * /api/branch-achievements: thank-you certificates and accomplishments of a healthcare centre.
 * See routes/branch-records.js for the rules.
 */
import sql from '../config/database.js';
import { createBranchRecordRouter } from './branch-records.js';

export default createBranchRecordRouter({
  kind: 'achievements',
  table: 'branch_achievements',
  entityType: 'branch_achievement',
  auditLabelField: 'title',
  textFields: [
    { name: 'title', max: 255, required: true, label: 'اسم الشهادة أو الإنجاز' },
    { name: 'description', max: 5000, label: 'الوصف' },
    { name: 'issuer', max: 255, label: 'الجهة المانحة' },
  ],
  enumFields: [],
  dateFields: ['achievement_date'],
  searchFields: ['title', 'description', 'issuer'],
  orderBy: sql`r.achievement_date DESC NULLS LAST, r.created_at DESC`,
  extraFilters: () => [],
});
