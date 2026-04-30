import express from 'express';
import { authenticate } from '../middleware/auth.js';
import { log } from '../utils/logger.js';
import { BusTransportation } from '../models/BusTransportation.js';
import { BusStudent } from '../models/BusStudent.js';
import { BusDetails } from '../models/BusDetails.js';
import { Branch } from '../models/Branch.js';
import { getScopedBranchFilter } from '../utils/policyScope.js';
import { printer as certificatePrinter } from '../utils/pdfFonts.js';
import { handleRouteError } from '../utils/routeErrorHandler.js';

const router = express.Router();

/**
 * Format plate number with spacing
 * Input: كقبBGK2925
 * Output: ك ق ب   B G K   2925
 * Format: 3 Arabic letters (spaced) - 3 English letters (spaced) - 4 numbers
 */
const formatPlateNumber = (plateNumber) => {
    if (!plateNumber) return '-';

    const str = String(plateNumber);

    // Extract Arabic letters, English letters, and numbers
    const arabicLetters = str.match(/[\u0600-\u06FF]/g) || [];
    const englishLetters = str.match(/[A-Za-z]/g) || [];
    const numbers = str.match(/[0-9]/g) || [];

    // Take exactly 3 Arabic letters, 3 English letters, 4 numbers
    const arabicPart = arabicLetters.slice(0, 3).join(' ');
    const englishPart = englishLetters.slice(0, 3).map(l => l.toUpperCase()).join(' ');
    const numberPart = numbers.slice(0, 4).join('');

    // Combine with spacing (3 spaces between each part)
    const parts = [];
    if (arabicPart) parts.push(arabicPart);
    if (englishPart) parts.push(englishPart);
    if (numberPart) parts.push(numberPart);

    return parts.join('   ') || '-';
};

// Generate Bus Transportation Report PDF
router.post('/generate-pdf', authenticate, async (req, res) => {
    try {
        const { branchIds, sections } = req.body;

        // Validate input
        if (!branchIds || !Array.isArray(branchIds) || branchIds.length === 0) {
            return res.status(400).json({ error: 'يجب اختيار فرع واحد على الأقل' });
        }

        // Normalize IDs to integers and de-duplicate
        const normalizedBranchIds = Array.from(new Set(branchIds.map(id => parseInt(id, 10)).filter(id => !Number.isNaN(id))));

        if (normalizedBranchIds.length === 0) {
            return res.status(400).json({ error: 'يجب اختيار فرع واحد على الأقل' });
        }

        // Validate requested branches against user scope
        const scopedBranch = getScopedBranchFilter(req, { allowMultiple: true });
        if (scopedBranch !== null && scopedBranch !== undefined) {
            const allowedIds = Array.isArray(scopedBranch) ? scopedBranch : [scopedBranch];
            const unauthorized = normalizedBranchIds.filter(id => !allowedIds.includes(id));
            if (unauthorized.length > 0) {
                return res.status(403).json({ error: 'تم رفض الوصول لبعض الفروع المطلوبة' });
            }
        }

        // Fetch only requested branches using efficient IN query
        const branches = await Branch.findManyByIds(normalizedBranchIds);

        if (branches.length === 0) {
            return res.status(404).json({ error: 'لم يتم العثور على الفروع المطلوبة' });
        }

        // Fetch bus data for the requested branches using efficient IN query
        const buses = await BusTransportation.findByBranchIds(normalizedBranchIds);

        const busIds = buses.map(b => b.id);
        const busStudents = await BusStudent.findByBusIds(busIds);

        const busDetails = await BusDetails.findByBusIds(busIds);

        // Get current date in Arabic format
        const now = new Date();
        const day = String(now.getDate()).padStart(2, '0');
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const year = now.getFullYear();
        const dateStr = `${day}/${month}/${year}`;

        const docContent = [];

        // Title
        docContent.push({
            text: 'تقرير النقل بالحافلات',
            style: 'title',
        });

        docContent.push({
            text: `التاريخ: ${dateStr}`,
            style: 'subtitle',
            margin: [0, 0, 0, 5],
        });

        // Show number of branches
        if (branches.length > 0) {
            docContent.push({
                text: `عدد الفروع: ${branches.length}`,
                style: 'subtitle',
                margin: [0, 0, 0, 20],
            });
        }

        // Summary Section - As Table
        if (sections.summary) {
            docContent.push({
                text: 'الملخص العام',
                style: 'heading',
            });

            const activeBuses = buses.filter(b => b.status === 'active').length;
            const inactiveBuses = buses.filter(b => b.status === 'inactive').length;

            docContent.push({
                table: {
                    headerRows: 1,
                    widths: ['25%', '25%', '25%', '25%'],
                    body: [
                        [
                            { text: 'عدد الحافلات الكلي', bold: true, alignment: 'center', color: '#ffffff', fillColor: '#3b82f6' },
                            { text: 'إجمالي الطلاب المسجلين', bold: true, alignment: 'center', color: '#ffffff', fillColor: '#3b82f6' },
                            { text: 'الحافلات النشطة', bold: true, alignment: 'center', color: '#ffffff', fillColor: '#3b82f6' },
                            { text: 'الحافلات المتوقفة', bold: true, alignment: 'center', color: '#ffffff', fillColor: '#3b82f6' },
                        ],
                        [
                            { text: String(buses.length), fontSize: 14, bold: true, alignment: 'center', color: '#3b82f6' },
                            { text: String(busStudents.length), fontSize: 14, bold: true, alignment: 'center', color: '#3b82f6' },
                            { text: String(activeBuses), fontSize: 14, bold: true, alignment: 'center', color: '#22c55e' },
                            { text: String(inactiveBuses), fontSize: 14, bold: true, alignment: 'center', color: '#ef4444' },
                        ],
                    ],
                },
                margin: [0, 0, 0, 20]
            });
        }

        // Bus Details Section
        if (sections.busDetails && buses.length > 0) {
            docContent.push({
                text: 'تفاصيل الحافلات',
                style: 'heading',
            });

            // Group buses by branch
            const busesByBranch = {};
            buses.forEach(bus => {
                if (!busesByBranch[bus.branch_id]) {
                    busesByBranch[bus.branch_id] = [];
                }
                busesByBranch[bus.branch_id].push(bus);
            });

            Object.keys(busesByBranch).forEach(branchId => {
                const branch = branches.find(b => b.id === parseInt(branchId));
                const branchBuses = busesByBranch[branchId];

                docContent.push({
                    text: `${branch?.branch_name}`,
                    style: 'subheading',
                    margin: [0, 10, 0, 5]
                });

                const busDetailsRows = branchBuses.map(bus => {
                    const plateNumber = bus.bus_number || bus.primary_plate || '-';
                    const formattedPlate = formatPlateNumber(plateNumber);
                    const seats = bus.number_of_seats || '-';

                    return [
                        { text: formattedPlate, fontSize: 10, alignment: 'center' },
                        { text: String(seats), fontSize: 10, alignment: 'center' },
                    ];
                });

                docContent.push({
                    table: {
                        headerRows: 1,
                        widths: ['60%', '40%'],
                        body: [
                            [
                                { text: 'رقم اللوحات', bold: true, alignment: 'center', color: '#ffffff', fillColor: '#3b82f6' },
                                { text: 'السعة', bold: true, alignment: 'center', color: '#ffffff', fillColor: '#3b82f6' },
                            ],
                            ...busDetailsRows,
                        ],
                    },
                    margin: [0, 0, 0, 15]
                });
            });
        }

        // Drivers Section - Fixed to use driver_full_name
        if (sections.drivers && buses.length > 0) {
            const busesWithDrivers = buses.filter(b => b.driver_full_name || b.license_number);

            if (busesWithDrivers.length > 0) {
                docContent.push({
                    text: 'بيانات السائقين',
                    style: 'heading',
                });

                const driversRows = busesWithDrivers.map(bus => {
                    const plateNumber = bus.bus_number || bus.primary_plate || '-';
                    const formattedPlate = formatPlateNumber(plateNumber);

                    return [
                        { text: bus.driver_full_name || '-', fontSize: 10, alignment: 'right' },
                        { text: bus.license_number || '-', fontSize: 10, alignment: 'center' },
                        { text: formattedPlate, fontSize: 10, alignment: 'center' },
                    ];
                });

                docContent.push({
                    table: {
                        headerRows: 1,
                        widths: ['40%', '30%', '30%'],
                        body: [
                            [
                                { text: 'اسم السائق', bold: true, alignment: 'center', color: '#ffffff', fillColor: '#3b82f6' },
                                { text: 'رقم الرخصة', bold: true, alignment: 'center', color: '#ffffff', fillColor: '#3b82f6' },
                                { text: 'رقم اللوحات', bold: true, alignment: 'center', color: '#ffffff', fillColor: '#3b82f6' },
                            ],
                            ...driversRows,
                        ],
                    },
                    margin: [0, 0, 0, 20]
                });
            }
        }

        // Routes Section - Removed أوقات التوقف
        if (sections.routes && buses.length > 0) {
            docContent.push({
                text: 'المسارات',
                style: 'heading',
            });

            const busesWithRoutes = buses.filter(b => b.route_name);

            if (busesWithRoutes.length > 0) {
                const routesRows = busesWithRoutes.map(bus => {
                    const plateNumber = bus.bus_number || bus.primary_plate || '-';
                    const formattedPlate = formatPlateNumber(plateNumber);

                    return [
                        { text: formattedPlate, fontSize: 10, alignment: 'center' },
                        { text: bus.route_name || '-', fontSize: 10, alignment: 'right' },
                    ];
                });

                docContent.push({
                    table: {
                        headerRows: 1,
                        widths: ['40%', '60%'],
                        body: [
                            [
                                { text: 'رقم اللوحات', bold: true, alignment: 'center', color: '#ffffff', fillColor: '#3b82f6' },
                                { text: 'اسم المسار', bold: true, alignment: 'center', color: '#ffffff', fillColor: '#3b82f6' },
                            ],
                            ...routesRows,
                        ],
                    },
                    margin: [0, 0, 0, 20]
                });
            } else {
                docContent.push({
                    text: 'لا توجد بيانات مسارات متوفرة',
                    margin: [0, 0, 0, 20]
                });
            }
        }

        // Students Section - Now as table
        if (sections.students && busStudents.length > 0) {
            docContent.push({
                text: 'الطلاب المسجلين',
                style: 'heading',
            });

            const studentsByBus = {};
            busStudents.forEach(student => {
                if (!studentsByBus[student.bus_id]) {
                    studentsByBus[student.bus_id] = [];
                }
                studentsByBus[student.bus_id].push(student);
            });

            // Group by branch
            const busesByBranchForStudents = {};
            Object.keys(studentsByBus).forEach(busId => {
                const bus = buses.find(b => b.id === parseInt(busId));
                if (bus) {
                    if (!busesByBranchForStudents[bus.branch_id]) {
                        busesByBranchForStudents[bus.branch_id] = [];
                    }
                    busesByBranchForStudents[bus.branch_id].push({ busId, bus, students: studentsByBus[busId] });
                }
            });

            Object.keys(busesByBranchForStudents).forEach(branchId => {
                const branch = branches.find(b => b.id === parseInt(branchId));
                const busesData = busesByBranchForStudents[branchId];
                const totalStudentsInBranch = busesData.reduce((sum, b) => sum + b.students.length, 0);

                docContent.push({
                    text: `${branch?.branch_name} (${totalStudentsInBranch} طالب)`,
                    style: 'subheading',
                    margin: [0, 10, 0, 5]
                });

                // Create table rows for students per bus
                const studentTableRows = busesData.map(({ bus, students }) => {
                    const plateNumber = bus.bus_number || bus.primary_plate || '-';
                    const formattedPlate = formatPlateNumber(plateNumber);

                    return [
                        { text: formattedPlate, fontSize: 10, alignment: 'center' },
                        { text: String(students.length), fontSize: 10, alignment: 'center' },
                    ];
                });

                docContent.push({
                    table: {
                        headerRows: 1,
                        widths: ['60%', '40%'],
                        body: [
                            [
                                { text: 'رقم اللوحات', bold: true, alignment: 'center', color: '#ffffff', fillColor: '#3b82f6' },
                                { text: 'عدد الطلاب', bold: true, alignment: 'center', color: '#ffffff', fillColor: '#3b82f6' },
                            ],
                            ...studentTableRows,
                        ],
                    },
                    margin: [0, 0, 0, 15]
                });
            });

            docContent.push({
                text: `إجمالي الطلاب المسجلين: ${busStudents.length}`,
                style: 'subheading',
                margin: [0, 10, 0, 0]
            });
        }

        // Financials Section REMOVED - no financial data in bus section

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
                    alignment: 'center',
                    margin: [0, 15, 0, 10],
                    color: '#2c3e50',
                    font: 'Amiri',
                },
                subheading: {
                    fontSize: 12,
                    bold: true,
                    color: '#2c3e50',
                    font: 'Amiri',
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
                    color: '#3b82f6',
                    font: 'Roboto',
                },
            },
            defaultStyle: {
                font: 'Amiri',
                fontSize: 11,
                color: '#1e293b',
            },
            pageSize: 'A4',
            pageOrientation: 'portrait',
            pageMargins: [40, 40, 40, 40],
        };

        // Generate PDF
        const pdfDoc = certificatePrinter.createPdfKitDocument(docDefinition);

        res.setHeader('Content-Type', 'application/pdf');
        const displayFilename = `تقرير-النقل-بالحافلات-${dateStr.replace(/\//g, '-')}.pdf`;
        const asciiFilename = `bus-transportation-report-${dateStr.replace(/\//g, '-')}.pdf`;
        const encodedFilename = encodeURIComponent(displayFilename);
        res.setHeader('Content-Disposition', `attachment; filename="${asciiFilename}"; filename*=UTF-8''${encodedFilename}`);

        pdfDoc.pipe(res);
        pdfDoc.end();
    } catch (error) {
        log.error('Error generating bus transportation PDF:', error);
        handleRouteError(error, req, res, 'حدث خطأ في الخادم');
    }
});

export default router;
