/**
 * Beneficiaries Routes
 * CRUD operations for beneficiary management (healthcare center branches)
 * Both branch managers and main managers can access with appropriate permissions
 */

import express from 'express';
import { authenticate } from '../middleware/auth.js';
import { requireMainManager, requireManager, checkBranchAccess } from '../middleware/authorization.js';
import Beneficiary from '../models/Beneficiary.js';
import { BusTransportation } from '../models/BusTransportation.js';
import { BusStudent } from '../models/BusStudent.js';
import sql from '../config/database.js';
import { log } from '../utils/logger.js';
import { getScopedBranchFilter, getScopedTermFilter, resolveBranchAccessFromScope } from '../utils/policyScope.js';
import { handleRouteError } from '../utils/routeErrorHandler.js';

const router = express.Router();

// All routes require authentication
router.use(authenticate);

/**
 * GET /api/beneficiaries
 * List beneficiaries - branch managers see their own, main manager sees all
 */
router.get('/', requireManager, async (req, res) => {
    try {
        const { branch_id, term_id, gender, enrollment_period, page, limit } = req.query;

        const filters = {
            is_archived: false,
            gender,
            enrollment_period,
            page,
            limit
        };

        // Branch managers can only see their branch data
        if (req.user.role === 'branch_manager') {
            filters.branch_id = req.user.branch_id;
        } else if (branch_id) {
            filters.branch_id = branch_id;
        }

        if (term_id) {
            filters.term_id = term_id;
        }

        const result = await Beneficiary.findAll(filters);
        res.json({ success: true, ...result });
    } catch (error) {
        log.error('Error fetching beneficiaries:', error);
        handleRouteError(error, req, res, 'فشل في جلب بيانات المستفيدين');
    }
});

/**
 * GET /api/beneficiaries/stats
 * Get comprehensive statistics - main manager only
 */
router.get('/stats', requireMainManager, async (req, res) => {
    try {
        const { term_id } = req.query;
        const includeFree = req.query.include_free === 'true';
        if (!term_id) {
            return res.status(400).json({ success: false, message: 'يجب تحديد الفصل الدراسي' });
        }

        const stats = await Beneficiary.getStatsByTerm(term_id, includeFree);
        res.json({ success: true, data: stats });
    } catch (error) {
        log.error('Error fetching beneficiary stats:', error);
        handleRouteError(error, req, res, 'فشل في جلب الإحصائيات');
    }
});

/**
 * GET /api/beneficiaries/stats/branch
 * Get branch-specific statistics
 */
router.get('/stats/branch', async (req, res) => {
    try {
        const { branch_id, term_id } = req.query;
        const includeFree = req.query.include_free === 'true';

        if (!term_id) {
            return res.status(400).json({ success: false, message: 'يجب تحديد الفصل الدراسي' });
        }

        const targetBranchId = req.user.role === 'branch_manager' ? req.user.branch_id : branch_id;
        if (!targetBranchId) {
            return res.status(400).json({ success: false, message: 'يجب تحديد الفرع' });
        }

        const stats = await Beneficiary.getStatsByBranch(targetBranchId, term_id, includeFree);
        res.json({ success: true, data: stats });
    } catch (error) {
        log.error('Error fetching branch beneficiary stats:', error);
        handleRouteError(error, req, res, 'فشل في جلب إحصائيات الفرع');
    }
});

/**
 * GET /api/beneficiaries/submission-status
 * Get which branches have submitted data for a term - main manager only
 */
router.get('/submission-status', requireMainManager, async (req, res) => {
    try {
        const { term_id } = req.query;
        const includeFree = req.query.include_free === 'true';
        if (!term_id) {
            return res.status(400).json({ success: false, message: 'يجب تحديد الفصل الدراسي' });
        }

        const status = await Beneficiary.getSubmissionStatus(term_id, includeFree);
        res.json({ success: true, data: status });
    } catch (error) {
        log.error('Error fetching submission status:', error);
        handleRouteError(error, req, res, 'فشل في جلب حالة الإدخال');
    }
});

/**
 * GET /api/beneficiaries/terms
 * Get terms that have beneficiary data (for archive filtering)
 */
router.get('/terms', requireMainManager, async (req, res) => {
    try {
        const terms = await Beneficiary.getTermsWithData();
        res.json({ success: true, data: terms });
    } catch (error) {
        log.error('Error fetching terms with data:', error);
        handleRouteError(error, req, res, 'فشل في جلب الفصول');
    }
});

/**
 * GET /api/beneficiaries/active-term
 * Get the current active term for healthcare centers
 */
router.get('/active-term', async (req, res) => {
    try {
        const now = new Date();

        // 1. Try exact date match: today within start_date..end_date
        let [term] = await sql`
      SELECT t.*, ay.year_label, ay.is_current as year_is_current
      FROM terms t
      LEFT JOIN academic_years ay ON t.academic_year_label = ay.year_label AND ay.branch_type = 'healthcare_center'
      WHERE t.branch_type = 'healthcare_center' AND t.is_active = true
      AND t.start_date <= ${now} AND t.end_date >= ${now}
      ORDER BY t.start_date DESC
      LIMIT 1
    `;

        // 2. Fallback: next upcoming term
        if (!term) {
            [term] = await sql`
        SELECT t.*, ay.year_label, ay.is_current as year_is_current
        FROM terms t
        LEFT JOIN academic_years ay ON t.academic_year_label = ay.year_label AND ay.branch_type = 'healthcare_center'
        WHERE t.branch_type = 'healthcare_center' AND t.is_active = true
        AND t.start_date > ${now}
        ORDER BY t.start_date ASC
        LIMIT 1
      `;
        }

        // 3. Last resort: most recent past term
        if (!term) {
            [term] = await sql`
        SELECT t.*, ay.year_label, ay.is_current as year_is_current
        FROM terms t
        LEFT JOIN academic_years ay ON t.academic_year_label = ay.year_label AND ay.branch_type = 'healthcare_center'
        WHERE t.branch_type = 'healthcare_center' AND t.is_active = true
        AND t.end_date < ${now}
        ORDER BY t.end_date DESC
        LIMIT 1
      `;
        }

        if (!term) {
            return res.json({ success: true, data: null, message: 'لا يوجد فصل دراسي نشط حالياً' });
        }

        res.json({ success: true, data: term });
    } catch (error) {
        log.error('Error fetching active term:', error);
        handleRouteError(error, req, res, 'فشل في جلب الفصل النشط');
    }
});

/**
 * GET /api/beneficiaries/branch-count
 * Get the beneficiary count for the authenticated branch manager's branch
 * for the current active healthcare-center term
 */
router.get('/branch-count', async (req, res) => {
    try {
        const branchId = req.user.branch_id;
        if (!branchId) {
            return res.json({ success: true, data: { count: 0, term: null } });
        }

        const now = new Date();

        // Find active healthcare term (same logic as active-term endpoint)
        let [term] = await sql`
          SELECT id, term_name FROM terms
          WHERE branch_type = 'healthcare_center' AND is_active = true
            AND start_date <= ${now} AND end_date >= ${now}
          ORDER BY start_date DESC LIMIT 1
        `;
        if (!term) {
            [term] = await sql`
              SELECT id, term_name FROM terms
              WHERE branch_type = 'healthcare_center' AND is_active = true
                AND start_date > ${now}
              ORDER BY start_date ASC LIMIT 1
            `;
        }
        if (!term) {
            [term] = await sql`
              SELECT id, term_name FROM terms
              WHERE branch_type = 'healthcare_center' AND is_active = true
              ORDER BY end_date DESC LIMIT 1
            `;
        }

        if (!term) {
            return res.json({ success: true, data: { count: 0, term: null } });
        }

        const [row] = await sql`
          SELECT COUNT(*)::int AS count
          FROM beneficiaries
          WHERE branch_id = ${branchId} AND term_id = ${term.id} AND is_archived = false
        `;

        res.json({ success: true, data: { count: row.count, term: term } });
    } catch (error) {
        log.error('Error fetching branch beneficiary count:', error);
        handleRouteError(error, req, res, 'فشل في جلب عدد المستفيدين');
    }
});

/**
 * GET /api/beneficiaries/export
 * Export beneficiaries as Excel - main manager only
 */
router.get('/export', requireMainManager, async (req, res) => {
    try {
        const { term_id, branch_id, is_archived } = req.query;

        if (!term_id) {
            return res.status(400).json({ success: false, message: 'يجب تحديد الفصل الدراسي' });
        }

        const filters = {
            term_id,
            is_archived: is_archived === 'true'
        };
        if (branch_id) filters.branch_id = branch_id;

        const result = await Beneficiary.findAll(filters);
        const data = result.data;

        // Dynamic import of ExcelJS
        const ExcelJS = (await import('exceljs')).default;
        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('المستفيدين');
        worksheet.views = [{ rightToLeft: true }];

        // Parse requested columns from query (default: all except branch_name and free_student)
        const requestedColumns = req.query.columns ? req.query.columns.split(',').map(c => c.trim()) : null;

        const allColumns = [
            { header: 'التسلسل', key: 'sequence_number', width: 10 },
            { header: 'الفرع', key: 'branch_name', width: 25 },
            { header: 'فترة الإلتحاق', key: 'enrollment_period', width: 15 },
            { header: 'اسم المستفيد', key: 'beneficiary_name', width: 30 },
            { header: 'رقم المستفيد', key: 'beneficiary_number', width: 12 },
            { header: 'السجل المدني', key: 'civil_id', width: 15 },
            { header: 'رقم التواصل', key: 'contact_number', width: 15 },
            { header: 'الجنس', key: 'gender', width: 10 },
            { header: 'العمر', key: 'age', width: 8 },
            { header: 'نطق وتخاطب', key: 'speech_therapy', width: 12 },
            { header: 'علاج طبيعي', key: 'physical_therapy', width: 12 },
            { header: 'علاج وظيفي', key: 'occupational_therapy', width: 12 },
            { header: 'علاج توحد', key: 'autism_therapy', width: 12 },
            { header: 'خدمة نقل', key: 'transport_service', width: 12 },
            { header: 'طالب مجاني', key: 'free_student', width: 12 },
            { header: 'ملاحظات', key: 'notes', width: 25 },
        ];

        // Default columns exclude branch_name and free_student
        const defaultKeys = allColumns.map(c => c.key).filter(k => k !== 'branch_name' && k !== 'free_student');
        const activeKeys = requestedColumns || defaultKeys;
        const validKeys = new Set(allColumns.map(c => c.key));

        // Define columns
        worksheet.columns = allColumns.filter(c => activeKeys.includes(c.key) && validKeys.has(c.key));

        // Add rows — only include active columns
        const activeKeySet = new Set(activeKeys);
        data.forEach((row, index) => {
            const rowData = {};
            if (activeKeySet.has('sequence_number')) rowData.sequence_number = index + 1;
            if (activeKeySet.has('branch_name')) rowData.branch_name = row.branch_name;
            if (activeKeySet.has('enrollment_period')) rowData.enrollment_period = row.enrollment_period;
            if (activeKeySet.has('beneficiary_name')) rowData.beneficiary_name = row.beneficiary_name;
            if (activeKeySet.has('beneficiary_number')) rowData.beneficiary_number = row.beneficiary_number;
            if (activeKeySet.has('civil_id')) rowData.civil_id = row.civil_id;
            if (activeKeySet.has('contact_number')) rowData.contact_number = row.contact_number;
            if (activeKeySet.has('gender')) rowData.gender = row.gender;
            if (activeKeySet.has('age')) rowData.age = row.age;
            if (activeKeySet.has('speech_therapy')) rowData.speech_therapy = row.speech_therapy ? 'نعم' : 'لا';
            if (activeKeySet.has('physical_therapy')) rowData.physical_therapy = row.physical_therapy ? 'نعم' : 'لا';
            if (activeKeySet.has('occupational_therapy')) rowData.occupational_therapy = row.occupational_therapy ? 'نعم' : 'لا';
            if (activeKeySet.has('autism_therapy')) rowData.autism_therapy = row.autism_therapy ? 'نعم' : 'لا';
            if (activeKeySet.has('transport_service')) rowData.transport_service = row.transport_service ? 'نعم' : 'لا';
            if (activeKeySet.has('free_student')) rowData.free_student = row.free_student ? 'نعم' : 'لا';
            if (activeKeySet.has('notes')) rowData.notes = row.notes || '';
            worksheet.addRow(rowData);
        });

        // Style header row
        const headerRow = worksheet.getRow(1);
        headerRow.font = { bold: true, size: 12, name: 'Arial' };
        headerRow.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FF4988C4' }
        };
        headerRow.font.color = { argb: 'FFFFFFFF' };
        headerRow.alignment = { horizontal: 'center', vertical: 'middle' };
        headerRow.height = 30;

        // Style data rows
        worksheet.eachRow((row, rowNumber) => {
            if (rowNumber > 1) {
                row.alignment = { horizontal: 'center', vertical: 'middle' };
                row.height = 25;
            }
            row.eachCell((cell) => {
                cell.border = {
                    top: { style: 'thin' },
                    left: { style: 'thin' },
                    bottom: { style: 'thin' },
                    right: { style: 'thin' }
                };
            });
        });

        // Generate buffer and send
        const buffer = await workbook.xlsx.writeBuffer();
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', 'attachment; filename=beneficiaries.xlsx');
        res.send(buffer);
    } catch (error) {
        log.error('Error exporting beneficiaries:', error);
        handleRouteError(error, req, res, 'فشل في تصدير البيانات');
    }
});

/**
 * GET /api/beneficiaries/archive
 * View archived beneficiaries - main manager only
 */
router.get('/archive', requireMainManager, async (req, res) => {
    try {
        const { term_id, branch_id, page, limit } = req.query;

        const filters = {
            is_archived: true,
            page,
            limit
        };
        if (term_id) filters.term_id = term_id;
        if (branch_id) filters.branch_id = branch_id;

        const result = await Beneficiary.findAll(filters);
        res.json({ success: true, ...result });
    } catch (error) {
        log.error('Error fetching archived beneficiaries:', error);
        handleRouteError(error, req, res, 'فشل في جلب الأرشيف');
    }
});

/**
 * POST /api/beneficiaries/copy-from-term
 * Copy beneficiaries from a previous term to the active term
 * Branch managers copy for their own branch, main manager can specify branch_id
 */
router.post('/copy-from-term', requireManager, async (req, res) => {
    try {
        const { source_term_id, branch_id: reqBranchId } = req.body;

        if (!source_term_id) {
            return res.status(400).json({ success: false, message: 'يرجى تحديد الفصل المصدر' });
        }

        // Determine branch
        const branchId = req.user.role === 'main_manager' && reqBranchId
            ? reqBranchId
            : req.user.branch_id;

        if (!branchId) {
            return res.status(400).json({ success: false, message: 'يرجى تحديد الفرع' });
        }

        // Get active term for healthcare_center
        const activeTerm = await sql`
            SELECT * FROM terms
            WHERE branch_type = 'healthcare_center'
            AND is_active = true
            AND start_date <= NOW() AND end_date >= NOW()
            ORDER BY start_date DESC LIMIT 1
        `;

        let targetTermId;
        if (activeTerm.length > 0) {
            targetTermId = activeTerm[0].id;
        } else {
            // Fallback to next upcoming term
            const upcoming = await sql`
                SELECT * FROM terms
                WHERE branch_type = 'healthcare_center'
                AND is_active = true AND start_date > NOW()
                ORDER BY start_date ASC LIMIT 1
            `;
            if (upcoming.length > 0) {
                targetTermId = upcoming[0].id;
            } else {
                return res.status(400).json({ success: false, message: 'لا يوجد فصل دراسي نشط حالياً' });
            }
        }

        if (parseInt(source_term_id) === targetTermId) {
            return res.status(400).json({ success: false, message: 'لا يمكن النسخ من نفس الفصل الحالي' });
        }

        const result = await Beneficiary.copyFromTerm(parseInt(source_term_id), targetTermId, parseInt(branchId));

        res.json({
            success: true,
            message: `تم نسخ ${result.copied} مستفيد بنجاح${result.skipped > 0 ? ` (تم تخطي ${result.skipped} مكرر)` : ''}`,
            data: result
        });
    } catch (error) {
        log.error('Error copying beneficiaries from term:', error);
        handleRouteError(error, req, res, 'فشل في نسخ المستفيدين');
    }
});

/**
 * GET /api/beneficiaries/staffing-requirements
 * Compute required staff per branch based on regulatory rules and compare with actual employees
 * Main manager only
 */
router.get('/staffing-requirements', requireMainManager, async (req, res) => {
    try {
        const { term_id } = req.query;
        const includeFree = req.query.include_free === 'true';
        const mergeTherapy = req.query.merge_therapy === 'true';
        if (!term_id) {
            return res.status(400).json({ success: false, message: 'يجب تحديد الفصل الدراسي' });
        }

        // Query 1: Beneficiary stats per branch
        const branchBeneficiaryStats = await sql`
            SELECT 
                b_data.branch_id,
                br.branch_name,
                COUNT(*) as total,
                COUNT(*) FILTER (WHERE b_data.enrollment_period = 'صباحية') as morning_count,
                COUNT(*) FILTER (WHERE b_data.enrollment_period = 'مسائية') as evening_count,
                COUNT(*) FILTER (WHERE b_data.speech_therapy = true) as speech_therapy_count,
                COUNT(*) FILTER (WHERE b_data.physical_therapy = true) as physical_therapy_count,
                COUNT(*) FILTER (WHERE b_data.occupational_therapy = true) as occupational_therapy_count,
                COUNT(*) FILTER (WHERE b_data.autism_therapy = true) as autism_therapy_count,
                COUNT(*) FILTER (WHERE b_data.transport_service = true) as transport_service_count,
                COUNT(*) FILTER (WHERE b_data.physical_therapy = true OR b_data.occupational_therapy = true) as physical_or_occupational_count
            FROM beneficiaries b_data
            LEFT JOIN branches br ON b_data.branch_id = br.id
            WHERE b_data.term_id = ${term_id} AND b_data.is_archived = false ${includeFree ? sql`` : sql`AND b_data.free_student IS NOT TRUE`}
            GROUP BY b_data.branch_id, br.branch_name
            ORDER BY br.branch_name
        `;

        if (branchBeneficiaryStats.length === 0) {
            return res.json({ success: true, data: [] });
        }

        // Query 2: Active employee counts per branch per job_title (healthcare centers only)
        const branchIds = branchBeneficiaryStats.map(b => b.branch_id);
        const employeeCounts = await sql`
            SELECT e.branch_id, e.job_title, COUNT(*)::int as count
            FROM employees e
            WHERE e.status = 'active' AND e.branch_id = ANY(${branchIds})
            GROUP BY e.branch_id, e.job_title
        `;

        // Build lookup: { branchId: { jobTitle: count } }
        const employeeMap = {};
        for (const row of employeeCounts) {
            if (!employeeMap[row.branch_id]) employeeMap[row.branch_id] = {};
            employeeMap[row.branch_id][row.job_title] = row.count;
        }

        // Staffing rules — includes detailed reason with student counts
        const computeRequirements = (bs, mergeTherapyFlag) => {
            const total = parseInt(bs.total);
            const morning = parseInt(bs.morning_count);
            const evening = parseInt(bs.evening_count);
            const speech = parseInt(bs.speech_therapy_count);
            const physical = parseInt(bs.physical_therapy_count);
            const occupational = parseInt(bs.occupational_therapy_count);
            const autism = parseInt(bs.autism_therapy_count);
            const transport = parseInt(bs.transport_service_count);
            const physicalOrOccupational = parseInt(bs.physical_or_occupational_count || 0);
            const nonAutism = total - autism;

            const nursingRequired = (morning > 0 ? 1 : 0) + (evening > 0 ? 1 : 0);
            const driverRequired = 1;
            const companionRequired = transport > 0 ? driverRequired : 0;

            // Therapy roles: merged or separate
            const therapyRoles = mergeTherapyFlag
                ? [
                    {
                        role: 'علاج طبيعي / وظيفي', required: physicalOrOccupational > 0 ? Math.ceil(physicalOrOccupational / 20) : 0, rule: '1 لكل 20 مستفيد (مدمج)',
                        reason: `${physicalOrOccupational} مستفيد يحتاج علاج طبيعي أو وظيفي ÷ 20 = ${Math.ceil(physicalOrOccupational / 20)} معالج مطلوب (مدمج)`, students: physicalOrOccupational, ratio: 20, icon: '🦿🧩', merged: true
                    },
                ]
                : [
                    {
                        role: 'علاج طبيعي', required: physical > 0 ? Math.ceil(physical / 20) : 0, rule: '1 لكل 20 مستفيد',
                        reason: `${physical} مستفيد يحتاج علاج طبيعي ÷ 20 = ${Math.ceil(physical / 20)} معالج مطلوب`, students: physical, ratio: 20, icon: '🦿'
                    },
                    {
                        role: 'علاج وظيفي', required: occupational > 0 ? Math.ceil(occupational / 25) : 0, rule: '1 لكل 25 مستفيد',
                        reason: `${occupational} مستفيد يحتاج علاج وظيفي ÷ 25 = ${Math.ceil(occupational / 25)} معالج مطلوب`, students: occupational, ratio: 25, icon: '🧩'
                    },
                ];

            return [
                { role: 'مديرة مراكز', required: 1, rule: 'واحد لكل مركز', reason: 'وظيفة إدارية أساسية — مطلوب مديرة واحدة لكل مركز رعاية', icon: '👔' },
                { role: 'الموارد البشرية', required: 1, rule: 'واحد لكل مركز', reason: 'وظيفة إدارية أساسية — مطلوب موظف موارد بشرية واحد لكل مركز', icon: '📋' },
                {
                    role: 'تمريض', required: nursingRequired, rule: 'واحد لكل فترة نشطة',
                    reason: nursingRequired === 2
                        ? `يوجد ${morning} مستفيد في الفترة الصباحية و ${evening} في المسائية — مطلوب ممرض/ة لكل فترة نشطة`
                        : morning > 0 ? `يوجد ${morning} مستفيد في الفترة الصباحية — مطلوب ممرض/ة واحد/ة` : `يوجد ${evening} مستفيد في الفترة المسائية — مطلوب ممرض/ة واحد/ة`,
                    icon: '🏥'
                },
                ...therapyRoles,
                {
                    role: 'النطق و التخاطب', required: speech > 0 ? Math.ceil(speech / 20) : 0, rule: '1 لكل 20 مستفيد',
                    reason: `${speech} مستفيد يحتاج نطق وتخاطب ÷ 20 = ${Math.ceil(speech / 20)} أخصائي مطلوب`, students: speech, ratio: 20, icon: '🗣️'
                },
                {
                    role: 'معلم صف توحد', required: autism > 0 ? Math.ceil(autism / 5) : 0, rule: '1 لكل 5 مستفيدين',
                    reason: `${autism} مستفيد توحد ÷ 5 = ${Math.ceil(autism / 5)} معلم صف مطلوب`, students: autism, ratio: 5, icon: '🧠'
                },
                {
                    role: 'معلم صف تربية خاصة', required: nonAutism > 0 ? Math.ceil(nonAutism / 8) : 0, rule: '1 لكل 8 مستفيدين',
                    reason: `${nonAutism} مستفيد (غير التوحد) ÷ 8 = ${Math.ceil(nonAutism / 8)} معلم تربية خاصة مطلوب`, students: nonAutism, ratio: 8, icon: '📚'
                },
                {
                    role: 'اخصائي نفسي', required: total > 0 ? Math.ceil(total / 50) : 0, rule: '1 لكل 50 مستفيد',
                    reason: `${total} مستفيد (إجمالي) ÷ 50 = ${Math.ceil(total / 50)} أخصائي نفسي مطلوب`, students: total, ratio: 50, icon: '🧘'
                },
                {
                    role: 'اخصائي اجتماعي', required: total > 0 ? Math.ceil(total / 100) : 0, rule: '1 لكل 100 مستفيد',
                    reason: `${total} مستفيد (إجمالي) ÷ 100 = ${Math.ceil(total / 100)} أخصائي اجتماعي مطلوب`, students: total, ratio: 100, icon: '🤝'
                },
                {
                    role: 'مشرف فني عام', required: total > 0 ? Math.ceil(total / 100) : 0, rule: '1 لكل 100 مستفيد',
                    reason: `${total} مستفيد (إجمالي) ÷ 100 = ${Math.ceil(total / 100)} مشرف فني مطلوب`, students: total, ratio: 100, icon: '📝'
                },
                {
                    role: 'مراقب اجتماعي', required: total > 0 ? Math.ceil(total / 100) : 0, rule: '1 لكل 100 مستفيد',
                    reason: `${total} مستفيد (إجمالي) ÷ 100 = ${Math.ceil(total / 100)} مراقب اجتماعي مطلوب`, students: total, ratio: 100, icon: '👁️'
                },
                {
                    role: 'الرعاية الشخصية', required: total > 0 ? Math.ceil(total / 20) : 0, rule: '1 لكل 20 مستفيد',
                    reason: `${total} مستفيد (إجمالي) ÷ 20 = ${Math.ceil(total / 20)} موظف رعاية شخصية مطلوب`, students: total, ratio: 20, icon: '💆'
                },
                { role: 'حارس امن', required: 1, rule: 'واحد لكل مركز', reason: 'وظيفة أساسية — مطلوب حارس أمن واحد لكل مركز', icon: '🛡️' },
                { role: 'سائق', required: driverRequired, rule: 'واحد لكل مركز', reason: 'وظيفة أساسية — مطلوب سائق واحد لكل مركز', icon: '🚐' },
                {
                    role: 'مرافق سائق', required: companionRequired, rule: 'مع السائق إذا توفر نقل',
                    reason: transport > 0 ? `${transport} مستفيد يستخدم خدمة النقل — مطلوب مرافق للسائق` : 'لا يوجد مستفيدين يستخدمون خدمة النقل', icon: '🚌'
                },
            ];
        };

        // Build response
        const data = branchBeneficiaryStats.map(bs => {
            const requirements = computeRequirements(bs, mergeTherapy);
            const branchEmployees = employeeMap[bs.branch_id] || {};

            const staffing = requirements.map(r => {
                // For merged therapy role, sum employees from both job titles
                const current = r.merged
                    ? (branchEmployees['علاج طبيعي'] || 0) + (branchEmployees['علاج وظيفي'] || 0)
                    : (branchEmployees[r.role] || 0);
                return {
                    role: r.role,
                    required: r.required,
                    current,
                    deficit: Math.max(0, r.required - current),
                    surplus: Math.max(0, current - r.required),
                    rule: r.rule,
                    reason: r.reason,
                    icon: r.icon,
                    students: r.students,
                    ratio: r.ratio,
                };
            });

            const totalRequired = staffing.reduce((sum, s) => sum + s.required, 0);
            const totalCurrent = staffing.reduce((sum, s) => sum + s.current, 0);
            const totalDeficit = staffing.reduce((sum, s) => sum + s.deficit, 0);

            return {
                branch_id: bs.branch_id,
                branch_name: bs.branch_name,
                total_beneficiaries: parseInt(bs.total),
                morning_count: parseInt(bs.morning_count),
                evening_count: parseInt(bs.evening_count),
                speech_therapy_count: parseInt(bs.speech_therapy_count),
                physical_therapy_count: parseInt(bs.physical_therapy_count),
                occupational_therapy_count: parseInt(bs.occupational_therapy_count),
                autism_therapy_count: parseInt(bs.autism_therapy_count),
                transport_service_count: parseInt(bs.transport_service_count),
                staffing,
                total_required: totalRequired,
                total_current: totalCurrent,
                total_deficit: totalDeficit,
            };
        });

        res.json({ success: true, data });
    } catch (error) {
        log.error('Error computing staffing requirements:', error);
        handleRouteError(error, req, res, 'فشل في حساب متطلبات التوظيف');
    }
});

/**
 * GET /api/beneficiaries/bus-students
 * List bus students that can be imported as beneficiaries
 * Only shows students not already linked (by name match)
 */
router.get('/bus-students', requireManager, async (req, res) => {
    try {
        const branchId = getScopedBranchFilter(req, { allowMultiple: false });
        if (!branchId) {
            return res.status(400).json({ success: false, message: 'يجب تحديد الفرع' });
        }

        // Verify branch is a healthcare center
        const [branch] = await sql`SELECT branch_type FROM branches WHERE id = ${branchId}`;
        if (!branch || branch.branch_type !== 'healthcare_center') {
            return res.status(400).json({ success: false, message: 'هذه الخدمة متاحة فقط لمراكز الرعاية الصحية' });
        }

        // Get active term for healthcare_center
        let termId = getScopedTermFilter(req);
        if (!termId) {
            const now = new Date();
            let [term] = await sql`
                SELECT id FROM terms
                WHERE branch_type = 'healthcare_center' AND is_active = true
                AND start_date <= ${now} AND end_date >= ${now}
                ORDER BY start_date DESC LIMIT 1
            `;
            if (!term) {
                [term] = await sql`
                    SELECT id FROM terms
                    WHERE branch_type = 'healthcare_center' AND is_active = true
                    AND start_date > ${now}
                    ORDER BY start_date ASC LIMIT 1
                `;
            }
            if (!term) {
                return res.json({ success: true, data: [] });
            }
            termId = term.id;
        }

        // Get all buses for this branch+term
        const buses = await BusTransportation.findByBranchAndTerm(branchId, termId);
        if (!buses || buses.length === 0) {
            return res.json({ success: true, data: [] });
        }

        const busIds = buses.map(b => b.id);
        const students = await BusStudent.findByBusIds(busIds, { term_id: termId });

        if (!students || students.length === 0) {
            return res.json({ success: true, data: [] });
        }

        // Get existing beneficiary names for this branch+term
        const existingBeneficiaries = await sql`
            SELECT LOWER(TRIM(beneficiary_name)) as name
            FROM beneficiaries
            WHERE branch_id = ${branchId} AND term_id = ${termId} AND is_archived = false
        `;
        const existingNames = new Set(existingBeneficiaries.map(b => b.name));

        // Build bus_number lookup
        const busNumberMap = {};
        for (const bus of buses) {
            busNumberMap[bus.id] = bus.bus_number;
        }

        // Filter out students already imported
        const importable = students
            .filter(s => !existingNames.has(s.student_full_name?.trim().toLowerCase()))
            .map(s => ({
                id: s.id,
                student_full_name: s.student_full_name,
                contact_mobile_number: s.contact_mobile_number,
                address: s.address,
                bus_id: s.bus_id,
                bus_number: busNumberMap[s.bus_id] || null
            }));

        res.json({ success: true, data: importable });
    } catch (error) {
        log.error('Error fetching importable bus students:', error);
        handleRouteError(error, req, res, 'فشل في جلب بيانات طلاب الباص');
    }
});

/**
 * GET /api/beneficiaries/available-buses
 * List buses at the branch for bus assignment
 */
router.get('/available-buses', requireManager, async (req, res) => {
    try {
        const branchId = getScopedBranchFilter(req, { allowMultiple: false });
        if (!branchId) {
            return res.status(400).json({ success: false, message: 'يجب تحديد الفرع' });
        }

        // Verify branch is a healthcare center
        const [branch] = await sql`SELECT branch_type FROM branches WHERE id = ${branchId}`;
        if (!branch || branch.branch_type !== 'healthcare_center') {
            return res.status(400).json({ success: false, message: 'هذه الخدمة متاحة فقط لمراكز الرعاية الصحية' });
        }

        let termId = getScopedTermFilter(req);
        if (!termId) {
            const now = new Date();
            let [term] = await sql`
                SELECT id FROM terms
                WHERE branch_type = 'healthcare_center' AND is_active = true
                AND start_date <= ${now} AND end_date >= ${now}
                ORDER BY start_date DESC LIMIT 1
            `;
            if (!term) {
                [term] = await sql`
                    SELECT id FROM terms
                    WHERE branch_type = 'healthcare_center' AND is_active = true
                    AND start_date > ${now}
                    ORDER BY start_date ASC LIMIT 1
                `;
            }
            if (!term) {
                return res.json({ success: true, data: [] });
            }
            termId = term.id;
        }

        const buses = await BusTransportation.findByBranchAndTerm(branchId, termId);
        if (!buses || buses.length === 0) {
            return res.json({ success: true, data: [] });
        }

        const result = buses.map(bus => ({
            id: bus.id,
            bus_number: bus.bus_number,
            driver_full_name: bus.driver_full_name || null,
            number_of_seats: bus.number_of_seats ? parseInt(bus.number_of_seats) : null,
            student_count: bus.student_count ? parseInt(bus.student_count) : 0,
            primary_plate: bus.primary_plate || null
        }));

        res.json({ success: true, data: result });
    } catch (error) {
        log.error('Error fetching available buses:', error);
        handleRouteError(error, req, res, 'فشل في جلب بيانات الباصات');
    }
});

/**
 * POST /api/beneficiaries/:id/assign-bus
 * Assign a beneficiary to a bus (creates a bus_student record)
 */
router.post('/:id/assign-bus', requireManager, async (req, res) => {
    try {
        const { bus_id } = req.body;
        if (!bus_id) {
            return res.status(400).json({ success: false, message: 'يجب تحديد الباص' });
        }

        const beneficiary = await Beneficiary.findById(req.params.id);
        if (!beneficiary) {
            return res.status(404).json({ success: false, message: 'المستفيد غير موجود' });
        }

        // Branch managers can only assign their own branch
        if (req.user.role === 'branch_manager' && beneficiary.branch_id !== req.user.branch_id) {
            return res.status(403).json({ success: false, message: 'غير مصرح بهذا الإجراء' });
        }

        if (!beneficiary.transport_service) {
            return res.status(400).json({ success: false, message: 'خدمة النقل غير مفعلة لهذا المستفيد' });
        }

        if (!beneficiary.term_id) {
            return res.status(400).json({ success: false, message: 'المستفيد غير مرتبط بفصل دراسي' });
        }

        // Verify the bus exists
        const [bus] = await sql`
            SELECT id, branch_id FROM bus_transportation WHERE id = ${parseInt(bus_id)}
        `;
        if (!bus) {
            return res.status(404).json({ success: false, message: 'الباص غير موجود' });
        }

        // Verify bus belongs to the same branch as the beneficiary
        if (bus.branch_id !== beneficiary.branch_id) {
            return res.status(400).json({ success: false, message: 'لا يمكن تعيين مستفيد لباص في فرع آخر' });
        }

        // Check if already assigned to any bus by name in the same branch/term
        const normalizedName = beneficiary.beneficiary_name?.trim().toLowerCase();
        const [existingByName] = await sql`
            SELECT bs.id FROM bus_students bs
            INNER JOIN bus_transportation bt ON bs.bus_id = bt.id
            WHERE LOWER(TRIM(bs.student_full_name)) = ${normalizedName}
            AND bt.branch_id = ${beneficiary.branch_id}
            AND bs.term_id = ${beneficiary.term_id}
        `;
        if (existingByName) {
            return res.status(400).json({ success: false, message: 'المستفيد مسجل بالفعل في باص' });
        }

        // Also check by unique constraint columns (bus_id, contact_mobile_number, term_id)
        const contactNumber = beneficiary.contact_number || '';
        if (contactNumber) {
            const [existingByConstraint] = await sql`
                SELECT id FROM bus_students
                WHERE bus_id = ${parseInt(bus_id)}
                AND contact_mobile_number = ${contactNumber}
                AND term_id = ${beneficiary.term_id}
            `;
            if (existingByConstraint) {
                return res.status(400).json({ success: false, message: 'يوجد طالب بنفس رقم التواصل مسجل بالفعل في هذا الباص' });
            }
        }

        // Create bus student record
        const student = await BusStudent.create({
            bus_id: parseInt(bus_id),
            term_id: beneficiary.term_id,
            student_full_name: beneficiary.beneficiary_name,
            contact_mobile_number: contactNumber,
            address: '',
            // created_by is FK to users(id) — branch managers have no users row, use null
            created_by: req.user.role === 'branch_manager' ? null : req.user.id
        });

        res.status(201).json({ success: true, data: student, message: 'تم تسجيل المستفيد في الباص بنجاح' });
    } catch (error) {
        log.error('Error assigning beneficiary to bus:', error);
        // Handle unique constraint violation gracefully
        if (error.code === '23505') {
            return res.status(400).json({ success: false, message: 'المستفيد مسجل بالفعل في هذا الباص' });
        }
        // Handle foreign key violation (e.g. invalid bus_id or term_id)
        if (error.code === '23503') {
            return res.status(400).json({ success: false, message: 'الباص أو الفصل الدراسي غير موجود' });
        }
        handleRouteError(error, req, res, 'فشل في تسجيل المستفيد في الباص');
    }
});

/**
 * GET /api/beneficiaries/:id
 * Get a single beneficiary
 */
router.get('/:id', async (req, res) => {
    try {
        const beneficiary = await Beneficiary.findById(req.params.id);
        if (!beneficiary) {
            return res.status(404).json({ success: false, message: 'المستفيد غير موجود' });
        }

        // Branch managers can only see their branch data
        if (req.user.role === 'branch_manager' && beneficiary.branch_id !== req.user.branch_id) {
            return res.status(403).json({ success: false, message: 'غير مصرح بالوصول لهذا المستفيد' });
        }

        res.json({ success: true, data: beneficiary });
    } catch (error) {
        log.error('Error fetching beneficiary:', error);
        handleRouteError(error, req, res, 'فشل في جلب بيانات المستفيد');
    }
});

/**
 * POST /api/beneficiaries
 * Create a new beneficiary
 */
router.post('/', requireManager, async (req, res) => {
    try {
        const { beneficiary_number, enrollment_period, beneficiary_name, civil_id, contact_number, gender, age,
            speech_therapy, physical_therapy, occupational_therapy, autism_therapy, transport_service, free_student, notes, term_id } = req.body;

        // Validate required fields
        if (!beneficiary_number || !enrollment_period || !beneficiary_name || !civil_id || !contact_number || !gender || !age) {
            return res.status(400).json({ success: false, message: 'جميع الحقول مطلوبة' });
        }

        // Validate beneficiary_number is 6 or 7 digits
        if (!/^\d{6,7}$/.test(beneficiary_number)) {
            return res.status(400).json({ success: false, message: 'رقم المستفيد يجب أن يكون 6 أو 7 أرقام' });
        }

        // Determine branch_id
        const branchAccess = resolveBranchAccessFromScope(req.scope, req.body.branch_id); // policy-scope:allow-direct
        if (!branchAccess.allowed) {
            return res.status(400).json({ success: false, message: 'يجب تحديد الفرع' });
        }
        const branchId = branchAccess.effectiveBranchId;

        // Verify branch is a healthcare center
        const [branch] = await sql`SELECT branch_type FROM branches WHERE id = ${branchId}`;
        if (!branch || branch.branch_type !== 'healthcare_center') {
            return res.status(400).json({ success: false, message: 'هذه الخدمة متاحة فقط لمراكز الرعاية الصحية' });
        }

        // Find active term for healthcare centers if not provided
        let activeTermId = term_id;
        if (!activeTermId) {
            const [activeTerm] = await sql`
        SELECT id FROM terms 
        WHERE branch_type = 'healthcare_center' AND is_active = true 
        ORDER BY created_at DESC LIMIT 1
      `;
            if (!activeTerm) {
                return res.status(400).json({ success: false, message: 'لا يوجد فصل دراسي نشط حالياً' });
            }
            activeTermId = activeTerm.id;
        } else {
            // Verify term is active
            const [term] = await sql`SELECT id, is_active FROM terms WHERE id = ${activeTermId}`;
            if (!term || !term.is_active) {
                return res.status(400).json({ success: false, message: 'الفصل الدراسي المحدد غير نشط' });
            }
        }

        // Check for duplicate civil_id in same branch+term
        const [existing] = await sql`
      SELECT id FROM beneficiaries 
      WHERE branch_id = ${branchId} AND term_id = ${activeTermId} AND civil_id = ${civil_id}
    `;
        if (existing) {
            return res.status(400).json({ success: false, message: 'السجل المدني مسجل بالفعل في هذا الفصل' });
        }

        const beneficiary = await Beneficiary.create({
            branch_id: branchId,
            term_id: activeTermId,
            beneficiary_number,
            enrollment_period,
            beneficiary_name,
            civil_id,
            contact_number,
            gender,
            age: parseInt(age),
            speech_therapy: speech_therapy || false,
            physical_therapy: physical_therapy || false,
            occupational_therapy: occupational_therapy || false,
            autism_therapy: autism_therapy || false,
            transport_service: transport_service || false,
            free_student: free_student || false,
            notes: notes || null
        });

        res.status(201).json({ success: true, data: beneficiary, message: 'تم إضافة المستفيد بنجاح' });
    } catch (error) {
        log.error('Error creating beneficiary:', error);
        if (error.code === '23505') {
            return res.status(400).json({ success: false, message: 'السجل المدني مسجل بالفعل في هذا الفصل' });
        }
        handleRouteError(error, req, res, 'فشل في إضافة المستفيد');
    }
});

/**
 * PUT /api/beneficiaries/:id
 * Update a beneficiary
 */
router.put('/:id', requireManager, async (req, res) => {
    try {
        const beneficiary = await Beneficiary.findById(req.params.id);
        if (!beneficiary) {
            return res.status(404).json({ success: false, message: 'المستفيد غير موجود' });
        }

        // Branch managers can only edit their own branch data
        if (req.user.role === 'branch_manager' && beneficiary.branch_id !== req.user.branch_id) {
            return res.status(403).json({ success: false, message: 'غير مصرح بتعديل هذا المستفيد' });
        }

        // Cannot edit archived records
        if (beneficiary.is_archived) {
            return res.status(400).json({ success: false, message: 'لا يمكن تعديل بيانات مؤرشفة' });
        }

        // Verify term is still active
        const [term] = await sql`SELECT id, is_active FROM terms WHERE id = ${beneficiary.term_id}`;
        if (!term || !term.is_active) {
            return res.status(400).json({ success: false, message: 'لا يمكن التعديل - الفصل الدراسي غير نشط' });
        }

        const { beneficiary_number, enrollment_period, beneficiary_name, civil_id, contact_number, gender, age,
            speech_therapy, physical_therapy, occupational_therapy, autism_therapy, transport_service, free_student, notes } = req.body;

        // Validate beneficiary_number is 6 or 7 digits if provided
        if (beneficiary_number && !/^\d{6,7}$/.test(beneficiary_number)) {
            return res.status(400).json({ success: false, message: 'رقم المستفيد يجب أن يكون 6 أو 7 أرقام' });
        }

        // Check for duplicate civil_id if it changed
        if (civil_id && civil_id !== beneficiary.civil_id) {
            const [existing] = await sql`
        SELECT id FROM beneficiaries 
        WHERE branch_id = ${beneficiary.branch_id} AND term_id = ${beneficiary.term_id} 
        AND civil_id = ${civil_id} AND id != ${req.params.id}
      `;
            if (existing) {
                return res.status(400).json({ success: false, message: 'السجل المدني مسجل بالفعل في هذا الفصل' });
            }
        }

        const updated = await Beneficiary.update(req.params.id, {
            beneficiary_number: beneficiary_number || beneficiary.beneficiary_number,
            enrollment_period: enrollment_period || beneficiary.enrollment_period,
            beneficiary_name: beneficiary_name || beneficiary.beneficiary_name,
            civil_id: civil_id || beneficiary.civil_id,
            contact_number: contact_number || beneficiary.contact_number,
            gender: gender || beneficiary.gender,
            age: age ? parseInt(age) : beneficiary.age,
            speech_therapy: speech_therapy !== undefined ? speech_therapy : beneficiary.speech_therapy,
            physical_therapy: physical_therapy !== undefined ? physical_therapy : beneficiary.physical_therapy,
            occupational_therapy: occupational_therapy !== undefined ? occupational_therapy : beneficiary.occupational_therapy,
            autism_therapy: autism_therapy !== undefined ? autism_therapy : beneficiary.autism_therapy,
            transport_service: transport_service !== undefined ? transport_service : beneficiary.transport_service,
            free_student: free_student !== undefined ? free_student : beneficiary.free_student,
            notes: notes !== undefined ? notes : beneficiary.notes
        });

        res.json({ success: true, data: updated, message: 'تم تحديث بيانات المستفيد بنجاح' });
    } catch (error) {
        log.error('Error updating beneficiary:', error);
        if (error.code === '23505') {
            return res.status(400).json({ success: false, message: 'السجل المدني مسجل بالفعل في هذا الفصل' });
        }
        handleRouteError(error, req, res, 'فشل في تحديث بيانات المستفيد');
    }
});

/**
 * DELETE /api/beneficiaries/:id
 * Delete a beneficiary
 */
router.delete('/:id', requireManager, async (req, res) => {
    try {
        const beneficiary = await Beneficiary.findById(req.params.id);
        if (!beneficiary) {
            return res.status(404).json({ success: false, message: 'المستفيد غير موجود' });
        }

        // Branch managers can only delete their own branch data
        if (req.user.role === 'branch_manager' && beneficiary.branch_id !== req.user.branch_id) {
            return res.status(403).json({ success: false, message: 'غير مصرح بحذف هذا المستفيد' });
        }

        // Cannot delete archived records
        if (beneficiary.is_archived) {
            return res.status(400).json({ success: false, message: 'لا يمكن حذف بيانات مؤرشفة' });
        }

        // Verify term is still active
        const [term] = await sql`SELECT id, is_active FROM terms WHERE id = ${beneficiary.term_id}`;
        if (!term || !term.is_active) {
            return res.status(400).json({ success: false, message: 'لا يمكن الحذف - الفصل الدراسي غير نشط' });
        }

        await Beneficiary.delete(req.params.id);
        res.json({ success: true, message: 'تم حذف المستفيد بنجاح' });
    } catch (error) {
        log.error('Error deleting beneficiary:', error);
        handleRouteError(error, req, res, 'فشل في حذف المستفيد');
    }
});

/**
 * POST /api/beneficiaries/archive/:termId
 * Archive all beneficiaries for a term - main manager only
 */
router.post('/archive/:termId', requireMainManager, async (req, res) => {
    try {
        const { termId } = req.params;

        // Verify term exists
        const [term] = await sql`SELECT id, term_name, academic_year_label FROM terms WHERE id = ${termId}`;
        if (!term) {
            return res.status(404).json({ success: false, message: 'الفصل الدراسي غير موجود' });
        }

        const archivedCount = await Beneficiary.archiveByTerm(termId);

        if (archivedCount === 0) {
            return res.json({ success: true, message: 'لا توجد بيانات للأرشفة في هذا الفصل' });
        }

        res.json({
            success: true,
            message: `تم أرشفة ${archivedCount} مستفيد بنجاح`,
            data: { archived_count: archivedCount }
        });
    } catch (error) {
        log.error('Error archiving beneficiaries:', error);
        handleRouteError(error, req, res, 'فشل في أرشفة البيانات');
    }
});

export default router;
