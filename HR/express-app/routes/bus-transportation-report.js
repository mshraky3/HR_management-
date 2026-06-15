import express from 'express';
import { PDFDocument } from 'pdf-lib';
import { authenticate } from '../middleware/auth.js';
import { log } from '../utils/logger.js';
import sql from '../config/database.js';
import { BusTransportation } from '../models/BusTransportation.js';
import { BusStudent } from '../models/BusStudent.js';
import { BusDetails } from '../models/BusDetails.js';
import { Branch } from '../models/Branch.js';
import { getScopedBranchFilter } from '../utils/policyScope.js';
import { printer as certificatePrinter } from '../utils/pdfFonts.js';
import { fetchBlobWithFallback } from '../utils/blobStorage.js';
import { formatDate } from '../utils/dateConverter.js';
import { withDbRetry } from '../utils/dbRetry.js';
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

/**
 * Render a pdfmake document definition to a Buffer (instead of streaming it).
 * Used so individual data pages can be merged with uploaded documents via pdf-lib.
 */
function pdfmakeToBuffer(docDefinition) {
    return new Promise((resolve, reject) => {
        try {
            const pdfDoc = certificatePrinter.createPdfKitDocument(docDefinition);
            const chunks = [];
            pdfDoc.on('data', (chunk) => chunks.push(chunk));
            pdfDoc.on('end', () => resolve(Buffer.concat(chunks)));
            pdfDoc.on('error', reject);
            pdfDoc.end();
        } catch (err) {
            reject(err);
        }
    });
}

/**
 * Detect file type from a buffer's magic bytes. pdf-lib can only merge PDF pages
 * and embed JPG/PNG images, so we sniff the bytes rather than trust a stored mime.
 */
function sniffFileType(buffer) {
    if (!buffer || buffer.length < 4) return 'unknown';
    if (buffer[0] === 0x25 && buffer[1] === 0x50 && buffer[2] === 0x44 && buffer[3] === 0x46) return 'pdf'; // %PDF
    if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) return 'png'; // \x89PNG
    if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'jpg'; // JPEG
    return 'unknown';
}

const reportStyles = {
    title: { fontSize: 24, bold: true, alignment: 'center', margin: [0, 0, 0, 10], color: '#1e293b', font: 'Amiri' },
    subtitle: { fontSize: 12, alignment: 'center', color: '#64748b', font: 'Amiri' },
    heading: { fontSize: 16, bold: true, alignment: 'center', margin: [0, 15, 0, 10], color: '#2c3e50', font: 'Amiri' },
    subheading: { fontSize: 13, bold: true, color: '#2c3e50', font: 'Amiri' },
};

const safeFormatDate = (value) => {
    if (!value) return '—';
    try {
        return formatDate(value) || '—';
    } catch {
        return '—';
    }
};

const isLicenseExpired = (value) => {
    if (!value) return false;
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return false;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return d < today;
};

/**
 * POST /api/bus-transportation-report/driver-licenses
 * Generate a PDF of every driver + driving-license record for the selected
 * branch(es). Each driver's uploaded license document (image or PDF) is embedded
 * as page(s) immediately after that driver's data page.
 * Body: { branchIds: number[] }
 */
router.post('/driver-licenses', authenticate, async (req, res) => {
    try {
        const { branchIds } = req.body;

        if (!branchIds || !Array.isArray(branchIds) || branchIds.length === 0) {
            return res.status(400).json({ error: 'يجب اختيار فرع واحد على الأقل' });
        }

        const normalizedBranchIds = Array.from(
            new Set(branchIds.map((id) => parseInt(id, 10)).filter((id) => !Number.isNaN(id)))
        );

        if (normalizedBranchIds.length === 0) {
            return res.status(400).json({ error: 'يجب اختيار فرع واحد على الأقل' });
        }

        // Validate requested branches against the user's scope
        const scopedBranch = getScopedBranchFilter(req, { allowMultiple: true });
        if (scopedBranch !== null && scopedBranch !== undefined) {
            const allowedIds = Array.isArray(scopedBranch) ? scopedBranch : [scopedBranch];
            const unauthorized = normalizedBranchIds.filter((id) => !allowedIds.includes(id));
            if (unauthorized.length > 0) {
                return res.status(403).json({ error: 'تم رفض الوصول لبعض الفروع المطلوبة' });
            }
        }

        // Fetch every driver-license record for buses in the requested branches.
        const licenses = await withDbRetry(() => sql`
            SELECT
                dld.*,
                bt.bus_number,
                bt.branch_id,
                b.branch_name,
                (SELECT plate_number FROM license_plate_data lpd
                   WHERE lpd.bus_id = bt.id AND lpd.is_primary = true LIMIT 1) AS primary_plate
            FROM bus_transportation bt
            INNER JOIN branches b ON bt.branch_id = b.id
            INNER JOIN driver_license_data dld ON dld.bus_id = bt.id
            WHERE bt.branch_id = ANY(${normalizedBranchIds}::int[])
            ORDER BY b.branch_name, dld.driver_full_name
        `, { label: 'driver-licenses-report' });

        if (!licenses || licenses.length === 0) {
            return res.status(404).json({ error: 'لا توجد بيانات سائقين أو رخص قيادة للفروع المحددة' });
        }

        // Fetch all license documents in parallel. Best-effort: a failed fetch is
        // recorded on the data page but does not abort the whole report.
        const documents = await Promise.all(
            licenses.map(async (lic) => {
                if (!lic.license_document_url) return null;
                try {
                    const { buffer } = await fetchBlobWithFallback(
                        lic.license_document_url,
                        lic.r2_license_document_url || null
                    );
                    return { buffer, type: sniffFileType(buffer) };
                } catch (err) {
                    log.warn('Failed to fetch driver license document for report', {
                        busId: lic.bus_id,
                        error: err.message,
                    });
                    return { error: true };
                }
            })
        );

        // Build the merged PDF with pdf-lib.
        const finalPdf = await PDFDocument.create();

        const appendPdfBuffer = async (buf) => {
            const src = await PDFDocument.load(buf, { ignoreEncryption: true });
            const pages = await finalPdf.copyPages(src, src.getPageIndices());
            pages.forEach((p) => finalPdf.addPage(p));
        };

        const appendImagePage = async (buf, type) => {
            const img = type === 'png' ? await finalPdf.embedPng(buf) : await finalPdf.embedJpg(buf);
            const A4_W = 595.28;
            const A4_H = 841.89;
            const margin = 28;
            const { width: iw, height: ih } = img.size();
            const ratio = Math.min((A4_W - margin * 2) / iw, (A4_H - margin * 2) / ih, 1);
            const w = iw * ratio;
            const h = ih * ratio;
            const page = finalPdf.addPage([A4_W, A4_H]);
            page.drawImage(img, { x: (A4_W - w) / 2, y: (A4_H - h) / 2, width: w, height: h });
        };

        const now = new Date();
        const dateStr = `${String(now.getDate()).padStart(2, '0')}/${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()}`;
        const branchNames = Array.from(new Set(licenses.map((l) => l.branch_name).filter(Boolean)));
        const withDocsCount = documents.filter((d) => d && d.buffer).length;

        // Cover page
        await appendPdfBuffer(await pdfmakeToBuffer({
            content: [
                { text: 'تقرير رخص السائقين', style: 'title' },
                { text: `التاريخ: ${dateStr}`, style: 'subtitle', margin: [0, 0, 0, 4] },
                { text: branchNames.length === 1 ? `الفرع: ${branchNames[0]}` : `عدد الفروع: ${branchNames.length}`, style: 'subtitle', margin: [0, 0, 0, 4] },
                { text: `عدد السائقين: ${licenses.length}`, style: 'subtitle', margin: [0, 0, 0, 4] },
                { text: `عدد المستندات المرفقة: ${withDocsCount}`, style: 'subtitle' },
            ],
            styles: reportStyles,
            defaultStyle: { font: 'Amiri', fontSize: 11, color: '#1e293b' },
            pageSize: 'A4',
            pageMargins: [40, 60, 40, 40],
        }));

        // One data page per driver, followed by the embedded license document.
        for (let i = 0; i < licenses.length; i++) {
            const lic = licenses[i];
            const doc = documents[i];
            const expired = isLicenseExpired(lic.expiry_date_gregorian);

            let documentStatus;
            if (!lic.license_document_url) {
                documentStatus = 'لا يوجد مستند رخصة مرفوع';
            } else if (!doc || doc.error) {
                documentStatus = 'تعذر تحميل المستند من التخزين السحابي';
            } else if (doc.type === 'unknown') {
                documentStatus = 'صيغة المستند غير مدعومة للعرض داخل التقرير';
            } else {
                documentStatus = 'مرفق في الصفحة التالية';
            }

            const rows = [
                ['اسم السائق', lic.driver_full_name || '—'],
                ['رقم الهوية', lic.driver_id_number || '—'],
                ['رقم الرخصة', lic.license_number || '—'],
                ['تاريخ إصدار الرخصة', safeFormatDate(lic.issue_date_gregorian)],
                ['تاريخ انتهاء الرخصة', `${safeFormatDate(lic.expiry_date_gregorian)}${expired ? '  (منتهية)' : ''}`],
                ['الجنسية', lic.driver_nationality || '—'],
                ['رقم الجوال', lic.driver_phone_number || '—'],
                ['تاريخ الميلاد', safeFormatDate(lic.driver_date_of_birth_gregorian)],
                ['الفرع', lic.branch_name || '—'],
                ['الحافلة / اللوحة', lic.primary_plate || lic.bus_number || '—'],
                ['يوجد مرافق', lic.has_assistant ? 'نعم' : 'لا'],
            ];
            if (lic.has_assistant) {
                rows.push(['اسم المرافق', lic.assistant_full_name || '—']);
                rows.push(['جوال المرافق', lic.assistant_phone_number || '—']);
            }
            rows.push(['حالة التوثيق', lic.is_verified ? 'موثّقة' : 'غير موثّقة']);
            rows.push(['المستند', documentStatus]);

            const tableBody = rows.map(([label, value]) => {
                const isExpiryRow = label === 'تاريخ انتهاء الرخصة' && expired;
                return [
                    { text: label, bold: true, alignment: 'right', fillColor: '#f1f5f9', color: '#334155', margin: [4, 3, 4, 3] },
                    { text: String(value), alignment: 'right', color: isExpiryRow ? '#dc2626' : '#1e293b', bold: isExpiryRow, margin: [4, 3, 4, 3] },
                ];
            });

            await appendPdfBuffer(await pdfmakeToBuffer({
                content: [
                    { text: 'بيانات السائق ورخصة القيادة', style: 'heading', margin: [0, 0, 0, 6] },
                    { text: lic.driver_full_name || '—', style: 'subheading', alignment: 'right', margin: [0, 0, 0, 10] },
                    {
                        table: { widths: ['35%', '65%'], body: tableBody },
                        layout: {
                            hLineColor: () => '#e2e8f0',
                            vLineColor: () => '#e2e8f0',
                            hLineWidth: () => 0.5,
                            vLineWidth: () => 0.5,
                        },
                    },
                ],
                styles: reportStyles,
                defaultStyle: { font: 'Amiri', fontSize: 11, color: '#1e293b' },
                pageSize: 'A4',
                pageMargins: [40, 50, 40, 40],
            }));

            // Embed the actual uploaded license document right after the data page.
            if (doc && doc.buffer && !doc.error) {
                try {
                    if (doc.type === 'pdf') {
                        await appendPdfBuffer(doc.buffer);
                    } else if (doc.type === 'png' || doc.type === 'jpg') {
                        await appendImagePage(doc.buffer, doc.type);
                    }
                } catch (embedErr) {
                    log.warn('Failed to embed license document into report', {
                        busId: lic.bus_id,
                        error: embedErr.message,
                    });
                }
            }
        }

        const pdfBytes = await finalPdf.save();

        const displayFilename = `تقرير-رخص-السائقين-${dateStr.replace(/\//g, '-')}.pdf`;
        const asciiFilename = `driver-licenses-report-${dateStr.replace(/\//g, '-')}.pdf`;
        const encodedFilename = encodeURIComponent(displayFilename);
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${asciiFilename}"; filename*=UTF-8''${encodedFilename}`);
        res.end(Buffer.from(pdfBytes));
    } catch (error) {
        log.error('Error generating driver licenses report:', error);
        handleRouteError(error, req, res, 'فشل إنشاء تقرير رخص السائقين');
    }
});

export default router;
