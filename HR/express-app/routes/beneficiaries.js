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
import log from '../utils/logger.js';

const router = express.Router();

// All routes require authentication
router.use(authenticate);

/**
 * GET /api/beneficiaries
 * List beneficiaries - branch managers see their own, main manager sees all
 */
router.get('/', async (req, res) => {
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
        res.status(500).json({ success: false, message: 'فشل في جلب بيانات المستفيدين' });
    }
});

/**
 * GET /api/beneficiaries/stats
 * Get comprehensive statistics - main manager only
 */
router.get('/stats', requireMainManager, async (req, res) => {
    try {
        const { term_id } = req.query;
        if (!term_id) {
            return res.status(400).json({ success: false, message: 'يجب تحديد الفصل الدراسي' });
        }

        const stats = await Beneficiary.getStatsByTerm(term_id);
        res.json({ success: true, data: stats });
    } catch (error) {
        log.error('Error fetching beneficiary stats:', error);
        res.status(500).json({ success: false, message: 'فشل في جلب الإحصائيات' });
    }
});

/**
 * GET /api/beneficiaries/stats/branch
 * Get branch-specific statistics
 */
router.get('/stats/branch', async (req, res) => {
    try {
        const { branch_id, term_id } = req.query;

        if (!term_id) {
            return res.status(400).json({ success: false, message: 'يجب تحديد الفصل الدراسي' });
        }

        const targetBranchId = req.user.role === 'branch_manager' ? req.user.branch_id : branch_id;
        if (!targetBranchId) {
            return res.status(400).json({ success: false, message: 'يجب تحديد الفرع' });
        }

        const stats = await Beneficiary.getStatsByBranch(targetBranchId, term_id);
        res.json({ success: true, data: stats });
    } catch (error) {
        log.error('Error fetching branch beneficiary stats:', error);
        res.status(500).json({ success: false, message: 'فشل في جلب إحصائيات الفرع' });
    }
});

/**
 * GET /api/beneficiaries/submission-status
 * Get which branches have submitted data for a term - main manager only
 */
router.get('/submission-status', requireMainManager, async (req, res) => {
    try {
        const { term_id } = req.query;
        if (!term_id) {
            return res.status(400).json({ success: false, message: 'يجب تحديد الفصل الدراسي' });
        }

        const status = await Beneficiary.getSubmissionStatus(term_id);
        res.json({ success: true, data: status });
    } catch (error) {
        log.error('Error fetching submission status:', error);
        res.status(500).json({ success: false, message: 'فشل في جلب حالة الإدخال' });
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
        res.status(500).json({ success: false, message: 'فشل في جلب الفصول' });
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
        res.status(500).json({ success: false, message: 'فشل في جلب الفصل النشط' });
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

        // Define columns
        worksheet.columns = [
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
        ];

        // Add rows
        data.forEach(row => {
            worksheet.addRow({
                sequence_number: row.sequence_number,
                branch_name: row.branch_name,
                enrollment_period: row.enrollment_period,
                beneficiary_name: row.beneficiary_name,
                beneficiary_number: row.beneficiary_number,
                civil_id: row.civil_id,
                contact_number: row.contact_number,
                gender: row.gender,
                age: row.age,
                speech_therapy: row.speech_therapy ? 'نعم' : 'لا',
                physical_therapy: row.physical_therapy ? 'نعم' : 'لا',
                occupational_therapy: row.occupational_therapy ? 'نعم' : 'لا',
                autism_therapy: row.autism_therapy ? 'نعم' : 'لا',
                transport_service: row.transport_service ? 'نعم' : 'لا',
            });
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
        res.status(500).json({ success: false, message: 'فشل في تصدير البيانات' });
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
        res.status(500).json({ success: false, message: 'فشل في جلب الأرشيف' });
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
        res.status(500).json({ success: false, message: 'فشل في نسخ المستفيدين' });
    }
});

/**
 * GET /api/beneficiaries/bus-students
 * List bus students that can be imported as beneficiaries
 * Only shows students not already linked (by name match)
 */
router.get('/bus-students', requireManager, async (req, res) => {
    try {
        const branchId = req.user.role === 'branch_manager' ? req.user.branch_id : req.query.branch_id;
        if (!branchId) {
            return res.status(400).json({ success: false, message: 'يجب تحديد الفرع' });
        }

        // Verify branch is a healthcare center
        const [branch] = await sql`SELECT branch_type FROM branches WHERE id = ${branchId}`;
        if (!branch || branch.branch_type !== 'healthcare_center') {
            return res.status(400).json({ success: false, message: 'هذه الخدمة متاحة فقط لمراكز الرعاية الصحية' });
        }

        // Get active term for healthcare_center
        let termId = req.query.term_id;
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
        res.status(500).json({ success: false, message: 'فشل في جلب بيانات طلاب الباص' });
    }
});

/**
 * GET /api/beneficiaries/available-buses
 * List buses at the branch for bus assignment
 */
router.get('/available-buses', requireManager, async (req, res) => {
    try {
        const branchId = req.user.role === 'branch_manager' ? req.user.branch_id : req.query.branch_id;
        if (!branchId) {
            return res.status(400).json({ success: false, message: 'يجب تحديد الفرع' });
        }

        // Verify branch is a healthcare center
        const [branch] = await sql`SELECT branch_type FROM branches WHERE id = ${branchId}`;
        if (!branch || branch.branch_type !== 'healthcare_center') {
            return res.status(400).json({ success: false, message: 'هذه الخدمة متاحة فقط لمراكز الرعاية الصحية' });
        }

        let termId = req.query.term_id;
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
        res.status(500).json({ success: false, message: 'فشل في جلب بيانات الباصات' });
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

        // Check if already assigned to this bus by name
        const normalizedName = beneficiary.beneficiary_name?.trim().toLowerCase();
        const [existing] = await sql`
            SELECT bs.id FROM bus_students bs
            INNER JOIN bus_transportation bt ON bs.bus_id = bt.id
            WHERE LOWER(TRIM(bs.student_full_name)) = ${normalizedName}
            AND bt.branch_id = ${beneficiary.branch_id}
            AND bs.term_id = ${beneficiary.term_id}
        `;
        if (existing) {
            return res.status(400).json({ success: false, message: 'المستفيد مسجل بالفعل في باص' });
        }

        // Create bus student record
        const student = await BusStudent.create({
            bus_id: parseInt(bus_id),
            term_id: beneficiary.term_id,
            student_full_name: beneficiary.beneficiary_name,
            contact_mobile_number: beneficiary.contact_number || '',
            address: '',
            created_by: req.user.id
        });

        res.status(201).json({ success: true, data: student, message: 'تم تسجيل المستفيد في الباص بنجاح' });
    } catch (error) {
        log.error('Error assigning beneficiary to bus:', error);
        res.status(500).json({ success: false, message: 'فشل في تسجيل المستفيد في الباص' });
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
        res.status(500).json({ success: false, message: 'فشل في جلب بيانات المستفيد' });
    }
});

/**
 * POST /api/beneficiaries
 * Create a new beneficiary
 */
router.post('/', requireManager, async (req, res) => {
    try {
        const { beneficiary_number, enrollment_period, beneficiary_name, civil_id, contact_number, gender, age,
            speech_therapy, physical_therapy, occupational_therapy, autism_therapy, transport_service, term_id } = req.body;

        // Validate required fields
        if (!beneficiary_number || !enrollment_period || !beneficiary_name || !civil_id || !contact_number || !gender || !age) {
            return res.status(400).json({ success: false, message: 'جميع الحقول مطلوبة' });
        }

        // Validate beneficiary_number is exactly 6 digits
        if (!/^\d{6}$/.test(beneficiary_number)) {
            return res.status(400).json({ success: false, message: 'رقم المستفيد يجب أن يكون 6 أرقام بالضبط' });
        }

        // Determine branch_id
        const branchId = req.user.role === 'branch_manager' ? req.user.branch_id : req.body.branch_id;
        if (!branchId) {
            return res.status(400).json({ success: false, message: 'يجب تحديد الفرع' });
        }

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
            transport_service: transport_service || false
        });

        res.status(201).json({ success: true, data: beneficiary, message: 'تم إضافة المستفيد بنجاح' });
    } catch (error) {
        log.error('Error creating beneficiary:', error);
        if (error.code === '23505') {
            return res.status(400).json({ success: false, message: 'السجل المدني مسجل بالفعل في هذا الفصل' });
        }
        res.status(500).json({ success: false, message: 'فشل في إضافة المستفيد' });
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
            speech_therapy, physical_therapy, occupational_therapy, autism_therapy, transport_service } = req.body;

        // Validate beneficiary_number is exactly 6 digits if provided
        if (beneficiary_number && !/^\d{6}$/.test(beneficiary_number)) {
            return res.status(400).json({ success: false, message: 'رقم المستفيد يجب أن يكون 6 أرقام بالضبط' });
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
            transport_service: transport_service !== undefined ? transport_service : beneficiary.transport_service
        });

        res.json({ success: true, data: updated, message: 'تم تحديث بيانات المستفيد بنجاح' });
    } catch (error) {
        log.error('Error updating beneficiary:', error);
        if (error.code === '23505') {
            return res.status(400).json({ success: false, message: 'السجل المدني مسجل بالفعل في هذا الفصل' });
        }
        res.status(500).json({ success: false, message: 'فشل في تحديث بيانات المستفيد' });
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
        res.status(500).json({ success: false, message: 'فشل في حذف المستفيد' });
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
        res.status(500).json({ success: false, message: 'فشل في أرشفة البيانات' });
    }
});

export default router;
