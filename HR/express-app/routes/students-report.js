import express from 'express';
import { authenticate } from '../middleware/auth.js';
import { log } from '../utils/logger.js';
import { BusStudent } from '../models/BusStudent.js';
import { BusTransportation } from '../models/BusTransportation.js';
import { Branch } from '../models/Branch.js';
import { printer as certificatePrinter } from '../utils/pdfFonts.js';
import { handleRouteError } from '../utils/routeErrorHandler.js';

const router = express.Router();

// Generate Students Report PDF
router.post('/generate-pdf', authenticate, async (req, res) => {
    try {
        const { branchId, sections, filters } = req.body;

        // Fetch branch data
        const branch = await Branch.findById(branchId);
        if (!branch) {
            return res.status(404).json({ error: 'Branch not found' });
        }

        // Fetch buses for the branch so we can filter students by branch
        const buses = await BusTransportation.findAll({ branch_id: branchId });
        const busIds = buses.map(bus => bus.id);
        const busMap = new Map(buses.map(bus => [bus.id, bus]));

        const studentFilters = {};
        if (filters?.status && filters.status !== 'all') {
            studentFilters.status = filters.status;
        }

        if (filters?.gradeLevel && filters.gradeLevel !== 'all') {
            studentFilters.grade_level = filters.gradeLevel;
        }

        const students = await BusStudent.findByBusIds(busIds, studentFilters);

        // Get current date
        const now = new Date();
        const day = String(now.getDate()).padStart(2, '0');
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const year = now.getFullYear();
        const dateStr = `${day}/${month}/${year}`;

        const docContent = [];

        // Title
        docContent.push({
            text: 'تقرير الطلاب',
            style: 'title',
        });

        docContent.push({
            text: `التاريخ: ${dateStr}`,
            style: 'subtitle',
            margin: [0, 0, 0, 10],
        });

        docContent.push({
            text: `الفرع: ${branch.branch_name}`,
            style: 'subtitle',
            margin: [0, 0, 0, 20],
        });

        // Summary Section
        if (sections.summary) {
            docContent.push({
                text: 'الملخص العام',
                style: 'heading',
            });

            const summary = [
                { label: 'إجمالي الطلاب', value: students.length },
                { label: 'الطلاب النشطين', value: students.filter(s => s.status === 'active').length },
                { label: 'الطلاب المتخرجين', value: students.filter(s => s.status === 'graduated').length },
            ];

            docContent.push({
                columns: summary.map((item) => ({
                    stack: [
                        { text: item.label, style: 'cardLabel' },
                        { text: item.value, style: 'cardValue' }
                    ],
                    width: '32%'
                })),
                margin: [0, 0, 0, 20]
            });
        }

        // Distribution by Grade
        if (sections.byGrade && students.length > 0) {
            docContent.push({
                text: 'توزيع الطلاب حسب المستوى الدراسي',
                style: 'heading',
            });

            const gradeMap = {
                kg: 'روضة',
                primary: 'ابتدائي',
                middle: 'متوسط',
                secondary: 'ثانوي',
            };

            const grades = {};
            students.forEach(s => {
                const gradeName = gradeMap[s.grade_level] || s.grade_level;
                grades[gradeName] = (grades[gradeName] || 0) + 1;
            });

            const gradeText = Object.entries(grades).map(([grade, count]) => {
                const percentage = ((count / students.length) * 100).toFixed(1);
                return `${grade}: ${count} طالب (${percentage}%)`;
            }).join('\n');

            docContent.push({
                text: gradeText,
                margin: [0, 0, 0, 20],
                fontSize: 10
            });
        }

        // Distribution by Bus
        if (sections.byBus && students.length > 0) {
            docContent.push({
                text: 'توزيع الطلاب حسب الحافلات',
                style: 'heading',
            });

            const busCounts = {};
            students.forEach(s => {
                const busNum = busMap.get(s.bus_id)?.bus_number || 'بدون حافلة';
                busCounts[busNum] = (busCounts[busNum] || 0) + 1;
            });

            const busText = Object.entries(busCounts).map(([bus, count]) => {
                return `${bus}: ${count} طالب`;
            }).join('\n');

            docContent.push({
                text: busText,
                margin: [0, 0, 0, 20],
                fontSize: 10
            });
        }

        // List All Students (max 50)
        if (sections.byStatus && students.length > 0) {
            docContent.push({
                text: 'قائمة الطلاب',
                style: 'heading',
            });

            const studentList = students.slice(0, 50).map(s =>
                `${s.student_name} - ${s.grade_level} - ${busMap.get(s.bus_id)?.bus_number || 'بدون'} - ${s.status === 'active' ? 'نشط' : s.status === 'graduated' ? 'متخرج' : 'غير نشط'}`
            ).join('\n');

            docContent.push({
                text: studentList,
                margin: [0, 0, 0, 20],
                fontSize: 9
            });

            if (students.length > 50) {
                docContent.push({
                    text: `تم عرض أول 50 طالب من أصل ${students.length}`,
                    fontSize: 9,
                    color: '#666',
                    margin: [0, 0, 0, 20]
                });
            }
        }

        // PDF Definition
        const docDefinition = {
            content: docContent,
            styles: {
                title: {
                    fontSize: 24,
                    bold: true,
                    alignment: 'center',
                    margin: [0, 0, 0, 10],
                    color: '#1e293b',
                    font: 'Amiri',
                },
                subtitle: {
                    fontSize: 12,
                    alignment: 'center',
                    color: '#64748b',
                    font: 'Amiri',
                },
                heading: {
                    fontSize: 16,
                    bold: true,
                    margin: [0, 15, 0, 10],
                    color: '#2c3e50',
                    font: 'Amiri',
                    border: [false, false, false, true],
                    borderColor: '#fa709a',
                    borderWidth: 2,
                    paddingBottom: 8,
                },
                cardLabel: {
                    fontSize: 10,
                    color: '#64748b',
                    font: 'Roboto',
                    margin: [0, 0, 5, 0],
                },
                cardValue: {
                    fontSize: 18,
                    bold: true,
                    color: '#fa709a',
                    font: 'Roboto',
                },
            },
            defaultStyle: {
                font: 'Roboto',
                fontSize: 11,
                color: '#1e293b',
            },
        };

        // Generate PDF
        const pdfDoc = certificatePrinter.createPdfKitDocument(docDefinition);

        const dateStrForFilename = new Date().toLocaleDateString('en-CA');
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="students-${branchId}-${dateStrForFilename}.pdf"`);

        pdfDoc.pipe(res);
        pdfDoc.end();
    } catch (error) {
        log.error('Error generating students PDF:', error);
        handleRouteError(error, req, res, 'حدث خطأ في الخادم');
    }
});

export default router;
